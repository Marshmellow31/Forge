/**
 * Who is calling — verified against Google's public keys, not taken on trust.
 *
 * The upload endpoints mint a credential that writes into the organiser's own
 * Drive. Without this check they would be an open relay: anyone on the internet
 * could fill a stranger's Google account with arbitrary files. So the caller
 * presents a Firebase ID token and we verify its signature, issuer, audience
 * and expiry before doing anything at all.
 *
 * Verified by hand rather than with `firebase-admin` deliberately. The Admin
 * SDK is ~10 MB of dependency for one RS256 signature check, and it dominates a
 * serverless cold start on the request a person is waiting on. `jose` would be
 * the other option; Node's built-in `crypto` does it in about thirty lines.
 */
import { createPublicKey, createVerify } from 'node:crypto';

const CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export interface VerifiedCaller {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export class AuthError extends Error {}

/**
 * Google's signing certificates, cached until they expire.
 *
 * They rotate roughly daily and the response carries `max-age`, which is what
 * we honour — a hardcoded TTL either re-fetches pointlessly or serves a key
 * that has already been retired.
 */
let certs: { keys: Record<string, string>; expiresAt: number } | null = null;

async function signingKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certs && certs.expiresAt > now) return certs.keys;

  const response = await fetch(CERT_URL);
  if (!response.ok) throw new AuthError('Could not fetch Google signing keys.');

  const keys = await response.json() as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1]);

  certs = {
    keys,
    expiresAt: now + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : 3600) * 1000,
  };
  return keys;
}

const b64url = (input: string) => Buffer.from(input, 'base64url');

/**
 * Verifies a Firebase ID token for `projectId`.
 *
 * Every check here matters and none is optional:
 *   • **signature** — that Google issued it;
 *   • **audience** — that it was issued for *this* Firebase project, not
 *     another one the attacker also controls;
 *   • **issuer** — same, from the other side;
 *   • **expiry** — that it is not a replayed old token;
 *   • **subject** — that there is an account behind it.
 */
export async function verifyIdToken(
  authorization: string | undefined,
  projectId: string,
): Promise<VerifiedCaller> {
  const raw = authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!raw) throw new AuthError('No credential presented.');

  const parts = raw.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed token.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = JSON.parse(b64url(encodedHeader).toString('utf8')) as
    { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw new AuthError('Unexpected token algorithm.');
  if (!header.kid) throw new AuthError('Token names no signing key.');

  const keys = await signingKeys();
  const certificate = keys[header.kid];
  if (!certificate) throw new AuthError('Token signed by an unknown key.');

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  const valid = verifier.verify(
    createPublicKey(certificate),
    b64url(encodedSignature),
  );
  if (!valid) throw new AuthError('Token signature does not verify.');

  const payload = JSON.parse(b64url(encodedPayload).toString('utf8')) as {
    aud?: string; iss?: string; sub?: string; exp?: number;
    email?: string; email_verified?: boolean;
  };

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new AuthError('Token is for a different project.');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new AuthError('Token has the wrong issuer.');
  }
  if (!payload.sub) throw new AuthError('Token names no account.');
  if (!payload.exp || payload.exp <= nowSeconds) throw new AuthError('Token has expired.');

  return {
    uid: payload.sub,
    email: payload.email ?? null,
    emailVerified: Boolean(payload.email_verified),
  };
}

/**
 * Is this caller actually registered for this challenge?
 *
 * ADR-026 recorded this as a known gap, on the assumption that checking it
 * needed the Admin SDK and a service-account key in the serverless environment
 * — a second long-lived credential to hold and rotate.
 *
 * It does not. Firestore has a REST API that accepts a **Firebase ID token**,
 * so the server can ask the database this question *as the caller*, using the
 * credential they already presented. `firestore.rules` allows
 * `rid == uid()` on a registration, so a caller can read their own and nothing
 * else — which is exactly the question being asked. No new secret exists, and
 * the check inherits the rules rather than reimplementing them.
 *
 * Fails **closed**: anything other than a clear "yes" is treated as not
 * registered. The alternative — letting a Firestore blip open the upload
 * endpoint to unregistered callers — is the wrong direction to fail in for a
 * check whose entire purpose is to keep it shut.
 */
export async function isRegisteredFor(
  idToken: string,
  projectId: string,
  orgId: string,
  challengeId: string,
  uid: string,
): Promise<boolean> {
  // Path segments come from a verified token and a validated request body, but
  // they are interpolated into a URL, so anything unexpected is refused rather
  // than encoded and hoped for.
  if (![orgId, challengeId, uid].every((v) => /^[A-Za-z0-9_-]{1,128}$/.test(v))) return false;

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`
    + `/documents/organizations/${orgId}/challenges/${challengeId}/registrations/${uid}`;

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${idToken.replace(/^Bearer\s+/i, '')}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, createSign, randomUUID } from 'node:crypto';
import { X509Certificate } from 'node:crypto';

/**
 * ID token verification — the boundary in front of the upload endpoints.
 *
 * `api/drive/upload-session` mints a credential that writes into the
 * organiser's Google Drive. Without this check it is an open relay: anyone on
 * the internet could fill a stranger's account with arbitrary files. Every
 * assertion below is a way that check could be bypassed, and each one is a real
 * bypass rather than a hypothetical — swapping the algorithm to `none`,
 * presenting a token from a different Firebase project, and replaying an
 * expired one are the three classic ways hand-rolled JWT verification is
 * defeated.
 *
 * The certificate endpoint is stubbed, so this needs no network and no Google
 * project. Keys are generated per-run, so nothing here is a fixture that could
 * drift out of step with what the code accepts.
 */

const PROJECT = 'forge-test-project';
const CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

/** A throwaway RSA keypair plus the self-signed certificate Google would serve. */
function keyMaterial() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { privateKey, publicKey };
}

const b64url = (input: object | string) =>
  Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url');

/**
 * Signs a token the way Google's secure-token service does.
 *
 * Built by hand rather than with a JWT library on purpose: a library would
 * agree with itself, and the point is to check what *our* verifier accepts.
 */
function makeToken(
  privateKey: ReturnType<typeof keyMaterial>['privateKey'],
  {
    kid = 'test-key',
    alg = 'RS256',
    aud = PROJECT,
    iss = `https://securetoken.google.com/${PROJECT}`,
    // `null` means "omit this claim". `undefined` cannot: passing it to a
    // destructured parameter triggers the default, so `{ sub: undefined }`
    // would quietly produce a token *with* a subject and the test would assert
    // nothing.
    sub = 'u_test' as string | null,
    exp = (Math.floor(Date.now() / 1000) + 3600) as number | null,
    email = 'ada@example.com',
    emailVerified = true,
    tamperPayload = false,
  }: Partial<{
    kid: string; alg: string; aud: string; iss: string; sub: string | null;
    exp: number | null; email: string; emailVerified: boolean; tamperPayload: boolean;
  }> = {},
) {
  const header = b64url({ alg, kid });
  const claims: Record<string, unknown> = { aud, iss, email, email_verified: emailVerified };
  if (sub !== null) claims.sub = sub;
  if (exp !== null) claims.exp = exp;
  const payload = b64url(claims);
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(privateKey).toString('base64url');

  if (tamperPayload) {
    // Same signature, different claims — the exact shape of a forged token.
    const swapped = b64url({
      aud, iss, sub: 'u_attacker', exp, email: 'attacker@example.com', email_verified: true,
    });
    return `${header}.${swapped}.${signature}`;
  }
  return `${header}.${payload}.${signature}`;
}

let keys: ReturnType<typeof keyMaterial>;
let certPem: string;

/** Serves our public key where the verifier expects Google's. */
function stubCerts(body: Record<string, string>, cacheControl = 'max-age=3600') {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url) !== CERT_URL) throw new Error(`unexpected fetch: ${url}`);
    return {
      ok: true,
      json: async () => body,
      headers: { get: (h: string) => (h.toLowerCase() === 'cache-control' ? cacheControl : null) },
    };
  }));
}

beforeEach(async () => {
  vi.resetModules();
  keys = keyMaterial();
  // `createPublicKey` in the verifier accepts a PEM public key as well as a
  // certificate, and generating a real X.509 cert here would add a dependency
  // for no extra coverage.
  certPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  stubCerts({ 'test-key': certPem });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const verify = async (token: string | undefined, project = PROJECT) => {
  const { verifyIdToken } = await import('./auth');
  return verifyIdToken(token === undefined ? undefined : `Bearer ${token}`, project);
};

describe('verifyIdToken — accepts a genuine token', () => {
  it('returns the account behind a valid token', async () => {
    const caller = await verify(makeToken(keys.privateKey));
    expect(caller).toMatchObject({
      uid: 'u_test', email: 'ada@example.com', emailVerified: true,
    });
  });

  it('reports an unverified email as unverified rather than refusing', async () => {
    // Verification gates invite redemption, not uploading. Conflating them
    // would lock a legitimate entrant out of a competition.
    const caller = await verify(makeToken(keys.privateKey, { emailVerified: false }));
    expect(caller.emailVerified).toBe(false);
  });

  it('tolerates a missing email, which an anonymous session has', async () => {
    const { verifyIdToken } = await import('./auth');
    const header = b64url({ alg: 'RS256', kid: 'test-key' });
    const payload = b64url({
      aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`,
      sub: 'u_guest', exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const token = `${header}.${payload}.${signer.sign(keys.privateKey).toString('base64url')}`;
    await expect(verifyIdToken(`Bearer ${token}`, PROJECT)).resolves.toMatchObject({
      uid: 'u_guest', email: null, emailVerified: false,
    });
  });
});

describe('verifyIdToken — refuses everything else', () => {
  it('refuses a missing credential', async () => {
    await expect(verify(undefined)).rejects.toThrow();
  });

  it('refuses a malformed token', async () => {
    await expect(verify('not.a.jwt.at.all')).rejects.toThrow();
    await expect(verify('onlyonepart')).rejects.toThrow();
  });

  it('refuses alg=none — the oldest JWT bypass there is', async () => {
    const header = b64url({ alg: 'none', kid: 'test-key' });
    const payload = b64url({
      aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`,
      sub: 'u_attacker', exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await expect(verify(`${header}.${payload}.`)).rejects.toThrow(/algorithm/i);
  });

  it('refuses HS256, where the "signature" is made with a key we publish', async () => {
    const header = b64url({ alg: 'HS256', kid: 'test-key' });
    const payload = b64url({ aud: PROJECT, sub: 'u_attacker' });
    await expect(verify(`${header}.${payload}.anything`)).rejects.toThrow(/algorithm/i);
  });

  it('refuses a token signed by a key Google does not publish', async () => {
    const attacker = keyMaterial();
    await expect(verify(makeToken(attacker.privateKey))).rejects.toThrow(/signature/i);
  });

  it('refuses a token naming an unknown key id', async () => {
    await expect(verify(makeToken(keys.privateKey, { kid: 'not-a-real-key' })))
      .rejects.toThrow(/unknown key/i);
  });

  it('refuses a token with no key id at all', async () => {
    const header = b64url({ alg: 'RS256' });
    const payload = b64url({ aud: PROJECT, sub: 'u' });
    await expect(verify(`${header}.${payload}.sig`)).rejects.toThrow(/signing key/i);
  });

  it('refuses claims swapped under a valid signature', async () => {
    await expect(verify(makeToken(keys.privateKey, { tamperPayload: true })))
      .rejects.toThrow(/signature/i);
  });

  it('refuses a token issued for a different Firebase project', async () => {
    // The attacker controls their own project and can mint tokens Google
    // genuinely signed. The audience check is the only thing standing there.
    await expect(verify(makeToken(keys.privateKey, { aud: 'someone-elses-project' })))
      .rejects.toThrow(/different project/i);
  });

  it('refuses a token with the wrong issuer', async () => {
    await expect(verify(makeToken(keys.privateKey, { iss: 'https://evil.example.com/' })))
      .rejects.toThrow(/issuer/i);
  });

  it('refuses an expired token', async () => {
    const exp = Math.floor(Date.now() / 1000) - 60;
    await expect(verify(makeToken(keys.privateKey, { exp }))).rejects.toThrow(/expired/i);
  });

  it('refuses a token with no expiry, rather than treating it as eternal', async () => {
    await expect(verify(makeToken(keys.privateKey, { exp: null })))
      .rejects.toThrow(/expired/i);
  });

  it('refuses a token that names no account', async () => {
    await expect(verify(makeToken(keys.privateKey, { sub: null })))
      .rejects.toThrow(/no account/i);
  });

  it('refuses when Google’s key endpoint is unreachable, rather than failing open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(verify(makeToken(keys.privateKey))).rejects.toThrow(/signing keys/i);
  });
});

describe('verifyIdToken — certificate caching', () => {
  it('does not refetch the certificates for every call', async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ 'test-key': certPem }),
      headers: { get: () => 'max-age=3600' },
    }));
    vi.stubGlobal('fetch', spy);

    const { verifyIdToken } = await import('./auth');
    const token = `Bearer ${makeToken(keys.privateKey)}`;
    await verifyIdToken(token, PROJECT);
    await verifyIdToken(token, PROJECT);
    await verifyIdToken(token, PROJECT);

    // A key fetch per upload is a slow round trip on the request a person is
    // waiting on, and a good way to meet a rate limit at a submission deadline.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

/** Keeps the import used — `X509Certificate` documents what Google really serves. */
void X509Certificate;
void randomUUID;

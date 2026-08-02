/**
 * Google Drive, server-side. The only place the organisation's credential is
 * ever held.
 *
 * ## Why a refresh token and not a service account
 *
 * A service account is the obvious answer and it does not work here. Service
 * accounts have **no Drive storage quota of their own**: an upload into a
 * folder shared with them fails `storageQuotaExceeded`, because the service
 * account would own the resulting file and it has nowhere to put it. The
 * documented fix is a Shared Drive, which requires Google Workspace — this
 * project runs on a consumer Gmail account.
 *
 * So the app acts *as the folder's owner*, using a refresh token that owner
 * granted once (`npm run drive:connect`). Files land in their Drive, on their
 * quota, owned by them. That is a real consequence and not a workaround: the
 * organiser is now underwriting storage for their entrants, which is the
 * trade ADR-026 records.
 *
 * ## Scope
 *
 * `drive.file` — per-file access, granted only to files this app creates. It
 * cannot read anything else in the owner's Drive, which is why the consent
 * screen is not asking for a restricted scope and why a leak of this token is
 * bounded to files we made.
 *
 * No `googleapis` SDK: three REST calls do not justify a dependency that
 * dominates a serverless cold start.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

export interface DriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
}

/** Reads the configuration, or explains precisely which variable is missing. */
export function driveConfig(): DriveConfig | { missing: string[] } {
  const entries = {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
  };
  const missing = Object.entries(entries)
    .filter(([, v]) => !v)
    .map(([k]) => `GOOGLE_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);

  if (missing.length > 0) return { missing };
  return entries as DriveConfig;
}

/**
 * Exchanges the long-lived refresh token for a short-lived access token.
 *
 * Cached in module scope for slightly less than its real lifetime. A serverless
 * instance handles a burst of uploads on one warm container, and a token
 * request per upload is both slow and a good way to meet a rate limit during
 * the exact five minutes a deadline is closing.
 */
let cached: { token: string; expiresAt: number } | null = null;

export async function accessToken(config: DriveConfig): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // A refresh token dies when the owner revokes access, changes their
    // password, or the consent screen stays in "testing" past seven days —
    // that last one is the common surprise, so name it.
    throw new DriveError(
      'notConfigured',
      `Could not refresh the Drive token (${response.status}). If the OAuth consent screen is still in "Testing", its refresh tokens expire after 7 days — publish it, or re-run \`npm run drive:connect\`. ${detail.slice(0, 200)}`,
    );
  }

  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new DriveError('notConfigured', 'Google returned no access token.');
  }

  cached = {
    token: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

export type DriveFailure =
  | 'notConfigured' | 'quotaExceeded' | 'rejected' | 'unknown';

export class DriveError extends Error {
  constructor(readonly failure: DriveFailure, message: string) {
    super(message);
    this.name = 'DriveError';
  }
}

/**
 * Creates a resumable upload session and returns the URL the browser PUTs to.
 *
 * The session is scoped at creation: the parent folder, the name and the type
 * are fixed here, server-side. What the browser receives cannot be redirected
 * to a different folder or a different file — which is what makes it safe to
 * hand out.
 *
 * `subfolderName` groups entries per challenge, so the owner's Drive stays
 * navigable by a human rather than becoming one folder of ten thousand files.
 */
export async function createUploadSession(
  config: DriveConfig,
  token: string,
  file: { name: string; mimeType: string; sizeBytes: number },
  parentId: string,
): Promise<string> {
  const response = await fetch(`${UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.mimeType,
      'X-Upload-Content-Length': String(file.sizeBytes),
    },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.mimeType,
      parents: [parentId],
    }),
  });

  if (response.status === 403) {
    const detail = await response.text().catch(() => '');
    throw new DriveError(
      /quota/i.test(detail) ? 'quotaExceeded' : 'rejected',
      `Drive refused the session: ${detail.slice(0, 300)}`,
    );
  }
  if (!response.ok) {
    throw new DriveError('rejected', `Drive returned ${response.status} creating the session.`);
  }

  const location = response.headers.get('location');
  if (!location) throw new DriveError('rejected', 'Drive created no upload session URL.');
  return location;
}

/**
 * Finds or creates the per-challenge subfolder, once.
 *
 * Cached per container: the lookup is a query, and doing it on every upload
 * turns a busy submission window into an avoidable pile of API calls.
 */
const folderCache = new Map<string, string>();

export async function challengeFolder(
  token: string,
  rootId: string,
  challengeId: string,
): Promise<string> {
  // The id is interpolated into a Drive query expression, so it is validated
  // against an allow-list rather than escaped. Escaping puts the burden on
  // getting every metacharacter right in someone else's query language;
  // refusing anything that is not a Firestore document id cannot be wrong,
  // because that is the only thing this is ever called with.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(challengeId)) {
    throw new DriveError('rejected', 'Refusing an implausible challenge id.');
  }

  const cacheKey = `${rootId}/${challengeId}`;
  const hit = folderCache.get(cacheKey);
  if (hit) return hit;

  const q = [
    `'${rootId}' in parents`,
    `name = '${challengeId}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ');

  const found = await fetch(
    `${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  if (found.ok) {
    const payload = await found.json() as { files?: { id: string }[] };
    const existing = payload.files?.[0]?.id;
    if (existing) {
      folderCache.set(cacheKey, existing);
      return existing;
    }
  }

  const created = await fetch(FILES_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: challengeId,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootId],
    }),
  });

  if (!created.ok) {
    // Not fatal to the upload — fall back to the root folder rather than
    // refusing an entry over filing.
    return rootId;
  }

  const payload = await created.json() as { id: string };
  folderCache.set(cacheKey, payload.id);
  return payload.id;
}

/**
 * Makes the file readable by link, and reads back its real metadata.
 *
 * The permission is the whole point of this step. A file uploaded into a
 * private folder is visible to its owner and nobody else — an entry that looks
 * submitted and shows the judges a blank frame. This is exactly the failure the
 * paste-a-link flow leaves to the entrant to remember; here the server does it,
 * which is the main reason uploading is better than pasting.
 *
 * `anyone/reader` and not something narrower because judging is anonymous to
 * Google: judges are Forge accounts, not Drive accounts, and the app has no
 * list of their Google identities to grant to.
 */
export async function shareAndDescribe(
  token: string,
  fileId: string,
): Promise<{ fileId: string; name: string; mimeType: string; sizeBytes: number }> {
  const permission = await fetch(`${FILES_URL}/${fileId}/permissions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  if (!permission.ok && permission.status !== 409) {
    throw new DriveError(
      'rejected',
      `Uploaded, but could not share the file (${permission.status}). Judges would not be able to open it.`,
    );
  }

  const meta = await fetch(`${FILES_URL}/${fileId}?fields=id,name,mimeType,size`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!meta.ok) throw new DriveError('rejected', `Could not read the file back (${meta.status}).`);

  const payload = await meta.json() as
    { id: string; name: string; mimeType: string; size?: string };

  return {
    fileId: payload.id,
    name: payload.name,
    mimeType: payload.mimeType,
    // Drive reports size as a string, and omits it for Google-native types.
    sizeBytes: Number(payload.size ?? 0),
  };
}

import { verifyIdToken, AuthError } from '../_lib/auth';
import { driveConfig, accessToken, shareAndDescribe, DriveError } from '../_lib/drive';

/**
 * `POST /api/drive/finalize` — shares the uploaded file and returns its `FileRef`.
 *
 * Two jobs, and the first is the one that matters: **set the sharing
 * permission**. A file uploaded into a private folder is visible to the folder's
 * owner and to nobody else, so without this step an entry looks submitted and
 * shows the judges a blank frame — the exact failure the paste-a-link flow
 * leaves entrants to remember. Doing it here, server-side, is the main reason
 * uploading beats pasting.
 *
 * The second is to read the metadata back from Drive rather than trusting what
 * the browser claims. Size and type come from Google, so a `FileRef` records
 * what is actually stored.
 */

interface Req { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
interface Res { status(code: number): Res; json(body: unknown): void }

const fail = (res: Res, status: number, error: string, message: string) =>
  res.status(status).json({ error, message });

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return fail(res, 405, 'unknown', 'Use POST.');

  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return fail(res, 501, 'notConfigured', 'FIREBASE_PROJECT_ID is not set.');

  const config = driveConfig();
  if ('missing' in config) {
    return fail(res, 501, 'notConfigured', `Missing: ${config.missing.join(', ')}.`);
  }

  try {
    const header = req.headers.authorization;
    await verifyIdToken(Array.isArray(header) ? header[0] : header, projectId);
  } catch (error) {
    return fail(res, 401, 'notSignedIn', error instanceof AuthError ? error.message : 'Not signed in.');
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as
    { fileId?: string } | null;
  if (!body?.fileId) return fail(res, 400, 'unknown', 'fileId is required.');

  try {
    const token = await accessToken(config);
    return res.status(200).json(await shareAndDescribe(token, body.fileId));
  } catch (error) {
    if (error instanceof DriveError) {
      return fail(res, error.failure === 'notConfigured' ? 501 : 502, error.failure, error.message);
    }
    return fail(res, 500, 'unknown', (error as Error)?.message ?? 'Could not finalize the upload.');
  }
}

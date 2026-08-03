import { verifyIdToken, AuthError } from '../_lib/auth';
import { driveConfig, accessToken, DriveError } from '../_lib/drive';

/**
 * `GET /api/drive/quota` — how full the organiser's Drive is.
 *
 * ADR-026 moved storage onto the organiser's own 15 GB, which is the price of
 * not requiring entrants to have Google accounts. The consequence nobody
 * notices until it bites: uploads start failing mid-competition with
 * `storageQuotaExceeded`, and the first person to find out is an entrant at a
 * deadline who did nothing wrong.
 *
 * This exists so the admin panel can say "you are at 89%" a week earlier.
 *
 * Reports **the whole account**, not what Forge uploaded — Drive quota is
 * account-wide, so a full Drive stops uploads regardless of what filled it, and
 * a number scoped to our own files would be reassuring and useless.
 */

interface Req { method?: string; headers: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; json(body: unknown): void }

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'unknown', message: 'Use GET.' });
  }

  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    return res.status(501).json({ error: 'notConfigured', message: 'FIREBASE_PROJECT_ID is not set.' });
  }

  const config = driveConfig();
  if ('missing' in config) {
    // Not an error worth a red box: an organisation that has not connected
    // Drive has no quota to report and no uploads to run out of.
    return res.status(200).json({ connected: false });
  }

  // Signed in is enough. The numbers are the organisation's own capacity, and
  // gating them on a permission would hide the warning from the volunteer most
  // likely to be watching the inbox when it matters.
  try {
    const header = req.headers.authorization;
    await verifyIdToken(Array.isArray(header) ? header[0] : header, projectId);
  } catch (error) {
    return res.status(401).json({
      error: 'notSignedIn',
      message: error instanceof AuthError ? error.message : 'Not signed in.',
    });
  }

  try {
    const token = await accessToken(config);
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user(emailAddress)',
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new DriveError('rejected', `Drive returned ${response.status}.`);

    const payload = await response.json() as {
      storageQuota?: { limit?: string; usage?: string };
      user?: { emailAddress?: string };
    };

    // An unlimited account (some Workspace tiers) reports no `limit` at all.
    // `null` says "no ceiling" rather than pretending to a percentage.
    const limit = payload.storageQuota?.limit ? Number(payload.storageQuota.limit) : null;
    const usage = Number(payload.storageQuota?.usage ?? 0);

    return res.status(200).json({
      connected: true,
      account: payload.user?.emailAddress ?? null,
      usageBytes: usage,
      limitBytes: limit,
      fraction: limit && limit > 0 ? Math.min(1, usage / limit) : null,
    });
  } catch (error) {
    if (error instanceof DriveError) {
      return res.status(502).json({ error: error.failure, message: error.message });
    }
    return res.status(500).json({
      error: 'unknown',
      message: (error as Error)?.message ?? 'Could not read the Drive quota.',
    });
  }
}

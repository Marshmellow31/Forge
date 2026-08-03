/**
 * One-time: grants Forge permission to upload into your Google Drive folder.
 *
 *   npm run drive:connect
 *
 * Run it once, locally. It opens Google's consent screen, catches the redirect
 * on `http://localhost:5179/oauth/callback`, exchanges the code for a **refresh
 * token**, and prints the four environment variables to set — locally in
 * `.env.local` and on Vercel.
 *
 * ## What you are granting
 *
 * Scope `drive.file`: per-file access, limited to files this app itself
 * creates. It cannot read, list or touch anything else in your Drive. That is
 * why the consent screen is not asking for a restricted scope, and why a leaked
 * token is bounded to files Forge made rather than to your whole account.
 *
 * ## Prerequisites, in the Google Cloud Console for this project
 *
 *   1. APIs & Services → Library → enable **Google Drive API**
 *   2. Credentials → Create credentials → **OAuth client ID** → Web application
 *      → Authorised redirect URI: exactly `http://localhost:5179/oauth/callback`
 *   3. OAuth consent screen → External → add yourself under **Test users**
 *
 * ## The seven-day trap
 *
 * While the consent screen is in **Testing**, Google expires refresh tokens
 * after seven days and uploads start failing with `invalid_grant`. For anything
 * beyond a trial, publish the consent screen — with only `drive.file` requested
 * that does not require Google's verification review.
 */
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const PORT = 5179;
const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

const ask = async (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
};

/** Opens a URL in the default browser, per platform. Failure is not fatal. */
function open(url: string) {
  const command = process.platform === 'win32' ? 'cmd'
    : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* the URL is printed anyway */
  }
}

/** Waits for Google's redirect and returns the authorisation code. */
function waitForCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
      if (url.pathname !== '/oauth/callback') {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><meta charset="utf-8"><title>Forge</title>`
        + `<body style="font:16px/1.6 system-ui;padding:3rem;max-width:32rem;margin:auto">`
        + (error || !code
          ? `<h1>Not connected</h1><p>Google said: <code>${error ?? 'no code'}</code>.</p>`
          : `<h1>Connected.</h1><p>Close this tab and go back to your terminal.</p>`)
        + `</body>`,
      );

      server.close();
      if (error) return reject(new Error(`Google returned: ${error}`));
      if (!code) return reject(new Error('Google returned no authorisation code.'));
      // A mismatched state means the redirect did not originate from this run.
      if (state !== expectedState) return reject(new Error('State mismatch — start again.'));
      resolve(code);
    });

    server.on('error', reject);
    server.listen(PORT);
  });
}

async function main() {
  console.log('\n  Connect Forge to a Google Drive folder\n');

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? await ask('  OAuth client ID: ');
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? await ask('  OAuth client secret: ');
  const folderInput = await ask('  Drive folder link (or id): ');

  const folderId = /folders\/([A-Za-z0-9_-]{10,})/.exec(folderInput)?.[1] ?? folderInput;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId)) {
    console.error('\n  That does not look like a Drive folder link or id.\n');
    process.exit(1);
  }

  const state = randomBytes(16).toString('hex');
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    // Both are required to be *given* a refresh token at all: without
    // `offline` Google issues only an access token, and without `consent` it
    // silently omits the refresh token on every grant after the first — the
    // single most common reason this flow appears to work and yields nothing.
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();

  console.log(`\n  Opening Google's consent screen. If it does not open:\n\n  ${authUrl}\n`);
  open(authUrl.toString());

  const code = await waitForCode(state);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    console.error(`\n  Token exchange failed (${response.status}):\n  ${await response.text()}\n`);
    process.exit(1);
  }

  const payload = await response.json() as { refresh_token?: string };
  if (!payload.refresh_token) {
    console.error(
      '\n  Google returned no refresh token.\n'
      + '  Revoke Forge at https://myaccount.google.com/permissions and run this again —\n'
      + '  Google only issues one on a fresh grant.\n',
    );
    process.exit(1);
  }

  console.log(`
  Connected.

  Add these to .env.local, and to Vercel → Settings → Environment Variables:

  GOOGLE_OAUTH_CLIENT_ID=${clientId}
  GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}
  GOOGLE_DRIVE_REFRESH_TOKEN=${payload.refresh_token}
  GOOGLE_DRIVE_FOLDER_ID=${folderId}

  Treat the refresh token like a password: it grants upload access to files
  Forge creates in your Drive, and it does not expire on its own.

  While the OAuth consent screen is in "Testing", Google expires it after
  7 days. Publish the screen before you rely on this.
`);
}

main().catch((error) => {
  console.error(`\n  ${(error as Error).message}\n`);
  process.exit(1);
});

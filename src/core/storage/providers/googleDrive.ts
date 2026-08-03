import {
  fileRefSchema, uploadSessionSchema, UploadError,
  type StorageProvider, type StoredFileRef, type UploadOptions, type UploadFailure,
} from '../types';

/**
 * Google Drive, via our own serverless endpoints.
 *
 * **This is the only file in the client allowed to know how Drive uploads
 * work** (hard rule 4). It talks to `/api/drive/*`, never to Google's SDK and
 * never with a Google credential — the token that can write to the
 * organization's folder lives on the server and does not come down here.
 *
 * The three steps:
 *
 *   1. `POST /api/drive/upload-session` — the server checks who is asking,
 *      checks the challenge accepts this file, and mints a resumable session.
 *   2. `PUT` the bytes to Google's session URL, straight from the browser.
 *      This is the only request that carries the file, and it does not touch
 *      our server — see the note in `../types.ts` about body size limits.
 *   3. `POST /api/drive/finalize` — the server sets the sharing permission so
 *      judges can actually open it, and returns the `FileRef` we persist.
 *
 * Step 3 is not decoration. A file uploaded into a private folder is visible to
 * the folder's owner and to nobody else, which would reproduce exactly the
 * failure the paste-a-link flow suffers from — an entry that looks submitted
 * and shows the judges nothing.
 */

const ENDPOINT = {
  session: '/api/drive/upload-session',
  finalize: '/api/drive/finalize',
} as const;

/** Maps an HTTP status onto something a person can act on. */
function failureFor(status: number, code?: string): UploadFailure {
  if (code && isFailure(code)) return code;
  if (status === 401 || status === 403) return 'notSignedIn';
  if (status === 413) return 'tooLarge';
  if (status === 415) return 'unsupportedType';
  if (status === 501) return 'notConfigured';
  if (status === 507) return 'quotaExceeded';
  if (status >= 500) return 'rejected';
  return 'unknown';
}

const FAILURES = new Set<string>([
  'notConfigured', 'notSignedIn', 'tooLarge', 'unsupportedType',
  'network', 'quotaExceeded', 'rejected', 'unknown',
]);
const isFailure = (v: string): v is UploadFailure => FAILURES.has(v);

async function post(url: string, idToken: string, body: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // A rejected `fetch` is a transport failure — DNS, offline, CORS, abort.
    // None of them are the user's fault and all of them are worth retrying.
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new UploadError('network', 'Could not reach the upload service.');
  }

  if (!response.ok) {
    // The endpoint sends `{ error: <UploadFailure>, message }`; a proxy or a
    // platform error will not, hence the status fallback.
    const payload = await response.json().catch(() => null) as
      { error?: string; message?: string } | null;
    throw new UploadError(
      failureFor(response.status, payload?.error),
      payload?.message ?? `Upload service returned ${response.status}.`,
    );
  }

  return response.json() as Promise<unknown>;
}

/**
 * PUTs the file to Google's resumable session with progress.
 *
 * `XMLHttpRequest`, not `fetch`, and deliberately: upload progress needs
 * `upload.onprogress`, and the `fetch` equivalent (a `ReadableStream` request
 * body with duplex) is still not supported across the browsers this has to run
 * in. A progress bar that jumps 0 → 100 on a 40 MB photo over a phone
 * connection is indistinguishable from a hang.
 */
function putBytes(
  uploadUrl: string,
  file: File,
  options: Pick<UploadOptions, 'onProgress' | 'signal'>,
): Promise<{ id?: string; name?: string; mimeType?: string; size?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        fraction: event.total > 0 ? event.loaded / event.total : 0,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText || '{}'));
        } catch {
          // A 2xx with an unreadable body still means the bytes landed; the
          // finalize step re-reads the metadata from Drive anyway.
          resolve({});
        }
        return;
      }
      // 403 from a *session* URL is Drive's quota refusal, not an auth problem
      // — the session was already authorised when it was minted.
      reject(new UploadError(
        xhr.status === 403 ? 'quotaExceeded' : xhr.status === 404 ? 'rejected' : 'network',
        `Google returned ${xhr.status} while receiving the file.`,
      ));
    };

    xhr.onerror = () => reject(new UploadError('network', 'The connection dropped mid-upload.'));
    xhr.ontimeout = () => reject(new UploadError('network', 'The upload timed out.'));

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(file);
  });
}

export const googleDriveProvider: StorageProvider = {
  id: 'googleDrive',
  label: 'the organiser’s Google Drive',

  async upload(file, options) {
    if (!options.idToken) {
      throw new UploadError('notSignedIn', 'An upload has to be recorded against an account.');
    }

    const session = uploadSessionSchema.parse(
      await post(ENDPOINT.session, options.idToken, {
        orgId: options.orgId,
        challengeId: options.challengeId,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      }, options.signal),
    );

    const uploaded = await putBytes(session.uploadUrl, file, options);

    if (!uploaded.id) {
      throw new UploadError('rejected', 'Google accepted the file but did not return an id.');
    }

    const ref = await post(ENDPOINT.finalize, options.idToken, {
      orgId: options.orgId,
      challengeId: options.challengeId,
      fileId: uploaded.id,
    }, options.signal);

    // Parsed rather than cast: this crosses the network, so hard rule 9 applies
    // even though we wrote the endpoint on the other side of it.
    return fileRefSchema.parse(ref) satisfies StoredFileRef;
  },
};

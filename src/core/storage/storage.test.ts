import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadError, UPLOAD_FAILURE_MESSAGE, fileRefSchema, type StorageProvider } from './index';

/**
 * The Drive storage provider's failure handling.
 *
 * The happy path needs a real Google account and is verified by hand; what is
 * worth pinning here is everything that goes wrong, because those are the paths
 * a person actually meets and the ones nobody exercises by accident. An upload
 * that fails silently, or reports "try again" when the organiser's Drive is
 * full, is the difference between an entrant retrying usefully and giving up.
 *
 * `XMLHttpRequest` and `fetch` are both stubbed, so this runs in node with no
 * network.
 */

/** Minimal XHR stand-in — enough surface for the provider's `putBytes`. */
class FakeXHR {
  static lastInstance: FakeXHR | null = null;
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  status = 200;
  responseText = '{"id":"drive_file_1"}';
  aborted = false;

  constructor() { FakeXHR.lastInstance = this; }
  open() { /* noop */ }
  setRequestHeader() { /* noop */ }
  abort() { this.aborted = true; }
  send() {
    // Deliver progress then completion on a later tick, as a real transfer does.
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
      this.onload?.();
    });
  }
}

const file = () =>
  ({ name: 'milky-way.jpg', type: 'image/jpeg', size: 4_000_000 }) as unknown as File;

const options = (over: Partial<Record<string, unknown>> = {}) => ({
  orgId: 'org_demo',
  challengeId: 'ch_milkyway',
  idToken: 'a-token',
  ...over,
} as Parameters<typeof upload>[1]);

let upload: StorageProvider['upload'];

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  const mod = await import('./providers/googleDrive');
  upload = mod.googleDriveProvider.upload.bind(mod.googleDriveProvider);
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXHR.lastInstance = null;
});

/** Responds to the two endpoints in order: session, then finalize. */
function stubEndpoints(session: unknown, finalize: unknown, sessionStatus = 200, finalizeStatus = 200) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const isSession = String(url).includes('upload-session');
    const status = isSession ? sessionStatus : finalizeStatus;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (isSession ? session : finalize),
    };
  }));
}

describe('googleDrive.upload — the happy path', () => {
  it('returns a FileRef built from what Drive reported, not what the browser claimed', async () => {
    stubEndpoints(
      { uploadUrl: 'https://upload.example.com/session/1', name: 'milky-way.jpg' },
      { fileId: 'drive_file_1', name: 'abc12345-milky-way.jpg', mimeType: 'image/jpeg', sizeBytes: 4_000_123 },
    );
    const ref = await upload(file(), options());
    expect(fileRefSchema.safeParse(ref).success).toBe(true);
    // The size is Drive's, not the 4_000_000 the client sent.
    expect(ref.sizeBytes).toBe(4_000_123);
  });

  it('reports progress as a fraction', async () => {
    stubEndpoints(
      { uploadUrl: 'https://upload.example.com/session/1', name: 'x.jpg' },
      { fileId: 'f', name: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 1 },
    );
    const seen: number[] = [];
    await upload(file(), options({ onProgress: (p: { fraction: number }) => seen.push(p.fraction) }));
    expect(seen).toEqual([0.5, 1]);
  });
});

describe('googleDrive.upload — failures a person can act on', () => {
  it('refuses without a token rather than calling the endpoint', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await expect(upload(file(), options({ idToken: '' })))
      .rejects.toMatchObject({ failure: 'notSignedIn' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('maps the endpoint’s own error code when it sends one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 403,
      json: async () => ({ error: 'quotaExceeded', message: 'Drive is full.' }),
    })));
    // The body wins over the status: 403 would otherwise read as "not signed
    // in", which would send the entrant to re-authenticate over a problem that
    // is the organiser's to fix.
    await expect(upload(file(), options())).rejects.toMatchObject({ failure: 'quotaExceeded' });
  });

  it.each([
    [401, 'notSignedIn'],
    [413, 'tooLarge'],
    [415, 'unsupportedType'],
    [501, 'notConfigured'],
    [507, 'quotaExceeded'],
  ])('falls back to the status when there is no code: %i → %s', async (status, failure) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, json: async () => null })));
    await expect(upload(file(), options())).rejects.toMatchObject({ failure });
  });

  it('treats a rejected fetch as a network failure, not an unknown one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(upload(file(), options())).rejects.toMatchObject({ failure: 'network' });
  });

  it('reads a 403 from the session URL as a full Drive, not an auth problem', async () => {
    stubEndpoints({ uploadUrl: 'https://upload.example.com/s', name: 'x' }, {});
    const original = FakeXHR.prototype.send;
    FakeXHR.prototype.send = function send(this: FakeXHR) {
      queueMicrotask(() => { this.status = 403; this.onload?.(); });
    };
    // The session was already authorised when it was minted, so a refusal here
    // is Drive declining to store the bytes.
    await expect(upload(file(), options())).rejects.toMatchObject({ failure: 'quotaExceeded' });
    FakeXHR.prototype.send = original;
  });

  it('fails rather than inventing an id when Drive returns none', async () => {
    stubEndpoints({ uploadUrl: 'https://upload.example.com/s', name: 'x' }, {});
    const original = FakeXHR.prototype.send;
    FakeXHR.prototype.send = function send(this: FakeXHR) {
      queueMicrotask(() => { this.responseText = '{}'; this.onload?.(); });
    };
    await expect(upload(file(), options())).rejects.toMatchObject({ failure: 'rejected' });
    FakeXHR.prototype.send = original;
  });

  it('rejects a malformed session response instead of PUTting into the void', async () => {
    stubEndpoints({ nonsense: true }, {});
    await expect(upload(file(), options())).rejects.toThrow();
  });

  it('rejects a finalize response that is not a FileRef', async () => {
    // Hard rule 9: this crosses the network, so it is parsed even though we
    // wrote the other side of it.
    stubEndpoints(
      { uploadUrl: 'https://upload.example.com/s', name: 'x' },
      { fileId: 'f', name: 'x' },
    );
    await expect(upload(file(), options())).rejects.toThrow();
  });
});

describe('the failure catalogue', () => {
  it('has a message for every failure an UploadError can carry', () => {
    for (const key of Object.keys(UPLOAD_FAILURE_MESSAGE)) {
      expect(UPLOAD_FAILURE_MESSAGE[key as keyof typeof UPLOAD_FAILURE_MESSAGE]).toBeTruthy();
    }
  });

  it('names the organiser, not the entrant, when the Drive is full', () => {
    // Blaming someone for a failure that is not theirs is the fastest way to
    // lose an entrant at a deadline.
    expect(UPLOAD_FAILURE_MESSAGE.quotaExceeded).toMatch(/organiser/i);
    expect(UPLOAD_FAILURE_MESSAGE.quotaExceeded).toMatch(/nothing you did is wrong/i);
  });

  it('carries the failure kind on the error itself', () => {
    const error = new UploadError('tooLarge', 'too big');
    expect(error).toBeInstanceOf(Error);
    expect(error.failure).toBe('tooLarge');
  });
});

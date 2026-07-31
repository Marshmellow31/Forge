import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

/**
 * Credential validation and the admin key gate.
 *
 * Both modules are I/O-free apart from `sessionStorage`, which is stubbed
 * below, so this suite runs in the default node environment with no emulator
 * and no Firebase project.
 */

/**
 * `core/auth/adminKey` reads the parsed environment, and `config/env` refuses
 * to produce one without the Firebase web config. These are the placeholder
 * values a test needs — the schema only asserts they are non-empty.
 */
beforeAll(() => {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
  vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'test.firebasestorage.app');
  vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '1234567890');
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:123:web:abc');
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A `sessionStorage` that behaves like the real one, for the node environment. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

// ---------------------------------------------------------------------------

describe('credentials', () => {
  it.each([
    'ada@example.com',
    'ada+challenges@example.co.uk',
    'a@b.io',
  ])('accepts %s', async (email) => {
    const { validateSignIn } = await import('./credentials');
    expect(validateSignIn({ email, password: 'secret' }).email).toBeUndefined();
  });

  it.each([
    ['', 'Enter your email address.'],
    ['not-an-email', 'That does not look like an email address.'],
    ['missing@tld', 'That does not look like an email address.'],
  ])('rejects %s', async (email, message) => {
    const { validateSignIn } = await import('./credentials');
    expect(validateSignIn({ email, password: 'secret' }).email).toBe(message);
  });

  it('lowercases the address, because firestore.rules looks invites up lowercased', async () => {
    const { emailSchema } = await import('./credentials');
    expect(emailSchema.parse('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('requires a password on sign-in without judging its length', async () => {
    // An existing account may predate the current minimum. Refusing to *try*
    // would lock out the person the reset flow exists for.
    const { validateSignIn } = await import('./credentials');
    expect(validateSignIn({ email: 'ada@example.com', password: 'old' })).toEqual({});
    expect(validateSignIn({ email: 'ada@example.com', password: '' }).password)
      .toBe('Enter your password.');
  });

  it('enforces the minimum length only when creating an account', async () => {
    const { validateSignUp, MIN_PASSWORD_LENGTH } = await import('./credentials');
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateSignUp({ email: 'ada@example.com', password: short }).password)
      .toBe(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    expect(validateSignUp({ email: 'ada@example.com', password: 'a'.repeat(MIN_PASSWORD_LENGTH) }))
      .toEqual({});
  });

  it('reports one message per field, not a stack of them', async () => {
    const { validateSignUp } = await import('./credentials');
    const errors = validateSignUp({ email: 'nope', password: '' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'password']);
    expect(errors.password).toBe('Enter a password.');
  });

  it('rates length above punctuation', async () => {
    const { passwordStrength } = await import('./credentials');
    expect(passwordStrength('short')).toBe('weak');
    expect(passwordStrength('P@ss1!')).toBe('weak'); // symbols, but too short
    expect(passwordStrength('correct12')).toBe('fair');
    expect(passwordStrength('correct horse battery')).toBe('strong');
  });
});

// ---------------------------------------------------------------------------

describe('admin key', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: fakeStorage() });
  });

  it('defaults to forge2026 when VITE_ADMIN_SECRET is unset', async () => {
    const { adminKey } = await import('./adminKey');
    expect(adminKey()).toBe('forge2026');
  });

  it('accepts the key and rejects everything else', async () => {
    const { verifyAdminKey } = await import('./adminKey');
    expect(verifyAdminKey('forge2026')).toBe(true);
    expect(verifyAdminKey('forge2025')).toBe(false);
    expect(verifyAdminKey('Forge2026')).toBe(false); // case matters
    expect(verifyAdminKey('forge2026 extra')).toBe(false);
    expect(verifyAdminKey('')).toBe(false);
  });

  it('tolerates the whitespace a paste brings with it', async () => {
    const { verifyAdminKey } = await import('./adminKey');
    expect(verifyAdminKey('  forge2026\n')).toBe(true);
  });

  it('is locked until an unlock is recorded', async () => {
    const { isUnlocked } = await import('./adminKey');
    expect(isUnlocked('u_admin')).toBe(false);
  });

  it('unlocks for the account that entered the key, and only that one', async () => {
    const { recordUnlock, isUnlocked } = await import('./adminKey');
    recordUnlock('u_admin');
    expect(isUnlocked('u_admin')).toBe(true);
    // The flag outliving the person who set it is the failure this prevents:
    // sign out, sign in as someone else on the same machine, straight in.
    expect(isUnlocked('u_someone_else')).toBe(false);
    expect(isUnlocked(null)).toBe(false);
    expect(isUnlocked(undefined)).toBe(false);
  });

  it('expires after the TTL and clears itself on the way out', async () => {
    const { recordUnlock, isUnlocked, UNLOCK_TTL_MS, unlockRemainingMs } = await import('./adminKey');
    const t0 = 1_700_000_000_000;
    recordUnlock('u_admin', t0);

    expect(isUnlocked('u_admin', t0 + UNLOCK_TTL_MS - 1)).toBe(true);
    expect(unlockRemainingMs('u_admin', t0 + UNLOCK_TTL_MS - 60_000)).toBe(60_000);

    expect(isUnlocked('u_admin', t0 + UNLOCK_TTL_MS)).toBe(false);
    // Expiry is not just reported, it is erased — otherwise a stale record sits
    // there until something else happens to overwrite it.
    expect(isUnlocked('u_admin', t0)).toBe(false);
  });

  it('clears on demand', async () => {
    const { recordUnlock, isUnlocked, clearUnlock } = await import('./adminKey');
    recordUnlock('u_admin');
    clearUnlock();
    expect(isUnlocked('u_admin')).toBe(false);
  });

  it('treats a hand-edited or unparseable record as locked', async () => {
    const { isUnlocked } = await import('./adminKey');
    window.sessionStorage.setItem('forge.admin.unlock', 'not json');
    expect(isUnlocked('u_admin')).toBe(false);
    window.sessionStorage.setItem('forge.admin.unlock', JSON.stringify({ until: 'soon' }));
    expect(isUnlocked('u_admin')).toBe(false);
  });

  it('stays locked when storage is unavailable rather than failing open', async () => {
    // Private browsing, or a blocked storage partition.
    vi.stubGlobal('window', {
      get sessionStorage(): Storage { throw new Error('access denied'); },
    });
    const { recordUnlock, isUnlocked } = await import('./adminKey');
    expect(() => recordUnlock('u_admin')).not.toThrow();
    expect(isUnlocked('u_admin')).toBe(false);
  });
});

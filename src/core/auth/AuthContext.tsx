import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import {
  onAuth, signInWithEmail, signUpWithEmail, sendPasswordReset, resendVerification,
  signOut, type AuthUser,
} from '@core/firebase/auth';
import { readMode, writeMode, clearMode, type AppMode } from './mode';
import { clearUnlock, isUnlocked, recordUnlock, verifyAdminKey } from './adminKey';

/**
 * Identity, available to every layer.
 *
 * This lived in `app/providers/AppProviders.tsx`, which meant every screen that
 * needed to know who the user is imported *upwards* from `modules/` into
 * `app/` — the exact inversion AGENT.md's dependency rule forbids, and which
 * `eslint-plugin-boundaries` now catches. Identity is a `core` concern that
 * modules consume, so it lives here and `app/` merely mounts it.
 *
 * React in `core/` is allowed: hard rule 8 names the four *pure engines*
 * (`forms`, `workflow`, `rbac`, `judging`), not the whole directory —
 * `core/firebase/hooks.ts` is already a React module for the same reason.
 */

export interface AuthValue {
  user: AuthUser | null;
  /** False until the first auth state resolves; screens should not decide anything before it. */
  ready: boolean;
  /** True while a sign-in, sign-up or reset request is in flight. */
  busy: boolean;
  /** Last authentication failure, in language a person can act on. */
  error: string | null;
  /** Last successful non-navigating action, e.g. "reset email sent". */
  notice: string | null;
  /** Clears `error` and `notice` — call when a form field changes. */
  clearMessages: () => void;

  /** Resolves true on success. Callers navigate only when it does. */
  signInEmail: (email: string, password: string) => Promise<boolean>;
  signUpEmail: (email: string, password: string, displayName?: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  resendVerificationEmail: () => Promise<boolean>;
  signOutNow: () => Promise<void>;

  /** Which surface to show. A view preference, never a permission. See mode.ts. */
  mode: AppMode | null;
  setMode: (mode: AppMode) => void;
  /** True once someone has chosen a door; false sends them to onboarding. */
  onboarded: boolean;

  /**
   * Whether this tab has passed the admin panel's key gate.
   *
   * A UI state, emphatically not a permission — read the header of
   * `adminKey.ts`. Never gate a *write* on this; gate it on `usePermissions`,
   * which resolves the same catalog `firestore.rules` enforces.
   */
  adminUnlocked: boolean;
  /** Returns false and sets `error` when the key is wrong. */
  unlockAdmin: (key: string) => boolean;
  lockAdmin: () => void;
}

const noop = () => {};

const AuthContext = createContext<AuthValue>({
  user: null,
  ready: false,
  busy: false,
  error: null,
  notice: null,
  clearMessages: noop,
  signInEmail: async () => false,
  signUpEmail: async () => false,
  resetPassword: async () => false,
  resendVerificationEmail: async () => false,
  signOutNow: async () => {},
  mode: null,
  setMode: noop,
  onboarded: false,
  adminUnlocked: false,
  unlockAdmin: () => false,
  lockAdmin: noop,
});

export const useAuth = () => useContext(AuthContext);

/**
 * Turns a Firebase auth error code into something worth showing a person.
 *
 * The raw codes leak implementation detail and, worse, are actively misleading:
 * `unauthorized-domain` reads as "you are not allowed" when it actually means
 * the deployer forgot a console setting.
 */
function explain(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    // --- Email and password ------------------------------------------------
    // Modern Firebase projects return `invalid-credential` for a wrong password
    // *and* an unknown address, deliberately, so the form cannot be used to
    // discover which addresses have accounts. The message must not undo that by
    // guessing which one it was.
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match an account. Check both, or create an account.';
    case 'auth/invalid-email':
      return 'That does not look like an email address.';
    case 'auth/email-already-in-use':
      return 'An account already exists with that email. Sign in instead, or reset the password.';
    case 'auth/weak-password':
      return 'That password is too short. Use at least 8 characters.';
    case 'auth/user-disabled':
      return 'That account has been disabled. Contact an administrator.';
    case 'auth/missing-password':
      return 'Enter your password.';

    // --- Project configuration ---------------------------------------------
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is not enabled on this Firebase project. Enable it under Firebase console → Authentication → Sign-in method → Email/Password.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for sign-in. Add it under Firebase console → Authentication → Settings → Authorized domains.';
    // The raw code reads as a client bug and sends people looking through their
    // own code. It is not: it means Authentication was never switched on for
    // the project at all, which is one click in the console and impossible to
    // guess from "configuration not found".
    case 'auth/configuration-not-found':
      return 'Sign-in is not set up on this Firebase project yet. Open the Firebase console → Build → Authentication → Get started, then enable the Email/Password provider. Reading works without this; only signing in needs it.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'The Firebase API key is wrong or belongs to a different project. Check VITE_FIREBASE_API_KEY against Firebase console → Project settings → Your apps.';

    // --- Transport ---------------------------------------------------------
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts from this device. Wait a few minutes, or reset your password.';
    case 'auth/requires-recent-login':
      return 'That action needs a fresh sign-in. Sign out and back in, then try again.';
    default:
      return err instanceof Error ? err.message : 'Something went wrong. Try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setModeState] = useState<AppMode | null>(() => readMode());
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  useEffect(() => {
    try {
      return onAuth((u) => {
        setUser(u);
        setReady(true);
        // Re-derived on every identity change rather than kept as independent
        // state: an unlock belongs to one account, so signing out — or signing
        // in as someone else on a shared machine — must not inherit it.
        setAdminUnlocked(isUnlocked(u?.uid));
      });
    } catch {
      // Auth not configured on the project: reads are public, so the app still
      // works. Failing to render here would be a worse outcome than no identity.
      setReady(true);
      return undefined;
    }
  }, []);

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const value = useMemo<AuthValue>(() => {
    /** Runs an auth call, reporting failure rather than throwing at the screen. */
    const run = async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await fn();
        if (success) setNotice(success);
        return true;
      } catch (err) {
        setError(explain(err));
        return false;
      } finally {
        setBusy(false);
      }
    };

    return {
      user,
      ready,
      busy,
      error,
      notice,
      clearMessages,

      signInEmail: (email, password) => run(() => signInWithEmail(email, password)),
      signUpEmail: (email, password, displayName) =>
        run(() => signUpWithEmail(email, password, displayName)),
      // Worded as a conditional on purpose: Firebase succeeds for an unknown
      // address too, and saying "sent" would be a claim we cannot support.
      resetPassword: (email) =>
        run(
          () => sendPasswordReset(email),
          'If that address has an account, a password reset link is on its way. Check spam as well.',
        ),
      resendVerificationEmail: () =>
        run(resendVerification, 'Verification email sent. Follow the link, then reload this page.'),

      // Signing out returns you to the front door: the surface you chose was
      // tied to who you were, and silently keeping it for the next person on a
      // shared machine would be wrong. The admin unlock goes with it, for the
      // same reason and more urgently.
      signOutNow: async () => {
        await run(async () => {
          await signOut();
          clearMode();
          clearUnlock();
          setModeState(null);
          setAdminUnlocked(false);
        });
      },

      mode,
      setMode: (next: AppMode) => {
        writeMode(next);
        setModeState(next);
      },
      onboarded: mode !== null,

      adminUnlocked,
      unlockAdmin: (key: string) => {
        // An unlock is bound to an account, so there has to be one. The panel
        // also needs an identity for its own audit trail to mean anything.
        if (!user) {
          setError('Sign in first — the admin panel is tied to an account.');
          return false;
        }
        if (!verifyAdminKey(key)) {
          setError('That key is not right.');
          return false;
        }
        recordUnlock(user.uid);
        setAdminUnlocked(true);
        setError(null);
        return true;
      },
      lockAdmin: () => {
        clearUnlock();
        setAdminUnlocked(false);
      },
    };
  }, [user, ready, busy, error, notice, mode, adminUnlocked, clearMessages]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

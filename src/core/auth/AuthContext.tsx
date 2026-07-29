import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  onAuth, signInAsGuest, signInWithGoogle, signOut, type AuthUser,
} from '@core/firebase/auth';
import { readMode, writeMode, clearMode, type AppMode } from './mode';

/**
 * Identity, available to every layer.
 *
 * This lived in `app/providers/AppProviders.tsx`, which meant every screen that
 * needed to know who the user is imported *upwards* from `modules/` into
 * `app/` — the exact inversion CLAUDE.md's dependency rule forbids, and which
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
  /** True while a sign-in popup or anonymous handshake is in flight. */
  busy: boolean;
  /** Last sign-in failure, in language a person can act on. */
  error: string | null;
  signIn: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOutNow: () => Promise<void>;

  /** Which surface to show. A view preference, never a permission. See mode.ts. */
  mode: AppMode | null;
  setMode: (mode: AppMode) => void;
  /** True once someone has chosen a door; false sends them to onboarding. */
  onboarded: boolean;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  ready: false,
  busy: false,
  error: null,
  signIn: async () => {},
  signInGoogle: async () => {},
  signOutNow: async () => {},
  mode: null,
  setMode: () => {},
  onboarded: false,
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
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null; // The user chose to stop. Not an error worth reporting.
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for sign-in. Add it under Firebase console → Authentication → Settings → Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled on this Firebase project. Enable it under Authentication → Sign-in method.';
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    default:
      return err instanceof Error ? err.message : 'Sign-in failed. Try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setModeState] = useState<AppMode | null>(() => readMode());

  useEffect(() => {
    try {
      return onAuth((u) => {
        setUser(u);
        setReady(true);
      });
    } catch {
      // Auth not configured on the project: reads are public, so the app still
      // works. Failing to render here would be a worse outcome than no identity.
      setReady(true);
      return undefined;
    }
  }, []);

  const value = useMemo<AuthValue>(() => {
    const run = async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(explain(err));
      } finally {
        setBusy(false);
      }
    };
    return {
      user,
      ready,
      busy,
      error,
      signIn: () => run(signInAsGuest),
      signInGoogle: () => run(signInWithGoogle),
      // Signing out returns you to the front door: the surface you chose was
      // tied to who you were, and silently keeping it for the next person on a
      // shared machine would be wrong.
      signOutNow: () => run(async () => {
        await signOut();
        clearMode();
        setModeState(null);
      }),
      mode,
      setMode: (next: AppMode) => {
        writeMode(next);
        setModeState(next);
      },
      onboarded: mode !== null,
    };
  }, [user, ready, busy, error, mode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

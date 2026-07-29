import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Stack, Typography, CircularProgress } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { c, radius } from '@app/tokens';
import { onAuth, signInAsGuest, signInWithGoogle, type AuthUser } from '@core/firebase/auth';
import { fetchIndexSnapshot, hydrateFromIndex } from '@core/firebase/snapshot';

/**
 * Defaults from CONVENTIONS.md §4, with `staleTime` raised well above the
 * documented 30 s.
 *
 * The demo dataset is rebuilt by `npm run seed`, never by the running app, so
 * every refetch is a guaranteed-identical result billed as fresh document
 * reads. An hour of staleness costs nothing and removes almost all repeat
 * traffic. Restore 30 s when live writes land.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

const AuthContext = createContext<{ user: AuthUser | null }>({ user: null });
export const useAuth = () => useContext(AuthContext);

/**
 * Blocks the app until Firebase Auth resolves, because every read is
 * rules-gated and an unauthenticated read returns permission-denied rather
 * than an empty list. Showing a sign-in door is honest; showing empty tables
 * would not be.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onAuth((u) => {
        setUser(u);
        setReady(true);
      }),
    [],
  );

  const attempt = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: c.surface }}>
        <CircularProgress sx={{ color: c.accent }} />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: c.surface, p: 3 }}>
        <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
          <Box sx={{ width: 56, height: 56, mx: 'auto', mb: 3, borderRadius: '18px', background: c.inverse, display: 'grid', placeItems: 'center', color: c.primary, fontSize: 28, fontWeight: 800 }}>
            F
          </Box>
          <Typography variant="h1" sx={{ fontSize: 34, mb: 1.5 }}>Forge</Typography>
          <Typography sx={{ fontSize: 15, color: c.inkMuted, mb: 4 }}>
            Sign in to view the demo. Guest access is read-only and needs no account.
          </Typography>
          <Stack spacing={1.5}>
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => attempt(signInAsGuest)}
              sx={{ height: 52 }}
              startIcon={<Icon name="visibility" size={20} />}
            >
              Continue as guest
            </Button>
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => attempt(signInWithGoogle)}
              sx={{ height: 52 }}
            >
              Sign in with Google
            </Button>
          </Stack>
          {error && (
            <Box sx={{ mt: 3, p: 2, borderRadius: `${radius.field}px`, background: c.errorContainer, color: c.errorBody, fontSize: 13, textAlign: 'left' }}>
              {error}
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
}

/**
 * Pulls the pre-joined index snapshot once and seeds the whole query cache
 * from it — one document read instead of ~138 across a full walkthrough.
 * See core/firebase/snapshot.ts for the arithmetic.
 *
 * If the snapshot is absent (an older seed, or a project seeded before this
 * existed) nothing breaks: the hooks fall through to their per-collection
 * queries, just more expensively.
 */
function SnapshotHydrator({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchIndexSnapshot()
      .then((snap) => {
        if (!cancelled && snap) hydrateFromIndex(qc, snap);
      })
      .catch(() => {
        /* fall through to per-collection reads */
      })
      .finally(() => !cancelled && setDone(true));
    return () => {
      cancelled = true;
    };
  }, [qc]);

  if (!done) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: c.surface }}>
        <CircularProgress sx={{ color: c.accent }} />
      </Box>
    );
  }
  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <SnapshotHydrator>{children}</SnapshotHydrator>
      </AuthGate>
    </QueryClientProvider>
  );
}

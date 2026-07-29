import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Box, CircularProgress } from '@mui/material';
import { c } from '@app/tokens';
import { onAuth, type AuthUser } from '@core/firebase/auth';
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
 * Optional sign-in.
 *
 * The demo reads world-readable seeded data (ADR-016), so this must never
 * block: 700 viewers should not each mint a throwaway anonymous account, and
 * the app has to render even when Auth is not configured on the project.
 *
 * A signed-in user gets their own name in the shell; everyone else is a
 * viewer. Auth failures are swallowed deliberately — they are not fatal here.
 */
function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    try {
      return onAuth(setUser);
    } catch {
      return undefined; // Auth not configured; the demo does not need it.
    }
  }, []);

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
      <AuthProvider>
        <SnapshotHydrator>{children}</SnapshotHydrator>
      </AuthProvider>
    </QueryClientProvider>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Box, CircularProgress } from '@mui/material';
import { c } from '@shared/design/tokens';
import { AuthProvider } from '@core/auth';
import { fetchIndexSnapshot, hydrateFromIndex } from '@core/firebase/snapshot';
import { PwaPrompts } from '@shared/ui/PwaPrompts';

/**
 * Composition root. Everything here is wiring; the behaviour lives in `core/`.
 *
 * `useAuth` used to be defined in this file, which forced every screen needing
 * identity to import upwards from `modules/` into `app/` — the inversion the
 * dependency rule exists to prevent. It now lives in `@core/auth`; this file
 * only mounts it.
 */

/**
 * Defaults from CONVENTIONS.md §4.
 *
 * `staleTime` is 5 minutes rather than the documented 30 s: reads are billed
 * per document and this data changes on human timescales. It is no longer the
 * one-hour setting used while the app was read-only — writes are live now, so a
 * participant must see their own registration appear without a hard reload.
 * Mutations invalidate the keys they touch, so correctness never depends on
 * this number; only the cost of being briefly behind does.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 24 * 60 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: true,
    },
  },
});

/**
 * Pulls the pre-joined index snapshot once and seeds the whole query cache
 * from it — one document read instead of ~138 across a full walkthrough.
 * See core/firebase/snapshot.ts for the arithmetic.
 *
 * If the snapshot is absent (an older seed, or a project seeded before this
 * existed) nothing breaks: the hooks fall through to their per-collection
 * queries, just more expensively. So a missing snapshot never fails the app.
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
      <Box
        sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: c.surface }}
        role="status"
        aria-live="polite"
        aria-label="Loading Forge"
      >
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
        {/* Outside the hydrator: an update or install offer should not wait on
            a Firestore read, and must still appear if that read fails. */}
        <PwaPrompts />
      </AuthProvider>
    </QueryClientProvider>
  );
}

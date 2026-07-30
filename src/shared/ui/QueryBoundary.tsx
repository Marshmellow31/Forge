import type { ReactNode } from 'react';
import { Box, Stack } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { c, radius } from '@shared/design/tokens';

/**
 * The three states every remote read has. Screens render this instead of
 * hand-rolling a spinner, so "loading" and "permission denied" never get
 * mistaken for "empty" — the failure mode that makes a demo look broken
 * without saying why.
 */
export function QueryBoundary({
  isLoading,
  error,
  children,
  skeletonHeight = 120,
  skeletonRows = 3,
}: {
  isLoading: boolean;
  error?: unknown;
  children: ReactNode;
  skeletonHeight?: number;
  skeletonRows?: number;
}) {
  if (isLoading) {
    return (
      <Stack spacing={2}>
        {Array.from({ length: skeletonRows }, (_, i) => (
          <Box key={i} className="shimmer" sx={{ height: skeletonHeight, borderRadius: `${radius.card}px` }} />
        ))}
      </Stack>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    const denied = /permission|insufficient/i.test(message);
    return (
      <Stack
        direction="row"
        gap={2}
        sx={{ p: 3, borderRadius: `${radius.card}px`, background: c.errorContainer, color: c.onErrorContainer }}
      >
        <Icon name={denied ? 'lock' : 'error'} size={24} color={c.errorInk} />
        <Box>
          <Box sx={{ fontSize: 15, fontWeight: 600, mb: 0.5 }}>
            {denied ? 'Not permitted to read this' : 'Could not load'}
          </Box>
          <Box sx={{ fontSize: 13, lineHeight: 1.55, color: c.errorBody }}>
            {denied
              ? 'Security rules rejected this read. If the data was just seeded, check that VITE_DEMO_ORG_ID matches the seeded organization and that firestore.rules is deployed.'
              : message}
          </Box>
        </Box>
      </Stack>
    );
  }

  return <>{children}</>;
}

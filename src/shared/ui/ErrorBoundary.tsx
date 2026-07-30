import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Icon } from './Icon';
import { c, radius } from '@shared/design/tokens';

/**
 * The last line of defence.
 *
 * Without one of these, a render error anywhere unmounts the entire React tree
 * and the user is left staring at a white page with no explanation and no way
 * forward — the worst failure mode a web app has, because it looks identical to
 * a network outage or a dead server.
 *
 * Placed *inside* the router so "Try again" can re-render the failed route
 * without a full page reload, and so the shell around it survives.
 *
 * A chunk-load failure is singled out because it has a specific, common cause
 * with a specific fix: the app was redeployed while this tab was open, so the
 * hashed chunk this build asked for no longer exists. Reloading genuinely fixes
 * it, and telling someone to "try again" when only a reload works is useless.
 */

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — pass the route so navigation recovers. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

const isChunkError = (error: Error): boolean =>
  /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    `${error.name} ${error.message}`,
  );

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props) {
    // Navigating away from a broken route should clear the error, otherwise the
    // boundary keeps showing its message over a perfectly healthy screen.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry endpoint exists yet, so this is deliberately just a log —
    // better than swallowing it, and honest about what it is.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkError(error);

    return (
      <Box
        role="alert"
        sx={{
          maxWidth: 560, mx: 'auto', my: 6, p: 4,
          borderRadius: `${radius.panel}px`,
          background: c.surfaceCard, border: `1px solid ${c.outline}`,
        }}
      >
        <Icon name={chunk ? 'sync_problem' : 'error'} size={40} color={c.errorInk} />
        <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', mt: 2, mb: 1 }}>
          {chunk ? 'Forge was updated' : 'Something went wrong on this screen'}
        </Typography>
        <Typography sx={{ fontSize: 15, color: c.inkMuted, lineHeight: 1.6, mb: 3 }}>
          {chunk
            ? 'A new version was deployed while this tab was open, so part of the app could not load. Reloading picks up the new version.'
            : 'The rest of Forge is still working — this one screen failed to render. Nothing you saved has been lost.'}
        </Typography>

        <Box
          component="pre"
          sx={{
            fontSize: 12, lineHeight: 1.5, p: 2, mb: 3, overflowX: 'auto',
            borderRadius: `${radius.field}px`,
            background: c.errorContainer, color: c.errorBody,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}
        >
          {error.message || String(error)}
        </Box>

        <Stack direction="row" gap={1.5}>
          {chunk ? (
            <Button variant="contained" onClick={() => window.location.reload()}>Reload</Button>
          ) : (
            <Button variant="contained" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          )}
          <Button variant="outlined" onClick={() => { window.location.href = '/home'; }}>
            Go home
          </Button>
        </Stack>
      </Box>
    );
  }
}

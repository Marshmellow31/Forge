import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Button, CircularProgress, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { Blobs } from '@shared/ui/primitives';
import { useAuth } from '@core/auth';
import { c, radius, ease } from '@shared/design/tokens';

/**
 * The key gate in front of the admin panel.
 *
 * Two conditions, in this order, because they fail for different reasons and
 * deserve different screens: you must be **signed in** (the panel is tied to an
 * account — its audit entries name you), and you must know the **access key**.
 *
 * ## What this gate is and is not
 *
 * It is not security, and the screen says so rather than implying otherwise.
 * The key is compared in the browser against a value that ships in the bundle
 * (see the header of `core/auth/adminKey.ts`), so it decides who is *shown* the
 * console, not who can change anything. Everything the console does is a
 * Firestore write evaluated against `firestore.rules` and the caller's stored
 * membership — force this gate and you get the chrome and a wall of
 * `permission-denied`.
 *
 * Saying that out loud in the UI is deliberate. A gate that looks like a vault
 * gets treated like one, and someone eventually puts something behind it that
 * needed a real lock.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, ready, adminUnlocked, unlockAdmin, error, clearMessages } = useAuth();
  const location = useLocation();
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  // `error` is one slot shared by every auth action, so whatever failed last —
  // a wrong key on a previous visit, a password that did not match — is still
  // sitting in it when this gate mounts. Rendering it here would open the form
  // already red, blaming the key box for something it did not do.
  useEffect(() => clearMessages(), [clearMessages]);

  // Identity has not resolved. Rendering the key form now would flash it at
  // someone who is in fact already unlocked.
  if (!ready) {
    return (
      <Frame>
        <Stack alignItems="center" gap={2} sx={{ py: 4 }}>
          <CircularProgress size={26} sx={{ color: c.accent }} />
          <Typography sx={{ fontSize: 14, color: c.inkMuted }}>Checking your session…</Typography>
        </Stack>
      </Frame>
    );
  }

  if (!user) {
    return (
      <Frame
        icon="account_circle"
        title="Sign in to continue"
        body="The admin panel is tied to an account: every action it takes is recorded against a name, and an anonymous session has none to record."
      >
        <Button
          variant="contained"
          component={Link}
          to="/signin"
          state={{ from: location.pathname }}
          sx={{ height: 52 }}
          startIcon={<Icon name="login" size={20} />}
        >
          Sign in
        </Button>
      </Frame>
    );
  }

  if (adminUnlocked) return <>{children}</>;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // `unlockAdmin` sets the error itself; the state it returns is only needed
    // to decide whether to clear the field.
    if (unlockAdmin(key)) setKey('');
  };

  return (
    <Frame
      icon="key"
      title="Enter the access key"
      body="The admin console is not linked from the main navigation. Enter the key to reveal it for this browser tab."
    >
      <Box component="form" onSubmit={submit} noValidate sx={{ width: '100%' }}>
        <TextField
          fullWidth
          label="Access key"
          type={showKey ? 'text' : 'password'}
          value={key}
          onChange={(e) => { setKey(e.target.value); if (error) clearMessages(); }}
          autoFocus
          autoComplete="off"
          error={Boolean(error)}
          helperText={error ?? ' '}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  edge="end"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  <Icon name={showKey ? 'visibility_off' : 'visibility'} size={20} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Button
          type="submit"
          fullWidth
          variant="contained"
          disabled={key.trim().length === 0}
          sx={{ height: 52, mt: 1 }}
          startIcon={<Icon name="lock_open" size={20} />}
        >
          Unlock admin panel
        </Button>
      </Box>

      <Stack
        direction="row"
        gap={1.5}
        sx={{ mt: 1, p: 2, borderRadius: `${radius.tile}px`, background: c.surfaceContainer, textAlign: 'left' }}
      >
        <Icon name="info" size={20} color={c.primaryIcon} />
        <Typography sx={{ fontSize: 12.5, color: c.inkMuted, lineHeight: 1.6 }}>
          <b>This key hides the console; it does not hold the permissions.</b> What you can actually
          read or change is decided by your role in the organization and enforced by the database
          rules — not by this box. Unlocking lasts for this tab, and ends when you sign out.
        </Typography>
      </Stack>

      <Button variant="text" size="small" component={Link} to="/home" sx={{ mt: 0.5 }}>
        Back to Forge
      </Button>
    </Frame>
  );
}

/** The centred card every state of this gate renders inside. */
function Frame({
  icon, title, body, children,
}: {
  icon?: string;
  title?: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', px: 2, py: { xs: 3, md: 5 } }}>
      <Box
        sx={{
          position: 'relative', overflow: 'hidden', width: '100%', maxWidth: 460,
          p: { xs: 3, md: 4 }, borderRadius: `${radius.panel}px`,
          background: c.surfaceCard, border: `1px solid ${c.outline}`, textAlign: 'center',
        }}
      >
        <Blobs variant="empty" />
        <Stack alignItems="center" gap={2} sx={{ position: 'relative' }}>
          {icon && (
            <Box
              sx={{
                width: 64, height: 64, borderRadius: '20px', background: c.primaryContainer,
                display: 'grid', placeItems: 'center',
                transition: `transform 200ms ${ease}`,
              }}
            >
              <Icon name={icon} size={30} fill color={c.onPrimaryContainer} />
            </Box>
          )}
          {title && (
            <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>{title}</Typography>
          )}
          {body && (
            <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.65 }}>{body}</Typography>
          )}
          {children}
        </Stack>
      </Box>
    </Box>
  );
}

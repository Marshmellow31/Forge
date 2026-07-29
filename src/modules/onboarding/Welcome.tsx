import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { Blobs } from '@shared/ui/primitives';
import { useAuth } from '@core/auth';
import { HOME_FOR, type AppMode } from '@core/auth/mode';
import { c, radius, shadow, ease } from '@shared/design/tokens';

/**
 * S-00 — The front door.
 *
 * Three doors, because Forge serves three arrivals with genuinely different
 * needs, and a single "Sign in" button serves none of them well:
 *
 *   • **Participant** — wants to enter a challenge. Needs an account (a
 *     submission has to be attributable) but nothing else.
 *   • **Organizer** — wants to run one. Needs an account *and* an organization,
 *     and if they have neither the honest next step is "create one", not a
 *     permission-denied screen.
 *   • **Have a look** — wants to judge the product before committing. Needs no
 *     account at all, and asking for one here loses them.
 *
 * The choice sets which *surface* you see, never what you may do. Permissions
 * come from `core/rbac` and are enforced by security rules — picking
 * "organizer" shows you the organizing screens and an empty state, it does not
 * make you one. That distinction is why this screen can be this permissive.
 */

interface Door {
  mode: AppMode;
  icon: string;
  title: string;
  body: string;
  cta: string;
  /** Whether choosing this door requires an account. */
  needsAccount: boolean;
  accent: string;
}

const DOORS: Door[] = [
  {
    mode: 'participant',
    icon: 'emoji_events',
    title: 'I want to enter challenges',
    body: 'Register, submit your work, track deadlines and see your results. Your entries and certificates stay with your account.',
    cta: 'Continue with Google',
    needsAccount: true,
    accent: c.primaryContainer,
  },
  {
    mode: 'organizer',
    icon: 'workspaces',
    title: 'I want to run challenges',
    body: 'Create a competition, frame the questions and requirements, invite judges, score entries and publish results.',
    cta: 'Continue with Google',
    needsAccount: true,
    accent: c.success,
  },
  {
    mode: 'demo',
    icon: 'visibility',
    title: 'Just show me around',
    body: 'Browse a fully seeded organization — six challenges, real entries, live judging — with no account and nothing to set up. Read-only.',
    cta: 'Explore the demo',
    needsAccount: false,
    accent: c.surfaceContainer,
  },
];

export default function Welcome() {
  const nav = useNavigate();
  const { user, signInGoogle, setMode, busy, error } = useAuth();
  const [pending, setPending] = useState<AppMode | null>(null);

  const choose = async (door: Door) => {
    setPending(door.mode);
    try {
      // Already signed in? Then the door is only a view preference and there is
      // no reason to make them authenticate again.
      if (door.needsAccount && !user) {
        await signInGoogle();
      }
      setMode(door.mode);
      nav(HOME_FOR[door.mode]);
    } finally {
      setPending(null);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', background: c.surface, color: c.ink, px: { xs: 2.5, md: 5 }, py: { xs: 4, md: 7 } }}>
      <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: { xs: 4, md: 6 } }}>
          <Box
            sx={{
              width: 40, height: 40, borderRadius: '13px', background: c.inverse,
              color: c.primary, display: 'grid', placeItems: 'center',
              fontSize: 21, fontWeight: 800, letterSpacing: '-.02em',
            }}
          >
            F
          </Box>
          <Typography sx={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Forge</Typography>
        </Stack>

        <Box
          sx={{
            position: 'relative', overflow: 'hidden', mb: { xs: 4, md: 5 },
            borderRadius: `${radius.hero}px`, background: c.primaryContainer,
            p: { xs: '32px 24px', md: '48px 44px' },
          }}
        >
          <Blobs variant="hero" />
          <Box sx={{ position: 'relative', maxWidth: 640 }}>
            <Typography sx={{ fontSize: 'clamp(30px, 4.2vw, 46px)', fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.1, mb: 1.5 }}>
              How do you want to use Forge?
            </Typography>
            <Typography sx={{ fontSize: 17, color: c.inkMuted, lineHeight: 1.6 }}>
              You can change this at any time, and it does not lock anything away — the same
              account can enter a challenge on Monday and run one on Tuesday.
            </Typography>
          </Box>
        </Box>

        {user && (
          <Stack
            direction="row"
            alignItems="center"
            gap={1.5}
            sx={{ mb: 3, p: 2, borderRadius: `${radius.tile}px`, background: c.surfaceContainer }}
          >
            <Icon name="account_circle" size={22} color={c.primaryIcon} />
            <Typography sx={{ fontSize: 14, color: c.inkMuted }}>
              Signed in as <b>{user.displayName ?? user.email ?? 'your account'}</b> — pick a
              surface below.
            </Typography>
          </Stack>
        )}

        {error && (
          <Stack
            direction="row"
            gap={1.5}
            sx={{ mb: 3, p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}
          >
            <Icon name="error" size={22} color={c.errorInk} />
            <Typography sx={{ fontSize: 13.5, color: c.errorBody, lineHeight: 1.6 }}>{error}</Typography>
          </Stack>
        )}

        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          {DOORS.map((door) => {
            const isPending = pending === door.mode;
            return (
              <Box
                key={door.mode}
                component="button"
                onClick={() => void choose(door)}
                disabled={busy}
                sx={{
                  textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                  display: 'flex', flexDirection: 'column',
                  p: 3, border: `1px solid ${c.outline}`, borderRadius: `${radius.card}px`,
                  background: c.surfaceCard,
                  transition: `transform 220ms ${ease}, box-shadow 220ms ${ease}`,
                  '&:hover:not(:disabled)': { transform: 'translateY(-4px)', boxShadow: shadow.card },
                  '&:disabled': { opacity: 0.6, cursor: 'default' },
                }}
              >
                <Box
                  sx={{
                    width: 52, height: 52, borderRadius: '16px', mb: 2.5,
                    background: door.accent, display: 'grid', placeItems: 'center',
                  }}
                >
                  <Icon name={door.icon} size={26} fill color={c.onPrimaryContainer} />
                </Box>

                <Typography sx={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.015em', mb: 1, lineHeight: 1.3 }}>
                  {door.title}
                </Typography>
                <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6, flex: 1, mb: 2.5 }}>
                  {door.body}
                </Typography>

                <Stack direction="row" alignItems="center" gap={1} sx={{ fontSize: 14, fontWeight: 700, color: c.primaryInk }}>
                  {isPending
                    ? <CircularProgress size={16} sx={{ color: c.primaryInk }} />
                    : <Icon name={door.needsAccount ? 'login' : 'arrow_forward'} size={18} />}
                  {isPending ? 'Just a moment…' : (user && door.needsAccount ? 'Continue' : door.cta)}
                </Stack>

                {!door.needsAccount && (
                  <Typography sx={{ fontSize: 12, color: c.inkFaint, mt: 1 }}>
                    No account needed
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ sm: 'center' }}
          gap={1.5}
          sx={{ mt: 4, p: 2.5, borderRadius: `${radius.tile}px`, background: c.surfaceContainer }}
        >
          <Icon name="info" size={22} color={c.primaryIcon} />
          <Typography sx={{ fontSize: 13.5, color: c.inkMuted, lineHeight: 1.6, flex: 1 }}>
            <b>New to organizing?</b> Choosing “run challenges” on a fresh account shows you the
            organizing screens with nothing in them yet — the next step is creating an
            organization, which makes you its owner.
          </Typography>
          <Button
            variant="outlined"
            onClick={() => { setMode('organizer'); nav('/org/new'); }}
            sx={{ flex: 'none' }}
          >
            Create an organization
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

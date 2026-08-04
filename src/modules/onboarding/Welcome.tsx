import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { useAuth, usePermissions } from '@core/auth';
import { type AppMode } from '@core/auth/mode';
import { c, ease, radius, shadow } from '@shared/design/tokens';

interface StartPath {
  mode: AppMode;
  icon: string;
  title: string;
  body: string;
  destination: string;
  steps: string[];
  needsAccount: boolean;
}

const START_PATHS: StartPath[] = [
  {
    mode: 'participant',
    icon: 'emoji_events',
    title: 'I want to enter competitions',
    body: 'Browse what is live, register once and keep every entry, deadline and result together.',
    destination: '/discover',
    steps: ['Discover', 'Register', 'Submit', 'Track results'],
    needsAccount: true,
  },
  {
    mode: 'organizer',
    icon: 'space_dashboard',
    title: 'I help run competitions',
    body: 'Open your organization workspace to manage challenges, participants, judging and results.',
    destination: '/org',
    steps: ['Create', 'Publish', 'Review', 'Reward'],
    needsAccount: true,
  },
];

/** One intent decision, with a visual preview of what happens next. */
export default function Welcome() {
  const nav = useNavigate();
  const { user, busy, setMode } = useAuth();
  const { isAdmin, ready: permissionsReady } = usePermissions();
  const [selected, setSelected] = useState<AppMode>('participant');
  const [pending, setPending] = useState<AppMode | 'admin' | null>(null);
  const chosen = START_PATHS.find((path) => path.mode === selected) ?? START_PATHS[0];

  const continueWith = (path: StartPath) => {
    setPending(path.mode);
    setMode(path.mode);
    if (!user && path.needsAccount) {
      nav(`/signin?next=${encodeURIComponent(path.destination)}`);
      return;
    }
    nav(path.destination);
  };

  const explore = () => {
    setMode('demo');
    nav('/discover');
  };

  return (
    <Box sx={{ minHeight: '100vh', px: { xs: 2, sm: 3, md: 5 }, py: { xs: 2, md: 4 }, background: c.surface, color: c.ink }}>
      <Box sx={{ maxWidth: 1080, mx: 'auto' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: { xs: 3, md: 5 } }}>
          <Brand />
          <Button component={Link} to={user ? '/discover' : '/signin'} variant="text">{user ? 'Skip for now' : 'I already have an account'}</Button>
        </Stack>

        <Box sx={{ display: 'grid', gap: { xs: 3, lg: 4 }, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,.9fr) minmax(420px,1.1fr)' }, alignItems: 'stretch' }}>
          <Box sx={{ p: { xs: 3, sm: 4, md: 5 }, borderRadius: `${radius.hero}px`, background: c.primaryContainer }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: c.primaryInk, mb: 2 }}>One quick choice</Typography>
            <Typography component="h1" sx={{ maxWidth: 520, fontSize: 'clamp(34px,4.8vw,52px)', fontWeight: 760, lineHeight: 1.04, letterSpacing: '-.05em', mb: 2 }}>
              How will you use Forge today?
            </Typography>
            <Typography sx={{ maxWidth: 520, fontSize: 15.5, lineHeight: 1.65, color: c.inkMuted, mb: 4 }}>
              This only arranges your workspace. It never grants an admin role—organization access still comes from an existing administrator.
            </Typography>

            <Stack gap={1.5}>
              {START_PATHS.map((path) => {
                const active = selected === path.mode;
                return (
                  <Box key={path.mode} component="button" type="button" onClick={() => setSelected(path.mode)} aria-pressed={active} sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 1.75, p: 2.25, borderRadius: `${radius.tile}px`, border: `1px solid ${active ? c.outlineStrong : 'transparent'}`, background: active ? c.surfaceCard : 'rgba(255,253,246,.5)', color: c.ink, textAlign: 'left', font: 'inherit', cursor: 'pointer', boxShadow: active ? shadow.raised : 'none', transition: `all 180ms ${ease}` }}>
                    <Box sx={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '14px', background: active ? c.primary : c.surfaceContainer }}><Icon name={path.icon} size={23} color={c.primaryIcon} /></Box>
                    <Box sx={{ flex: 1 }}><Typography sx={{ fontSize: 16, fontWeight: 750, mb: 0.5 }}>{path.title}</Typography><Typography sx={{ fontSize: 13, lineHeight: 1.55, color: c.inkMuted }}>{path.body}</Typography></Box>
                    <Icon name={active ? 'check_circle' : 'radio_button_unchecked'} size={22} fill={active} color={active ? c.successInk : c.inkFaint} />
                  </Box>
                );
              })}
            </Stack>

            <Button fullWidth variant="contained" disabled={busy} onClick={() => continueWith(chosen)} sx={{ height: 54, mt: 3 }} endIcon={pending === chosen.mode ? <CircularProgress size={17} sx={{ color: c.onPrimary }} /> : <Icon name="arrow_forward" size={19} />}>
              {user ? `Open ${chosen.mode === 'participant' ? 'competition discovery' : 'organization workspace'}` : 'Continue to account sign in'}
            </Button>
            <Button fullWidth variant="text" onClick={explore} sx={{ mt: 1 }}>Explore without an account</Button>
          </Box>

          <JourneyPreview path={chosen} />
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5} sx={{ mt: 3, p: 2.25, borderRadius: `${radius.card}px`, background: c.surfaceContainer }}>
          <Icon name="verified_user" size={23} color={c.primaryIcon} />
          <Typography sx={{ flex: 1, fontSize: 13.5, lineHeight: 1.55, color: c.inkMuted }}>
            One account follows you across entries and invitations. Admin accounts manage competitions but cannot enter them.
          </Typography>
          {permissionsReady && isAdmin && (
            <Button variant="outlined" disabled={busy} onClick={() => { setPending('admin'); setMode('organizer'); nav('/admin'); }} endIcon={pending === 'admin' ? <CircularProgress size={16} /> : <Icon name="arrow_forward" size={18} />}>
              Open admin workspace
            </Button>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

function JourneyPreview({ path }: { path: StartPath }) {
  const participant = path.mode === 'participant';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', p: { xs: 3, sm: 4, md: 5 }, borderRadius: `${radius.hero}px`, background: participant ? c.surfaceCard : c.inverse, color: participant ? c.ink : c.onInverse, border: participant ? `1px solid ${c.outline}` : 'none', transition: `background 220ms ${ease}, color 220ms ${ease}` }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 4 }}>
        <Box><Typography sx={{ fontSize: 12, color: participant ? c.inkFaint : c.primary }}>Your next steps</Typography><Typography sx={{ mt: 0.4, fontSize: 19, fontWeight: 750 }}>{participant ? 'From finding a competition to seeing your result' : 'From setup to published results'}</Typography></Box>
        <Box sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: '14px', background: participant ? c.primaryContainer : 'rgba(255,241,185,.14)' }}><Icon name={participant ? 'route' : 'monitoring'} size={24} color={participant ? c.primaryIcon : c.primary} /></Box>
      </Stack>

      <Stack gap={1.5} sx={{ flex: 1 }}>
        {path.steps.map((step, index) => (
          <Stack key={step} direction="row" alignItems="center" gap={1.5} sx={{ position: 'relative', p: 1.75, borderRadius: `${radius.tile}px`, background: participant ? (index === 0 ? c.primaryContainer : c.surfaceContainer) : 'rgba(255,255,255,.07)' }}>
            <Box sx={{ width: 34, height: 34, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '11px', background: participant ? c.surfaceCard : 'rgba(255,241,185,.14)', color: participant ? c.primaryInk : c.primary, fontSize: 12, fontWeight: 800 }}>{index + 1}</Box>
            <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{step}</Typography>
            <Icon name={index === path.steps.length - 1 ? 'flag' : 'arrow_downward'} size={18} color={participant ? c.inkFaint : c.primary} />
          </Stack>
        ))}
      </Stack>

      <Box sx={{ mt: 3, p: 2, borderRadius: `${radius.tile}px`, background: participant ? c.success : 'rgba(205,227,203,.12)' }}>
        <Stack direction="row" alignItems="center" gap={1.25}><Icon name="notifications_active" size={21} color={participant ? c.successInk : c.primary} /><Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>{participant ? 'Deadlines and result updates stay with your account.' : 'Live counts show what needs attention next.'}</Typography></Stack>
      </Box>
    </Box>
  );
}

function Brand() {
  return (
    <Stack component={Link} to="/" direction="row" alignItems="center" gap={1.25} sx={{ color: 'inherit', textDecoration: 'none' }}>
      <Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: '13px', background: c.inverse, color: c.primary, fontSize: 21, fontWeight: 800 }}>F</Box>
      <Typography sx={{ fontSize: 23, fontWeight: 750, letterSpacing: '-.03em' }}>Forge</Typography>
    </Stack>
  );
}

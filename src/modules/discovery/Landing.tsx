import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { useChallenges } from '@core/firebase/hooks';
import { ChallengeCard } from '@shared/ui/ChallengeCard';
import { Blobs, EmptyState, Eyebrow } from '@shared/ui/primitives';
import { c, coverFor, ease, radius, shadow } from '@shared/design/tokens';
import type { Challenge } from '@shared/types/domain';

const PARTICIPANT_STEPS = [
  { icon: 'travel_explore', title: 'Discover', body: 'See what is open right now.' },
  { icon: 'how_to_reg', title: 'Enter', body: 'Complete the organizer’s form.' },
  { icon: 'upload_file', title: 'Submit', body: 'Send work and meet deadlines.' },
  { icon: 'military_tech', title: 'Track', body: 'Follow judging, results and awards.' },
];

const ADMIN_ACTIVITY = [
  { label: 'Registrations', value: '184', progress: 82 },
  { label: 'Submissions', value: '142', progress: 64 },
  { label: 'Reviews complete', value: '318', progress: 76 },
];

const isOpen = (challenge: Challenge) =>
  challenge.visibility === 'public' && (challenge.status === 'running' || challenge.status === 'published');

/**
 * Public first page. Live competitions are above the fold because most people
 * arrive to enter something, not to read a product architecture essay.
 */
export default function Landing() {
  const { data: challenges = [], isLoading, error } = useChallenges();
  const open = useMemo(
    () => challenges.filter(isOpen).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'running' ? -1 : 1;
      return b.counters.registrations - a.counters.registrations;
    }),
    [challenges],
  );

  return (
    <Box sx={{ minHeight: '100vh', background: c.surface, color: c.ink }}>
      <Header />

      <Box component="main" sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2, sm: 3, md: 5 }, pb: 10 }}>
        <Box sx={{ position: 'relative', overflow: 'hidden', display: 'grid', gap: { xs: 4, lg: 6 }, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.08fr) minmax(360px,.92fr)' }, alignItems: 'center', p: { xs: '38px 24px', sm: '48px 36px', lg: '58px 52px' }, borderRadius: `${radius.hero}px`, background: c.primaryContainer }}>
          <Blobs variant="hero" />
          <Box sx={{ position: 'relative' }}>
            <Stack direction="row" alignItems="center" gap={1} sx={{ width: 'fit-content', px: 1.5, py: 0.75, mb: 2.5, borderRadius: `${radius.pill}px`, background: 'rgba(255,253,246,.68)', color: c.primaryInk }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: c.successInk }} />
              <Typography sx={{ fontSize: 12, fontWeight: 750 }}>
                {isLoading ? 'Finding open competitions' : `${open.length} competition${open.length === 1 ? '' : 's'} open now`}
              </Typography>
            </Stack>
            <Typography component="h1" sx={{ maxWidth: 650, fontSize: 'clamp(38px, 5.5vw, 66px)', fontWeight: 760, lineHeight: 1.02, letterSpacing: '-.052em', color: c.onPrimaryContainer, mb: 2.5 }}>
              Find it. Enter it. Make it count.
            </Typography>
            <Typography sx={{ maxWidth: 570, fontSize: { xs: 16, md: 18 }, lineHeight: 1.65, color: c.inkMuted, mb: 4 }}>
              Forge brings competition discovery, registration, submissions, judging and results into one clear experience.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
              <Button component={Link} to="/discover" variant="contained" sx={{ height: 54, px: 3 }} endIcon={<Icon name="arrow_forward" size={20} />}>Explore competitions</Button>
              <Button component={Link} to="/signin" variant="outlined" sx={{ height: 54, px: 3 }}>Sign in</Button>
            </Stack>
            <Typography sx={{ mt: 2, fontSize: 12.5, color: c.inkFaint }}>You can browse without an account. Sign in only when you are ready to enter.</Typography>
          </Box>

          <LivePanel challenges={open.slice(0, 2)} isLoading={isLoading} />
        </Box>

        <Box component="section" aria-labelledby="open-heading" sx={{ pt: { xs: 6, md: 8 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'flex-end' }} justifyContent="space-between" gap={1.5} sx={{ mb: 2.5 }}>
            <Box>
              <Eyebrow>Open now</Eyebrow>
              <Typography id="open-heading" component="h2" sx={{ mt: 0.75, fontSize: { xs: 27, md: 34 }, fontWeight: 750, letterSpacing: '-.035em' }}>Running competitions</Typography>
              <Typography sx={{ mt: 0.75, fontSize: 14.5, color: c.inkMuted }}>Choose a competition to view its details before signing in.</Typography>
            </Box>
            <Button component={Link} to="/discover" variant="text" endIcon={<Icon name="arrow_forward" size={18} />}>View all</Button>
          </Stack>

          {isLoading ? (
            <Stack alignItems="center" sx={{ py: 7 }}><CircularProgress size={28} sx={{ color: c.accent }} /></Stack>
          ) : error ? (
            <EmptyState icon="cloud_off" title="Competitions are temporarily unavailable" body="The rest of Forge is ready. Try this list again in a moment." />
          ) : open.length === 0 ? (
            <EmptyState icon="event_busy" title="No competitions are open right now" body="Check back soon—new competitions will appear here as soon as they are published." />
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(268px,1fr))', gap: 2 }}>
              {open.slice(0, 4).map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} to={`/c/${challenge.slug}`} />)}
            </Box>
          )}
        </Box>

        <Box component="section" aria-labelledby="how-heading" sx={{ pt: { xs: 7, md: 10 } }}>
          <Box sx={{ maxWidth: 680, mb: 3.5 }}>
            <Eyebrow>Everything in one place</Eyebrow>
            <Typography id="how-heading" component="h2" sx={{ mt: 0.75, fontSize: { xs: 28, md: 38 }, fontWeight: 750, lineHeight: 1.15, letterSpacing: '-.04em' }}>See the whole competition journey</Typography>
            <Typography sx={{ mt: 1.25, fontSize: 15.5, lineHeight: 1.65, color: c.inkMuted }}>Participants always know what comes next. Organizers can see what needs attention without stitching together forms, sheets and chat threads.</Typography>
          </Box>

          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '1.08fr .92fr' } }}>
            <ParticipantPreview />
            <AdminPreview />
          </Box>
        </Box>

        <Box component="section" sx={{ pt: { xs: 7, md: 10 } }}>
          <Box sx={{ position: 'relative', overflow: 'hidden', p: { xs: 3, md: '42px 46px' }, borderRadius: `${radius.hero}px`, background: c.inverse, color: c.onInverse }}>
            <Blobs variant="empty" />
            <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} gap={3} sx={{ position: 'relative' }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: { xs: 26, md: 34 }, fontWeight: 750, letterSpacing: '-.035em', mb: 1 }}>Ready when you are.</Typography>
                <Typography sx={{ maxWidth: 620, fontSize: 15, lineHeight: 1.6, color: c.onInverseSurface }}>Create one customer account for your entries and invitations. Organization access is assigned separately by an administrator.</Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.25}>
                <Button component={Link} to="/welcome" variant="contained" endIcon={<Icon name="arrow_forward" size={18} />}>Get started</Button>
                <Button component={Link} to="/signin" variant="outlined" sx={{ color: c.onInverse, borderColor: 'rgba(255,255,255,.38)' }}>Sign in</Button>
              </Stack>
            </Stack>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function Header() {
  return (
    <Stack component="header" direction="row" alignItems="center" sx={{ maxWidth: 1240, height: 76, mx: 'auto', px: { xs: 2, sm: 3, md: 5 } }}>
      <Stack component={Link} to="/" direction="row" alignItems="center" gap={1.25} sx={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>
        <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: '13px', background: c.inverse, color: c.primary, fontSize: 20, fontWeight: 800 }}>F</Box>
        <Typography sx={{ fontSize: 23, fontWeight: 750, letterSpacing: '-.03em' }}>Forge</Typography>
      </Stack>
      <Button component={Link} to="/discover" variant="text" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Competitions</Button>
      <Button component={Link} to="/signin" variant="text">Sign in</Button>
      <Button component={Link} to="/welcome" variant="contained" sx={{ ml: 0.75 }}>Get started</Button>
    </Stack>
  );
}

function LivePanel({ challenges, isLoading }: { challenges: Challenge[]; isLoading: boolean }) {
  return (
    <Box sx={{ position: 'relative', p: { xs: 2.25, sm: 2.75 }, borderRadius: `${radius.panel}px`, background: 'rgba(255,253,246,.82)', border: '1px solid rgba(167,154,106,.28)', boxShadow: shadow.card, backdropFilter: 'blur(14px)' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" gap={1}><Icon name="sensors" size={20} color={c.successInk} /><Typography sx={{ fontSize: 14, fontWeight: 750 }}>Live on Forge</Typography></Stack>
        <Typography sx={{ fontSize: 11.5, color: c.inkFaint }}>Updated automatically</Typography>
      </Stack>
      {isLoading ? (
        <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={24} sx={{ color: c.accent }} /></Stack>
      ) : challenges.length === 0 ? (
        <Box sx={{ py: 5, textAlign: 'center' }}><Icon name="event" size={28} color={c.primaryIcon} /><Typography sx={{ mt: 1, fontSize: 13.5, color: c.inkMuted }}>New competitions will appear here.</Typography></Box>
      ) : (
        <Stack gap={1.25}>
          {challenges.map((challenge) => <LiveRow key={challenge.id} challenge={challenge} />)}
        </Stack>
      )}
      <Button component={Link} to="/discover" fullWidth variant="text" sx={{ mt: 1.5 }} endIcon={<Icon name="arrow_forward" size={18} />}>Browse every competition</Button>
    </Box>
  );
}

function LiveRow({ challenge }: { challenge: Challenge }) {
  return (
    <Stack component={Link} to={`/c/${challenge.slug}`} direction="row" alignItems="center" gap={1.5} sx={{ p: 1.5, borderRadius: `${radius.tile}px`, background: c.surfaceCard, border: `1px solid ${c.outlineSoft}`, color: 'inherit', textDecoration: 'none', transition: `transform 180ms ${ease}, border-color 180ms ${ease}`, '&:hover': { transform: 'translateX(3px)', borderColor: c.outlineStrong } }}>
      <Box sx={{ width: 48, height: 48, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '15px', background: coverFor(challenge.category) }}><Icon name="emoji_events" size={24} color={c.onPrimaryContainer} /></Box>
      <Box sx={{ flex: 1, minWidth: 0 }}><Typography noWrap sx={{ fontSize: 14, fontWeight: 750 }}>{challenge.title}</Typography><Typography noWrap sx={{ mt: 0.25, fontSize: 12, color: c.inkFaint }}>{challenge.category} · {challenge.counters.registrations} entered</Typography></Box>
      <Icon name="chevron_right" size={20} color={c.inkFaint} />
    </Stack>
  );
}

function ParticipantPreview() {
  return (
    <Box sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}` }}>
      <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 3 }}><Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: '13px', background: c.primaryContainer }}><Icon name="person" size={22} color={c.primaryIcon} /></Box><Box><Typography sx={{ fontSize: 12, color: c.inkFaint }}>For participants</Typography><Typography sx={{ fontWeight: 750 }}>A clear path from discovery to result</Typography></Box></Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4,1fr)' }, gap: 1.25 }}>
        {PARTICIPANT_STEPS.map((step, index) => (
          <Box key={step.title} sx={{ position: 'relative', minHeight: 150, p: 2, borderRadius: `${radius.tile}px`, background: index === 1 ? c.primaryContainer : c.surfaceContainer }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, color: c.inkFaint }}>0{index + 1}</Typography><Icon name={step.icon} size={25} color={c.primaryIcon} /><Typography sx={{ mt: 1.5, fontSize: 14, fontWeight: 750 }}>{step.title}</Typography><Typography sx={{ mt: 0.5, fontSize: 12, lineHeight: 1.45, color: c.inkMuted }}>{step.body}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function AdminPreview() {
  return (
    <Box sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: `${radius.panel}px`, background: c.surfaceContainer, border: `1px solid ${c.outline}` }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}><Stack direction="row" alignItems="center" gap={1.25}><Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: '13px', background: c.success }}><Icon name="space_dashboard" size={22} color={c.successInk} /></Box><Box><Typography sx={{ fontSize: 12, color: c.inkFaint }}>For organizers</Typography><Typography sx={{ fontWeight: 750 }}>One live control room</Typography></Box></Stack><Box sx={{ width: 8, height: 8, borderRadius: '50%', background: c.successInk }} /></Stack>
      <Stack gap={2}>
        {ADMIN_ACTIVITY.map((item) => (
          <Box key={item.label}><Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}><Typography sx={{ fontSize: 13, color: c.inkMuted }}>{item.label}</Typography><Typography sx={{ fontSize: 13, fontWeight: 750 }}>{item.value}</Typography></Stack><Box sx={{ height: 7, overflow: 'hidden', borderRadius: 4, background: c.trackAlt }}><Box sx={{ width: `${item.progress}%`, height: '100%', borderRadius: 4, background: c.accent }} /></Box></Box>
        ))}
      </Stack>
      <Stack direction="row" alignItems="center" gap={1.25} sx={{ mt: 3, p: 1.75, borderRadius: `${radius.tile}px`, background: c.surfaceCard }}><Icon name="notifications_active" size={20} color={c.primaryIcon} /><Typography sx={{ flex: 1, fontSize: 12.5, color: c.inkMuted }}>12 entries are ready for judging</Typography><Icon name="arrow_forward" size={18} color={c.primaryIcon} /></Stack>
    </Box>
  );
}

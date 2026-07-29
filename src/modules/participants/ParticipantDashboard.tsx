import { Link, useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import {
  Hero, StatTile, SectionLabel, ProgressBar, StatusPill, EmptyState, liftSx,
} from '@shared/ui/primitives';
import { ChallengeCard, StageStepper } from '@modules/challenges/components';
import { c, radius, ease } from '@app/tokens';
import { useChallenges, useBadges, useCertificates, useCurrentUser } from '@core/firebase/hooks';
import { useAuth } from '@app/providers/AppProviders';
import { QueryBoundary } from '@shared/ui/QueryBoundary';

const BADGE_ICONS: Record<string, string> = {
  b1: 'rocket_launch',
  b2: 'bolt',
  b3: 'emoji_events',
  b4: 'favorite',
  b5: 'wb_twilight',
  b6: 'directions_run',
  b7: 'stars',
};

/** S-51 — Participant dashboard ("Home" in the design). */
export default function ParticipantDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: challenges = [], isLoading, error } = useChallenges();
  const { data: badges = [] } = useBadges();
  const { data: certificates = [] } = useCertificates();
  const { data: profile } = useCurrentUser(user?.uid);
  const displayName = user?.displayName ?? 'there';
  const stats = profile ?? { points: 0, streakDays: 0, challengesEntered: 0, challengesWon: 0 };
  const active = challenges.filter((ch) => ch.status === 'running' || ch.status === 'judging');
  const open = challenges.filter((ch) => ch.status === 'published').slice(0, 3);
  const earned = badges.filter((b) => b.earned);

  return (
    <>
      <Hero>
        <Typography variant="overline" sx={{ display: 'block', color: c.primaryInk, mb: 1.5 }}>
          Tuesday, 28 July
        </Typography>
        <Typography
          variant="h1"
          sx={{ fontSize: 'clamp(32px, 4.6vw, 52px)', color: c.onPrimaryContainer, mb: 1.5, textWrap: 'balance' }}
        >
          {active.length} deadline{active.length === 1 ? '' : 's'}
          <br />
          this week, {displayName.split(' ')[0]}.
        </Typography>
        <Typography sx={{ fontSize: 16, lineHeight: 1.55, color: c.inkMuted, maxWidth: '44ch', mb: 3.5 }}>
          Everything you have entered, everything still open, and what the judges have sent back — in one place.
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1.5}>
          <Button
            onClick={() => navigate(active[0] ? `/c/${active[0].slug}` : '/discover')}
            sx={{
              height: 52,
              px: 3.5,
              borderRadius: '26px',
              background: c.inverse,
              color: c.onInverse,
              transition: `transform 180ms ${ease}`,
              '&:hover': { background: c.inverse, transform: 'translateY(-1px)' },
            }}
            startIcon={<Icon name="bolt" size={20} />}
          >
            Resume my entry
          </Button>
          <Button variant="outlined" component={Link} to="/discover" sx={{ height: 52, px: 3.25, borderRadius: '26px' }}>
            Browse challenges
          </Button>
        </Stack>
      </Hero>

      <QueryBoundary isLoading={isLoading} error={error}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 2, mb: 4.5 }}>
        <StatTile label="Points" value={stats.points.toLocaleString()} icon="bolt" />
        <StatTile label="Day streak" value={stats.streakDays} icon="local_fire_department" />
        <StatTile label="Challenges entered" value={stats.challengesEntered} icon="assignment" />
        <StatTile label="Wins" value={stats.challengesWon} icon="emoji_events" />
      </Box>

      <SectionLabel action={<Button size="small" variant="text" component={Link} to="/me/registrations">All entries</Button>}>
        In progress
      </SectionLabel>
      {active.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Nothing in progress"
          body="Join a challenge and it will show up here with its deadline and stage."
          action={<Button variant="contained" component={Link} to="/discover">Find a challenge</Button>}
        />
      ) : (
        <Stack spacing={2} sx={{ mb: 4.5 }}>
          {active.map((ch) => {
            const done = ch.stages.filter((s) => s.state === 'done').length;
            const pct = Math.round((done / ch.stages.length) * 100);
            return (
              <Box
                key={ch.id}
                onClick={() => navigate(`/c/${ch.slug}`)}
                sx={{
                  ...liftSx,
                  borderRadius: `${radius.card}px`,
                  background: c.surfaceCard,
                  border: `1px solid ${c.outline}`,
                  p: 3,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 3,
                  alignItems: 'flex-start',
                  '&:hover': { boxShadow: '0 4px 14px rgba(60,50,10,.10)', transform: 'translateY(-2px)' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 240 }}>
                  <Stack direction="row" alignItems="center" gap={1.25} flexWrap="wrap" sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>{ch.title}</Typography>
                    <StatusPill status={ch.status} />
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: c.inkMuted, mb: 2.25 }}>
                    Submissions close {ch.timeline.submissionClosesAt}
                  </Typography>
                  <StageStepper stages={ch.stages} />
                </Box>
                <Box sx={{ width: '100%', maxWidth: 240 }}>
                  <ProgressBar value={pct} label={`${done}/${ch.stages.length} stages`} />
                  <Button
                    fullWidth
                    sx={{
                      mt: 2,
                      height: 44,
                      borderRadius: '22px',
                      background: c.primaryContainer,
                      color: c.onPrimaryContainer,
                      '&:hover': { background: c.primary },
                    }}
                  >
                    Open
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}

      <SectionLabel action={<Button size="small" variant="text" component={Link} to="/discover">Browse all</Button>}>
        Open for registration
      </SectionLabel>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 2, mb: 4.5 }}>
        {open.map((ch) => (
          <ChallengeCard key={ch.id} challenge={ch} to={`/c/${ch.slug}`} />
        ))}
      </Box>

      <Box sx={{ borderRadius: `${radius.card}px`, background: c.surfaceContainer, p: 3 }}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2.25 }}>
          <Typography variant="h6">Recent awards</Typography>
          <Button size="small" variant="text" component={Link} to="/me/achievements">All awards</Button>
        </Stack>
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2.5 }}>
          {earned.map((b) => (
            <Stack
              key={b.id}
              direction="row"
              alignItems="center"
              gap={1}
              sx={{ fontSize: 13, fontWeight: 600, px: 1.75, py: 1, borderRadius: '10px', background: c.surfaceCard, border: `1px solid ${c.outline}` }}
            >
              <Icon name={BADGE_ICONS[b.id] ?? 'workspace_premium'} size={17} fill color={c.primaryIcon} />
              {b.name}
            </Stack>
          ))}
        </Stack>
        <Stack spacing={1}>
          {certificates.slice(0, 2).map((cert) => (
            <Stack key={cert.id} direction="row" alignItems="center" gap={1.5}>
              <Icon name="workspace_premium" size={22} fill color={c.primaryIcon} />
              <Typography sx={{ fontSize: 14, flex: 1 }}>{cert.challenge}</Typography>
              <Button size="small" variant="text" component={Link} to={`/verify/${cert.id}`}>Verify</Button>
            </Stack>
          ))}
        </Stack>
      </Box>
      </QueryBoundary>
    </>
  );
}

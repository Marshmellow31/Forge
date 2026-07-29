import { Link, useParams } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { Blobs, EmptyState, Eyebrow, Num, StatTile } from '@shared/ui/primitives';
import { ChallengeCard } from '@shared/ui/ChallengeCard';
import { useOrg, useChallenges } from '@core/firebase/hooks';
import { c, radius } from '@shared/design/tokens';

/**
 * S-09 — Public organization page. ROADMAP Phase 2.
 *
 * The page an organiser sends people to: `forge.app/o/iiitv`. Reachable signed
 * out, because the whole purpose is to be shared with people who have no
 * account yet — asking them to sign in before they can see what a challenge
 * even is loses most of them.
 *
 * **It shows only public challenges.** Not because the rules would leak the
 * others — they would not — but because an organization-visibility challenge
 * appearing on a public page, greyed out, tells the world it exists. That is
 * itself a disclosure the organiser did not choose to make.
 */
export default function PublicOrgPage() {
  const { slug } = useParams();
  const { data: org, isLoading, error } = useOrg();
  const { data: challenges = [] } = useChallenges();

  // The demo serves a single org, so the slug is validated rather than used to
  // look one up. When multi-org lands this becomes a query by slug and nothing
  // else on this screen changes.
  const matches = !slug || !org || org.slug === slug;

  const publicChallenges = challenges.filter((ch) => ch.visibility === 'public');
  const live = publicChallenges.filter((ch) => ch.status === 'running' || ch.status === 'published');
  const past = publicChallenges.filter((ch) => ch.status === 'completed');
  const entrants = publicChallenges.reduce((n, ch) => n + ch.counters.registrations, 0);

  return (
    <Box sx={{ minHeight: '100vh', background: c.surface, color: c.ink }}>
      <Stack
        direction="row"
        alignItems="center"
        gap={1.5}
        sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2.5, md: 5 }, py: 3 }}
      >
        <Box
          component={Link}
          to="/"
          sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none', color: 'inherit' }}
        >
          <Box sx={{ width: 32, height: 32, borderRadius: '10px', background: c.inverse, color: c.primary, display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 800 }}>
            F
          </Box>
          <Typography sx={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em' }}>Forge</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Button component={Link} to="/discover" variant="text">Discover</Button>
        <Button component={Link} to="/welcome" variant="contained">Get started</Button>
      </Stack>

      <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2.5, md: 5 }, pb: 8 }}>
        <QueryBoundary isLoading={isLoading} error={error}>
          {!org || !matches ? (
            <EmptyState
              icon="domain_disabled"
              title="No organization at this address"
              body={`Nothing on Forge is published at /o/${slug ?? ''}.`}
              action={<Button component={Link} to="/discover" variant="contained">Browse challenges</Button>}
            />
          ) : (
            <>
              <Box
                sx={{
                  position: 'relative', overflow: 'hidden', mb: 4,
                  borderRadius: `${radius.hero}px`, background: c.primaryContainer,
                  p: { xs: '32px 24px', md: '48px 44px' },
                }}
              >
                <Blobs variant="hero" />
                <Stack direction="row" alignItems="center" gap={2.5} sx={{ position: 'relative' }}>
                  <Box
                    sx={{
                      width: 72, height: 72, flex: 'none', borderRadius: '22px',
                      background: c.inverse, color: c.primary,
                      display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 800,
                    }}
                  >
                    {org.initials}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Eyebrow>{org.type}</Eyebrow>
                    <Typography sx={{ fontSize: 'clamp(26px, 3.6vw, 40px)', fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.1 }}>
                      {org.name}
                    </Typography>
                    <Typography sx={{ fontSize: 14, color: c.inkMuted, mt: 0.5 }}>
                      forge.app/o/{org.slug}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, mb: 5 }}>
                <StatTile label="Open now" value={live.length} icon="bolt" tone="primary" />
                <StatTile label="Challenges run" value={publicChallenges.length} icon="emoji_events" />
                <StatTile label="Entrants" value={entrants.toLocaleString()} icon="group" />
              </Box>

              <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', mb: 2 }}>
                Open for entries
              </Typography>
              {live.length === 0 ? (
                <Box sx={{ p: 4, borderRadius: `${radius.card}px`, background: c.surfaceContainer, mb: 5 }}>
                  <Typography sx={{ fontSize: 15, color: c.inkMuted }}>
                    Nothing open right now. Past challenges are below.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, mb: 5 }}>
                  {live.map((ch) => (
                    <ChallengeCard key={ch.id} challenge={ch} to={`/c/${ch.slug}`} />
                  ))}
                </Box>
              )}

              {past.length > 0 && (
                <>
                  <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', mb: 2 }}>
                    Finished
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
                    {past.map((ch) => (
                      <ChallengeCard key={ch.id} challenge={ch} to={`/c/${ch.slug}`} />
                    ))}
                  </Box>
                </>
              )}

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ sm: 'center' }}
                gap={2}
                sx={{ mt: 6, p: 3, borderRadius: `${radius.card}px`, background: c.surfaceContainer }}
              >
                <Icon name="rocket_launch" size={26} color={c.primaryIcon} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, mb: 0.25 }}>
                    Run your own challenges
                  </Typography>
                  <Typography sx={{ fontSize: 13.5, color: c.inkMuted, lineHeight: 1.6 }}>
                    <Num>{org.memberCount}</Num> people organize on Forge here. Creating an
                    organization takes about a minute.
                  </Typography>
                </Box>
                <Button component={Link} to="/welcome" variant="contained" sx={{ flex: 'none' }}>
                  Get started
                </Button>
              </Stack>
            </>
          )}
        </QueryBoundary>
      </Box>
    </Box>
  );
}

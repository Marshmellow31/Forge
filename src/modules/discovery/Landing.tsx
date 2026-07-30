import { Link } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { useChallenges } from '@core/firebase/hooks';
import { ChallengeCard } from '@shared/ui/ChallengeCard';
import { Blobs, Eyebrow } from '@shared/ui/primitives';
import { c, radius, ease } from '@shared/design/tokens';

/**
 * S-01 — Marketing landing page.
 *
 * The only screen outside AppShell: it is not part of the design system's
 * screen set, so it borrows the tokens but keeps its own full-bleed layout.
 */

const REPLACES = [
  ['Google Forms', 'Dynamic form builder'],
  ['Drive + email', 'Structured submissions'],
  ['Excel + WhatsApp', 'Rubrics and judge queues'],
  ['A PDF on WhatsApp', 'Live leaderboards'],
  ['Canva, one by one', 'Verifiable certificates'],
  ['Nothing', 'Analytics and audit logs'],
];

const PILLARS = [
  { icon: 'dynamic_form', title: 'Dynamic form engine', body: 'Admins build forms visually. The UI is generated from stored JSON — there is no hardcoded form in the product.' },
  { icon: 'account_tree', title: 'Configurable workflows', body: 'Registration → Submission → Winner, or a six-stage screening funnel. Same engine, different data.' },
  { icon: 'cloud', title: 'Your storage, your quota', body: 'Files upload straight to the organization’s own Drive. We store references, never bytes.' },
  { icon: 'gavel', title: 'Pluggable judging', body: 'Average, weighted, median, trimmed mean, community vote. Strategies are registered, not patched in.' },
];

export default function Landing() {
  const { data: challenges = [] } = useChallenges();

  return (
    <Box sx={{ background: c.surface, color: c.ink, minHeight: '100vh' }}>
      <Stack
        component="header"
        direction="row"
        alignItems="center"
        gap={2}
        sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2.5, md: 5 }, height: 80 }}
      >
        <Box sx={{ width: 36, height: 36, borderRadius: '12px', background: c.inverse, display: 'grid', placeItems: 'center', color: c.primary, fontSize: 19, fontWeight: 800 }}>
          F
        </Box>
        <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', flex: 1 }}>Forge</Typography>
        <Button variant="text" component={Link} to="/discover">Discover</Button>
        <Button variant="contained" component={Link} to="/welcome">Get started</Button>
      </Stack>

      <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2.5, md: 5 }, pb: 8 }}>
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: `${radius.hero}px`,
            background: c.primaryContainer,
            p: { xs: '48px 28px', md: '80px 56px' },
            textAlign: 'center',
          }}
        >
          <Blobs variant="hero" />
          <Box sx={{ position: 'relative' }}>
            <Eyebrow>Multi-tenant SaaS · frontend demo</Eyebrow>
            <Typography
              variant="h1"
              sx={{ fontSize: 'clamp(38px, 6vw, 68px)', color: c.onPrimaryContainer, mt: 2, mb: 2.5, textWrap: 'balance' }}
            >
              The operating system
              <br />
              for engagement
            </Typography>
            <Typography sx={{ fontSize: 18, lineHeight: 1.55, color: c.inkMuted, maxWidth: '46ch', mx: 'auto', mb: 4 }}>
              Create, manage, judge and reward challenges of any kind — from a single configurable platform.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} justifyContent="center">
              <Button
                component={Link}
                to="/welcome"
                sx={{ height: 56, px: 3.5, borderRadius: '28px', background: c.inverse, color: c.onInverse, '&:hover': { background: c.inverse } }}
                endIcon={<Icon name="arrow_forward" size={20} />}
              >
                Get started
              </Button>
              <Button variant="outlined" component={Link} to="/discover" sx={{ height: 56, px: 3.5, borderRadius: '28px' }}>
                Browse challenges
              </Button>
            </Stack>
            <Typography sx={{ fontSize: 13, color: c.inkMuted, mt: 3 }}>
              Photography · Hackathons · Wellness · Design · Community — one architecture
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2.5, md: 5 }, pb: 8 }}>
        <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceContainer, p: { xs: 3, md: 4.5 } }}>
          <Eyebrow>The point</Eyebrow>
          <Typography variant="h5" sx={{ mt: 1, mb: 1 }}>Not a better form. A replaced workflow.</Typography>
          <Typography sx={{ fontSize: 15, color: c.inkMuted, maxWidth: '62ch', mb: 3.5 }}>
            Running a challenge today means seven disconnected tools, no memory, and no audit trail. The pain
            isn’t that forms are bad — it’s fragmentation.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 1.5 }}>
            {REPLACES.map(([before, after]) => (
              <Box key={before} sx={{ borderRadius: `${radius.field}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: 2 }}>
                <Typography sx={{ fontSize: 12, color: c.inkFaint, textDecoration: 'line-through' }}>{before}</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 700, mt: 0.5 }}>{after}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2.5, md: 5 }, pb: 8 }}>
        <Eyebrow>Engineering set-pieces</Eyebrow>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2 }}>
          {PILLARS.map((p) => (
            <Box
              key={p.title}
              sx={{
                borderRadius: `${radius.card}px`,
                background: c.surfaceCard,
                border: `1px solid ${c.outline}`,
                p: 3,
                transition: `transform 200ms ${ease}`,
                '&:hover': { transform: 'translateY(-2px)' },
              }}
            >
              <Icon name={p.icon} size={28} color={c.primaryIcon} />
              <Typography sx={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', mt: 1.5 }}>{p.title}</Typography>
              <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.55, mt: 1 }}>{p.body}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1240, mx: 'auto', px: { xs: 2.5, md: 5 }, pb: 10 }}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h5">Open challenges</Typography>
          <Button variant="text" component={Link} to="/discover" endIcon={<Icon name="arrow_forward" size={18} />}>
            Browse all
          </Button>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))', gap: 2 }}>
          {challenges
            .filter((ch) => ch.visibility === 'public' && ch.status !== 'draft')
            .slice(0, 3)
            .map((ch) => (
              <ChallengeCard key={ch.id} challenge={ch} to={`/c/${ch.slug}`} />
            ))}
        </Box>
      </Box>
    </Box>
  );
}

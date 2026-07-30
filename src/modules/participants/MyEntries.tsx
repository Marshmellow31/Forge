import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { PageTitle, StatusPill, EmptyState, Num, liftSx } from '@shared/ui/primitives';
import { c, radius, coverFor } from '@shared/design/tokens';
import { useChallenges, useSubmissions } from '@core/firebase/hooks';
import { QueryBoundary } from '@shared/ui/QueryBoundary';

/** S-55 — My entries. */

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'judged', label: 'Judged' },
  { key: 'archived', label: 'Archived' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const CATEGORY_ICON: Record<string, string> = {
  Photography: 'photo_camera',
  Hackathon: 'code',
  Wellness: 'directions_run',
  Design: 'draw',
  Community: 'forum',
  Data: 'insights',
  Pitch: 'campaign',
};

export default function MyEntries() {
  const [tab, setTab] = useState<TabKey>('active');
  const navigate = useNavigate();
  const { data: challenges = [], isLoading, error } = useChallenges();
  // The demo user's entries live on the one challenge that has submissions.
  const withSubs = challenges.find((ch) => ch.counters.submissions > 0);
  const { data: submissions = [] } = useSubmissions(withSubs?.id);

  // Demo shape: the current user's entries are the first submission per challenge.
  const mine = challenges
    .map((ch) => ({ ch, sub: submissions.find((s) => s.challengeId === ch.id) }))
    .filter((row): row is { ch: (typeof challenges)[number]; sub: (typeof submissions)[number] } => Boolean(row.sub));

  const rows = mine.filter(({ ch, sub }) => {
    if (tab === 'active') return ch.status === 'running' || ch.status === 'judging';
    if (tab === 'judged') return sub.status === 'reviewed' || ch.status === 'completed';
    return ch.status === 'completed' || ch.status === 'draft';
  });

  return (
    <>
      <PageTitle>My entries</PageTitle>

      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} variant="scrollable" sx={{ mb: 3 }}>
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>

      <QueryBoundary isLoading={isLoading} error={error}>
      {rows.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Nothing here yet"
          body="Entries you archive, or that finish without a placement, collect here."
          action={<Button variant="contained" component={Link} to="/discover">Find a challenge</Button>}
        />
      ) : (
        <Stack spacing={1.5}>
          {rows.map(({ ch, sub }) => (
            <Box
              key={sub.id}
              onClick={() => navigate(`/c/${ch.slug}`)}
              sx={{
                ...liftSx,
                display: 'flex',
                gap: 2.25,
                alignItems: 'center',
                flexWrap: 'wrap',
                borderRadius: `${radius.card}px`,
                background: c.surfaceCard,
                border: `1px solid ${c.outline}`,
                p: 2.5,
                '&:hover': { boxShadow: '0 4px 14px rgba(60,50,10,.09)', transform: 'translateY(-2px)' },
              }}
            >
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  flex: 'none',
                  borderRadius: `${radius.field}px`,
                  display: 'grid',
                  placeItems: 'center',
                  background: coverFor(ch.category),
                }}
              >
                <Icon name={CATEGORY_ICON[ch.category] ?? 'emoji_events'} size={24} color={c.onPrimaryContainer} />
              </Box>

              <Box sx={{ flex: 1, minWidth: 180 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em', mb: 0.5 }}>
                  {ch.title}
                </Typography>
                <Typography sx={{ fontSize: 13, color: c.inkMuted }}>
                  Submitted {sub.submittedAt} · {sub.reviewsDone} of {sub.reviewsTotal} reviews in
                </Typography>
              </Box>

              <StatusPill status={sub.status} label={sub.status === 'underReview' ? 'under review' : sub.status} />

              <Box sx={{ textAlign: 'right', minWidth: 88 }}>
                <Typography sx={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
                  {sub.score === null ? <Box component="span" sx={{ color: c.inkFaint, fontSize: 15 }}>—</Box> : <Num size={20}>{sub.score.toFixed(1)}</Num>}
                </Typography>
                <Typography sx={{ fontSize: 11, color: c.inkFaint }}>
                  {sub.score === null ? 'not scored' : sub.isProvisional ? 'provisional' : 'final'}
                </Typography>
              </Box>

              <Icon name="chevron_right" size={22} color={c.inkFaint} />
            </Box>
          ))}
        </Stack>
      )}
      </QueryBoundary>
    </>
  );
}

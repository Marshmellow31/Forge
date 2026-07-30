import { useMemo } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import {
  PageTitle, EmptyState, StatTile, Eyebrow, ProgressBar, Num, containerSx, panelSx,
} from '@shared/ui/primitives';
import { useChallenges, useMembers } from '@core/firebase/hooks';
import { usePermissions } from '@core/auth';
import { c, coverFor } from '@shared/design/tokens';

/**
 * S-24 — Analytics.
 *
 * Computed from data already in the query cache rather than from a warehouse:
 * the org index snapshot is one document read, and every figure here is derived
 * from it. That keeps the screen free at the cost of only being able to answer
 * questions the snapshot already contains — which is the right trade until
 * someone asks a question it cannot answer.
 *
 * Deliberately no charting library. Every figure here is a ratio or a count,
 * and a bar built from a `<div>` costs nothing while a chart bundle costs
 * 40–100 kB on a screen most people open twice.
 */
export default function Analytics() {
  const { can, ready } = usePermissions();
  const { data: challenges = [], isLoading, error } = useChallenges();
  const { data: members = [] } = useMembers();

  const stats = useMemo(() => {
    const totals = challenges.reduce(
      (acc, ch) => ({
        registrations: acc.registrations + ch.counters.registrations,
        submissions: acc.submissions + ch.counters.submissions,
        reviewsDone: acc.reviewsDone + ch.counters.reviewsCompleted,
        reviewsPending: acc.reviewsPending + ch.counters.reviewsPending,
      }),
      { registrations: 0, submissions: 0, reviewsDone: 0, reviewsPending: 0 },
    );

    const live = challenges.filter((ch) => ch.status === 'running' || ch.status === 'judging');
    const byCategory = new Map<string, number>();
    for (const ch of challenges) {
      byCategory.set(ch.category, (byCategory.get(ch.category) ?? 0) + ch.counters.registrations);
    }

    return {
      ...totals,
      live: live.length,
      // The number organisers actually care about: of the people who signed up,
      // how many produced work? A low rate is the earliest signal a challenge
      // is in trouble, and it is visible long before the deadline.
      conversion: totals.registrations > 0
        ? Math.round((totals.submissions / totals.registrations) * 100)
        : 0,
      reviewProgress: totals.reviewsDone + totals.reviewsPending > 0
        ? Math.round((totals.reviewsDone / (totals.reviewsDone + totals.reviewsPending)) * 100)
        : 100,
      categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [challenges]);

  if (ready && !can('analytics.read')) {
    return (
      <>
        <PageTitle>Analytics</PageTitle>
        <EmptyState
          icon="lock"
          title="You cannot read analytics"
          body="This needs the analytics.read permission."
        />
      </>
    );
  }

  const peak = stats.categories[0]?.[1] ?? 1;

  return (
    <>
      <PageTitle sub="Derived from the organization snapshot — one document read, no warehouse.">
        Analytics
      </PageTitle>

      <QueryBoundary isLoading={isLoading} error={error}>
        {challenges.length === 0 ? (
          <EmptyState icon="analytics" title="Nothing to measure yet" body="Run a challenge first." />
        ) : (
          <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 4 }}>
              <StatTile label="Challenges" value={challenges.length} icon="emoji_events" />
              <StatTile label="Live now" value={stats.live} icon="bolt" tone="primary" />
              <StatTile label="Entrants" value={stats.registrations.toLocaleString()} icon="group" />
              <StatTile label="Members" value={members.length} icon="badge" />
            </Box>

            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 4 }}>
              <Box sx={panelSx}>
                <Eyebrow>Entry → submission</Eyebrow>
                <Stack direction="row" alignItems="baseline" gap={1} sx={{ mt: 1.5, mb: 2 }}>
                  <Typography sx={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1 }}>
                    {stats.conversion}%
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: c.inkMuted }}>
                    <Num>{stats.submissions}</Num> of <Num>{stats.registrations}</Num> entrants submitted
                  </Typography>
                </Stack>
                <ProgressBar value={stats.conversion} />
                <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6, mt: 2 }}>
                  The earliest signal a challenge is in trouble. People who registered but never
                  submitted are the ones worth a reminder — long before the deadline, not after.
                </Typography>
              </Box>

              <Box sx={panelSx}>
                <Eyebrow>Judging progress</Eyebrow>
                <Stack direction="row" alignItems="baseline" gap={1} sx={{ mt: 1.5, mb: 2 }}>
                  <Typography sx={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1 }}>
                    {stats.reviewProgress}%
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: c.inkMuted }}>
                    <Num>{stats.reviewsPending}</Num> reviews outstanding
                  </Typography>
                </Stack>
                <ProgressBar
                  value={stats.reviewProgress}
                  color={stats.reviewProgress < 50 ? c.error : c.accent}
                />
                <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6, mt: 2 }}>
                  Results cannot be published while reviews are outstanding — a missing review is
                  never counted as a zero.
                </Typography>
              </Box>
            </Box>

            <Box sx={{ ...panelSx, mb: 4 }}>
              <Eyebrow>Entrants by category</Eyebrow>
              <Stack gap={2} sx={{ mt: 2 }}>
                {stats.categories.map(([category, count]) => (
                  <Box key={category}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{category}</Typography>
                      <Num>{count}</Num>
                    </Stack>
                    <Box sx={{ height: 10, borderRadius: '5px', background: c.track, overflow: 'hidden' }}>
                      <Box
                        sx={{
                          height: '100%',
                          width: `${Math.round((count / peak) * 100)}%`,
                          background: coverFor(category),
                          borderRadius: '5px',
                        }}
                      />
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>

            <Stack direction="row" gap={1.75} sx={{ ...containerSx, p: 2.25 }}>
              <Icon name="info" size={22} color={c.primaryIcon} />
              <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.6 }}>
                These figures come from each challenge's denormalized <b>counters</b>. Registration
                and submission counts are maintained live; review counts are seeded and will not
                move until a Cloud Function owns them (ADR-019). Treat judging progress as
                indicative until then.
              </Typography>
            </Stack>
          </>
        )}
      </QueryBoundary>
    </>
  );
}

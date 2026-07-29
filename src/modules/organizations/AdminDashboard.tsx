import { Link } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { StatTile, Eyebrow } from '@shared/ui/primitives';
import { c, radius, mono } from '@app/tokens';
import { useChallenges, useOrg, useAuditLog } from '@core/firebase/hooks';
import { QueryBoundary } from '@shared/ui/QueryBoundary';

/** S-13 — Admin dashboard ("Organization" in the design). */
export default function AdminDashboard() {
  const { data: challenges = [], isLoading, error } = useChallenges();
  const { data: activeOrg } = useOrg();
  const { data: auditLog = [] } = useAuditLog();

  const totals = challenges.reduce(
    (acc, ch) => ({
      registrations: acc.registrations + ch.counters.registrations,
      submissions: acc.submissions + ch.counters.submissions,
      pending: acc.pending + ch.counters.reviewsPending,
    }),
    { registrations: 0, submissions: 0, pending: 0 },
  );
  const live = challenges.filter((ch) => ch.status === 'running' || ch.status === 'judging');

  const attention = [
    ...challenges
      .filter((ch) => ch.counters.reviewsPending > 0)
      .slice(0, 2)
      .map((ch) => ({
        icon: 'gavel',
        fg: c.primaryIcon,
        bg: c.primaryContainer,
        title: `${ch.counters.reviewsPending} reviews outstanding`,
        body: ch.title,
        action: 'Open',
        to: `/org/challenges/${ch.id}`,
      })),
    {
      icon: 'how_to_reg',
      fg: c.successInk,
      bg: c.success,
      title: '2 registrations awaiting approval',
      body: challenges[0]!.title,
      action: 'Review',
      to: `/org/challenges/${challenges[0]!.id}`,
    },
  ];

  return (
    <>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 3.5 }}>
        <Box>
          <Eyebrow>{activeOrg?.name ?? '…'} · {activeOrg?.plan ?? ''}</Eyebrow>
          <Typography variant="h2" sx={{ fontSize: 'clamp(30px, 3.8vw, 44px)', mt: 1 }}>Organization</Typography>
        </Box>
        <Button variant="contained" sx={{ height: 52 }} startIcon={<Icon name="add" size={20} />}>
          New challenge
        </Button>
      </Stack>

      <QueryBoundary isLoading={isLoading} error={error}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 2, mb: 4 }}>
        <StatTile label="Live challenges" value={live.length} tone="primary" />
        <StatTile label="Registrations" value={totals.registrations} delta={12} />
        <StatTile label="Submissions" value={totals.submissions} delta={8} />
        <StatTile label="Reviews pending" value={totals.pending} tone={totals.pending > 0 ? 'container' : 'success'} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1.4fr) minmax(0,1fr)' }, gap: 2.5, alignItems: 'start' }}>
        <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>Needs your attention</Typography>
          <Typography sx={{ fontSize: 13, color: c.inkMuted, mb: 2.25 }}>
            {attention.length} items are blocking a result announcement.
          </Typography>
          <Stack spacing={1.25}>
            {attention.map((a) => (
              <Stack
                key={a.title}
                direction="row"
                gap={1.75}
                alignItems="center"
                sx={{ p: 2, borderRadius: `${radius.row}px`, background: a.bg }}
              >
                <Icon name={a.icon} size={22} color={a.fg} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.25 }}>{a.title}</Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: c.inkMuted }}>{a.body}</Typography>
                </Box>
                <Button size="small" variant="text" component={Link} to={a.to}>{a.action}</Button>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceContainer, p: 3 }}>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2.25 }}>
            <Typography variant="h6">Recent activity</Typography>
            <Button size="small" variant="text" component={Link} to="/org/audit">Full log</Button>
          </Stack>
          <Stack>
            {auditLog.slice(0, 6).map((a) => (
              <Stack
                key={a.id}
                direction="row"
                gap={1.5}
                sx={{ py: 1.5, borderBottom: `1px solid ${c.outline}`, '&:last-of-type': { borderBottom: 'none' } }}
              >
                <Box sx={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: c.inverse, color: c.primary, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                  {a.actor.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, lineHeight: 1.45 }}>
                    <Box component="strong" sx={{ fontWeight: 600 }}>{a.actor}</Box> {a.action}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: c.inkFaint, mt: 0.25 }}>{a.target}</Typography>
                </Box>
                <Box sx={{ fontSize: 11, color: c.inkFaint, whiteSpace: 'nowrap', fontFamily: mono }}>{a.at}</Box>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Box>
      </QueryBoundary>
    </>
  );
}

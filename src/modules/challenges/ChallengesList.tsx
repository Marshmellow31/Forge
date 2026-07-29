import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { challenges, getWorkspace } from '@mock/data';
import { PageTitle, EmptyState, StatusPill, TableHead, tableRowSx, Num } from '@shared/ui/primitives';
import { c, radius, coverFor } from '@app/tokens';

const TABS = ['All', 'draft', 'published', 'running', 'judging', 'completed'];

/** S-26 — Admin challenges list. The design renders this as a list table. */
export default function ChallengesList() {
  const [tab, setTab] = useState(0);
  const navigate = useNavigate();

  const rows = useMemo(
    () => challenges.filter((ch) => tab === 0 || ch.status === TABS[tab]),
    [tab],
  );

  return (
    <>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 3 }}>
        <PageTitle>Challenges</PageTitle>
        <Button variant="contained" sx={{ height: 52, mb: 2 }} startIcon={<Icon name="add" size={20} />}>
          New challenge
        </Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" sx={{ mb: 3 }}>
        {TABS.map((t) => (
          <Tab key={t} label={t} sx={{ textTransform: 'capitalize' }} />
        ))}
      </Tabs>

      {rows.length === 0 ? (
        <EmptyState icon="emoji_events" title="No challenges here" body="Nothing in this state yet." />
      ) : (
        <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
          <TableHead
            cols={[
              { label: 'Challenge' },
              { label: 'Entries', width: 96, align: 'right' },
              { label: 'Reviews', width: 96, align: 'right' },
              { label: 'Status', width: 120 },
            ]}
          />
          {rows.map((ch) => {
            const ws = getWorkspace(ch.workspaceId);
            const pending = ch.counters.reviewsPending;
            return (
              <Box
                key={ch.id}
                onClick={() => navigate(`/org/challenges/${ch.id}`)}
                sx={{ ...tableRowSx, cursor: 'pointer' }}
              >
                <Box sx={{ width: 40, height: 40, flex: 'none', borderRadius: '12px', background: coverFor(ch.category) }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 15, fontWeight: 600 }}>{ch.title}</Typography>
                  <Typography sx={{ fontSize: 12, color: c.inkFaint }}>
                    {ws?.name} · closes {ch.timeline.submissionClosesAt}
                  </Typography>
                </Box>
                <Box sx={{ width: 96, textAlign: 'right', flex: 'none' }}>
                  <Num>{ch.counters.registrations}</Num>
                </Box>
                <Box sx={{ width: 96, textAlign: 'right', flex: 'none', color: pending > 0 ? c.errorInk : c.inkMuted }}>
                  <Num>{pending > 0 ? `${pending} left` : 'done'}</Num>
                </Box>
                <Box sx={{ width: 120, flex: 'none' }}>
                  <StatusPill status={ch.status} />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </>
  );
}

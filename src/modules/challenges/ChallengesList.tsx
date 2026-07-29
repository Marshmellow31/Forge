import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, Button, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { useChallenges, useWorkspaces } from '@core/firebase/hooks';
import { useSaveChallenge } from '@core/firebase/mutations';
import { useAuth, usePermissions } from '@core/auth';
import { newChallengeId, uniqueSlug } from '@core/challenges/slug';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { PageTitle, EmptyState, StatusPill, TableHead, tableRowSx, Num } from '@shared/ui/primitives';
import { CoverImage } from '@shared/ui/CoverImage';
import { c, radius } from '@shared/design/tokens';

const TABS = ['All', 'draft', 'published', 'running', 'judging', 'completed'];

/** S-26 — Admin challenges list. The design renders this as a list table. */
export default function ChallengesList() {
  const [tab, setTab] = useState(0);
  const { data: challenges = [], isLoading, error } = useChallenges();
  const { data: workspaces = [] } = useWorkspaces();
  const getWorkspace = (id: string) => workspaces.find((w) => w.id === id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const clone = useSaveChallenge();
  const canCreate = can('challenge.create');

  /**
   * Clone-to-create. ROADMAP Phase 2 "challenge templates".
   *
   * The copy is always a **draft**, always gets a fresh id and slug, and
   * deliberately does not carry the original's counters, timeline or entrants —
   * duplicating a running challenge should give you a blank competition shaped
   * like it, not a second one claiming 184 entrants who never entered.
   *
   * The form schema *is* shared: schemas are versioned and immutable once
   * published (hard rule 6), so pointing at the same version is correct and
   * avoids a pointless duplicate.
   */
  const duplicate = async (source: (typeof challenges)[number]) => {
    const title = `${source.title} (copy)`;
    const id = newChallengeId(title);
    await clone.mutateAsync({
      input: {
        id,
        workspaceId: source.workspaceId,
        title,
        slug: uniqueSlug(title, challenges.map((c2) => c2.slug)),
        description: source.description,
        category: source.category,
        tags: source.tags ?? [],
        status: 'draft',
        visibility: source.visibility,
        cover: source.cover ?? '',
        formSchemaId: source.formSchemaId,
        formSchemaVersion: 1,
        prize: source.prize ?? '',
        blindJudging: source.blindJudging ?? false,
        teamsEnabled: source.teamsEnabled ?? false,
        maxTeamSize: source.maxTeamSize ?? 4,
        leaderboardMode: source.leaderboardMode,
        stages: source.stages.map((s) => ({ ...s, state: 'locked' as const })),
        // Dates are the one thing that never survives a copy: they described
        // the original's calendar, and silently inheriting them would create a
        // challenge whose deadline has already passed.
        timeline: { registrationClosesAt: null, submissionClosesAt: null, resultsAt: null },
      },
      userId: user?.uid,
      isNew: true,
    });
    navigate(`/org/challenges/${id}/edit`);
  };

  const rows = useMemo(
    () => challenges.filter((ch) => tab === 0 || ch.status === TABS[tab]),
    [tab, challenges],
  );

  return (
    <>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 3 }}>
        <PageTitle>Challenges</PageTitle>
        <Button
          component={Link}
          to="/org/challenges/new"
          variant="contained"
          sx={{ height: 52, mb: 2 }}
          startIcon={<Icon name="add" size={20} />}
        >
          New challenge
        </Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" sx={{ mb: 3 }}>
        {TABS.map((t) => (
          <Tab key={t} label={t} sx={{ textTransform: 'capitalize' }} />
        ))}
      </Tabs>

      <QueryBoundary isLoading={isLoading} error={error}>
      {rows.length === 0 ? (
        <EmptyState
          icon="emoji_events"
          title={tab === 0 ? 'No challenges yet' : 'Nothing in this state'}
          body={tab === 0
            ? 'Create your first challenge — you can save it as a draft and keep editing.'
            : `No challenge is currently ${TABS[tab]}.`}
          action={tab === 0 ? (
            <Button
              component={Link}
              to="/org/challenges/new"
              variant="contained"
              startIcon={<Icon name="add" size={20} />}
            >
              New challenge
            </Button>
          ) : undefined}
        />
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
                <Box sx={{ width: 40, height: 40, flex: 'none' }}>
                  <CoverImage cover={ch.cover} category={ch.category} height={40} width={80} radius={12} />
                </Box>
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
                {canCreate && (
                  <Tooltip title="Duplicate as a new draft">
                    <IconButton
                      size="small"
                      aria-label={`Duplicate ${ch.title}`}
                      disabled={clone.isPending}
                      onClick={(e) => {
                        // The row itself navigates; duplicating must not.
                        e.stopPropagation();
                        void duplicate(ch);
                      }}
                    >
                      <Icon name="content_copy" size={18} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            );
          })}
        </Box>
      )}
      </QueryBoundary>
    </>
  );
}

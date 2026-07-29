import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import {
  useChallenge, useWorkspaces, useRegistrations, useSubmissions, useLeaderboard,
  useRubric, useFormSchemas, useChallengeSnapshot,
} from '@core/firebase/hooks';
import { ListSkeleton } from '@shared/ui/primitives';
import { StageStepper } from './components';
import {
  StatTile, EmptyState, PersonCell, ScoreCell, StatusPill, SectionLabel, TableHead,
  tableRowSx, Num, Tag, ProgressBar,
} from '@shared/ui/primitives';
import { c, radius, mono } from '@app/tokens';

const TABS = ['Overview', 'Registrations', 'Submissions', 'Judging', 'Leaderboard'];

/** S-28 — Challenge control room. */
export default function ChallengeControlRoom() {
  const { cid } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  // One pre-joined read fills registrations/submissions/rubric/leaderboard.
  const { isLoading: snapLoading } = useChallengeSnapshot(cid);
  const { data: ch, isLoading } = useChallenge(cid);
  const { data: workspaces = [] } = useWorkspaces();
  const { data: schemas = {} } = useFormSchemas();
  const { data: regs = [] } = useRegistrations(cid);
  const { data: subs = [] } = useSubmissions(cid);
  const { data: rubric = [] } = useRubric(cid);
  const { data: leaderboard = [] } = useLeaderboard(cid);

  if (isLoading || snapLoading) return <ListSkeleton rows={3} height={140} />;
  if (!ch) return <EmptyState icon="warning" title="Challenge not found" />;

  const schema = schemas[ch.formSchemaId];
  const lateOffline = subs.filter((s) => s.clientSubmittedAt);

  return (
    <>
      <Button
        onClick={() => navigate('/org/challenges')}
        variant="text"
        sx={{ mb: 1.5, color: c.inkMuted, pl: 1 }}
        startIcon={<Icon name="arrow_back" size={20} />}
      >
        Challenges
      </Button>

      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 2.5 }}>
        <Box>
          <Stack direction="row" alignItems="center" gap={1.25} flexWrap="wrap" sx={{ mb: 0.75 }}>
            <Typography variant="h2" sx={{ fontSize: 'clamp(28px, 3.4vw, 40px)' }}>{ch.title}</Typography>
            <StatusPill status={ch.status} />
          </Stack>
          <Typography sx={{ fontSize: 14, color: c.inkMuted }}>
            {workspaces.find((w) => w.id === ch.workspaceId)?.name} · form {schema?.id ?? '—'} v{schema?.version ?? '?'} ·{' '}
            {ch.counters.submissions} of {ch.counters.registrations} submitted
          </Typography>
        </Box>
        <Stack direction="row" gap={1.25} flexWrap="wrap">
          <Button variant="outlined" component={Link} to={`/org/challenges/${ch.id}/form`} startIcon={<Icon name="dynamic_form" size={20} />}>
            Form builder
          </Button>
          <Button variant="outlined" component={Link} to={`/c/${ch.slug}`}>Public page</Button>
          <Button sx={{ background: c.inverse, color: c.onInverse, '&:hover': { background: c.inverse } }}>
            Publish results
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ borderRadius: `${radius.card}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: 2.5, mb: 3 }}>
        <StageStepper stages={ch.stages} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 2, mb: 3 }}>
        <StatTile label="Registrations" value={ch.counters.registrations} />
        <StatTile label="Submissions" value={ch.counters.submissions} />
        <StatTile label="Reviews done" value={ch.counters.reviewsCompleted} tone="success" />
        <StatTile label="Reviews pending" value={ch.counters.reviewsPending} tone="primary" />
      </Box>

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" sx={{ mb: 3 }}>
        {TABS.map((t) => <Tab key={t} label={t} />)}
      </Tabs>

      {tab === 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1.6fr) minmax(0,1fr)' }, gap: 2.5, alignItems: 'start' }}>
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: 3 }}>
            <Typography variant="overline" sx={{ display: 'block' }}>Description</Typography>
            <Typography sx={{ fontSize: 15, lineHeight: 1.6, color: c.inkBody, mt: 1, mb: 3 }}>{ch.description}</Typography>
            <Typography variant="overline" sx={{ display: 'block', mb: 1.5 }}>Rubric</Typography>
            <Stack spacing={1.25}>
              {rubric.map((r) => (
                <Box key={r.id} sx={{ borderRadius: `${radius.tile}px`, background: c.surfaceContainer, p: '16px 18px' }}>
                  <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1.5} sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{r.name}</Typography>
                    <Stack direction="row" gap={0.75}>
                      <Tag>{`${(r.weight * 100).toFixed(0)}%`}</Tag>
                      <Tag bg={c.surfaceCard} fg={c.inkMuted}>{`max ${r.max}`}</Tag>
                    </Stack>
                  </Stack>
                  <Typography sx={{ fontSize: 13, color: c.inkMuted }}>{r.description}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceContainer, p: 3 }}>
            <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>Timeline</Typography>
            {[
              ['Registration closes', ch.timeline.registrationClosesAt],
              ['Submissions close', ch.timeline.submissionClosesAt],
              ['Results', ch.timeline.resultsAt],
            ].map(([k, v]) => (
              <Stack key={k} direction="row" justifyContent="space-between" gap={2} sx={{ py: 1.5, borderBottom: `1px solid ${c.outline}` }}>
                <Typography sx={{ fontSize: 14, color: c.inkMuted }}>{k}</Typography>
                <Box sx={{ fontFamily: mono, fontSize: 13 }}>{v}</Box>
              </Stack>
            ))}
            <Typography variant="overline" sx={{ display: 'block', mt: 2.5, mb: 0.5 }}>Reward</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{ch.prize}</Typography>
            <Typography variant="overline" sx={{ display: 'block', mt: 2.5, mb: 0.5 }}>Leaderboard</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 600, textTransform: 'capitalize' }}>{ch.leaderboardMode}</Typography>
          </Box>
        </Box>
      )}

      {tab === 1 && (
        regs.length === 0 ? (
          <EmptyState icon="how_to_reg" title="No registrations yet" body="Share the public page to start collecting entries." />
        ) : (
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
            <TableHead
              cols={[
                { label: 'Participant' },
                { label: 'Status', width: 110 },
                { label: 'Stage', width: 110 },
                { label: 'Registered', width: 110, align: 'right' },
                { label: 'Checked in', width: 96, align: 'right' },
              ]}
            />
            {regs.map((r) => (
              <Box key={r.id} sx={tableRowSx}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <PersonCell name={r.name} sub={r.email} />
                </Box>
                <Box sx={{ width: 110, flex: 'none' }}><StatusPill status={r.status} /></Box>
                <Box sx={{ width: 110, flex: 'none', fontSize: 13, color: c.inkMuted }}>{r.currentStageKey}</Box>
                <Box sx={{ width: 110, flex: 'none', textAlign: 'right' }}><Num size={13}>{r.registeredAt}</Num></Box>
                <Box sx={{ width: 96, flex: 'none', textAlign: 'right' }}>
                  <Icon name={r.checkedIn ? 'check_circle' : 'remove'} size={18} fill={r.checkedIn} color={r.checkedIn ? c.successInk : c.inkFaint} />
                </Box>
              </Box>
            ))}
          </Box>
        )
      )}

      {tab === 2 && (
        <>
          {lateOffline.length > 0 && (
            <Alert
              severity="warning"
              sx={{ mb: 2.5 }}
              icon={<Icon name="schedule" size={22} color={c.primaryIcon} />}
              action={<Button size="small" variant="text">Grace decision</Button>}
            >
              <strong>{lateOffline[0]!.anonymizedLabel}</strong> was queued offline at{' '}
              {lateOffline[0]!.clientSubmittedAt} and received at {lateOffline[0]!.serverReceivedAt} — after the
              deadline. The client clock is not trusted; both timestamps are recorded for a human to decide.
            </Alert>
          )}
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
            <TableHead
              cols={[
                { label: 'Entry', width: 110 },
                { label: 'Participant' },
                { label: 'Reviews', width: 96, align: 'right' },
                { label: 'Score', width: 110, align: 'right' },
                { label: 'Variance', width: 96, align: 'right' },
              ]}
            />
            {subs.map((s) => (
              <Box key={s.id} sx={tableRowSx}>
                <Box sx={{ width: 110, flex: 'none', color: c.inkMuted }}><Num size={13}>{s.anonymizedLabel}</Num></Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{s.participant}</Typography>
                    {s.isLate && <Tag bg={c.errorContainer} fg={c.errorInk}>late</Tag>}
                  </Stack>
                  <Typography sx={{ fontSize: 12, color: c.inkFaint }}>
                    {s.submittedAt} · {s.fileCount} file{s.fileCount === 1 ? '' : 's'} · {s.status}
                  </Typography>
                </Box>
                <Box sx={{ width: 96, flex: 'none', textAlign: 'right', fontSize: 13, fontWeight: 600, color: s.reviewsDone < s.reviewsTotal ? c.errorInk : c.successInk }}>
                  {s.reviewsDone}/{s.reviewsTotal}
                </Box>
                <Box sx={{ width: 110, flex: 'none' }}>
                  <ScoreCell score={s.score} provisional={s.isProvisional} done={s.reviewsDone} total={s.reviewsTotal} />
                </Box>
                <Box sx={{ width: 96, flex: 'none', textAlign: 'right' }}>
                  {s.variance > 15 ? (
                    <Tooltip title="Judges disagree sharply — the criterion may be ambiguous">
                      <Box component="span"><Tag bg={c.errorContainer} fg={c.errorInk}>{s.variance.toFixed(1)}</Tag></Box>
                    </Tooltip>
                  ) : (
                    <Box sx={{ color: c.inkFaint }}><Num size={13}>{s.variance.toFixed(1)}</Num></Box>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </>
      )}

      {tab === 3 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: 3 }}>
            <SectionLabel>Strategy</SectionLabel>
            <Stack spacing={1.5}>
              {[
                ['Aggregation', 'average'],
                ['Judges per submission', '3'],
                ['Blind judging', 'on'],
                ['Recusal allowed', 'yes'],
              ].map(([k, v]) => (
                <Stack key={k} direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{ fontSize: 14, color: c.inkMuted }}>{k}</Typography>
                  <Tag bg={c.success} fg={c.onSuccess}>{v}</Tag>
                </Stack>
              ))}
            </Stack>
            <Box sx={{ mt: 2.5, p: 2, borderRadius: `${radius.tile}px`, background: c.primaryContainer, fontSize: 13, lineHeight: 1.55, color: c.onPrimaryContainer }}>
              With blind judging on, judges see “{subs[0]?.anonymizedLabel}” and never the participant name or the
              original filename.
            </Box>
          </Box>
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceContainer, p: 3 }}>
            <SectionLabel>Judge progress</SectionLabel>
            <Stack spacing={2.5}>
              {([['Fatima Sheikh', 46, 48], ['Gaurav Tiwari', 38, 48], ['Dr. Anjali Menon', 22, 48]] as const).map(
                ([name, done, total]) => (
                  <Box key={name}>
                    <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 1 }}>
                      <PersonCell name={name} />
                    </Stack>
                    <ProgressBar value={Math.round((done / total) * 100)} label={`${done} of ${total}`} />
                  </Box>
                ),
              )}
            </Stack>
            <Button fullWidth variant="outlined" sx={{ mt: 3 }} component={Link} to="/judge">Open judge view</Button>
          </Box>
        </Box>
      )}

      {tab === 4 && (
        <>
          <Box sx={{ mb: 2.5, p: 2, borderRadius: `${radius.tile}px`, background: c.surfaceContainer, fontSize: 13, lineHeight: 1.55, color: c.inkMuted }}>
            The leaderboard is materialized by a scheduled job, not computed in the browser. Mode:{' '}
            <Box component="strong" sx={{ color: c.ink }}>{ch.leaderboardMode}</Box>. Provisional rows have fewer
            reviews than required and are never shown as zero.
          </Box>
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, overflow: 'hidden' }}>
            <TableHead
              cols={[
                { label: 'Rank', width: 72 },
                { label: 'Participant' },
                { label: 'Reviews', width: 96, align: 'right' },
                { label: 'Score', width: 110, align: 'right' },
                { label: 'Change', width: 80, align: 'right' },
              ]}
            />
            {leaderboard.map((e) => (
              <Box key={e.registrationId} sx={tableRowSx}>
                <Box sx={{ width: 72, flex: 'none' }}>
                  <Typography sx={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: e.rank <= 3 ? c.primaryInk : c.ink }}>
                    #{e.rank}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}><PersonCell name={e.name} /></Box>
                <Box sx={{ width: 96, flex: 'none', textAlign: 'right', fontSize: 13, color: c.inkMuted }}>
                  {e.reviewsDone}/{e.reviewsTotal}
                </Box>
                <Box sx={{ width: 110, flex: 'none' }}>
                  <ScoreCell score={e.score} provisional={e.isProvisional} done={e.reviewsDone} total={e.reviewsTotal} />
                </Box>
                <Box sx={{ width: 80, flex: 'none', textAlign: 'right' }}>
                  {e.change === 0 ? (
                    <Icon name="remove" size={18} color={c.inkFaint} />
                  ) : (
                    <Stack direction="row" alignItems="center" justifyContent="flex-end" sx={{ color: e.change > 0 ? c.successInk : c.errorInk, fontSize: 13, fontWeight: 600 }}>
                      <Icon name={e.change > 0 ? 'arrow_upward' : 'arrow_downward'} size={16} />
                      {Math.abs(e.change)}
                    </Stack>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </>
      )}
    </>
  );
}

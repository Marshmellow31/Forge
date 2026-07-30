import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Stack, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import {
  Eyebrow, EmptyState, TableHead, tableRowSx, Num, PersonCell, Tag,
  panelSx, containerSx, StatTile,
} from '@shared/ui/primitives';
import {
  useChallenge, useSubmissions, useRubric, useRegistrations, useOrg, useChallengeSnapshot,
} from '@core/firebase/hooks';
import { usePublishResults } from '@core/firebase/mutations';
import { useAuth, usePermissions } from '@core/auth';
import { aggregateSubmission, rankCohort, awardFor } from '@core/judging/aggregate';
import { c, radius } from '@shared/design/tokens';

/**
 * S-60 — Publish results. SPEC_SCORING §5, ROADMAP 1.15.
 *
 * The ranking is computed here by the pure engine and **shown before it is
 * written**, because publishing is the least reversible thing in the product:
 * it freezes a leaderboard, issues certificates and tells every entrant where
 * they placed. An organiser should see exactly what will happen, including who
 * is still unscored, before any of it does.
 *
 * The provisional check is the important one. A submission nobody has reviewed
 * scores `null`, not zero, and publishing over that would rank someone last for
 * a judge's inaction. So it is a blocking warning that must be acknowledged
 * explicitly rather than a line of small print.
 */
export default function PublishResults() {
  const { cid } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { can, ready } = usePermissions();

  const { data: challenge, isLoading, error } = useChallenge(cid);
  useChallengeSnapshot(cid);
  const { data: submissions = [] } = useSubmissions(cid);
  const { data: registrations = [] } = useRegistrations(cid);
  const { data: rubric = [] } = useRubric(cid);
  const { data: org } = useOrg();

  const publish = usePublishResults(cid);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [awarded, setAwarded] = useState<number | null>(null);

  const criteria = useMemo(
    () => rubric.map((r) => ({ id: r.id, weight: r.weight, max: r.max })),
    [rubric],
  );

  /**
   * Reviews are not read directly — the seeded `submissions` already carry
   * `score`, `reviewsDone` and `reviewsTotal`, and re-reading every review to
   * recompute would cost 1,500 documents at real scale for a number that is
   * already denormalized. The pure engine is still the authority on *ranking*.
   */
  const ranked = useMemo(() => {
    const aggregates = submissions.map((s) =>
      s.score !== null
        ? {
            submissionId: s.id,
            score: s.score,
            reviewsDone: s.reviewsDone,
            reviewsTotal: s.reviewsTotal,
            isProvisional: s.isProvisional || s.reviewsDone < s.reviewsTotal,
            variance: s.variance,
          }
        : aggregateSubmission(s.id, [], criteria, { reviewsRequired: s.reviewsTotal || 1 }),
    );
    return rankCohort(aggregates);
  }, [submissions, criteria]);

  const nameFor = (submissionId: string) => {
    const submission = submissions.find((s) => s.id === submissionId);
    const registration = registrations.find((r) => r.id === submission?.registrationId);
    return {
      displayName: registration?.name ?? submission?.participant ?? 'Unknown entrant',
      registrationId: submission?.registrationId ?? submissionId,
      userId: registration?.userId ?? submission?.registrationId ?? '',
    };
  };

  const unscored = ranked.filter((r) => r.score === null).length;
  const provisional = ranked.filter((r) => r.isProvisional && r.score !== null).length;
  const blocked = unscored > 0 || provisional > 0;
  const alreadyPublished = challenge?.status === 'completed';

  const doPublish = async () => {
    if (!challenge || !org) return;
    const count = await publish.mutateAsync({
      input: {
        challengeTitle: challenge.title,
        orgName: org.name,
        publishedByName: user?.displayName ?? user?.email ?? 'An organizer',
        entries: ranked.map((r) => {
          const who = nameFor(r.submissionId);
          return {
            rank: r.rank,
            submissionId: r.submissionId,
            registrationId: who.registrationId,
            userId: who.userId,
            displayName: who.displayName,
            score: r.score,
            reviewsDone: r.reviewsDone,
            reviewsTotal: r.reviewsTotal,
            isProvisional: r.isProvisional,
            award: awardFor(r.rank),
          };
        }),
      },
      userId: user?.uid,
    });
    setConfirm(false);
    setAwarded(count);
  };

  if (ready && !can('result.publish')) {
    return (
      <>
        <Eyebrow>Publish results</Eyebrow>
        <EmptyState
          icon="lock"
          title="You cannot publish results"
          body="This needs the result.publish permission — it freezes the leaderboard and issues certificates."
        />
      </>
    );
  }

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <IconButton component={Link} to={`/org/challenges/${cid}`} aria-label="Back">
          <Icon name="arrow_back" size={22} />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Eyebrow>Publish results</Eyebrow>
          <Typography noWrap sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
            {challenge?.title ?? '…'}
          </Typography>
        </Box>
      </Stack>

      <QueryBoundary isLoading={isLoading} error={error}>
        {ranked.length === 0 ? (
          <EmptyState icon="how_to_vote" title="Nothing to publish" body="No submissions have been received." />
        ) : (
          <>
            {alreadyPublished && (
              <Stack direction="row" gap={1.75} sx={{ ...containerSx, mb: 3, background: c.success }}>
                <Icon name="check_circle" size={22} fill color={c.successInk} />
                <Typography sx={{ fontSize: 14, color: c.onSuccess, lineHeight: 1.6 }}>
                  Results for this challenge are already published. Publishing again recomputes and
                  overwrites the same documents — it will not issue duplicate certificates.
                </Typography>
              </Stack>
            )}

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
              <StatTile label="Entries" value={ranked.length} icon="inbox" />
              <StatTile label="Certificates" value={ranked.filter((r) => awardFor(r.rank)).length} icon="workspace_premium" tone="primary" />
              <StatTile label="Provisional" value={provisional} icon="pending" tone={provisional ? 'container' : 'default'} />
              <StatTile label="Unscored" value={unscored} icon="help" tone={unscored ? 'container' : 'default'} />
            </Box>

            {blocked && (
              <Box sx={{ mb: 3, p: 2.5, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
                <Stack direction="row" gap={1.75} sx={{ mb: 1.5 }}>
                  <Icon name="warning" size={22} color={c.errorInk} />
                  <Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: c.onErrorContainer, mb: 0.5 }}>
                      Judging is not finished
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.6 }}>
                      {unscored > 0 && `${unscored} ${unscored === 1 ? 'entry has' : 'entries have'} no score at all. `}
                      {provisional > 0 && `${provisional} ${provisional === 1 ? 'is' : 'are'} missing at least one review. `}
                      A missing review is never counted as zero, so publishing now ranks people on
                      incomplete information — and the result is frozen and announced.
                    </Typography>
                  </Box>
                </Stack>
                <FormControlLabel
                  sx={{ ml: 4.25 }}
                  control={<Checkbox checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />}
                  label={
                    <Typography sx={{ fontSize: 13, color: c.errorBody }}>
                      I understand, and want to publish anyway
                    </Typography>
                  }
                />
              </Box>
            )}

            <Box sx={{ ...panelSx, p: 0, overflow: 'hidden', mb: 3 }}>
              <TableHead
                cols={[
                  { label: 'Rank', width: 70 },
                  { label: 'Entrant' },
                  { label: 'Award', width: 130 },
                  { label: 'Score', width: 110, align: 'right' },
                ]}
              />
              {ranked.map((entry) => {
                const who = nameFor(entry.submissionId);
                const award = awardFor(entry.rank);
                return (
                  <Stack key={entry.submissionId} direction="row" alignItems="center" gap={2} sx={tableRowSx}>
                    <Box sx={{ width: 70, flex: 'none' }}><Num size={15}>{entry.rank}</Num></Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <PersonCell name={who.displayName} />
                    </Box>
                    <Box sx={{ width: 130, flex: 'none' }}>
                      {award ? <Tag>{award}</Tag> : <Typography sx={{ fontSize: 12, color: c.inkFaint }}>—</Typography>}
                    </Box>
                    <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={0.75} sx={{ width: 110, flex: 'none' }}>
                      {entry.score === null ? (
                        <Typography sx={{ fontSize: 12, color: c.errorInk }}>Not scored</Typography>
                      ) : (
                        <>
                          <Num size={15}>{entry.score.toFixed(1)}</Num>
                          {entry.isProvisional && (
                            <Tag bg={c.primary} fg={c.onPrimary}>{`${entry.reviewsDone}/${entry.reviewsTotal}`}</Tag>
                          )}
                        </>
                      )}
                    </Stack>
                  </Stack>
                );
              })}
            </Box>

            {publish.error && (
              <Box sx={{ mb: 3, p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: c.onErrorContainer, mb: 0.5 }}>
                  Could not publish
                </Typography>
                <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
                  {publish.error instanceof Error ? publish.error.message : String(publish.error)}
                  {' '}Nothing partial is left behind — every document written is keyed by a derived
                  id, so running this again converges rather than duplicating.
                </Typography>
              </Box>
            )}

            <Stack direction="row" gap={1.5} alignItems="center" sx={{ pb: 4 }}>
              <Typography sx={{ fontSize: 13, color: c.inkMuted, flex: 1 }}>
                Freezes the leaderboard, issues {ranked.filter((r) => awardFor(r.rank)).length} certificates,
                marks the challenge completed and notifies every entrant.
              </Typography>
              <Button
                variant="contained"
                sx={{ height: 52, px: 3.5 }}
                disabled={publish.isPending || (blocked && !acknowledged)}
                onClick={() => setConfirm(true)}
                startIcon={<Icon name="campaign" size={20} />}
              >
                {publish.isPending ? 'Publishing…' : 'Publish results'}
              </Button>
            </Stack>
          </>
        )}
      </QueryBoundary>

      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Publish and announce?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, lineHeight: 1.6, color: c.inkMuted }}>
            Every entrant will be told where they placed, and the top three receive certificates
            with public verification links. The leaderboard is frozen.
            <br /><br />
            This is not reversible from here.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirm(false)}>Not yet</Button>
          <Button variant="contained" disabled={publish.isPending} onClick={() => void doPublish()}>
            {publish.isPending ? 'Publishing…' : 'Publish'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={awarded !== null} onClose={() => setAwarded(null)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: 'center', py: 4.5, px: 3.5 }}>
          <Box sx={{ display: 'grid', placeItems: 'center', mb: 2.25 }}>
            <Box sx={{ width: 72, height: 72, borderRadius: '50%', background: c.success, display: 'grid', placeItems: 'center', animation: 'pop 420ms cubic-bezier(.2,0,0,1) both' }}>
              <Icon name="emoji_events" size={40} fill color={c.successInk} />
            </Box>
          </Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', mb: 1.25 }}>
            Results published
          </Typography>
          <Typography sx={{ fontSize: 15, lineHeight: 1.55, color: c.inkMuted }}>
            {awarded} {awarded === 1 ? 'certificate' : 'certificates'} issued and every entrant
            notified.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3.5, pb: 3 }}>
          <Button fullWidth variant="contained" onClick={() => nav(`/org/challenges/${cid}`)}>
            Back to the control room
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

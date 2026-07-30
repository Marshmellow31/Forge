import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Box, Button, Dialog, DialogActions, DialogContent, Slider, Stack, TextField, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { useChallenges, useSubmissions, useRubric, useChallengeSnapshot } from '@core/firebase/hooks';
import { useSubmitReview } from '@core/firebase/mutations';
import { useAuth } from '@core/auth';
import { NotSignedInError } from '@core/sync';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { PageTitle, EmptyState, StatTile, Num, Tag, liftSx, ListSkeleton } from '@shared/ui/primitives';
import { c, radius, coverFor, mono } from '@shared/design/tokens';

/**
 * The judged challenge for this demo: the first one actually in judging.
 * A real judge queue is driven by assignment (reviews where judgeId == me),
 * which needs the assignment pipeline — see STATUS.md.
 */
function useJudgeQueue() {
  const { data: challenges = [] } = useChallenges();
  const target = challenges.find((ch) => ch.status === 'judging') ?? challenges[0];
  useChallengeSnapshot(target?.id);
  const { data: submissions = [], isLoading, error } = useSubmissions(target?.id);
  const { data: rubric = [] } = useRubric(target?.id);
  const queue = submissions.filter((s) => s.reviewsDone < s.reviewsTotal);
  // Blind mode is a per-challenge setting, not an assumption. It used to be
  // hardcoded here, which meant a challenge that had not chosen it still told
  // judges names were hidden — while showing them.
  return {
    submissions, queue, rubric, isLoading, error,
    challengeId: target?.id,
    blind: target?.blindJudging ?? false,
  };
}

/** What a judge is allowed to see for this submission. */
const labelFor = (s: { participant: string; anonymizedLabel: string }, blind: boolean) =>
  blind ? s.anonymizedLabel : s.participant;

/** S-46 — Judging queue. */
export function JudgeQueue() {
  const { submissions, queue, isLoading, error, blind } = useJudgeQueue();
  const done = submissions.length - queue.length;
  const pct = submissions.length ? Math.round((done / submissions.length) * 100) : 0;
  const navigate = useNavigate();
  const next = queue[0];

  return (
    <>
      <Stack direction="row" alignItems="flex-end" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <PageTitle>Judging queue</PageTitle>
        <Typography sx={{ fontSize: 14, color: c.inkMuted, mb: 3 }}>
          {blind
            ? 'Blind judging is on — entrant names are hidden.'
            : 'Entrant names are visible on this challenge.'}
        </Typography>
      </Stack>

      <QueryBoundary isLoading={isLoading} error={error}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 2, mb: 3 }}>
        <StatTile label="Assigned" value={submissions.length} />
        <StatTile label="Remaining" value={queue.length} tone="primary" />
        <StatTile label="Completed" value={done} tone="success" />
        <StatTile label="Avg time" value="2m 14s" />
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        flexWrap="wrap"
        gap={2.5}
        sx={{ borderRadius: `${radius.card}px`, background: c.primaryContainer, p: '22px 24px', mb: 3 }}
      >
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: c.onPrimaryContainer, mb: 1 }}>
            {done} of {submissions.length} reviewed · 3 days left
          </Typography>
          <Box sx={{ height: 8, borderRadius: '4px', background: 'rgba(36,26,0,.14)', overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: c.inverse }} />
          </Box>
        </Box>
        {next && (
          <Button
            onClick={() => navigate(`/judge/score/${next.id}`)}
            sx={{ height: 52, px: 3.25, borderRadius: '26px', background: c.inverse, color: c.onInverse, '&:hover': { background: c.inverse } }}
            endIcon={<Icon name="arrow_forward" size={20} />}
          >
            Review next
          </Button>
        )}
      </Stack>

      <Stack direction="row" gap={1.5} sx={{ mb: 3, p: 2, borderRadius: `${radius.tile}px`, background: c.surfaceContainer }}>
        <Icon name="visibility_off" size={20} color={c.primaryIcon} />
        <Typography sx={{ fontSize: 13, lineHeight: 1.55, color: c.inkMuted }}>
          You see anonymized entry labels. Participant names and original filenames are suppressed — filenames
          identify people just as reliably as names do.
        </Typography>
      </Stack>

      {queue.length === 0 ? (
        <EmptyState icon="task_alt" title="Queue is clear" body="Nothing left to score." />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 2 }}>
          {queue.map((s) => (
            <Box
              key={s.id}
              component={Link}
              to={`/judge/score/${s.id}`}
              sx={{
                ...liftSx,
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                borderRadius: `${radius.card}px`,
                overflow: 'hidden',
                background: c.surfaceCard,
                border: `1px solid ${c.outline}`,
              }}
            >
              <Box sx={{ height: 132, background: coverFor('Photography'), position: 'relative', display: 'grid', placeItems: 'center' }}>
                <Icon name="image" size={34} color="rgba(36,26,0,.4)" />
                <Box
                  component="span"
                  sx={{ position: 'absolute', top: 12, left: 12, fontFamily: mono, fontSize: 11, background: 'rgba(255,253,246,.86)', px: 1, py: 0.5, borderRadius: '8px' }}
                >
                  {labelFor(s, blind)}
                </Box>
              </Box>
              <Box sx={{ p: '16px 18px 18px' }}>
                <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 0.75 }}>
                  {String(s.answers.title ?? 'Untitled entry')}
                </Typography>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ fontSize: 12, color: c.inkMuted }}>
                  <span>{s.submittedAt}</span>
                  <Box component="span" sx={{ fontWeight: 700, color: s.reviewsDone === 0 ? c.errorInk : c.primaryInk }}>
                    {s.reviewsDone}/{s.reviewsTotal}
                  </Box>
                </Stack>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      </QueryBoundary>
    </>
  );
}

/** S-47 — Scoring screen. Blind mode, recusal and the weighted rubric. */
export function ScoringScreen() {
  const { sid } = useParams();
  const nav = useNavigate();
  const { queue, rubric, isLoading, challengeId, blind } = useJudgeQueue();
  const { user } = useAuth();
  const reviewMutation = useSubmitReview(challengeId);
  const idx = queue.findIndex((s) => s.id === sid);
  const sub = queue[idx];
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [recuse, setRecuse] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) return <ListSkeleton rows={2} height={220} />;
  if (!sub) return <EmptyState icon="search_off" title="Submission not found" />;

  const weighted = rubric.reduce((sum, r) => sum + ((scores[r.id] ?? 0) / r.max) * r.weight * 100, 0);
  const complete = rubric.every((r) => scores[r.id] !== undefined);

  const send = (recused: boolean) =>
    reviewMutation.mutate(
      {
        submissionId: sub.id,
        judgeId: user?.uid,
        stageKey: sub.stageKey,
        criteriaScores: rubric.map((r) => ({
          criterionId: r.id,
          score: scores[r.id] ?? 0,
          comment: null,
        })),
        totalRaw: rubric.reduce((n, r) => n + (scores[r.id] ?? 0), 0),
        totalWeighted: weighted,
        comment: comment || null,
        recused,
      },
      {
        onSuccess: () => {
          setRecuse(false);
          if (recused) nav('/judge');
          else setSubmitted(true);
        },
      },
    );

  const reviewError = reviewMutation.error;
  const needsSignIn = reviewError instanceof NotSignedInError;

  return (
    <>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          component={Link}
          to="/judge"
          aria-label="Close review"
          sx={{ width: 48, height: 48, flex: 'none', borderRadius: '50%', background: c.surfaceField, display: 'grid', placeItems: 'center', color: c.ink, '&:hover': { background: c.surfaceFieldHover } }}
        >
          <Icon name="close" size={22} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, color: c.inkFaint }}>
            {blind ? 'Blind review' : 'Review'}
          </Typography>
          <Typography noWrap sx={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>
            {labelFor(sub, blind)}
          </Typography>
        </Box>
        <Box sx={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: c.inkMuted }}>
          {idx + 1} / {queue.length}
        </Box>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1.2fr) minmax(0,1fr)' }, gap: 3, alignItems: 'start' }}>
        <Box sx={{ borderRadius: `${radius.panel}px`, overflow: 'hidden', background: c.surfaceCard, border: `1px solid ${c.outline}` }}>
          <Box sx={{ height: { xs: 240, md: 340 }, background: `linear-gradient(140deg,${c.success},${c.primary})`, display: 'grid', placeItems: 'center' }}>
            <Box sx={{ textAlign: 'center', fontFamily: mono, fontSize: 12, color: c.onPrimary }}>
              <Icon name="image" size={40} style={{ display: 'block', marginBottom: 8 }} />
              {blind ? 'filename hidden — blind mode' : 'submitted entry'}
            </Box>
          </Box>
          <Box sx={{ p: '22px 24px' }}>
            <Box sx={{ fontFamily: mono, fontSize: 12, color: c.inkFaint, mb: 1 }}>
              {labelFor(sub, blind)} · shot on {String(sub.answers.shot_on ?? '—')}
            </Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', mb: 1.25 }}>
              {String(sub.answers.title ?? 'Untitled')}
            </Typography>
            <Typography sx={{ fontSize: 14, lineHeight: 1.6, color: c.inkMuted, mb: 2.5 }}>
              {String(sub.answers.statement ?? '—')}
            </Typography>
            <Box sx={{ p: 2, borderRadius: `${radius.field}px`, background: c.surfaceContainer, fontSize: 13, lineHeight: 1.55, color: c.inkMuted }}>
              {blind
                ? 'Name, email and any field marked as personal are withheld, because this challenge has blind judging on. Exports are anonymized too.'
                : 'This challenge does not use blind judging, so entrant details are visible. An organizer can turn it on in the challenge settings — before judging starts.'}
            </Box>
          </Box>
        </Box>

        <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceContainer, p: 3, position: { md: 'sticky' }, top: 96 }}>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2.5 }}>
            <Typography variant="h6">Rubric</Typography>
            <Typography sx={{ fontSize: 12, color: c.inkFaint }}>
              Review {sub.reviewsDone + 1} of {sub.reviewsTotal}
            </Typography>
          </Stack>

          <Stack spacing={2.75} sx={{ mb: 3 }}>
            {rubric.map((r) => (
              <Box key={r.id}>
                <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1.5} sx={{ mb: 0.25 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{r.name}</Typography>
                  <Box sx={{ fontFamily: mono, fontSize: 16, fontWeight: 600 }}>
                    {scores[r.id] ?? '—'}
                    <Box component="span" sx={{ color: c.inkFaint }}>/{r.max}</Box>
                  </Box>
                </Stack>
                <Typography sx={{ fontSize: 12, color: c.inkFaint, mb: 1 }}>
                  {r.description} · weight {(r.weight * 100).toFixed(0)}%
                </Typography>
                <Slider
                  min={0}
                  max={r.max}
                  step={1}
                  value={scores[r.id] ?? 0}
                  onChange={(_, v) => setScores((p) => ({ ...p, [r.id]: v as number }))}
                  aria-label={r.name}
                />
              </Box>
            ))}
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ borderRadius: `${radius.tile}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: '18px 20px', mb: 2.5 }}
          >
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Weighted total</Typography>
            <Box sx={{ fontFamily: mono, fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: complete ? c.ink : c.inkFaint }}>
              {complete ? weighted.toFixed(1) : '—'}
            </Box>
          </Stack>

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Private note to the organizer"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            sx={{ mb: 2.5 }}
          />

          {reviewError && (
            <Stack
              direction="row"
              gap={1.5}
              alignItems="flex-start"
              sx={{ mb: 2.5, p: 2, borderRadius: `${radius.field}px`, background: c.errorContainer }}
            >
              <Icon name={needsSignIn ? 'lock' : 'error'} size={20} color={c.errorInk} />
              <Box>
                <Box sx={{ fontSize: 14, fontWeight: 600, color: c.onErrorContainer, mb: 0.25 }}>
                  {needsSignIn ? 'Sign in to score' : 'Could not save this review'}
                </Box>
                <Box sx={{ fontSize: 13, lineHeight: 1.5, color: c.errorBody }}>
                  {needsSignIn
                    ? 'Judging writes to the append-only score ledger, so it needs an identity. Your scores are still here.'
                    : reviewError instanceof Error
                      ? reviewError.message
                      : String(reviewError)}
                </Box>
              </Box>
            </Stack>
          )}

          {!complete && (
            <Box sx={{ mb: 2.5, p: 2, borderRadius: `${radius.field}px`, background: c.errorContainer, color: c.errorBody, fontSize: 13, lineHeight: 1.5 }}>
              Score every criterion before submitting. A skipped criterion is never treated as zero.
            </Box>
          )}

          <Stack direction="row" gap={1.5}>
            <Button variant="outlined" sx={{ flex: 'none', height: 52, borderRadius: '26px' }} onClick={() => setRecuse(true)}>
              Recuse
            </Button>
            <Button
              variant="contained"
              sx={{ flex: 1, height: 52, borderRadius: '26px' }}
              disabled={!complete || reviewMutation.isPending}
              onClick={() => send(false)}
            >
              {reviewMutation.isPending ? 'Saving…' : 'Submit review'}
            </Button>
          </Stack>
        </Box>
      </Box>

      <Dialog open={recuse} onClose={() => setRecuse(false)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ p: 3.5 }}>
          <Icon name="front_hand" size={26} color={c.primaryIcon} style={{ display: 'block', marginBottom: 12 }} />
          <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', mb: 1.25 }}>
            Recuse yourself
          </Typography>
          <Typography sx={{ fontSize: 15, lineHeight: 1.55, color: c.inkMuted, mb: 2.5 }}>
            Use this if you recognise the entry or have a conflict of interest. It is recorded in the audit log.
          </Typography>
          <TextField fullWidth multiline rows={3} label="Reason" />
        </DialogContent>
        <DialogActions sx={{ px: 3.5, pb: 3 }}>
          <Button variant="text" onClick={() => setRecuse(false)}>Cancel</Button>
          <Button variant="contained" disabled={reviewMutation.isPending} onClick={() => send(true)}>Recuse</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={submitted} onClose={() => setSubmitted(false)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: 'center', py: 4.5, px: 3.5 }}>
          <Box sx={{ display: 'grid', placeItems: 'center', mb: 2.25 }}>
            <Box sx={{ width: 72, height: 72, borderRadius: '50%', background: c.success, display: 'grid', placeItems: 'center', animation: 'pop 420ms cubic-bezier(.2,0,0,1) both' }}>
              <Icon name="check" size={40} fill color={c.successInk} />
            </Box>
          </Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', mb: 1.25 }}>
            Score recorded
          </Typography>
          <Typography sx={{ fontSize: 15, lineHeight: 1.55, color: c.inkMuted, mb: 2 }}>
            Written as an append-only event — nothing was overwritten.
          </Typography>
          <Stack direction="row" justifyContent="center" gap={1}>
            <Tag>{`${weighted.toFixed(1)} weighted`}</Tag>
            <Tag bg={c.surfaceContainer} fg={c.inkMuted}>
              <Num size={11}>{labelFor(sub, blind)}</Num>
            </Tag>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3.5, pb: 3 }}>
          <Button fullWidth variant="contained" onClick={() => { setSubmitted(false); nav('/judge'); }}>
            Next submission
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  Stack, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { DriveLinkInput } from '@shared/ui/DriveLinkInput';
import { useChallengeBySlug, useFormSchemas, useSubmissions } from '@core/firebase/hooks';
import { useSubmitEntry } from '@core/firebase/mutations';
import { useAuth } from '@core/auth';
import { NotSignedInError } from '@core/sync';
import { FormRenderer, useFormEngine } from '@shared/ui/forms/FormRenderer';
import { stripHiddenAnswers } from '@core/forms/conditions';
import { parseDriveLink, driveFileRef } from '@core/drive/links';
import { EmptyState, Tag, ListSkeleton, containerSx } from '@shared/ui/primitives';
import { c, radius } from '@shared/design/tokens';

/**
 * S-56 — Submit your entry. ROADMAP 1.10.
 *
 * Distinct from the *registration* form: registration says "I am entering",
 * this says "here is the work". They use the same schema engine but different
 * stages, and a submission is frozen once sent while a registration stays
 * editable while pending.
 *
 * Two things here are deliberate and worth not undoing:
 *
 * 1. **A late entry is accepted and flagged, never rejected.** Rejecting at the
 *    deadline throws away work over a clock the participant cannot see, and the
 *    organiser is the right person to decide what lateness costs. The server
 *    timestamp is the authority; the client's is recorded as evidence.
 * 2. **The work link is a first-class field**, not one of the schema's optional
 *    questions, because every challenge needs somewhere to put the artefact and
 *    making each organiser remember to add a file field guarantees some forget.
 */
export default function SubmitScreen() {
  const { slug } = useParams();
  const { user } = useAuth();
  const { data: challenge, isLoading } = useChallengeBySlug(slug);
  const { data: schemas = {} } = useFormSchemas();
  const { data: submissions = [] } = useSubmissions(challenge?.id);
  const schema = challenge ? schemas[challenge.formSchemaId] : undefined;

  const [workLink, setWorkLink] = useState('');
  const [done, setDone] = useState(false);
  const submit = useSubmitEntry(challenge?.id);

  const engine = useFormEngine(
    schema ?? {
      id: '', orgId: '', version: 0, status: 'draft', title: '', description: null,
      sections: [], settings: { allowDrafts: true, showProgressBar: true, confirmationMessage: null },
    },
  );

  // The stage a submission belongs to. Falls back to 'submission' so a
  // challenge whose stages were renamed still accepts work.
  const stageKey = useMemo(
    () => challenge?.stages.find((s) => s.state === 'active')?.key ?? 'submission',
    [challenge],
  );

  const existing = submissions.find((s) => s.registrationId === user?.uid);

  const deadline = challenge?.timeline.submissionClosesAt;
  const isLate = useMemo(() => {
    if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return false;
    // End of the deadline day, not its midnight — nobody reads "closes on the
    // 18th" as "closes as the 17th ends".
    return Date.now() > new Date(`${deadline}T23:59:59`).getTime();
  }, [deadline]);

  if (isLoading) return <ListSkeleton rows={3} height={90} />;
  if (!challenge || !schema) return <EmptyState icon="search_off" title="Nothing to submit to" />;

  const target = parseDriveLink(workLink);
  const stored = stripHiddenAnswers(schema, engine.answers);

  const send = (status: 'draft' | 'submitted') => {
    if (status === 'submitted') {
      engine.setShowErrors(true);
      if (!engine.isValid) return;
    }
    const files = target && user
      ? [driveFileRef(target, { name: `${challenge.title} — entry`, uploadedBy: user.uid })]
      : [];

    submit.mutate(
      {
        userId: user?.uid,
        participant: user?.displayName ?? user?.email ?? 'Participant',
        stageKey,
        formSchemaId: schema.id,
        formSchemaVersion: schema.version,
        answers: { ...stored, __work: files },
        fileCount: files.length,
        status,
        isLate,
      },
      { onSuccess: () => status === 'submitted' && setDone(true) },
    );
  };

  const error = submit.error;
  const needsSignIn = error instanceof NotSignedInError;
  const frozen = existing?.status === 'submitted' || existing?.status === 'reviewed';

  return (
    <Box sx={{ maxWidth: 680, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          component={Link}
          to={`/c/${challenge.slug}`}
          aria-label="Back to challenge"
          sx={{
            width: 48, height: 48, flex: 'none', borderRadius: '50%',
            background: c.surfaceField, display: 'grid', placeItems: 'center', color: c.ink,
            '&:hover': { background: c.surfaceFieldHover },
          }}
        >
          <Icon name="arrow_back" size={22} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12, color: c.inkFaint }}>
            Submission · {challenge.title}
          </Typography>
          <Typography noWrap sx={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>
            Your entry
          </Typography>
        </Box>
        {isLate && <Tag bg={c.errorContainer} fg={c.errorInk}>Late</Tag>}
      </Stack>

      {frozen && (
        <Stack direction="row" gap={1.75} sx={{ ...containerSx, mb: 3, background: c.success }}>
          <Icon name="lock" size={22} color={c.successInk} />
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: c.onSuccess, mb: 0.25 }}>
              Already submitted
            </Typography>
            <Typography sx={{ fontSize: 13, color: c.onSuccess, lineHeight: 1.5 }}>
              A submitted entry is frozen so judges all review the same thing. Contact the
              organisers if something needs to change.
            </Typography>
          </Box>
        </Stack>
      )}

      {isLate && !frozen && (
        <Stack direction="row" gap={1.75} sx={{ ...containerSx, mb: 3, background: c.errorContainer }}>
          <Icon name="schedule" size={22} color={c.errorInk} />
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: c.onErrorContainer, mb: 0.25 }}>
              The deadline has passed
            </Typography>
            <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
              You can still submit — it will be recorded and flagged as late, and the organisers
              decide what that means. Submissions closed on {deadline}.
            </Typography>
          </Box>
        </Stack>
      )}

      <Box sx={{ height: 6, borderRadius: '3px', background: c.track, overflow: 'hidden', mb: 4 }}>
        <Box sx={{ height: '100%', width: `${engine.percent}%`, background: c.accent, transition: 'width 300ms cubic-bezier(.2,0,0,1)' }} />
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.5 }}>Your work</Typography>
        <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6, mb: 2 }}>
          Share the file or folder from your Google Drive, then paste the link. It stays in your
          Drive — we only keep the link, so nothing is uploaded and nothing can fail at the deadline.
        </Typography>
        <DriveLinkInput
          value={workLink}
          onChange={setWorkLink}
          purpose="attachment"
          label="Link to your work"
        />
      </Box>

      <FormRenderer schema={schema} engine={engine} />

      {error && (
        <Stack direction="row" gap={1.75} alignItems="flex-start" sx={{ mt: 4, p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
          <Icon name={needsSignIn ? 'lock' : 'error'} size={22} color={c.errorInk} />
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: c.onErrorContainer, mb: 0.25 }}>
              {needsSignIn ? 'Sign in to submit' : 'Could not save your entry'}
            </Typography>
            <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: c.errorBody }}>
              {needsSignIn
                ? 'Submitting needs an identity so your entry can be attributed to you. Nothing you typed has been lost.'
                : error instanceof Error ? error.message : String(error)}
            </Typography>
          </Box>
        </Stack>
      )}

      <Stack direction="row" gap={1.5} alignItems="center" sx={{ mt: 4, pb: 3 }}>
        <Button
          variant="outlined"
          sx={{ height: 52, borderRadius: '26px' }}
          disabled={frozen || submit.isPending}
          onClick={() => send('draft')}
        >
          Save draft
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          sx={{ height: 52, px: 3.75, borderRadius: '26px' }}
          disabled={frozen || submit.isPending}
          onClick={() => send('submitted')}
          endIcon={
            submit.isPending
              ? <CircularProgress size={18} sx={{ color: 'inherit' }} />
              : <Icon name="send" size={20} />
          }
        >
          {submit.isPending ? 'Submitting…' : 'Submit entry'}
        </Button>
      </Stack>

      <Dialog open={done} onClose={() => setDone(false)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: 'center', py: 4.5, px: 3.5 }}>
          <Box sx={{ display: 'grid', placeItems: 'center', mb: 2.25 }}>
            <Box sx={{ width: 72, height: 72, borderRadius: '50%', background: c.success, display: 'grid', placeItems: 'center', animation: 'pop 420ms cubic-bezier(.2,0,0,1) both' }}>
              <Icon name="check" size={40} fill color={c.successInk} />
            </Box>
          </Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', mb: 1.25 }}>
            Entry submitted
          </Typography>
          <Typography sx={{ fontSize: 15, lineHeight: 1.55, color: c.inkMuted, mb: 2 }}>
            {isLate
              ? 'Recorded and flagged as late. The organisers will decide how to treat it.'
              : 'Your work is in. You will be notified when results are published.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3.5, pb: 3 }}>
          <Button fullWidth variant="contained" component={Link} to="/me/registrations">
            Go to my entries
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

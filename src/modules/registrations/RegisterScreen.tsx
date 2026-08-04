import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Dialog, DialogActions,
  DialogContent, Stack, Typography, CircularProgress,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { useChallengeBySlug, useFormSchemas } from '@core/firebase/hooks';
import { useSubmitRegistration } from '@core/firebase/mutations';
import { useAuth, usePermissions } from '@core/auth';
import { demoOrgId } from '@core/firebase/app';
import { NotSignedInError } from '@core/sync';
import { FormRenderer, useFormEngine } from '@shared/ui/forms/FormRenderer';
import { UploadProvider } from '@shared/ui/forms/UploadContext';
import { stripHiddenAnswers } from '@core/forms/conditions';
import { EmptyState, Tag, ListSkeleton } from '@shared/ui/primitives';
import { c, radius, mono } from '@shared/design/tokens';

/** S-54 — Registration form, rendered entirely from a stored schema. */
export default function RegisterScreen() {
  const { slug } = useParams();
  const { data: challenge, isLoading } = useChallengeBySlug(slug);
  const { data: schemas = {} } = useFormSchemas();
  const schema = challenge ? schemas[challenge.formSchemaId] : undefined;
  const [done, setDone] = useState(false);
  const { user } = useAuth();
  const { isAdmin, ready: permissionsReady } = usePermissions();
  const submitMutation = useSubmitRegistration(challenge?.id);

  // Hooks must run unconditionally — fall back to an empty schema when missing.
  const engine = useFormEngine(
    schema ?? { id: '', orgId: '', version: 0, status: 'draft', title: '', description: null, sections: [], settings: { allowDrafts: false, showProgressBar: false, confirmationMessage: null } },
  );

  if (isLoading) return <ListSkeleton rows={3} height={90} />;
  if (!challenge || !schema) return <EmptyState icon="search_off" title="Form not found" />;
  if (permissionsReady && isAdmin) {
    return (
      <EmptyState
        icon="admin_panel_settings"
        title="Admins cannot enter competitions"
        body="Admin accounts manage competitions and participants. Use a separate customer account to enter this competition."
      />
    );
  }

  const stored = stripHiddenAnswers(schema, engine.answers);

  const submit = () => {
    engine.setShowErrors(true);
    if (!engine.isValid) return;
    submitMutation.mutate(
      {
        userId: user?.uid,
        displayName: user?.displayName ?? 'Demo participant',
        email: user?.email ?? 'demo@forge.app',
        formSchemaId: schema.id,
        formSchemaVersion: schema.version,
        // Hidden answers are dropped before storage — no ghost data.
        answers: stored,
      },
      { onSuccess: () => setDone(true) },
    );
  };

  const error = submitMutation.error;
  const needsSignIn = error instanceof NotSignedInError;

  return (
    <Box sx={{ maxWidth: 680, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          component={Link}
          to={`/c/${challenge.slug}`}
          aria-label="Close form"
          sx={{ width: 48, height: 48, flex: 'none', borderRadius: '50%', background: c.surfaceField, display: 'grid', placeItems: 'center', color: c.ink, '&:hover': { background: c.surfaceFieldHover } }}
        >
          <Icon name="close" size={22} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12, color: c.inkFaint }}>
            Entry form · {challenge.title}
          </Typography>
          <Typography noWrap sx={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>
            {schema.title}
          </Typography>
        </Box>
        <Tag bg={c.success} fg={c.onSuccess}>Draft saved</Tag>
      </Stack>

      <Box sx={{ height: 6, borderRadius: '3px', background: c.track, overflow: 'hidden', mb: 4 }}>
        <Box sx={{ height: '100%', width: `${engine.percent}%`, background: c.accent, transition: 'width 300ms cubic-bezier(.2,0,0,1)' }} />
      </Box>

      <Stack direction="row" gap={1.75} sx={{ p: 2.25, borderRadius: `${radius.tile}px`, background: c.surfaceContainer, mb: 3 }}>
        <Icon name="code" size={22} color={c.primaryIcon} />
        {/* Was written against the seeded monsoon form and named two of its
            fields by hand — so it described a form that no longer exists the
            moment the demo data went (ADR-025). Every entry form is a different
            schema; the note has to be true of all of them. */}
        <Typography sx={{ fontSize: 13, lineHeight: 1.55, color: c.inkMuted }}>
          Every field below is generated from stored JSON — nothing here is hardcoded. Some fields
          appear only once an earlier answer calls for them, and answers that end up hidden are
          dropped before storage.
        </Typography>
      </Stack>

      {/* File fields upload into the organiser's Drive, and need to know
          which challenge they are filing under and who is asking. The schema
          cannot carry either — the same schema serves different challenges —
          so it arrives as context. See shared/ui/forms/UploadContext.tsx. */}
      <UploadProvider
        value={{
          orgId: demoOrgId(),
          challengeId: challenge?.id ?? '',
          getIdToken: () => (user ? user.getIdToken() : Promise.resolve(null)),
        }}
      >
        <FormRenderer schema={schema} engine={engine} />
      </UploadProvider>

      {error && (
        <Stack
          direction="row"
          gap={1.75}
          alignItems="flex-start"
          sx={{ mt: 4, p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}
        >
          <Icon name={needsSignIn ? 'lock' : 'error'} size={22} color={c.errorInk} />
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: c.onErrorContainer, mb: 0.25 }}>
              {needsSignIn ? 'Sign in to submit' : 'Could not save your entry'}
            </Typography>
            <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: c.errorBody }}>
              {needsSignIn
                ? 'The demo is read-only until you sign in. Nothing you typed has been lost.'
                : error instanceof Error
                  ? error.message
                  : String(error)}
            </Typography>
          </Box>
        </Stack>
      )}

      <Stack direction="row" gap={1.5} alignItems="center" sx={{ mt: 4, pb: 3 }}>
        <Button variant="outlined" sx={{ height: 52, borderRadius: '26px' }}>Save draft</Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          sx={{ height: 52, px: 3.75, borderRadius: '26px' }}
          onClick={submit}
          disabled={submitMutation.isPending}
          endIcon={
            submitMutation.isPending
              ? <CircularProgress size={18} sx={{ color: 'inherit' }} />
              : <Icon name="arrow_forward" size={20} />
          }
        >
          {submitMutation.isPending ? 'Submitting…' : 'Submit entry'}
        </Button>
      </Stack>

      <Accordion
        disableGutters
        elevation={0}
        sx={{ background: 'transparent', border: `1px solid ${c.outline}`, borderRadius: `${radius.tile}px !important`, '&:before': { display: 'none' } }}
      >
        <AccordionSummary expandIcon={<Icon name="expand_more" size={22} />}>
          <Stack direction="row" gap={1} alignItems="center">
            <Icon name="code" size={18} color={c.primaryIcon} />
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
              What gets stored ({Object.keys(stored).length} keys)
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Typography sx={{ fontSize: 12, color: c.inkFaint, mb: 1.5 }}>
            Hidden fields are excluded from both validation and storage — no ghost data.
          </Typography>
          <Box
            component="pre"
            sx={{ fontFamily: mono, fontSize: 12, overflow: 'auto', borderRadius: `${radius.chip}px`, p: 2, m: 0, background: c.inverseSurface, color: c.onInverseSurface }}
          >
            {JSON.stringify({ formSchemaId: schema.id, formSchemaVersion: schema.version, answers: stored }, null, 2)}
          </Box>
        </AccordionDetails>
      </Accordion>

      <Dialog open={done} onClose={() => setDone(false)} maxWidth="xs" fullWidth>
        <DialogContent sx={{ textAlign: 'center', py: 4.5, px: 3.5 }}>
          <Box sx={{ display: 'grid', placeItems: 'center', mb: 2.25 }}>
            <Box sx={{ width: 72, height: 72, borderRadius: '50%', background: c.success, display: 'grid', placeItems: 'center', animation: 'pop 420ms cubic-bezier(.2,0,0,1) both' }}>
              <Icon name="check" size={40} fill color={c.successInk} />
            </Box>
          </Box>
          <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', mb: 1.25 }}>
            Entry received
          </Typography>
          <Typography sx={{ fontSize: 15, lineHeight: 1.55, color: c.inkMuted, mb: 2 }}>
            {schema.settings.confirmationMessage ?? 'You are registered.'}
          </Typography>
          <Tag bg={c.surfaceContainer} fg={c.inkMuted}>{`Validated against schema v${schema.version}`}</Tag>
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

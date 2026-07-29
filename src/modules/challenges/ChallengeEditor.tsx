import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { DriveLinkInput } from '@shared/ui/DriveLinkInput';
import { CoverImage } from '@shared/ui/CoverImage';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { Eyebrow, Tag, panelSx, containerSx } from '@shared/ui/primitives';
import { useChallenge, useChallenges, useWorkspaces, useFormSchemas, useRubric } from '@core/firebase/hooks';
import { useSaveChallenge, useDeleteChallenge, useSaveRubric } from '@core/firebase/mutations';
import { useAuth, usePermissions } from '@core/auth';
import {
  slugify, uniqueSlug, newChallengeId, newCriterionId, DEFAULT_STAGES, CATEGORIES,
} from '@core/challenges/slug';
import { StageDesigner } from './StageDesigner';
import { c, radius, ease } from '@shared/design/tokens';
import type { Challenge } from '@shared/types/domain';

/**
 * S-27 — Challenge editor. Create and edit, one screen.
 *
 * This is where "admins have full control" actually lives: every property of a
 * competition an organiser could want to change is here, as data, with nothing
 * hardcoded (CLAUDE.md hard rule 1). The form *questions* are a separate screen
 * — the form builder — because a schema is versioned and immutable once
 * published while these settings are freely editable, and mixing the two would
 * force a version bump every time someone fixed a typo in the prize.
 */

type Draft = {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  status: Challenge['status'];
  visibility: Challenge['visibility'];
  cover: string;
  formSchemaId: string;
  prize: string;
  leaderboardMode: Challenge['leaderboardMode'];
  stages: Array<{ key: string; name: string; type: string; state: 'done' | 'active' | 'locked' }>;
  timeline: { registrationClosesAt: string; submissionClosesAt: string; resultsAt: string };
};

type CriterionDraft = {
  id: string; name: string; description: string; weight: number; max: number; order: number;
};

/** A date that arrived as `YYYY-MM-DD` or `—`, normalised for `<input type=date>`. */
const asDateInput = (value: string | undefined) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';

function emptyDraft(workspaceId: string, formSchemaId: string): Draft {
  return {
    id: '',
    workspaceId,
    title: '',
    slug: '',
    description: '',
    category: CATEGORIES[0],
    tags: [],
    status: 'draft',
    visibility: 'public',
    cover: '',
    formSchemaId,
    prize: '',
    leaderboardMode: 'afterClose',
    stages: DEFAULT_STAGES.map((s) => ({ ...s })),
    timeline: { registrationClosesAt: '', submissionClosesAt: '', resultsAt: '' },
  };
}

export default function ChallengeEditor() {
  const { cid } = useParams();
  const isNew = !cid || cid === 'new';
  const nav = useNavigate();

  const { user } = useAuth();
  const { can, ready: permsReady } = usePermissions();
  const { data: existing, isLoading, error } = useChallenge(isNew ? undefined : cid);
  const { data: challenges = [] } = useChallenges();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: schemas = {} } = useFormSchemas();
  const { data: rubric = [] } = useRubric(isNew ? undefined : cid);

  const save = useSaveChallenge();
  const remove = useDeleteChallenge();
  const saveRubric = useSaveRubric(isNew ? undefined : cid);

  const [tab, setTab] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [criteria, setCriteria] = useState<CriterionDraft[]>([]);
  const [removedCriteria, setRemovedCriteria] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const schemaIds = useMemo(() => Object.keys(schemas), [schemas]);
  const firstWorkspaceId = workspaces[0]?.id ?? '';
  const firstSchemaId = schemaIds[0] ?? '';

  // Seed the draft exactly once, when the remote data first lands. The `draft`
  // guard is what makes that true: without it every refetch would overwrite
  // whatever the organiser had typed.
  useEffect(() => {
    if (draft) return;
    if (isNew) {
      if (firstWorkspaceId || firstSchemaId) {
        setDraft(emptyDraft(firstWorkspaceId, firstSchemaId));
      }
      return;
    }
    if (existing) {
      setDraft({
        id: existing.id,
        workspaceId: existing.workspaceId,
        title: existing.title,
        slug: existing.slug,
        description: existing.description,
        category: existing.category,
        tags: existing.tags ?? [],
        status: existing.status,
        visibility: existing.visibility,
        cover: existing.cover ?? '',
        formSchemaId: existing.formSchemaId,
        prize: existing.prize ?? '',
        leaderboardMode: existing.leaderboardMode,
        stages: existing.stages.map((s) => ({ ...s })),
        timeline: {
          registrationClosesAt: asDateInput(existing.timeline.registrationClosesAt),
          submissionClosesAt: asDateInput(existing.timeline.submissionClosesAt),
          resultsAt: asDateInput(existing.timeline.resultsAt),
        },
      });
    }
  }, [existing, isNew, firstWorkspaceId, firstSchemaId, draft]);

  /**
   * Back-fill defaults that arrived after the draft was seeded.
   *
   * The lists load from separate queries, so whichever resolves second would
   * otherwise leave its select empty and the organiser staring at a validation
   * error for a choice they were never offered. Only ever fills a blank — it
   * cannot overwrite something the user picked.
   */
  useEffect(() => {
    setDraft((d) => {
      if (!d) return d;
      const workspaceId = d.workspaceId || firstWorkspaceId;
      const formSchemaId = d.formSchemaId || firstSchemaId;
      if (workspaceId === d.workspaceId && formSchemaId === d.formSchemaId) return d;
      return { ...d, workspaceId, formSchemaId };
    });
  }, [firstWorkspaceId, firstSchemaId]);

  useEffect(() => {
    if (rubric.length > 0 && criteria.length === 0) {
      setCriteria(rubric.map((r, i) => ({
        id: r.id, name: r.name, description: r.description, weight: r.weight, max: r.max, order: i,
      })));
    }
  }, [rubric, criteria.length]);

  const takenSlugs = useMemo(
    () => challenges.filter((ch) => ch.id !== draft?.id).map((ch) => ch.slug),
    [challenges, draft?.id],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const problems = useMemo(() => {
    if (!draft) return [];
    const list: string[] = [];
    if (!draft.title.trim()) list.push('A challenge needs a title.');
    if (!draft.slug.trim()) list.push('A challenge needs a URL slug.');
    if (takenSlugs.includes(draft.slug)) list.push(`The slug “${draft.slug}” is already used by another challenge.`);
    if (!draft.formSchemaId) list.push('Pick a registration form. Participants have nothing to fill in without one.');
    if (!draft.workspaceId) list.push('Pick a workspace.');

    const { registrationClosesAt: reg, submissionClosesAt: sub, resultsAt: res } = draft.timeline;
    if (reg && sub && reg > sub) list.push('Registration closes after submissions close, which no one could satisfy.');
    if (sub && res && sub > res) list.push('Results are announced before submissions close.');
    if (draft.status !== 'draft' && !sub) list.push('A published challenge needs a submission deadline.');

    const totalWeight = criteria.reduce((n, r) => n + r.weight, 0);
    if (criteria.length > 0 && Math.abs(totalWeight - 100) > 0.01) {
      list.push(`Rubric weights total ${totalWeight}%, not 100%.`);
    }
    return list;
  }, [draft, takenSlugs, criteria]);

  const canSave = can('challenge.update') || (isNew && can('challenge.create'));

  const commit = async (status?: Challenge['status']) => {
    if (!draft) return;
    const finalStatus = status ?? draft.status;
    const id = draft.id || newChallengeId(draft.title);

    await save.mutateAsync({
      input: {
        ...draft,
        id,
        status: finalStatus,
        formSchemaVersion: schemas[draft.formSchemaId]?.version ?? 1,
        timeline: {
          registrationClosesAt: draft.timeline.registrationClosesAt || null,
          submissionClosesAt: draft.timeline.submissionClosesAt || null,
          resultsAt: draft.timeline.resultsAt || null,
        },
      },
      userId: user?.uid,
      isNew,
    });

    if (criteria.length > 0 || removedCriteria.length > 0) {
      await saveRubric.mutateAsync({
        criteria: criteria.map((r, i) => ({ ...r, order: i })),
        removedIds: removedCriteria,
        userId: user?.uid,
      });
      setRemovedCriteria([]);
    }

    setSavedAt(new Date().toLocaleTimeString());
    if (isNew) nav(`/org/challenges/${id}/edit`, { replace: true });
  };

  if (!draft) {
    return (
      <QueryBoundary isLoading={isLoading || !permsReady} error={error}>
        <Box sx={{ ...containerSx, textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: c.inkMuted }}>
            {isNew
              ? 'Preparing a new challenge…'
              : 'That challenge could not be found. It may have been deleted.'}
          </Typography>
        </Box>
      </QueryBoundary>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', pb: 6 }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
        <IconButton
          component={Link}
          to={isNew ? '/org/challenges' : `/org/challenges/${draft.id}`}
          aria-label="Back"
        >
          <Icon name="arrow_back" size={22} />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>{isNew ? 'New challenge' : 'Editing'}</Eyebrow>
          <Typography noWrap sx={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
            {draft.title || 'Untitled challenge'}
          </Typography>
        </Box>
        <Tag bg={c.surfaceField} fg={c.inkMuted}>{draft.status}</Tag>
      </Stack>

      {!canSave && permsReady && (
        <Stack direction="row" gap={1.5} sx={{ ...containerSx, mb: 3, background: c.errorContainer }}>
          <Icon name="lock" size={22} color={c.errorInk} />
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: c.onErrorContainer }}>
              You can look, but not save
            </Typography>
            <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
              Editing a challenge needs the <b>challenge.update</b> permission. Ask an owner or admin to
              invite you as an Organizer.
            </Typography>
          </Box>
        </Stack>
      )}

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" sx={{ mb: 3 }}>
        <Tab label="Basics" />
        <Tab label="Cover" />
        <Tab label="Timeline" />
        <Tab label="Stages" />
        <Tab label="Scoring" />
        <Tab label="Visibility" />
      </Tabs>

      {tab === 0 && (
        <Stack gap={2.5} sx={panelSx}>
          <TextField
            label="Title"
            fullWidth
            value={draft.title}
            autoFocus
            onChange={(e) => {
              const title = e.target.value;
              setDraft((d) => d && {
                ...d,
                title,
                // Only auto-follow while the slug has never been hand-edited —
                // a live challenge's URL must not change under its audience.
                slug: isNew && (d.slug === '' || d.slug === slugify(d.title))
                  ? uniqueSlug(title, takenSlugs)
                  : d.slug,
              });
            }}
            placeholder="Monsoon Photo Challenge"
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems="flex-start">
            <TextField
              label="URL slug"
              fullWidth
              value={draft.slug}
              onChange={(e) => set('slug', slugify(e.target.value))}
              helperText={`forge.app/c/${draft.slug || '…'}`}
              error={takenSlugs.includes(draft.slug)}
            />
            <Tooltip title="Regenerate from the title. Only do this before sharing the link.">
              <Button
                variant="outlined"
                sx={{ height: 56, flex: 'none' }}
                onClick={() => set('slug', uniqueSlug(draft.title, takenSlugs))}
              >
                Regenerate
              </Button>
            </Tooltip>
          </Stack>

          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={3}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            helperText="Shown on the public page and the discover card. Two sentences beats two paragraphs."
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField
              select label="Category" fullWidth value={draft.category}
              onChange={(e) => set('category', e.target.value)}
              helperText="Also picks the fallback cover colour."
            >
              {CATEGORIES.map((cat) => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
            </TextField>
            <TextField
              select label="Workspace" fullWidth value={draft.workspaceId}
              onChange={(e) => set('workspaceId', e.target.value)}
            >
              {workspaces.length === 0 && <MenuItem value="">No workspaces yet</MenuItem>}
              {workspaces.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </TextField>
          </Stack>

          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: c.inkMuted, mb: 1 }}>Tags</Typography>
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
              {draft.tags.map((t) => (
                <Box
                  key={t}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.5,
                    background: c.surfaceField, borderRadius: `${radius.chip}px`,
                    px: 1.25, py: 0.5, fontSize: 13,
                  }}
                >
                  {t}
                  <IconButton
                    size="small"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => set('tags', draft.tags.filter((x) => x !== t))}
                    sx={{ p: 0.25 }}
                  >
                    <Icon name="close" size={14} />
                  </IconButton>
                </Box>
              ))}
              {draft.tags.length === 0 && (
                <Typography sx={{ fontSize: 13, color: c.inkFaint }}>No tags yet.</Typography>
              )}
            </Stack>
            <TextField
              size="small"
              placeholder="Add a tag and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const tag = tagInput.trim().toLowerCase();
                if (tag && !draft.tags.includes(tag)) set('tags', [...draft.tags, tag]);
                setTagInput('');
              }}
            />
          </Box>

          <TextField
            select label="Registration form" fullWidth value={draft.formSchemaId}
            onChange={(e) => set('formSchemaId', e.target.value)}
            helperText="What participants fill in to enter. Edit the questions in the form builder."
          >
            {schemaIds.length === 0 && <MenuItem value="">No forms yet</MenuItem>}
            {schemaIds.map((id) => (
              <MenuItem key={id} value={id}>{schemas[id]?.title ?? id} (v{schemas[id]?.version})</MenuItem>
            ))}
          </TextField>

          {draft.formSchemaId && !isNew && (
            <Button
              component={Link}
              to={`/org/challenges/${draft.id}/form`}
              variant="outlined"
              startIcon={<Icon name="edit_note" size={20} />}
              sx={{ alignSelf: 'flex-start' }}
            >
              Edit the questions
            </Button>
          )}
        </Stack>
      )}

      {tab === 1 && (
        <Stack gap={3} sx={panelSx}>
          <Box>
            <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.5 }}>Cover image</Typography>
            <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6 }}>
              Paste a Google Drive share link or any image URL. Leave it empty to use the category
              colour — that is a deliberate design, not a placeholder, so an event with no photo still
              looks finished.
            </Typography>
          </Box>

          <DriveLinkInput
            value={draft.cover}
            onChange={(next) => set('cover', next)}
            purpose="image"
            allowPlainUrl
            label="Cover image link"
            placeholder="https://drive.google.com/file/d/…/view"
          />

          <Divider />

          <Box>
            <Eyebrow>How it will look</Eyebrow>
            <Box sx={{ mt: 1.5, borderRadius: `${radius.card}px`, overflow: 'hidden', border: `1px solid ${c.outline}` }}>
              <CoverImage cover={draft.cover} category={draft.category} height={180} alt="" />
              <Box sx={{ p: 2.5, background: c.surfaceCard }}>
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
                  {draft.title || 'Untitled challenge'}
                </Typography>
                <Typography sx={{ fontSize: 13, color: c.inkMuted, mt: 0.5 }}>
                  {draft.description || 'No description yet.'}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Stack>
      )}

      {tab === 2 && (
        <Stack gap={2.5} sx={panelSx}>
          <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6 }}>
            All three are optional while the challenge is a draft. A published challenge needs at
            least a submission deadline, because lateness is judged against it.
          </Typography>
          {([
            ['registrationClosesAt', 'Registration closes', 'After this, no new entrants.'],
            ['submissionClosesAt', 'Submissions close', 'Entries after this are marked late, not rejected.'],
            ['resultsAt', 'Results announced', 'When the leaderboard becomes final.'],
          ] as const).map(([key, label, help]) => (
            <TextField
              key={key}
              type="date"
              label={label}
              value={draft.timeline[key]}
              onChange={(e) => set('timeline', { ...draft.timeline, [key]: e.target.value })}
              InputLabelProps={{ shrink: true }}
              helperText={help}
              fullWidth
            />
          ))}
        </Stack>
      )}

      {tab === 3 && (
        <Box sx={panelSx}>
          <StageDesigner stages={draft.stages} onChange={(next) => set('stages', next)} />
        </Box>
      )}

      {tab === 4 && (
        <Stack gap={2.5} sx={panelSx}>
          <Box>
            <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.5 }}>Scoring rubric</Typography>
            <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6 }}>
              What judges score against. Weights are a percentage of the final mark and must total 100.
              Changing a rubric never rewrites past scores — the ledger is append-only.
            </Typography>
          </Box>

          {criteria.map((cr, i) => (
            <Box key={cr.id} sx={{ ...containerSx, p: 2.25 }}>
              <Stack direction="row" gap={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                <TextField
                  size="small" label="Criterion" value={cr.name} sx={{ flex: 1 }}
                  onChange={(e) => setCriteria(criteria.map((x, j) =>
                    j === i ? { ...x, name: e.target.value } : x))}
                />
                <TextField
                  size="small" label="Weight %" type="number" value={cr.weight} sx={{ width: 110 }}
                  onChange={(e) => setCriteria(criteria.map((x, j) =>
                    j === i ? { ...x, weight: Number(e.target.value) } : x))}
                />
                <TextField
                  size="small" label="Out of" type="number" value={cr.max} sx={{ width: 100 }}
                  onChange={(e) => setCriteria(criteria.map((x, j) =>
                    j === i ? { ...x, max: Number(e.target.value) } : x))}
                />
                <IconButton
                  aria-label={`Remove ${cr.name}`}
                  onClick={() => {
                    setCriteria(criteria.filter((_, j) => j !== i));
                    setRemovedCriteria([...removedCriteria, cr.id]);
                  }}
                >
                  <Icon name="delete" size={18} />
                </IconButton>
              </Stack>
              <TextField
                size="small" fullWidth label="What judges should look for" value={cr.description}
                onChange={(e) => setCriteria(criteria.map((x, j) =>
                  j === i ? { ...x, description: e.target.value } : x))}
              />
            </Box>
          ))}

          <Stack direction="row" alignItems="center" gap={2}>
            <Button
              variant="outlined"
              startIcon={<Icon name="add" size={20} />}
              onClick={() => setCriteria([...criteria, {
                id: newCriterionId('criterion'),
                name: '', description: '', weight: 0, max: 10, order: criteria.length,
              }])}
            >
              Add criterion
            </Button>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{
              fontSize: 13, fontWeight: 700,
              color: Math.abs(criteria.reduce((n, r) => n + r.weight, 0) - 100) < 0.01 || criteria.length === 0
                ? c.successInk : c.errorInk,
            }}>
              {criteria.reduce((n, r) => n + r.weight, 0)}% of 100%
            </Typography>
          </Stack>
        </Stack>
      )}

      {tab === 5 && (
        <Stack gap={2.5} sx={panelSx}>
          <TextField
            select label="Who can see this" fullWidth value={draft.visibility}
            onChange={(e) => set('visibility', e.target.value as Draft['visibility'])}
          >
            <MenuItem value="public">Public — listed in Discover, anyone can enter</MenuItem>
            <MenuItem value="organization">Organization — only members can see it</MenuItem>
            <MenuItem value="invite">Invite only — reachable by direct link</MenuItem>
          </TextField>

          <TextField
            select label="Leaderboard" fullWidth value={draft.leaderboardMode}
            onChange={(e) => set('leaderboardMode', e.target.value as Draft['leaderboardMode'])}
            helperText="A live leaderboard during judging can bias judges. 'After close' is the safe default."
          >
            <MenuItem value="hidden">Hidden — nobody sees ranks</MenuItem>
            <MenuItem value="live">Live — updates as scores land</MenuItem>
            <MenuItem value="afterClose">After close — revealed when results are published</MenuItem>
            <MenuItem value="public">Public — visible to everyone, including non-entrants</MenuItem>
          </TextField>

          <TextField
            label="Prize" fullWidth value={draft.prize}
            onChange={(e) => set('prize', e.target.value)}
            placeholder="₹25,000 and a feature on the community page"
            helperText="Recorded and displayed. Forge never disburses money."
          />

          <TextField
            select label="Status" fullWidth value={draft.status}
            onChange={(e) => set('status', e.target.value as Draft['status'])}
          >
            {(['draft', 'published', 'running', 'judging', 'completed'] as const).map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>
            ))}
          </TextField>

          {!isNew && can('challenge.delete') && (
            <>
              <Divider />
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: c.errorInk, mb: 0.5 }}>
                  Delete this challenge
                </Typography>
                <Typography sx={{ fontSize: 13, color: c.inkMuted, mb: 1.5, lineHeight: 1.5 }}>
                  Entries and scores already recorded are not removed, so nothing is silently lost —
                  but the challenge disappears from every list and its public link stops resolving.
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<Icon name="delete" size={20} />}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete challenge
                </Button>
              </Box>
            </>
          )}
        </Stack>
      )}

      {problems.length > 0 && (
        <Box sx={{ mt: 3, p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: c.onErrorContainer, mb: 1 }}>
            Fix before publishing
          </Typography>
          <Stack component="ul" gap={0.75} sx={{ m: 0, pl: 2.5 }}>
            {problems.map((p) => (
              <Typography key={p} component="li" sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
                {p}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}

      {save.error && (
        <Box sx={{ mt: 3, p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: c.onErrorContainer, mb: 0.5 }}>
            Could not save
          </Typography>
          <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
            {save.error instanceof Error ? save.error.message : String(save.error)}
          </Typography>
        </Box>
      )}

      <Stack
        direction="row"
        gap={1.5}
        alignItems="center"
        sx={{
          mt: 3, position: 'sticky', bottom: 0, py: 2,
          background: `linear-gradient(to top, ${c.surface} 70%, transparent)`,
        }}
      >
        {savedAt && (
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ fontSize: 13, color: c.successInk }}>
            <Icon name="check_circle" size={18} fill />
            Saved {savedAt}
          </Stack>
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          sx={{ height: 48 }}
          disabled={!canSave || save.isPending || problems.length > 0}
          onClick={() => void commit('draft')}
        >
          Save draft
        </Button>
        <Button
          variant="contained"
          sx={{ height: 48, px: 3, transition: `transform 150ms ${ease}` }}
          disabled={!canSave || save.isPending || problems.length > 0}
          onClick={() => void commit(draft.status === 'draft' ? 'published' : draft.status)}
        >
          {save.isPending ? 'Saving…' : draft.status === 'draft' ? 'Publish' : 'Save changes'}
        </Button>
      </Stack>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete “{draft.title}”?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, lineHeight: 1.6, color: c.inkMuted }}>
            This cannot be undone from here. Entrants will no longer find the challenge, and its
            public link will stop working. Their submitted entries are kept.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
          <Button
            variant="contained"
            color="error"
            disabled={remove.isPending}
            onClick={async () => {
              await remove.mutateAsync({ challengeId: draft.id, userId: user?.uid });
              nav('/org/challenges', { replace: true });
            }}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

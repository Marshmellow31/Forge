import { Box, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { Tag, containerSx } from '@shared/ui/primitives';
import { validateWorkflow } from '@core/workflow/engine';
import type { AdvanceRule, Stage as EngineStage, StageType, Tiebreaker } from '@core/workflow/types';
import { c, radius } from '@shared/design/tokens';
import type { Stage } from '@shared/types/domain';

/**
 * The workflow designer. ROADMAP Phase 2, SPEC_WORKFLOW_ENGINE.
 *
 * It edits the stages a challenge actually runs on rather than a separate
 * `WorkflowDefinition` document, because a definition that is not the thing
 * being executed is a second source of truth — and the first bug it produces is
 * a challenge running a workflow its designer does not show.
 *
 * Every control here is data going into `core/workflow`. Nothing about the
 * *shape* of a competition is encoded in this file: the same four controls
 * express "one form, one winner" and "screening → two rounds → interview",
 * which is CLAUDE.md hard rule 1 in practice.
 */

const STAGE_TYPES: Array<{ value: StageType; label: string; hint: string }> = [
  { value: 'registration', label: 'Registration', hint: 'Where participants enter. Must be first.' },
  { value: 'submission', label: 'Submission', hint: 'Participants produce something.' },
  { value: 'screening', label: 'Screening', hint: 'Staff filter, usually without scoring.' },
  { value: 'review', label: 'Review', hint: 'Qualitative feedback, no score.' },
  { value: 'judging', label: 'Judging', hint: 'Scored against the rubric.' },
  { value: 'voting', label: 'Community voting', hint: 'Peers or the public vote.' },
  { value: 'interview', label: 'Interview', hint: 'Happens offline; the outcome is recorded.' },
  { value: 'checkIn', label: 'Check-in', hint: 'Attendance or QR check-in.' },
  { value: 'announcement', label: 'Announcement', hint: 'Terminal — results are published.' },
  { value: 'custom', label: 'Custom', hint: 'Anything else.' },
];

const RULES: Array<{ value: AdvanceRule['mode']; label: string; hint: string }> = [
  { value: 'manual', label: 'Staff decide each participant', hint: 'Nobody moves until someone says so.' },
  { value: 'all', label: 'Everyone advances', hint: 'A pass-through stage.' },
  { value: 'submissionComplete', label: 'Once they submit', hint: 'Advances as soon as a submission arrives.' },
  { value: 'deadline', label: 'When the stage closes', hint: 'Everyone still active advances at the deadline.' },
  { value: 'threshold', label: 'Above a score', hint: 'A pass mark. Unscored entries wait, they never fail.' },
  { value: 'topN', label: 'Top N', hint: 'A fixed cut. Ties at the boundary all advance.' },
  { value: 'topPercent', label: 'Top percentage', hint: 'A proportional cut, rounded up.' },
  { value: 'quorum', label: 'Enough reviews and a minimum average', hint: 'Waits for quorum before deciding.' },
];

const TIEBREAKERS: Array<{ value: Tiebreaker; label: string }> = [
  { value: 'earliestSubmission', label: 'Earliest submission' },
  { value: 'highestSingleCriterion', label: 'Best single criterion' },
  { value: 'judgeCount', label: 'Most reviews' },
  { value: 'random', label: 'Random (seeded, reproducible)' },
];

const defaultRule = (mode: AdvanceRule['mode']): AdvanceRule => {
  switch (mode) {
    case 'topN': return { mode, n: 10, tiebreaker: 'earliestSubmission' };
    case 'topPercent': return { mode, percent: 50, tiebreaker: 'earliestSubmission' };
    case 'threshold': return { mode, minScore: 60 };
    case 'quorum': return { mode, minReviews: 3, minAvgScore: 60 };
    default: return { mode } as AdvanceRule;
  }
};

/** `YYYY-MM-DD` ⇄ epoch millis, for the date inputs. */
const toDateInput = (ms: number | null | undefined) =>
  ms ? new Date(ms).toISOString().slice(0, 10) : '';
const fromDateInput = (value: string) =>
  value ? new Date(`${value}T23:59:59`).getTime() : null;

export function StageDesigner({
  stages,
  onChange,
}: {
  stages: Stage[];
  onChange: (next: Stage[]) => void;
}) {
  // Validated through the real engine, so the designer cannot disagree with
  // what will actually run.
  const asEngineStages: EngineStage[] = stages.map((s, i) => ({
    id: s.key, key: s.key, name: s.name, description: null, order: i + 1,
    type: (s.type as StageType) ?? 'custom',
    entry: 'auto', window: s.window ?? null, capacity: null,
    formSchemaId: null, formSchemaVersion: null,
    advanceRule: s.advanceRule ?? { mode: 'manual' },
    onEnter: [], onExit: [], visibility: 'participants',
  }));

  const issues = validateWorkflow({
    id: 'preview', orgId: '', version: 1, status: 'draft',
    name: 'preview', description: null, stages: asEngineStages,
    settings: { allowWithdraw: true, allowReentry: false, autoAdvanceOnDeadline: true, notifyOnStageChange: true },
  });

  const update = (index: number, patch: Partial<Stage>) =>
    onChange(stages.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const move = (index: number, delta: number) => {
    const next = [...stages];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <Stack gap={2.5}>
      <Box>
        <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.5 }}>Stages</Typography>
        <Typography sx={{ fontSize: 14, color: c.inkMuted, lineHeight: 1.6 }}>
          The path a participant walks, and the rule that moves them along it. These are data, not
          code — the same four controls express “one form, one winner” and “screening → two rounds
          → interview”.
        </Typography>
      </Box>

      {issues.length > 0 && (
        <Box sx={{ p: 2.25, borderRadius: `${radius.tile}px`, background: c.errorContainer }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: c.onErrorContainer, mb: 1 }}>
            This workflow will not run
          </Typography>
          <Stack component="ul" gap={0.75} sx={{ m: 0, pl: 2.5 }}>
            {issues.map((issue) => (
              <Typography key={`${issue.code}-${issue.stageKey}`} component="li" sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
                {issue.message}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}

      {stages.map((stage, index) => {
        const rule = stage.advanceRule ?? { mode: 'manual' as const };
        const typeHint = STAGE_TYPES.find((t) => t.value === stage.type)?.hint;
        const ruleHint = RULES.find((r) => r.value === rule.mode)?.hint;

        return (
          <Box key={stage.key} sx={{ ...containerSx, p: 2.5 }}>
            <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
              <Box
                sx={{
                  width: 28, height: 28, flex: 'none', borderRadius: '50%',
                  background: c.inverse, color: c.primary,
                  display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
                }}
              >
                {index + 1}
              </Box>
              <TextField
                size="small" label="Stage name" value={stage.name} sx={{ flex: 1 }}
                onChange={(e) => update(index, { name: e.target.value })}
              />
              {index === stages.length - 1 && <Tag bg={c.success} fg={c.onSuccess}>Final</Tag>}
              <IconButton aria-label={`Move ${stage.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                <Icon name="arrow_upward" size={18} />
              </IconButton>
              <IconButton aria-label={`Move ${stage.name} down`} disabled={index === stages.length - 1} onClick={() => move(index, 1)}>
                <Icon name="arrow_downward" size={18} />
              </IconButton>
              <IconButton
                aria-label={`Remove ${stage.name}`}
                disabled={stages.length <= 1}
                onClick={() => onChange(stages.filter((_, i) => i !== index))}
              >
                <Icon name="delete" size={18} />
              </IconButton>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mb: 1.5 }}>
              <TextField
                select size="small" label="Kind of stage" value={stage.type} fullWidth
                helperText={typeHint}
                onChange={(e) => update(index, { type: e.target.value })}
              >
                {STAGE_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </TextField>

              <TextField
                select size="small" label="How participants move on" value={rule.mode} fullWidth
                helperText={ruleHint}
                onChange={(e) => update(index, { advanceRule: defaultRule(e.target.value as AdvanceRule['mode']) })}
              >
                {RULES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
              </TextField>
            </Stack>

            {/* Only the parameters the chosen rule actually uses. */}
            <Stack direction="row" gap={2} flexWrap="wrap">
              {rule.mode === 'topN' && (
                <TextField
                  size="small" type="number" label="How many advance" value={rule.n} sx={{ width: 170 }}
                  onChange={(e) => update(index, { advanceRule: { ...rule, n: Number(e.target.value) } })}
                />
              )}
              {rule.mode === 'topPercent' && (
                <TextField
                  size="small" type="number" label="Percent advancing" value={rule.percent} sx={{ width: 170 }}
                  onChange={(e) => update(index, { advanceRule: { ...rule, percent: Number(e.target.value) } })}
                />
              )}
              {rule.mode === 'threshold' && (
                <TextField
                  size="small" type="number" label="Pass mark" value={rule.minScore} sx={{ width: 170 }}
                  onChange={(e) => update(index, { advanceRule: { ...rule, minScore: Number(e.target.value) } })}
                />
              )}
              {rule.mode === 'quorum' && (
                <>
                  <TextField
                    size="small" type="number" label="Reviews needed" value={rule.minReviews} sx={{ width: 170 }}
                    onChange={(e) => update(index, { advanceRule: { ...rule, minReviews: Number(e.target.value) } })}
                  />
                  <TextField
                    size="small" type="number" label="Minimum average" value={rule.minAvgScore} sx={{ width: 170 }}
                    onChange={(e) => update(index, { advanceRule: { ...rule, minAvgScore: Number(e.target.value) } })}
                  />
                </>
              )}
              {(rule.mode === 'topN' || rule.mode === 'topPercent') && (
                <TextField
                  select size="small" label="Break ties by" value={rule.tiebreaker} sx={{ minWidth: 240 }}
                  helperText="Everyone tied with the last place advances regardless."
                  onChange={(e) => update(index, { advanceRule: { ...rule, tiebreaker: e.target.value as Tiebreaker } })}
                >
                  {TIEBREAKERS.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
              )}
              {rule.mode === 'deadline' && (
                <TextField
                  size="small" type="date" label="Stage closes" sx={{ width: 200 }}
                  InputLabelProps={{ shrink: true }}
                  value={toDateInput(stage.window?.closesAt)}
                  onChange={(e) => update(index, {
                    window: { opensAt: stage.window?.opensAt ?? null, closesAt: fromDateInput(e.target.value) },
                  })}
                />
              )}

              <Box sx={{ flex: 1 }} />

              <TextField
                select size="small" label="State" value={stage.state} sx={{ width: 130 }}
                onChange={(e) => update(index, { state: e.target.value as Stage['state'] })}
              >
                <MenuItem value="done">Done</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="locked">Locked</MenuItem>
              </TextField>
            </Stack>
          </Box>
        );
      })}

      <Stack direction="row" gap={1.5} alignItems="center">
        <Box
          component="button"
          onClick={() => onChange([...stages, {
            key: `stage_${Date.now().toString(36)}`,
            name: 'New stage',
            type: 'custom',
            state: 'locked',
            advanceRule: { mode: 'manual' },
          }])}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 1, cursor: 'pointer',
            font: 'inherit', fontSize: 14, fontWeight: 600, color: c.primaryInk,
            px: 2, py: 1.25, borderRadius: `${radius.pill}px`,
            border: `1px solid ${c.outline}`, background: c.surfaceCard,
            '&:hover': { background: c.surfaceRowHover },
          }}
        >
          <Icon name="add" size={20} />
          Add stage
        </Box>
        <Typography sx={{ fontSize: 12.5, color: c.inkFaint, lineHeight: 1.5 }}>
          An unscored entry is always <b>held</b>, never eliminated — a cut waits for judging
          rather than punishing someone for a judge&rsquo;s backlog.
        </Typography>
      </Stack>
    </Stack>
  );
}

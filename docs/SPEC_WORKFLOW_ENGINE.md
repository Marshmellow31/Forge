# SPEC_WORKFLOW_ENGINE.md

Challenges are not "one form, one winner". An admin composes stages; the engine
moves participants through them. Config-driven, deterministic, pure.

Lives in `src/core/workflow` (pure) + `src/modules/workflow` (designer UI).

---

## 1. What it must express

```
Simple:     Registration → Submission → Winner

Multi-round: Registration → Screening → Round 1 → Round 2 → Interview → Winner

Ongoing:    Registration → Weekly Submission (repeating) → Monthly Leaderboard

Voting:     Registration → Submission → Community Voting → Jury → Winner
```

All four are the **same code path** with different documents.

## 2. Types

```ts
interface WorkflowDefinition {
  id: string;
  orgId: string;
  version: number;                 // published versions immutable
  status: 'draft' | 'published' | 'archived';
  name: string;
  description: string | null;
  stages: Stage[];                 // ordered; linear in v1, DAG-ready
  settings: {
    allowWithdraw: boolean;
    allowReentry: boolean;
    autoAdvanceOnDeadline: boolean;
    notifyOnStageChange: boolean;
  };
}

interface Stage {
  id: string;
  key: StageKey;                   // stable slug, referenced by registrations
  name: string;
  description: string | null;
  order: number;
  type: StageType;

  entry: 'auto' | 'manual' | 'scheduled';
  window: { opensAt: Timestamp | null; closesAt: Timestamp | null } | null;
  capacity: number | null;         // max participants in this stage

  formSchemaId: string | null;     // stage collects data
  formSchemaVersion: number | null;
  judgingConfigId: string | null;  // stage is evaluated

  advanceRule: AdvanceRule;
  onEnter: StageAction[];
  onExit: StageAction[];

  visibility: 'public' | 'participants' | 'staff';
  requiredPermissionToDecide: Permission | null;
}

type StageType =
  | 'registration'   // entry point; creates the Registration
  | 'submission'     // participant produces an artifact
  | 'screening'      // staff filter, usually no scoring
  | 'review'         // qualitative feedback
  | 'judging'        // scored via a rubric
  | 'voting'         // community/peer votes
  | 'interview'      // scheduled, offline outcome recorded
  | 'checkIn'        // QR / attendance
  | 'announcement'   // terminal; results published
  | 'custom';

type AdvanceRule =
  | { mode: 'manual' }                                    // staff decide each participant
  | { mode: 'all' }                                        // everyone advances
  | { mode: 'topN'; n: number; tiebreaker: Tiebreaker }
  | { mode: 'topPercent'; percent: number; tiebreaker: Tiebreaker }
  | { mode: 'threshold'; minScore: number }
  | { mode: 'quorum'; minReviews: number; minAvgScore: number }
  | { mode: 'submissionComplete' }                        // advance once a valid submission exists
  | { mode: 'deadline' };                                  // advance whoever is still active at close

type Tiebreaker = 'earliestSubmission' | 'highestSingleCriterion' | 'judgeCount' | 'random';

type StageAction =
  | { type: 'notify'; template: string; channels: NotificationChannel[] }
  | { type: 'awardPoints'; points: number }
  | { type: 'awardBadge'; badgeId: string }
  | { type: 'issueCertificate'; templateId: string; awardLabel: string }
  | { type: 'setStatus'; status: RegistrationStatus }
  | { type: 'webhook'; url: string; secretRef: string };   // Phase 3
```

## 3. Participant state

State lives on `Registration` (see [DATA_MODEL.md](DATA_MODEL.md)):
`currentStageKey`, `stageHistory[]`, `status`.

```
      ┌──────────┐   approve    ┌────────┐
      │ pending  │─────────────▶│ active │◀──────┐
      └──────────┘              └───┬────┘       │ advance
            │ reject                │            │
            ▼                       ├────────────┘
      ┌──────────┐                  │
      │ rejected │                  ├──▶ eliminated
      └──────────┘                  ├──▶ withdrawn
                                    ├──▶ disqualified
                                    └──▶ winner   (terminal)
```

`pending` only exists when `challenge.participation.requiresApproval` is true.

## 4. The engine is pure

```ts
// core/workflow/engine.ts — NO Firebase, NO Date.now(), NO randomness
export function evaluateAdvancement(input: {
  stage: Stage;
  cohort: ParticipantSnapshot[];   // everyone currently in this stage
  now: number;                     // injected clock
  seed: string;                    // injected, for 'random' tiebreaker determinism
}): AdvancementDecision[];

export function applyTransition(
  registration: RegistrationState,
  decision: AdvancementDecision,
  workflow: WorkflowDefinition,
  now: number,
): RegistrationState;               // returns a NEW object; never mutates

export function nextStage(workflow: WorkflowDefinition, currentKey: StageKey): Stage | null;
export function canEnterStage(stage: Stage, reg: RegistrationState, now: number): Result<true, ReasonCode>;
export function validateWorkflow(wf: WorkflowDefinition): ValidationIssue[];
```

**Why purity matters here:** advancement decides who wins. It must be replayable,
auditable, and testable without a database. Injecting `now` and `seed` means the
same inputs always produce the same outcome — including the `random` tiebreaker,
which uses a seeded PRNG so a disputed result can be reproduced exactly.

## 5. Execution: who calls the engine

| Caller | Purpose | Authority |
|---|---|---|
| Builder preview (client) | Show admins what a rule would do | none — advisory |
| Participant UI (client) | Render "you are in Round 2" | none — display |
| `advanceStage` Cloud Function | Actually write transitions | **authoritative** |
| `scheduledAdvance` cron | Deadline-driven auto-advance | **authoritative** |

Clients never write `currentStageKey`. Security rules forbid it. The client
computes the same answer only so the UI can be optimistic and offline-correct.

**Idempotency:** `advanceStage` takes `(challengeId, stageKey, decisionBatchId)`.
Re-running with the same batch id is a no-op. Transitions are written in batches
of ≤ 400 with a checkpoint document so a timeout resumes rather than double-advances.

## 6. Validation rules (checked before publish)

`validateWorkflow()` must reject:

1. Zero stages, or no stage of type `registration` first.
2. Duplicate `stage.key`.
3. A stage of type `judging`/`voting` with no `judgingConfigId`.
4. A stage of type `submission` with no `formSchemaId`.
5. `advanceRule.mode === 'topN'` on a stage with no scoring source.
6. `window.closesAt <= window.opensAt`.
7. A stage window that opens before the previous stage's window closes, when
   `entry === 'auto'` (produces unreachable stages).
8. `capacity` smaller than a `topN` on the same stage.
9. A terminal `announcement` stage that is not last.
10. Unreachable stages (no path from registration).

Issues are returned as `{ severity: 'error'|'warning', stageKey, code, message }`.
Errors block publish; warnings are shown with an override.

## 7. Editing a live workflow

Publishing a new version does **not** move existing registrations. They stay
pinned to `challenge.workflowVersion`. Changing a running challenge's workflow
version is an explicit, permissioned, audited action (`workflow.migrate`) that
requires a stage-key mapping from old → new, supplied by the admin. Unmapped
participants block the migration.

## 8. Repeating stages (fitness/weekly challenges)

A stage with `config.repeat = { every: 'week' | 'day'; occurrences: number }`
spawns **submission slots** rather than new stages. The registration stays in one
stage; `submissions` accumulate with a `slotKey` (`2026-W31`). Advancement rules
then read aggregate scores across slots. This keeps the stage list finite while
supporting ongoing challenges.

## 9. Testing requirements

| Test | Why |
|---|---|
| `topN` with ties resolves per `tiebreaker`, deterministically under a fixed seed | Disputed results must be reproducible |
| Same batch id applied twice → identical state | Idempotency |
| `threshold` with zero qualifying participants → challenge does not deadlock | Real failure mode |
| `validateWorkflow` catches all ten rules in §6 | Publish safety |
| Registration pinned to v1 is unaffected by publishing v2 | Version isolation |
| Withdrawal mid-stage removes from cohort before advancement | Cohort correctness |
| 5 000-participant cohort evaluates in < 500 ms | Scale |

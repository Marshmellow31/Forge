/**
 * Workflow engine types. PURE data — SPEC_WORKFLOW_ENGINE §2.
 *
 * The point of this file is that "Registration → Submission → Winner" and
 * "Registration → Screening → Round 1 → Round 2 → Interview → Winner" are the
 * same code path with different documents. Nothing below encodes a particular
 * competition shape; that is AGENT.md hard rule 1 expressed as types.
 */

export type StageKey = string;

export type StageType =
  | 'registration'
  | 'submission'
  | 'screening'
  | 'review'
  | 'judging'
  | 'voting'
  | 'interview'
  | 'checkIn'
  | 'announcement'
  | 'custom';

export type Tiebreaker =
  | 'earliestSubmission'
  | 'highestSingleCriterion'
  | 'judgeCount'
  | 'random';

export type AdvanceRule =
  | { mode: 'manual' }
  | { mode: 'all' }
  | { mode: 'topN'; n: number; tiebreaker: Tiebreaker }
  | { mode: 'topPercent'; percent: number; tiebreaker: Tiebreaker }
  | { mode: 'threshold'; minScore: number }
  | { mode: 'quorum'; minReviews: number; minAvgScore: number }
  | { mode: 'submissionComplete' }
  | { mode: 'deadline' };

export type RegistrationStatus =
  | 'pending' | 'active' | 'eliminated' | 'withdrawn' | 'disqualified' | 'winner';

export type StageAction =
  | { type: 'notify'; template: string }
  | { type: 'awardPoints'; points: number }
  | { type: 'awardBadge'; badgeId: string }
  | { type: 'issueCertificate'; awardLabel: string }
  | { type: 'setStatus'; status: RegistrationStatus };

export interface Stage {
  id: string;
  key: StageKey;
  name: string;
  description: string | null;
  order: number;
  type: StageType;
  entry: 'auto' | 'manual' | 'scheduled';
  /** Epoch millis, so the engine never touches a `Date`. */
  window: { opensAt: number | null; closesAt: number | null } | null;
  capacity: number | null;
  formSchemaId: string | null;
  formSchemaVersion: number | null;
  advanceRule: AdvanceRule;
  onEnter: StageAction[];
  onExit: StageAction[];
  visibility: 'public' | 'participants' | 'staff';
}

export interface WorkflowDefinition {
  id: string;
  orgId: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  name: string;
  description: string | null;
  stages: Stage[];
  settings: {
    allowWithdraw: boolean;
    allowReentry: boolean;
    autoAdvanceOnDeadline: boolean;
    notifyOnStageChange: boolean;
  };
}

/** Everything the engine needs to know about one participant, and no more. */
export interface ParticipantSnapshot {
  registrationId: string;
  currentStageKey: StageKey;
  status: RegistrationStatus;
  /** null when unscored — never 0. SPEC_SCORING §8. */
  score: number | null;
  reviewsDone: number;
  /** Epoch millis, or null when nothing was submitted at this stage. */
  submittedAt: number | null;
  highestSingleCriterion: number | null;
}

export type AdvancementOutcome = 'advance' | 'eliminate' | 'hold';

export interface AdvancementDecision {
  registrationId: string;
  outcome: AdvancementOutcome;
  /** Why, in words an organiser could paste into an appeal response. */
  reason: string;
}

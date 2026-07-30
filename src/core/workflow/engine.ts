/**
 * The workflow engine. PURE — SPEC_WORKFLOW_ENGINE §4.
 *
 * **No Firebase, no `Date.now()`, no `Math.random()`.** The clock and the
 * random seed are injected, which is what makes advancement *reproducible*:
 * an organiser who reruns a decision gets the same answer, and an appeal can be
 * re-adjudicated from the same inputs months later. A competition that cannot
 * explain why someone was eliminated is a competition nobody trusts twice.
 *
 * Every decision carries a `reason` for the same purpose.
 */
import type {
  AdvancementDecision, ParticipantSnapshot, Stage, Tiebreaker, WorkflowDefinition,
} from './types';

/**
 * A deterministic 32-bit hash, used for the `random` tiebreaker.
 *
 * Seeded by `${seed}:${registrationId}` so the ordering is stable for a given
 * seed and genuinely arbitrary across seeds. `Math.random()` would make the
 * same input produce different winners on each run, which is indefensible.
 */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Orders a cohort best-first for cut-based rules.
 *
 * Unscored participants always sort last regardless of tiebreaker: a `null`
 * score is an absence, and letting it compete for a top-N place would reward
 * not being reviewed.
 */
function orderForCut(
  cohort: ParticipantSnapshot[],
  tiebreaker: Tiebreaker,
  seed: string,
): ParticipantSnapshot[] {
  return [...cohort].sort((a, b) => {
    if (a.score === null && b.score === null) return a.registrationId.localeCompare(b.registrationId);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    if (b.score !== a.score) return b.score - a.score;

    switch (tiebreaker) {
      case 'earliestSubmission': {
        // A missing timestamp cannot claim to be earliest.
        const at = a.submittedAt ?? Number.POSITIVE_INFINITY;
        const bt = b.submittedAt ?? Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;
        break;
      }
      case 'highestSingleCriterion': {
        const ac = a.highestSingleCriterion ?? -1;
        const bc = b.highestSingleCriterion ?? -1;
        if (ac !== bc) return bc - ac;
        break;
      }
      case 'judgeCount':
        if (a.reviewsDone !== b.reviewsDone) return b.reviewsDone - a.reviewsDone;
        break;
      case 'random': {
        const ah = hash(`${seed}:${a.registrationId}`);
        const bh = hash(`${seed}:${b.registrationId}`);
        if (ah !== bh) return ah - bh;
        break;
      }
    }
    // Final fallback so the sort is total, never implementation-defined.
    return a.registrationId.localeCompare(b.registrationId);
  });
}

export interface EvaluateInput {
  stage: Stage;
  /** Everyone currently in this stage. */
  cohort: ParticipantSnapshot[];
  /** Injected clock, epoch millis. */
  now: number;
  /** Injected, for the `random` tiebreaker. */
  seed: string;
}

/**
 * Decides who advances out of a stage.
 *
 * Participants who are not `active` are always held: someone withdrawn or
 * disqualified is not a candidate, and silently advancing them would be a
 * correctness bug that only surfaces at the final results.
 */
export function evaluateAdvancement(input: EvaluateInput): AdvancementDecision[] {
  const { stage, cohort, now, seed } = input;
  const rule = stage.advanceRule;

  const inactive = cohort.filter((p) => p.status !== 'active');
  const active = cohort.filter((p) => p.status === 'active');

  const held: AdvancementDecision[] = inactive.map((p) => ({
    registrationId: p.registrationId,
    outcome: 'hold',
    reason: `Not active in this stage (status: ${p.status}).`,
  }));

  const closesAt = stage.window?.closesAt ?? null;
  const windowClosed = closesAt !== null && now >= closesAt;

  switch (rule.mode) {
    case 'manual':
      return [
        ...held,
        ...active.map((p) => ({
          registrationId: p.registrationId,
          outcome: 'hold' as const,
          reason: 'This stage advances participants manually.',
        })),
      ];

    case 'all':
      return [
        ...held,
        ...active.map((p) => ({
          registrationId: p.registrationId,
          outcome: 'advance' as const,
          reason: 'Everyone in this stage advances.',
        })),
      ];

    case 'submissionComplete':
      return [
        ...held,
        ...active.map((p) => ({
          registrationId: p.registrationId,
          outcome: p.submittedAt !== null ? ('advance' as const) : ('hold' as const),
          reason: p.submittedAt !== null
            ? 'A submission was received.'
            : 'Waiting for a submission.',
        })),
      ];

    case 'deadline':
      // Before the deadline nobody is eliminated — there is still time.
      return [
        ...held,
        ...active.map((p) => ({
          registrationId: p.registrationId,
          outcome: windowClosed ? ('advance' as const) : ('hold' as const),
          reason: windowClosed
            ? 'Still active when the stage closed.'
            : 'The stage is still open.',
        })),
      ];

    case 'threshold':
      return [
        ...held,
        ...active.map((p) => {
          if (p.score === null) {
            return {
              registrationId: p.registrationId,
              outcome: 'hold' as const,
              reason: 'Not scored yet — an unscored entry is never treated as a fail.',
            };
          }
          const passed = p.score >= rule.minScore;
          return {
            registrationId: p.registrationId,
            outcome: passed ? ('advance' as const) : ('eliminate' as const),
            reason: `Scored ${p.score}, and the stage requires at least ${rule.minScore}.`,
          };
        }),
      ];

    case 'quorum':
      return [
        ...held,
        ...active.map((p) => {
          if (p.reviewsDone < rule.minReviews) {
            return {
              registrationId: p.registrationId,
              outcome: 'hold' as const,
              reason: `Only ${p.reviewsDone} of ${rule.minReviews} required reviews are in.`,
            };
          }
          const passed = (p.score ?? 0) >= rule.minAvgScore;
          return {
            registrationId: p.registrationId,
            outcome: passed ? ('advance' as const) : ('eliminate' as const),
            reason: `Averaged ${p.score ?? 0} across ${p.reviewsDone} reviews, against a required ${rule.minAvgScore}.`,
          };
        }),
      ];

    case 'topN':
    case 'topPercent': {
      const cut = rule.mode === 'topN'
        ? rule.n
        : Math.max(1, Math.ceil((active.length * rule.percent) / 100));

      const ordered = orderForCut(active, rule.tiebreaker, seed);

      // A cut cannot be made honestly while anyone is unscored: the ordering
      // would depend on reviews that have not happened, and eliminating on it
      // punishes people for a judge's backlog.
      if (ordered.some((p) => p.score === null)) {
        return [
          ...held,
          ...active.map((p) => ({
            registrationId: p.registrationId,
            outcome: 'hold' as const,
            reason: 'Some entries in this stage are still unscored, so a cut would not be fair yet.',
          })),
        ];
      }

      // Everyone tied with the last qualifier advances. Splitting a genuine tie
      // by list position would be arbitrary in a way nobody could defend.
      const boundary = ordered[cut - 1]?.score ?? null;

      return [
        ...held,
        ...ordered.map((p, index) => {
          const within = index < cut;
          const tiedWithBoundary = boundary !== null && p.score === boundary;
          const advance = within || tiedWithBoundary;
          return {
            registrationId: p.registrationId,
            outcome: advance ? ('advance' as const) : ('eliminate' as const),
            reason: advance
              ? (within
                  ? `Placed ${index + 1} of ${ordered.length}, within the top ${cut}.`
                  : `Tied on ${p.score} with the last qualifying place.`)
              : `Placed ${index + 1} of ${ordered.length}, outside the top ${cut}.`,
          };
        }),
      ];
    }

    default:
      return [...held];
  }
}

/* ================================================================== *
 * Definition-level helpers                                            *
 * ================================================================== */

export function stageByKey(definition: WorkflowDefinition, key: string): Stage | undefined {
  return definition.stages.find((s) => s.key === key);
}

/** The stage after `key`, or null when `key` is terminal. */
export function nextStage(definition: WorkflowDefinition, key: string): Stage | null {
  const ordered = [...definition.stages].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((s) => s.key === key);
  if (index === -1 || index === ordered.length - 1) return null;
  return ordered[index + 1];
}

export function isTerminal(definition: WorkflowDefinition, key: string): boolean {
  return nextStage(definition, key) === null;
}

export type WorkflowProblem =
  | 'noStages'
  | 'duplicateKey'
  | 'duplicateOrder'
  | 'noRegistrationStage'
  | 'registrationNotFirst'
  | 'terminalIsRepeating'
  | 'impossibleCut'
  | 'windowInverted';

export interface WorkflowIssue {
  code: WorkflowProblem;
  stageKey: string | null;
  message: string;
}

/**
 * Integrity check, the workflow analogue of `core/forms/validateSchema`.
 *
 * A workflow is published once and then moves real people through it, so the
 * cheapest possible moment to catch "this cut can never be satisfied" is before
 * anybody has entered.
 */
export function validateWorkflow(definition: WorkflowDefinition): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const stages = [...definition.stages].sort((a, b) => a.order - b.order);

  if (stages.length === 0) {
    return [{ code: 'noStages', stageKey: null, message: 'A workflow needs at least one stage.' }];
  }

  const keys = new Set<string>();
  const orders = new Set<number>();

  for (const stage of stages) {
    if (keys.has(stage.key)) {
      issues.push({
        code: 'duplicateKey', stageKey: stage.key,
        message: `Two stages share the key "${stage.key}". Registrations point at a stage by key, so the second would be unreachable.`,
      });
    }
    keys.add(stage.key);

    if (orders.has(stage.order)) {
      issues.push({
        code: 'duplicateOrder', stageKey: stage.key,
        message: `Two stages share order ${stage.order}, so their sequence is undefined.`,
      });
    }
    orders.add(stage.order);

    if (stage.window && stage.window.opensAt !== null && stage.window.closesAt !== null
        && stage.window.opensAt > stage.window.closesAt) {
      issues.push({
        code: 'windowInverted', stageKey: stage.key,
        message: `"${stage.name}" closes before it opens.`,
      });
    }

    const rule = stage.advanceRule;
    if (rule.mode === 'topN' && rule.n < 1) {
      issues.push({
        code: 'impossibleCut', stageKey: stage.key,
        message: `"${stage.name}" advances the top ${rule.n}, which nobody can satisfy.`,
      });
    }
    if (rule.mode === 'topPercent' && (rule.percent <= 0 || rule.percent > 100)) {
      issues.push({
        code: 'impossibleCut', stageKey: stage.key,
        message: `"${stage.name}" advances ${rule.percent}% of entrants, which is not a usable proportion.`,
      });
    }
  }

  const registration = stages.filter((s) => s.type === 'registration');
  if (registration.length === 0) {
    issues.push({
      code: 'noRegistrationStage', stageKey: null,
      message: 'A workflow needs a registration stage — it is where participants enter.',
    });
  } else if (stages[0].type !== 'registration') {
    issues.push({
      code: 'registrationNotFirst', stageKey: registration[0].key,
      message: 'Registration must be the first stage; nothing can precede entering.',
    });
  }

  return issues;
}

export const canPublishWorkflow = (definition: WorkflowDefinition): boolean =>
  validateWorkflow(definition).length === 0;

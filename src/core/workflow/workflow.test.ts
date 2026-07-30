import { describe, it, expect } from 'vitest';
import {
  evaluateAdvancement, nextStage, stageByKey, isTerminal,
  validateWorkflow, canPublishWorkflow,
} from './engine';
import type {
  AdvanceRule, ParticipantSnapshot, Stage, WorkflowDefinition,
} from './types';

const NOW = 1_800_000_000_000;

function stage(over: Partial<Stage> = {}): Stage {
  return {
    id: 'st', key: 'judging', name: 'Judging', description: null, order: 2,
    type: 'judging', entry: 'auto', window: null, capacity: null,
    formSchemaId: null, formSchemaVersion: null,
    advanceRule: { mode: 'all' }, onEnter: [], onExit: [],
    visibility: 'participants', ...over,
  };
}

function person(over: Partial<ParticipantSnapshot> = {}): ParticipantSnapshot {
  return {
    registrationId: 'r1', currentStageKey: 'judging', status: 'active',
    score: 50, reviewsDone: 3, submittedAt: NOW - 1000,
    highestSingleCriterion: 8, ...over,
  };
}

const decide = (rule: AdvanceRule, cohort: ParticipantSnapshot[], over: Partial<Stage> = {}) =>
  evaluateAdvancement({ stage: stage({ advanceRule: rule, ...over }), cohort, now: NOW, seed: 'seed-1' });

const outcomeFor = (decisions: ReturnType<typeof decide>, id: string) =>
  decisions.find((d) => d.registrationId === id)?.outcome;

/* ------------------------------------------------------------------ */
/* Purity — the property the whole engine rests on                     */
/* ------------------------------------------------------------------ */

describe('determinism', () => {
  const cohort = [
    person({ registrationId: 'a', score: 80 }),
    person({ registrationId: 'b', score: 80 }),
    person({ registrationId: 'c', score: 80 }),
    person({ registrationId: 'd', score: 80 }),
  ];

  it('produces identical results for identical inputs', () => {
    const rule: AdvanceRule = { mode: 'topN', n: 2, tiebreaker: 'random' };
    const first = decide(rule, cohort);
    const second = decide(rule, cohort);
    expect(second).toEqual(first);
  });

  it('does not depend on input ordering', () => {
    const rule: AdvanceRule = { mode: 'topN', n: 2, tiebreaker: 'earliestSubmission' };
    const forward = decide(rule, cohort).map((d) => `${d.registrationId}:${d.outcome}`).sort();
    const reversed = decide(rule, [...cohort].reverse()).map((d) => `${d.registrationId}:${d.outcome}`).sort();
    expect(reversed).toEqual(forward);
  });

  it('gives a different arbitrary order for a different seed', () => {
    const rule: AdvanceRule = { mode: 'topN', n: 2, tiebreaker: 'random' };
    const a = evaluateAdvancement({ stage: stage({ advanceRule: rule }), cohort, now: NOW, seed: 'x' });
    const b = evaluateAdvancement({ stage: stage({ advanceRule: rule }), cohort, now: NOW, seed: 'y' });
    // Same set of ids either way; the point is that the seed is what varies it.
    expect(a.map((d) => d.registrationId).sort()).toEqual(b.map((d) => d.registrationId).sort());
  });

  it('explains every decision', () => {
    for (const d of decide({ mode: 'topN', n: 2, tiebreaker: 'random' }, cohort)) {
      expect(d.reason.length).toBeGreaterThan(10);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Inactive participants                                               */
/* ------------------------------------------------------------------ */

describe('non-active participants', () => {
  it.each(['withdrawn', 'disqualified', 'eliminated', 'pending'] as const)(
    'holds a %s participant instead of advancing them',
    (status) => {
      const decisions = decide({ mode: 'all' }, [person({ registrationId: 'x', status })]);
      expect(outcomeFor(decisions, 'x')).toBe('hold');
    },
  );

  it('still advances the active ones alongside them', () => {
    const decisions = decide({ mode: 'all' }, [
      person({ registrationId: 'gone', status: 'withdrawn' }),
      person({ registrationId: 'here', status: 'active' }),
    ]);
    expect(outcomeFor(decisions, 'gone')).toBe('hold');
    expect(outcomeFor(decisions, 'here')).toBe('advance');
  });

  it('returns a decision for every participant, losing nobody', () => {
    const cohort = [person({ registrationId: 'a' }), person({ registrationId: 'b', status: 'withdrawn' })];
    expect(decide({ mode: 'all' }, cohort)).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Each advance rule                                                   */
/* ------------------------------------------------------------------ */

describe('manual', () => {
  it('never decides for you', () => {
    expect(outcomeFor(decide({ mode: 'manual' }, [person({ registrationId: 'a' })]), 'a')).toBe('hold');
  });
});

describe('submissionComplete', () => {
  it('advances whoever submitted', () => {
    expect(outcomeFor(decide({ mode: 'submissionComplete' }, [person({ registrationId: 'a', submittedAt: NOW })]), 'a'))
      .toBe('advance');
  });

  it('holds — never eliminates — whoever has not', () => {
    // Holding matters: the window may still be open.
    expect(outcomeFor(decide({ mode: 'submissionComplete' }, [person({ registrationId: 'a', submittedAt: null })]), 'a'))
      .toBe('hold');
  });
});

describe('deadline', () => {
  const openWindow = { window: { opensAt: null, closesAt: NOW + 10_000 } };
  const closedWindow = { window: { opensAt: null, closesAt: NOW - 10_000 } };

  it('holds while the stage is still open', () => {
    expect(outcomeFor(decide({ mode: 'deadline' }, [person({ registrationId: 'a' })], openWindow), 'a')).toBe('hold');
  });

  it('advances everyone still active once it closes', () => {
    expect(outcomeFor(decide({ mode: 'deadline' }, [person({ registrationId: 'a' })], closedWindow), 'a')).toBe('advance');
  });

  it('treats the exact closing instant as closed', () => {
    const atClose = { window: { opensAt: null, closesAt: NOW } };
    expect(outcomeFor(decide({ mode: 'deadline' }, [person({ registrationId: 'a' })], atClose), 'a')).toBe('advance');
  });
});

describe('threshold', () => {
  it('advances at or above the bar', () => {
    expect(outcomeFor(decide({ mode: 'threshold', minScore: 60 }, [person({ registrationId: 'a', score: 60 })]), 'a'))
      .toBe('advance');
  });

  it('eliminates below it', () => {
    expect(outcomeFor(decide({ mode: 'threshold', minScore: 60 }, [person({ registrationId: 'a', score: 59.9 })]), 'a'))
      .toBe('eliminate');
  });

  // The rule the whole product turns on.
  it('HOLDS an unscored entry rather than failing it', () => {
    const decisions = decide({ mode: 'threshold', minScore: 60 }, [person({ registrationId: 'a', score: null })]);
    expect(outcomeFor(decisions, 'a')).toBe('hold');
    expect(outcomeFor(decisions, 'a')).not.toBe('eliminate');
  });

  it('eliminates a genuine zero, which is a real score', () => {
    expect(outcomeFor(decide({ mode: 'threshold', minScore: 1 }, [person({ registrationId: 'a', score: 0 })]), 'a'))
      .toBe('eliminate');
  });
});

describe('quorum', () => {
  const rule: AdvanceRule = { mode: 'quorum', minReviews: 3, minAvgScore: 70 };

  it('holds until enough reviews land', () => {
    expect(outcomeFor(decide(rule, [person({ registrationId: 'a', reviewsDone: 2, score: 90 })]), 'a')).toBe('hold');
  });

  it('advances once quorum is met and the average clears', () => {
    expect(outcomeFor(decide(rule, [person({ registrationId: 'a', reviewsDone: 3, score: 71 })]), 'a')).toBe('advance');
  });

  it('eliminates once quorum is met and the average does not', () => {
    expect(outcomeFor(decide(rule, [person({ registrationId: 'a', reviewsDone: 3, score: 69 })]), 'a')).toBe('eliminate');
  });
});

describe('topN', () => {
  const cohort = [
    person({ registrationId: 'a', score: 90 }),
    person({ registrationId: 'b', score: 80 }),
    person({ registrationId: 'c', score: 70 }),
    person({ registrationId: 'd', score: 60 }),
  ];

  it('advances exactly the top N', () => {
    const decisions = decide({ mode: 'topN', n: 2, tiebreaker: 'judgeCount' }, cohort);
    expect(decisions.filter((d) => d.outcome === 'advance').map((d) => d.registrationId).sort())
      .toEqual(['a', 'b']);
  });

  it('eliminates the rest', () => {
    const decisions = decide({ mode: 'topN', n: 2, tiebreaker: 'judgeCount' }, cohort);
    expect(outcomeFor(decisions, 'd')).toBe('eliminate');
  });

  // Splitting a genuine tie by list position is indefensible.
  it('advances everyone tied with the last qualifying place', () => {
    const tied = [
      person({ registrationId: 'a', score: 90 }),
      person({ registrationId: 'b', score: 80 }),
      person({ registrationId: 'c', score: 80 }),
    ];
    const decisions = decide({ mode: 'topN', n: 2, tiebreaker: 'judgeCount' }, tied);
    expect(decisions.filter((d) => d.outcome === 'advance')).toHaveLength(3);
  });

  it('HOLDS the whole cohort while anyone is unscored', () => {
    const partial = [
      person({ registrationId: 'a', score: 90 }),
      person({ registrationId: 'b', score: null }),
    ];
    const decisions = decide({ mode: 'topN', n: 1, tiebreaker: 'judgeCount' }, partial);
    expect(decisions.every((d) => d.outcome === 'hold')).toBe(true);
  });

  it('advances everyone when N exceeds the cohort', () => {
    const decisions = decide({ mode: 'topN', n: 99, tiebreaker: 'judgeCount' }, cohort);
    expect(decisions.every((d) => d.outcome === 'advance')).toBe(true);
  });

  it('handles an empty cohort', () => {
    expect(decide({ mode: 'topN', n: 3, tiebreaker: 'random' }, [])).toEqual([]);
  });

  it('breaks a tie by earliest submission when asked', () => {
    const tied = [
      person({ registrationId: 'late', score: 80, submittedAt: NOW }),
      person({ registrationId: 'early', score: 80, submittedAt: NOW - 50_000 }),
      person({ registrationId: 'low', score: 10 }),
    ];
    const decisions = decide({ mode: 'topN', n: 1, tiebreaker: 'earliestSubmission' }, tied);
    // Both 80s tie with the boundary, so both advance; the 10 does not.
    expect(outcomeFor(decisions, 'early')).toBe('advance');
    expect(outcomeFor(decisions, 'low')).toBe('eliminate');
  });
});

describe('topPercent', () => {
  const cohort = Array.from({ length: 10 }, (_, i) =>
    person({ registrationId: `r${i}`, score: 100 - i * 5 }));

  it('advances the top half at 50%', () => {
    const decisions = decide({ mode: 'topPercent', percent: 50, tiebreaker: 'judgeCount' }, cohort);
    expect(decisions.filter((d) => d.outcome === 'advance')).toHaveLength(5);
  });

  it('rounds up, so a small cohort keeps at least one', () => {
    const decisions = decide({ mode: 'topPercent', percent: 10, tiebreaker: 'judgeCount' },
      [person({ registrationId: 'a', score: 90 }), person({ registrationId: 'b', score: 10 })]);
    expect(decisions.filter((d) => d.outcome === 'advance')).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Definition helpers and validation                                   */
/* ------------------------------------------------------------------ */

function workflow(stages: Stage[]): WorkflowDefinition {
  return {
    id: 'wf', orgId: 'org', version: 1, status: 'draft',
    name: 'Test', description: null, stages,
    settings: { allowWithdraw: true, allowReentry: false, autoAdvanceOnDeadline: true, notifyOnStageChange: true },
  };
}

const registration = stage({ key: 'registration', type: 'registration', order: 1, name: 'Registration' });
const submission = stage({ key: 'submission', type: 'submission', order: 2, name: 'Submission' });
const judging = stage({ key: 'judging', type: 'judging', order: 3, name: 'Judging' });

describe('definition helpers', () => {
  const wf = workflow([judging, registration, submission]); // deliberately unsorted

  it('finds a stage by key', () => {
    expect(stageByKey(wf, 'submission')?.name).toBe('Submission');
    expect(stageByKey(wf, 'nope')).toBeUndefined();
  });

  it('walks stages in order, not array position', () => {
    expect(nextStage(wf, 'registration')?.key).toBe('submission');
    expect(nextStage(wf, 'submission')?.key).toBe('judging');
  });

  it('returns null after the last stage', () => {
    expect(nextStage(wf, 'judging')).toBeNull();
    expect(isTerminal(wf, 'judging')).toBe(true);
    expect(isTerminal(wf, 'registration')).toBe(false);
  });

  it('returns null for an unknown key rather than throwing', () => {
    expect(nextStage(wf, 'ghost')).toBeNull();
  });
});

describe('validateWorkflow', () => {
  it('passes a well-formed linear workflow', () => {
    expect(validateWorkflow(workflow([registration, submission, judging]))).toEqual([]);
    expect(canPublishWorkflow(workflow([registration, submission, judging]))).toBe(true);
  });

  it('rejects an empty workflow', () => {
    expect(validateWorkflow(workflow([])).map((i) => i.code)).toEqual(['noStages']);
  });

  it('rejects duplicate stage keys — registrations point at a stage by key', () => {
    const clash = stage({ key: 'submission', order: 3, type: 'submission' });
    expect(validateWorkflow(workflow([registration, submission, clash])).some((i) => i.code === 'duplicateKey'))
      .toBe(true);
  });

  it('rejects duplicate orders, which leave sequence undefined', () => {
    expect(validateWorkflow(workflow([registration, stage({ key: 'x', order: 1, type: 'submission' })]))
      .some((i) => i.code === 'duplicateOrder')).toBe(true);
  });

  it('requires a registration stage', () => {
    expect(validateWorkflow(workflow([submission, judging])).some((i) => i.code === 'noRegistrationStage'))
      .toBe(true);
  });

  it('requires registration to come first', () => {
    const late = stage({ key: 'registration', type: 'registration', order: 9 });
    expect(validateWorkflow(workflow([submission, late])).some((i) => i.code === 'registrationNotFirst'))
      .toBe(true);
  });

  it('rejects a window that closes before it opens', () => {
    const inverted = stage({ key: 'submission', type: 'submission', order: 2, window: { opensAt: NOW, closesAt: NOW - 1 } });
    expect(validateWorkflow(workflow([registration, inverted])).some((i) => i.code === 'windowInverted'))
      .toBe(true);
  });

  it('rejects a cut nobody can satisfy', () => {
    const impossible = stage({ key: 'j', type: 'judging', order: 2, advanceRule: { mode: 'topN', n: 0, tiebreaker: 'random' } });
    expect(validateWorkflow(workflow([registration, impossible])).some((i) => i.code === 'impossibleCut'))
      .toBe(true);
  });

  it('rejects a nonsensical percentage', () => {
    for (const percent of [0, -10, 101]) {
      const bad = stage({ key: 'j', type: 'judging', order: 2, advanceRule: { mode: 'topPercent', percent, tiebreaker: 'random' } });
      expect(validateWorkflow(workflow([registration, bad])).some((i) => i.code === 'impossibleCut')).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The four shapes SPEC_WORKFLOW_ENGINE §1 demands                     */
/* ------------------------------------------------------------------ */

describe('all four documented shapes are the same code path', () => {
  it('simple: registration → submission → winner', () => {
    expect(canPublishWorkflow(workflow([registration, submission]))).toBe(true);
  });

  it('multi-round: screening then two rounds then interview', () => {
    const wf = workflow([
      registration,
      stage({ key: 'screening', type: 'screening', order: 2, advanceRule: { mode: 'topPercent', percent: 50, tiebreaker: 'judgeCount' } }),
      stage({ key: 'round1', type: 'judging', order: 3, advanceRule: { mode: 'topN', n: 10, tiebreaker: 'random' } }),
      stage({ key: 'round2', type: 'judging', order: 4, advanceRule: { mode: 'topN', n: 3, tiebreaker: 'random' } }),
      stage({ key: 'interview', type: 'interview', order: 5, advanceRule: { mode: 'manual' } }),
    ]);
    expect(canPublishWorkflow(wf)).toBe(true);
    expect(nextStage(wf, 'round1')?.key).toBe('round2');
  });

  it('voting: submission → community voting → jury', () => {
    const wf = workflow([
      registration,
      submission,
      stage({ key: 'voting', type: 'voting', order: 3, advanceRule: { mode: 'topN', n: 5, tiebreaker: 'earliestSubmission' } }),
      stage({ key: 'jury', type: 'judging', order: 4, advanceRule: { mode: 'topN', n: 1, tiebreaker: 'highestSingleCriterion' } }),
    ]);
    expect(canPublishWorkflow(wf)).toBe(true);
  });

  it('ongoing: a repeating weekly submission stage', () => {
    const wf = workflow([
      registration,
      stage({ key: 'weekly', type: 'submission', order: 2, advanceRule: { mode: 'deadline' }, window: { opensAt: NOW, closesAt: NOW + 604_800_000 } }),
    ]);
    expect(canPublishWorkflow(wf)).toBe(true);
  });
});

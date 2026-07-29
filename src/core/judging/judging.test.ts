import { describe, it, expect } from 'vitest';
import {
  weightedTotal, aggregateSubmission, rankCohort, paginate, awardFor,
  type CriterionWeight, type ReviewInput,
} from './aggregate';

const CRITERIA: CriterionWeight[] = [
  { id: 'craft', weight: 50, max: 10 },
  { id: 'story', weight: 30, max: 10 },
  { id: 'impact', weight: 20, max: 5 },
];

const review = (judgeId: string, scores: Record<string, number>, recused = false): ReviewInput => ({
  submissionId: 's1',
  judgeId,
  recused,
  criteriaScores: Object.entries(scores).map(([criterionId, score]) => ({ criterionId, score })),
});

describe('weightedTotal', () => {
  it('gives 100 for a perfect review', () => {
    expect(weightedTotal(review('j1', { craft: 10, story: 10, impact: 5 }), CRITERIA)).toBe(100);
  });

  it('gives 0 for an all-zero review — an explicit zero is a real score', () => {
    expect(weightedTotal(review('j1', { craft: 0, story: 0, impact: 0 }), CRITERIA)).toBe(0);
  });

  it('weights criteria by their percentage, not equally', () => {
    // Full marks on the 50% criterion only.
    expect(weightedTotal(review('j1', { craft: 10, story: 0, impact: 0 }), CRITERIA)).toBe(50);
  });

  it('respects each criterion’s own max', () => {
    // impact is out of 5, so 5 is full marks on a 20% criterion.
    expect(weightedTotal(review('j1', { craft: 0, story: 0, impact: 5 }), CRITERIA)).toBe(20);
  });

  it('scales a partial review rather than deflating it', () => {
    // Only `craft` scored, and full marks. The judge's omission must not drag
    // the entrant down — the result is 100% of what was actually assessed.
    expect(weightedTotal(review('j1', { craft: 10 }), CRITERIA)).toBe(100);
  });

  it('ignores a score for a criterion that no longer exists', () => {
    expect(weightedTotal(review('j1', { craft: 10, deleted: 999 }), CRITERIA)).toBe(100);
  });

  it('clamps a score above the criterion max', () => {
    expect(weightedTotal(review('j1', { craft: 9999 }), CRITERIA)).toBe(100);
  });

  it('clamps a negative score to zero', () => {
    expect(weightedTotal(review('j1', { craft: -50 }), CRITERIA)).toBe(0);
  });

  it('returns null when nothing scorable was scored', () => {
    expect(weightedTotal(review('j1', {}), CRITERIA)).toBeNull();
    expect(weightedTotal(review('j1', { unknown: 5 }), CRITERIA)).toBeNull();
  });

  it('returns null rather than dividing by zero on a zero-max criterion', () => {
    expect(weightedTotal(review('j1', { broken: 5 }), [{ id: 'broken', weight: 100, max: 0 }])).toBeNull();
  });
});

describe('aggregateSubmission — a missing review is never a zero', () => {
  it('reports null, not 0, when no review exists', () => {
    const result = aggregateSubmission('s1', [], CRITERIA, { reviewsRequired: 3 });
    expect(result.score).toBeNull();
    expect(result.score).not.toBe(0);
    expect(result.reviewsDone).toBe(0);
    expect(result.isProvisional).toBe(true);
  });

  it('averages only submitted reviews, not the required count', () => {
    // 100 and 50 from two judges, with three required. The answer is 75 — the
    // average of what landed — not 50 (averaging in a phantom zero).
    const result = aggregateSubmission('s1', [
      review('j1', { craft: 10, story: 10, impact: 5 }),
      review('j2', { craft: 5, story: 5, impact: 2.5 }),
    ], CRITERIA, { reviewsRequired: 3 });
    expect(result.score).toBe(75);
    expect(result.reviewsDone).toBe(2);
    expect(result.isProvisional).toBe(true);
  });

  it('is final once the required number of reviews land', () => {
    const result = aggregateSubmission('s1', [
      review('j1', { craft: 10, story: 10, impact: 5 }),
      review('j2', { craft: 10, story: 10, impact: 5 }),
    ], CRITERIA, { reviewsRequired: 2 });
    expect(result.isProvisional).toBe(false);
    expect(result.score).toBe(100);
  });

  it('excludes a recused judge entirely', () => {
    const result = aggregateSubmission('s1', [
      review('j1', { craft: 10, story: 10, impact: 5 }),
      review('j2', { craft: 0, story: 0, impact: 0 }, true),
    ], CRITERIA, { reviewsRequired: 1 });
    expect(result.score).toBe(100);
    expect(result.reviewsDone).toBe(1);
  });

  it('ignores reviews belonging to another submission', () => {
    const other: ReviewInput = { ...review('j9', { craft: 0 }), submissionId: 's2' };
    const result = aggregateSubmission('s1', [review('j1', { craft: 10 }), other], CRITERIA, { reviewsRequired: 1 });
    expect(result.score).toBe(100);
    expect(result.reviewsDone).toBe(1);
  });

  it('reports variance so judge disagreement is visible', () => {
    const result = aggregateSubmission('s1', [
      review('j1', { craft: 10, story: 10, impact: 5 }),
      review('j2', { craft: 0, story: 0, impact: 0 }),
    ], CRITERIA, { reviewsRequired: 2 });
    expect(result.variance).toBe(100);
  });

  it('reports zero variance when judges agree', () => {
    const result = aggregateSubmission('s1', [
      review('j1', { craft: 8, story: 8, impact: 4 }),
      review('j2', { craft: 8, story: 8, impact: 4 }),
    ], CRITERIA, { reviewsRequired: 2 });
    expect(result.variance).toBe(0);
  });

  it('supports median, which one hostile judge cannot swing', () => {
    const result = aggregateSubmission('s1', [
      review('j1', { craft: 10, story: 10, impact: 5 }),
      review('j2', { craft: 9, story: 9, impact: 4.5 }),
      review('j3', { craft: 0, story: 0, impact: 0 }),
    ], CRITERIA, { reviewsRequired: 3, strategy: 'median' });
    expect(result.score).toBe(90);
  });

  it('supports a trimmed mean, dropping the extremes', () => {
    const result = aggregateSubmission('s1', [
      review('j1', { craft: 10, story: 10, impact: 5 }),
      review('j2', { craft: 8, story: 8, impact: 4 }),
      review('j3', { craft: 0, story: 0, impact: 0 }),
    ], CRITERIA, { reviewsRequired: 3, strategy: 'trimmedMean' });
    expect(result.score).toBe(80);
  });

  it('does not trim away everything when only two reviews exist', () => {
    const result = aggregateSubmission('s1', [
      review('j1', { craft: 10 }),
      review('j2', { craft: 0 }),
    ], CRITERIA, { reviewsRequired: 2, strategy: 'trimmedMean' });
    expect(result.score).toBe(50);
  });
});

describe('rankCohort', () => {
  const agg = (id: string, score: number | null, reviewsDone = 2) => ({
    submissionId: id, score, reviewsDone, reviewsTotal: 2, isProvisional: false, variance: 0,
  });

  it('ranks highest first', () => {
    const ranked = rankCohort([agg('a', 70), agg('b', 90), agg('c', 80)]);
    expect(ranked.map((r) => r.submissionId)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('gives tied entrants the same rank and skips the next — 1, 2, 2, 4', () => {
    const ranked = rankCohort([agg('a', 90), agg('b', 80), agg('c', 80), agg('d', 70)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('sorts unscored submissions last but still ranks them', () => {
    const ranked = rankCohort([agg('a', null), agg('b', 50)]);
    expect(ranked[0].submissionId).toBe('b');
    expect(ranked[1].submissionId).toBe('a');
    expect(ranked[1].rank).toBe(2);
    expect(ranked).toHaveLength(2);
  });

  it('breaks a tie by review count, which is explainable', () => {
    const ranked = rankCohort([agg('fewer', 80, 1), agg('more', 80, 3)]);
    expect(ranked[0].submissionId).toBe('more');
  });

  it('is deterministic for identical inputs', () => {
    const input = [agg('a', 80, 2), agg('b', 80, 2)];
    expect(rankCohort(input).map((r) => r.submissionId))
      .toEqual(rankCohort(input).map((r) => r.submissionId));
  });

  it('handles an empty cohort', () => {
    expect(rankCohort([])).toEqual([]);
  });

  it('ranks everyone when nobody has been scored', () => {
    const ranked = rankCohort([agg('a', null), agg('b', null)]);
    expect(ranked).toHaveLength(2);
    expect(ranked.every((r) => r.rank > 0)).toBe(true);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 120 }, (_, i) => i);

  it('pages at 50 by default, per the 1 MiB document cap', () => {
    const pages = paginate(rows);
    expect(pages.map((p) => p.length)).toEqual([50, 50, 20]);
  });

  it('loses nothing', () => {
    expect(paginate(rows).flat()).toEqual(rows);
  });

  it('returns one empty page for an empty cohort, so page_0 always exists', () => {
    expect(paginate([])).toEqual([[]]);
  });
});

describe('awardFor', () => {
  it('names the podium', () => {
    expect(awardFor(1)).toBe('Winner');
    expect(awardFor(2)).toBe('Runner-up');
    expect(awardFor(3)).toBe('Third place');
  });

  it('returns null below third, rather than inventing a certificate', () => {
    expect(awardFor(4)).toBeNull();
    expect(awardFor(50)).toBeNull();
  });
});

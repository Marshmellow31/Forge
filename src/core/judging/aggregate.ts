/**
 * Score aggregation and ranking. PURE — no React, no Firebase, no clock.
 * SPEC_SCORING §3–4.
 *
 * This is the engine that decides who won, so its two hardest rules are about
 * refusing to answer rather than answering:
 *
 *   • **A missing review is never a zero.** Averaging over judges who have not
 *     reviewed yet silently punishes whoever drew a slow judge. Aggregation is
 *     over *submitted* reviews only, and the result carries how many landed.
 *   • **A score below the review threshold is provisional, not final.** The
 *     type makes that explicit so a caller cannot render a half-judged number
 *     as a verdict by accident.
 */

export interface CriterionWeight {
  id: string;
  /** Percentage of the final mark. The set should total 100. */
  weight: number;
  /** Top of this criterion's raw scale. */
  max: number;
}

export interface ReviewInput {
  submissionId: string;
  judgeId: string;
  criteriaScores: Array<{ criterionId: string; score: number }>;
  /** A recused judge is excluded entirely — not counted as a review. */
  recused?: boolean;
}

export interface Aggregate {
  submissionId: string;
  /** 0–100, weighted. `null` when no usable review exists — never 0. */
  score: number | null;
  reviewsDone: number;
  reviewsTotal: number;
  isProvisional: boolean;
  /** Spread between the highest and lowest judge, 0–100. Flags disagreement. */
  variance: number;
}

/**
 * One judge's review → a 0–100 weighted total.
 *
 * Each criterion contributes `(score / max) * weight`. A criterion the judge did
 * not score is skipped and its weight removed from the denominator, so a
 * partially completed review is scaled rather than deflated — otherwise a judge
 * who skipped one box would drag the entrant down for the judge's omission.
 */
export function weightedTotal(
  review: ReviewInput,
  criteria: CriterionWeight[],
): number | null {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  let earned = 0;
  let available = 0;

  for (const entry of review.criteriaScores) {
    const criterion = byId.get(entry.criterionId);
    // A score for a criterion that no longer exists is ignored rather than
    // counted: rubrics change, and a deleted criterion must not skew a total.
    if (!criterion || criterion.max <= 0) continue;
    const clamped = Math.max(0, Math.min(entry.score, criterion.max));
    earned += (clamped / criterion.max) * criterion.weight;
    available += criterion.weight;
  }

  if (available === 0) return null;
  return (earned / available) * 100;
}

/**
 * Aggregates every review for one submission.
 *
 * `strategy` is data, not a branch in a caller: SPEC_SCORING lists more
 * strategies (trimmed mean, median) and adding one belongs here.
 */
export function aggregateSubmission(
  submissionId: string,
  reviews: ReviewInput[],
  criteria: CriterionWeight[],
  options: { reviewsRequired: number; strategy?: 'average' | 'median' | 'trimmedMean' } = { reviewsRequired: 1 },
): Aggregate {
  const usable = reviews
    .filter((r) => r.submissionId === submissionId && !r.recused)
    .map((r) => weightedTotal(r, criteria))
    .filter((n): n is number => n !== null);

  const reviewsTotal = Math.max(options.reviewsRequired, usable.length);

  if (usable.length === 0) {
    // No review is not a zero. It is an absence, and it must read as one.
    return {
      submissionId, score: null, reviewsDone: 0,
      reviewsTotal, isProvisional: true, variance: 0,
    };
  }

  const sorted = [...usable].sort((a, b) => a - b);
  let score: number;

  switch (options.strategy ?? 'average') {
    case 'median':
      score = sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      break;
    case 'trimmedMean': {
      // Drop the highest and lowest, but only when doing so leaves something.
      const trimmed = sorted.length >= 3 ? sorted.slice(1, -1) : sorted;
      score = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
      break;
    }
    default:
      score = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  }

  return {
    submissionId,
    score: Math.round(score * 10) / 10,
    reviewsDone: usable.length,
    reviewsTotal,
    isProvisional: usable.length < options.reviewsRequired,
    variance: Math.round((sorted[sorted.length - 1] - sorted[0]) * 10) / 10,
  };
}

export interface RankedEntry extends Aggregate {
  rank: number;
}

/**
 * Ranks a cohort, highest score first.
 *
 * **Ties share a rank and consume the positions below them** — 1, 2, 2, 4 —
 * which is standard competition ranking. Two genuinely tied entrants must not
 * be separated by an arbitrary tiebreak that neither could have influenced.
 *
 * Unscored submissions sort last and are given a rank, so every entrant appears
 * somewhere rather than silently vanishing from the board.
 */
export function rankCohort(aggregates: Aggregate[]): RankedEntry[] {
  const sorted = [...aggregates].sort((a, b) => {
    if (a.score === null && b.score === null) return a.submissionId.localeCompare(b.submissionId);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    if (b.score !== a.score) return b.score - a.score;
    // A stable, explainable tiebreak: more reviews means more confidence.
    if (b.reviewsDone !== a.reviewsDone) return b.reviewsDone - a.reviewsDone;
    return a.submissionId.localeCompare(b.submissionId);
  });

  const out: RankedEntry[] = [];
  let lastScore: number | null | undefined;
  let lastRank = 0;

  sorted.forEach((entry, index) => {
    const tied = lastScore !== undefined && entry.score === lastScore && entry.score !== null;
    const rank = tied ? lastRank : index + 1;
    out.push({ ...entry, rank });
    lastScore = entry.score;
    lastRank = rank;
  });

  return out;
}

/** Firestore caps a document at 1 MiB; leaderboards page at 50 rows. */
export function paginate<T>(rows: T[], perPage = 50): T[][] {
  if (rows.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return pages;
}

/**
 * The award label for a final position, as data.
 *
 * Returns null below the podium: inventing "4th place" certificates devalues
 * the ones that mean something, and an organiser who wants participation
 * certificates should say so explicitly rather than get them by default.
 */
export function awardFor(rank: number): string | null {
  if (rank === 1) return 'Winner';
  if (rank === 2) return 'Runner-up';
  if (rank === 3) return 'Third place';
  return null;
}

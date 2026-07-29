# SPEC_SCORING.md — Judging, Leaderboards, Rewards, Certificates

How a submission becomes a rank, and a rank becomes a reward.

Lives in `src/core/judging` (pure) + `src/modules/judging|leaderboards|rewards`.

---

## 1. Rubrics

```ts
interface JudgingConfig {
  id: string;
  orgId: string;
  name: string;
  strategyId: JudgingStrategyId;
  strategyConfig: Record<string, unknown>;

  rubric: {
    criteria: Criterion[];
    totalMaxScore: number;          // derived; stored for display
  };

  assignment: {
    mode: 'all' | 'roundRobin' | 'manual' | 'random';
    judgesPerSubmission: number;
    allowSelfAssign: boolean;
    preventConflict: boolean;        // judge cannot review own org/team
  };

  blind: {
    enabled: boolean;
    hideIdentity: boolean;           // name, email, photo
    hideFileNames: boolean;          // filenames leak identity
    hideOtherJudges: boolean;        // judges cannot see peers' scores until submitted
  };

  requireComment: boolean;
  allowRecusal: boolean;
  deadline: Timestamp | null;
}

interface Criterion {
  id: string;
  name: string;
  description: string | null;
  weight: number;                    // 0..1, must sum to 1 across criteria
  scale: { min: number; max: number; step: number };
  labels: Record<number, string> | null;   // "1 = Poor", "5 = Excellent"
  order: number;
}
```

Validation before save: weights sum to `1.0 ± 0.001`; at least one criterion;
`scale.max > scale.min`.

## 2. Judging strategies (the registry)

```ts
interface JudgingStrategy {
  id: JudgingStrategyId;
  label: string;
  description: string;
  configSchema: ZodType;

  /** PURE. Same inputs → same output, always. */
  aggregate(input: {
    reviews: Review[];               // one per judge for ONE submission
    rubric: Rubric;
    config: unknown;
  }): AggregatedScore;

  /** PURE. Ranks a whole cohort; handles ties. */
  rank(input: {
    scored: AggregatedScore[];
    tiebreaker: Tiebreaker;
    seed: string;
  }): RankedEntry[];

  requiresAllJudges: boolean;
  supportsBlind: boolean;
  minReviewsForValidity: number;
}

interface AggregatedScore {
  submissionId: string;
  registrationId: string;
  score: number;                     // normalized 0..100
  raw: number;
  perCriterion: Record<string, number>;
  reviewCount: number;
  variance: number;                  // judge disagreement signal
  isProvisional: boolean;            // below minReviewsForValidity
}
```

| Strategy | Aggregation |
|---|---|
| `single` | The one review's weighted total |
| `average` | Mean of judges' weighted totals |
| `weightedAverage` | Mean weighted by per-judge weight from config |
| `median` | Median — robust to one outlier judge |
| `trimmedMean` | Drop highest and lowest, then mean (needs ≥ 4 judges) |
| `sumOfCriteria` | No weighting; raw sum |
| `rankChoice` | Judges rank entries; Borda count |
| `communityVote` | One vote per eligible user; config: `weightVsJury` |
| `hybrid` | `juryWeight × jury + voteWeight × community` |
| `aiAssisted` | AI produces a *suggested* score; a human must confirm. **Never auto-final.** Phase 3. |

`variance` is surfaced in the admin UI: high disagreement between judges is the
signal that a rubric criterion is ambiguous, and it's the most useful analytics
output in the whole system.

## 3. Score integrity

* `scores` is an **append-only ledger**. A score change writes a new event; the
  aggregator takes the latest per `(judgeId, criterionId)`. Nothing is ever
  overwritten.
* This is what makes offline replay safe: replaying a stale score event cannot
  clobber a newer one, because ordering is by event timestamp, not write order.
* `score.override` (admin changing a judge's score) writes both a score event and
  an `AuditLog` entry, in one batch.
* Clients may create score events only for themselves as an assigned judge —
  enforced in rules by `reviewId == "${submissionId}_${uid}"`.

## 4. Leaderboards

Never a live client query. Materialized by Function.

```
onScoreWrite (Firestore trigger)
   └─▶ debounce 30 s per challenge (a task-queue doc with a scheduled run)
        └─▶ read all reviews for the stage
             └─▶ strategy.aggregate() per submission   [pure]
                  └─▶ strategy.rank() over the cohort  [pure]
                       └─▶ write leaderboard/page_0..n (50 entries each) + meta
```

**Why materialized:** ranking requires reading every review in the challenge. At
500 participants × 3 judges that is 1 500 documents *per viewer* if done
client-side. Materialized, it is one page read.

### Visibility modes

| Mode | Who sees it |
|---|---|
| `hidden` | Staff only |
| `live` | Everyone, updated continuously |
| `afterClose` | Everyone, once `submissionClosesAt` passes |
| `topN` | Everyone, but only the top N rows |
| `public` | Everyone including unauthenticated (mirrored to `publicChallenges`) |

Enforced in rules via a `leaderboardVisible(orgId, cid)` function reading the
challenge's `leaderboard.mode` — not by filtering in the client.

### Grouped leaderboards

`leaderboard.groupBy` names a **form field key** (e.g. `department`, `year`,
`team`). Grouping is therefore customer-defined — no `department` concept exists
in our schema, which is exactly the generic-over-vertical rule from
[BRAIN.md](BRAIN.md) in action.

## 5. Result publishing

`publishResults` (callable, requires `result.publish`) does, atomically:

1. Freeze the leaderboard (`meta.frozen = true`, `frozenAt`).
2. Write `finalRank` / `finalScore` onto each `Registration`.
3. Set `status: 'winner'` per the workflow's terminal rule.
4. Run each terminal stage's `onExit` actions (points, badges, certificates).
5. Update `users/{uid}/participations` and `user.stats` (denormalized portfolio).
6. Set `challenge.status = 'completed'`.
7. Fan out notifications.
8. Write an `AuditLog` entry.

Batched in chunks of ≤ 400 writes with a checkpoint document; idempotent by
`publishBatchId` so a retry after timeout resumes rather than double-awarding.

Publishing is **irreversible from the UI**. Unpublishing requires
`result.publish` plus an explicit confirmation and writes a second audit entry.

## 6. Rewards

```ts
type Reward =
  | { type: 'points'; amount: number }
  | { type: 'badge'; badgeId: string }
  | { type: 'xp'; amount: number }
  | { type: 'certificate'; templateId: string; awardLabel: string }
  | { type: 'coupon'; code: string; expiresAt: Timestamp | null }
  | { type: 'cash'; amount: number; currency: string; note: string }
  | { type: 'custom'; label: string; description: string };
```

`cash` is **recorded, not disbursed.** We are not a payments platform (see
BRAIN.md §10 non-goals). The record exists so the org can reconcile externally.

Points and badges accrue to the **global** user profile, which is what makes the
cross-org portfolio valuable.

## 7. Certificates

```ts
interface CertificateTemplate {
  id: string;
  name: string;
  backgroundFileRef: FileRef | null;       // A4 landscape image or PDF
  orientation: 'landscape' | 'portrait';
  placeholders: Array<{
    token: PlaceholderToken;
    x: number; y: number;                  // percentage of page
    fontSize: number; fontFamily: string; color: string;
    align: 'left' | 'center' | 'right';
    maxWidth: number;
  }>;
}

type PlaceholderToken =
  | '{{recipientName}}' | '{{challengeTitle}}' | '{{organizationName}}'
  | '{{rank}}' | '{{awardLabel}}' | '{{issuedDate}}' | '{{certificateId}}'
  | '{{verificationUrl}}' | '{{score}}' | '{{customField:<fieldKey>}}';
```

* Rendered with `pdf-lib` — client-side for preview, in a Function for issuance
  (so the verification hash is signed server-side).
* `verificationHash = HMAC(secret, canonicalJson({certificateId, userId, challengeId, rank, issuedAt}))`.
* Public verification page at `/verify/{certificateId}` reads the global
  `certificates` collection and recomputes the hash. This is why that collection
  is global and public-readable — see [DATA_MODEL.md §3](DATA_MODEL.md).
* Revocation sets `revoked: true`; the verification page must show revoked
  status rather than 404, so a revoked certificate is provably revoked.
* Bulk issuance is chunked and resumable; issuing 2 000 certificates must not be
  one Function invocation.

## 8. Testing requirements

| Test | Why |
|---|---|
| Each strategy's `aggregate` is pure and deterministic | Results must be defensible |
| `trimmedMean` with < 4 reviews falls back to `average`, flagged provisional | Real edge case |
| Ties resolve identically under a fixed seed | Reproducible disputes |
| Missing reviews → `isProvisional: true`, never a silent zero | **A missing score must never read as a bad score** |
| Score ledger: out-of-order replay yields the latest value | Offline safety |
| `publishResults` run twice → identical state, no double awards | Idempotency |
| Leaderboard pagination at 501 participants produces 11 pages | Doc-size limit |
| Blind mode: no response contains recipient name, email, or filename | Fairness |
| Certificate hash verifies; tampered payload fails | Trust |

/**
 * Cloud Functions for Forge.
 *
 * ⚠️  **NOT DEPLOYED — but executed and tested.**
 *
 * The project is on the Spark plan, which has no Cloud Functions, so none of
 * this has run *in production*. It is written and waiting: `npm --prefix
 * functions run deploy` the day billing is enabled.
 *
 * The emulator, however, has no plan restriction, and that is where these are
 * verified: `npm run test:functions` starts the Firestore and
 * Functions emulators, writes real documents, and asserts what each trigger
 * wrote (see `../verify.mjs` — 22 assertions across all four functions,
 * including a real local HTTP receiver that recomputes the webhook HMAC). So
 * "compiles clean" is no longer the only evidence. What the emulator cannot
 * prove is hosting, not code: IAM, region placement, cold-start limits, and
 * egress to the public internet (which Spark blocks).
 *
 * Each function here either **retires a documented trade-off** or **unblocks a
 * Phase 3 feature that cannot exist client-side**:
 *
 * | Function              | Replaces / unblocks                              |
 * |-----------------------|--------------------------------------------------|
 * | `onRegistrationWrite` | ADR-019 — client-incremented counters             |
 * | `onSubmissionWrite`   | ADR-019 — submission counter                      |
 * | `onScoreWrite`        | Stale leaderboards; SPEC_SCORING §4               |
 * | `dispatchWebhook`     | Phase 3 — signed webhooks (needs a server secret) |
 *
 * After deploying, go and **tighten the rules back**: `leaderboard` and
 * `certificates` return to `write: if false`, and the challenge-update rule
 * drops its `counters` escape hatch. Those relaxations exist only because there
 * was no server; leaving them once there is one would be the worst of both.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHmac } from 'node:crypto';
// The app's own pure engine, compiled into this bundle rather than duplicated.
// It has no imports of its own, which is what makes that possible.
import {
  aggregateSubmission, rankCohort, paginate,
  type CriterionWeight, type ReviewInput,
} from '../../src/core/judging/aggregate';

initializeApp();
const db = getFirestore();

// Keep cold starts and cost predictable. These are small, frequent functions.
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

/* ================================================================== *
 * Counters — retires ADR-019                                          *
 * ================================================================== */

/**
 * Recomputes `challenge.counters.registrations` from the collection itself.
 *
 * A `count()` aggregation rather than an increment: increments drift whenever a
 * write is replayed or a document is deleted out of band, and a counter that is
 * *derived* cannot drift by construction. It costs one aggregation read per
 * change, which is the right trade for a number people see.
 */
export const onRegistrationWrite = onDocumentWritten(
  'organizations/{orgId}/challenges/{cid}/registrations/{rid}',
  async (event) => {
    const { orgId, cid } = event.params;
    const col = db.collection(`organizations/${orgId}/challenges/${cid}/registrations`);
    const snap = await col.count().get();
    await db.doc(`organizations/${orgId}/challenges/${cid}`).set(
      { counters: { registrations: snap.data().count }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  },
);

export const onSubmissionWrite = onDocumentWritten(
  'organizations/{orgId}/challenges/{cid}/submissions/{sid}',
  async (event) => {
    const { orgId, cid } = event.params;
    const col = db.collection(`organizations/${orgId}/challenges/${cid}/submissions`);
    // Drafts are not submissions. Counting them would tell an organiser that
    // work has arrived when it has not.
    //
    // Total-minus-drafts rather than `where('status', '!=', 'draft')`: a `!=`
    // filter silently excludes documents that have no `status` field at all, so
    // any submission written without one would vanish from the count. Two
    // aggregations cost marginally more and cannot under-report.
    const [total, drafts] = await Promise.all([
      col.count().get(),
      col.where('status', '==', 'draft').count().get(),
    ]);
    await db.doc(`organizations/${orgId}/challenges/${cid}`).set(
      {
        counters: { submissions: total.data().count - drafts.data().count },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  },
);

/* ================================================================== *
 * Leaderboard materialization — SPEC_SCORING §4                       *
 * ================================================================== */

/**
 * Rebuilds the leaderboard when a score lands.
 *
 * **This is the function that makes ranks move.** Without it, leaderboard pages
 * are whatever the seed wrote, which is why STATUS lists stale leaderboards as
 * a known risk on Spark.
 *
 * It imports **the app's own aggregation engine** rather than reimplementing
 * it. An earlier draft duplicated the arithmetic here, which is a genuine
 * correctness hazard: the moment the two roundings disagree, a participant sees
 * one score on their entry and a different one on the board, and neither is
 * obviously wrong. `core/judging/aggregate.ts` has no imports at all, so this
 * package compiles the real file (see `tsconfig.json` `rootDir`) and the 32
 * tests that cover it now cover this function too.
 */
export const onScoreWrite = onDocumentWritten(
  'organizations/{orgId}/challenges/{cid}/scores/{scoreId}',
  async (event) => {
    const { orgId, cid } = event.params;
    const base = `organizations/${orgId}/challenges/${cid}`;

    const [rubricSnap, reviewsSnap, regsSnap, subsSnap] = await Promise.all([
      db.collection(`${base}/rubric`).get(),
      db.collection(`${base}/reviews`).get(),
      db.collection(`${base}/registrations`).get(),
      db.collection(`${base}/submissions`).get(),
    ]);

    const criteria: CriterionWeight[] = rubricSnap.docs.map((d) => ({
      id: d.id,
      weight: Number(d.data().weight ?? 0),
      max: Number(d.data().max ?? 10),
    }));

    const reviews: ReviewInput[] = reviewsSnap.docs.map((d) => {
      const r = d.data();
      return {
        submissionId: String(r.submissionId ?? ''),
        judgeId: String(r.judgeId ?? ''),
        recused: Boolean(r.recused),
        criteriaScores: (r.criteriaScores ?? []) as ReviewInput['criteriaScores'],
      };
    });

    // How many reviews a submission is *expected* to get decides whether its
    // score is provisional. A missing review is never a zero (SPEC_SCORING §8),
    // and the engine encodes that — which is exactly why it is shared.
    const expected = new Map(
      subsSnap.docs.map((d) => [d.id, Number(d.data().reviewsTotal ?? 1) || 1]),
    );

    const aggregates = subsSnap.docs.map((d) =>
      aggregateSubmission(d.id, reviews, criteria, { reviewsRequired: expected.get(d.id) ?? 1 }),
    );
    const ranked = rankCohort(aggregates);

    const nameFor = new Map(regsSnap.docs.map((d) => [d.id, String(d.data().name ?? 'Entrant')]));
    const registrationFor = new Map(
      subsSnap.docs.map((d) => [d.id, String(d.data().registrationId ?? d.id)]),
    );

    const batch = db.batch();
    for (const [page, rows] of paginate(ranked).entries()) {
      batch.set(db.doc(`${base}/leaderboard/page_${page}`), {
        page,
        groupKey: null,
        entries: rows.map((r) => {
          const registrationId = registrationFor.get(r.submissionId) ?? r.submissionId;
          return {
            rank: r.rank,
            registrationId,
            userId: registrationId,
            displayName: nameFor.get(registrationId) ?? 'Entrant',
            avatarColor: '#4f46e5',
            // A null score means "not scored". It is stored as 0 only because
            // the leaderboard shape requires a number; `isProvisional` is what
            // readers must branch on, never the 0 itself.
            score: r.score ?? 0,
            change: 0,
            isProvisional: r.isProvisional,
            reviewsDone: r.reviewsDone,
            reviewsTotal: r.reviewsTotal,
          };
        }),
        computedAt: FieldValue.serverTimestamp(),
        strategyId: 'average',
        schemaVersion: 1,
      });
    }
    await batch.commit();
  },
);

/* ================================================================== *
 * Phase 3 — signed webhooks                                           *
 * ================================================================== */

/**
 * Delivers a signed webhook.
 *
 * **This is why webhooks cannot exist on Spark.** The signature proves the
 * request came from Forge, and it requires a secret the receiver also holds.
 * A browser cannot hold that secret — shipping it in a bundle publishes it, and
 * an unsigned webhook is one anybody can forge, which is worse than none.
 *
 * The signature covers a timestamp as well as the body, so a captured request
 * cannot be replayed later; receivers should reject anything older than a few
 * minutes.
 */
export const dispatchWebhook = onCall<{ orgId: string; event: string; payload: unknown }>(
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');

    const { orgId, event, payload } = request.data;

    const member = await db.doc(`organizations/${orgId}/members/${request.auth.uid}`).get();
    const permissions: string[] = member.data()?.resolvedPermissions ?? [];
    if (!permissions.includes('integration.manage')) {
      throw new HttpsError('permission-denied', 'Needs the integration.manage permission.');
    }

    const hooks = await db
      .collection(`organizations/${orgId}/webhooks`)
      .where('event', '==', event)
      .where('active', '==', true)
      .get();

    const timestamp = Date.now().toString();

    await Promise.all(
      hooks.docs.map(async (hook) => {
        const { url, secret } = hook.data() as { url: string; secret: string };
        const body = JSON.stringify({ event, orgId, payload, timestamp });
        const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Forge-Event': event,
              'X-Forge-Timestamp': timestamp,
              'X-Forge-Signature': `sha256=${signature}`,
            },
            body,
            signal: AbortSignal.timeout(10_000),
          });
          await hook.ref.set(
            { lastStatus: response.status, lastAttemptAt: FieldValue.serverTimestamp() },
            { merge: true },
          );
        } catch (error) {
          // One slow receiver must not fail delivery to the others, and it must
          // not fail the action that triggered the webhook.
          await hook.ref.set(
            {
              lastStatus: 0,
              lastError: error instanceof Error ? error.message : String(error),
              lastAttemptAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      }),
    );

    return { delivered: hooks.size };
  },
);

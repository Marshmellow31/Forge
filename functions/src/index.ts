/**
 * Cloud Functions for Forge.
 *
 * ⚠️  **NOT DEPLOYED. NOT EXECUTED. NOT TESTED.**
 *
 * The project is on the Spark plan, which has no Cloud Functions, so none of
 * this has ever run. It is written and waiting: `cd functions && npm install &&
 * npm run deploy` the day billing is enabled. Treat every line as unverified
 * until it has run once against a real project — the shapes match
 * `src/core/firebase/types.ts`, but that is a promise, not a proof.
 *
 * Each function here either **retires a documented trade-off** or **unblocks a
 * Phase 3 feature that cannot exist client-side**:
 *
 * | Function              | Replaces / unblocks                              |
 * |-----------------------|--------------------------------------------------|
 * | `onRegistrationWrite` | ADR-019 — client-incremented counters             |
 * | `onSubmissionWrite`   | ADR-019 — submission counter                      |
 * | `onScoreWrite`        | Stale leaderboards; SPEC_SCORING §4               |
 * | `onResultsPublished`  | ADR-022 — makes publishing atomic and audited     |
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
    const snap = await col.where('status', '!=', 'draft').count().get();
    await db.doc(`organizations/${orgId}/challenges/${cid}`).set(
      { counters: { submissions: snap.data().count }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  },
);

/* ================================================================== *
 * Leaderboard materialization — SPEC_SCORING §4                       *
 * ================================================================== */

interface ReviewDoc {
  submissionId: string;
  judgeId: string;
  recused?: boolean;
  criteriaScores: Array<{ criterionId: string; score: number }>;
}

/**
 * Rebuilds the leaderboard when a score lands.
 *
 * **This is the function that makes ranks move.** Without it, leaderboard pages
 * are whatever the seed wrote, which is why STATUS lists stale leaderboards as
 * a known risk on Spark.
 *
 * The aggregation deliberately mirrors `src/core/judging/aggregate.ts` rather
 * than importing it — a Functions package cannot reach into the app's `src/`
 * without a build step that would couple their deploy cycles. **That
 * duplication is a real hazard**: if the client's rounding and this disagree, a
 * participant sees one number and the board shows another. Before deploying,
 * either extract `core/judging` into a shared workspace package or add a test
 * that runs both over the same fixture and asserts they match.
 */
export const onScoreWrite = onDocumentWritten(
  'organizations/{orgId}/challenges/{cid}/scores/{scoreId}',
  async (event) => {
    const { orgId, cid } = event.params;
    const base = `organizations/${orgId}/challenges/${cid}`;

    const [rubricSnap, reviewsSnap, regsSnap] = await Promise.all([
      db.collection(`${base}/rubric`).get(),
      db.collection(`${base}/reviews`).get(),
      db.collection(`${base}/registrations`).get(),
    ]);

    const criteria = rubricSnap.docs.map((d) => ({
      id: d.id,
      weight: Number(d.data().weight ?? 0),
      max: Number(d.data().max ?? 10),
    }));

    // submissionId -> weighted totals, one per judge.
    const totals = new Map<string, number[]>();
    for (const doc of reviewsSnap.docs) {
      const review = doc.data() as ReviewDoc;
      if (review.recused) continue;

      let earned = 0;
      let available = 0;
      for (const entry of review.criteriaScores ?? []) {
        const criterion = criteria.find((c) => c.id === entry.criterionId);
        if (!criterion || criterion.max <= 0) continue;
        const clamped = Math.max(0, Math.min(entry.score, criterion.max));
        earned += (clamped / criterion.max) * criterion.weight;
        available += criterion.weight;
      }
      if (available === 0) continue;

      const list = totals.get(review.submissionId) ?? [];
      list.push((earned / available) * 100);
      totals.set(review.submissionId, list);
    }

    const nameFor = new Map(
      regsSnap.docs.map((d) => [d.id, String(d.data().name ?? 'Entrant')]),
    );

    const rows = [...totals.entries()]
      .map(([submissionId, scores]) => ({
        submissionId,
        score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        reviewsDone: scores.length,
      }))
      .sort((a, b) => b.score - a.score || a.submissionId.localeCompare(b.submissionId));

    // Competition ranking: ties share a place and consume the ones below.
    let lastScore: number | undefined;
    let lastRank = 0;
    const ranked = rows.map((row, index) => {
      const rank = lastScore === row.score ? lastRank : index + 1;
      lastScore = row.score;
      lastRank = rank;
      return { ...row, rank };
    });

    // 50 rows per page — Firestore caps a document at 1 MiB.
    const batch = db.batch();
    for (let page = 0; page * 50 < Math.max(ranked.length, 1); page += 1) {
      batch.set(db.doc(`${base}/leaderboard/page_${page}`), {
        page,
        groupKey: null,
        entries: ranked.slice(page * 50, page * 50 + 50).map((r) => ({
          rank: r.rank,
          registrationId: r.submissionId,
          userId: r.submissionId,
          displayName: nameFor.get(r.submissionId) ?? 'Entrant',
          avatarColor: '#4f46e5',
          score: r.score,
          change: 0,
          isProvisional: false,
          reviewsDone: r.reviewsDone,
          reviewsTotal: r.reviewsDone,
        })),
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

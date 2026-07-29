/**
 * Executes the Cloud Functions against the Firestore emulator and asserts what
 * they wrote.
 *
 * This exists because the functions could not otherwise be *run* at all: the
 * project is on the Spark plan, so they cannot be deployed, and "compiles
 * clean" is not evidence that a trigger fires or that a counter lands. The
 * emulator has no plan restriction, so it is the only place this code can prove
 * itself before billing is enabled.
 *
 * Run it with:  npm run test:functions
 * (from the repo root — that wraps it in `firebase emulators:exec`, so the
 * emulators are started and torn down around it).
 *
 * It asserts three things, one per function:
 *   1. onRegistrationWrite  — counters.registrations is derived from the collection
 *   2. onSubmissionWrite    — counters.submissions excludes drafts *and* counts
 *                             documents that have no `status` field at all
 *   3. onScoreWrite         — the leaderboard is rebuilt, ranked, and marks
 *                             under-reviewed entries provisional
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'forge-4d40a' });
const db = getFirestore();

const ORG = 'org_verify';
const CID = 'ch_verify';
const base = `organizations/${ORG}/challenges/${CID}`;

const failures = [];
function check(label, ok, detail) {
  if (ok) console.log(`  ok    ${label}`);
  else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
}

/** Triggers are asynchronous; poll rather than sleep a fixed amount. */
async function until(fn, what, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last !== undefined && last !== null) return last;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function main() {
  await db.doc(base).set({ id: CID, orgId: ORG, title: 'Verification', counters: {} });

  console.log('\nonRegistrationWrite');
  for (const [i, name] of ['Ada', 'Grace', 'Alan'].entries()) {
    await db.doc(`${base}/registrations/reg_${i}`).set({ id: `reg_${i}`, name, userId: `u_${i}` });
  }
  const regCount = await until(async () => {
    const n = (await db.doc(base).get()).data()?.counters?.registrations;
    return n === 3 ? n : null;
  }, 'counters.registrations === 3');
  check('counters.registrations is derived from the collection', regCount === 3, `got ${regCount}`);

  // Deleting must decrement — the whole reason this is an aggregation and not an
  // increment (ADR-019). An increment-based counter would still read 3.
  await db.doc(`${base}/registrations/reg_2`).delete();
  const afterDelete = await until(async () => {
    const n = (await db.doc(base).get()).data()?.counters?.registrations;
    return n === 2 ? n : null;
  }, 'counters.registrations === 2 after a delete');
  check('a deleted registration decrements the counter', afterDelete === 2, `got ${afterDelete}`);

  console.log('\nonSubmissionWrite');
  await db.doc(`${base}/submissions/sub_0`).set({
    id: 'sub_0', registrationId: 'reg_0', status: 'submitted', reviewsTotal: 2,
  });
  await db.doc(`${base}/submissions/sub_1`).set({
    id: 'sub_1', registrationId: 'reg_1', status: 'submitted', reviewsTotal: 2,
  });
  await db.doc(`${base}/submissions/sub_draft`).set({
    id: 'sub_draft', registrationId: 'reg_1', status: 'draft', reviewsTotal: 2,
  });
  // No `status` field at all. A `where('status','!=','draft')` filter drops this
  // document silently, which is the bug the total-minus-drafts form avoids.
  await db.doc(`${base}/submissions/sub_nostatus`).set({
    id: 'sub_nostatus', registrationId: 'reg_0', reviewsTotal: 2,
  });
  const subCount = await until(async () => {
    const n = (await db.doc(base).get()).data()?.counters?.submissions;
    return n === 3 ? n : null;
  }, 'counters.submissions === 3');
  check('drafts are excluded and a status-less submission still counts', subCount === 3, `got ${subCount}`);

  console.log('\nonScoreWrite');
  await db.doc(`${base}/rubric/crit_a`).set({ id: 'crit_a', weight: 60, max: 10 });
  await db.doc(`${base}/rubric/crit_b`).set({ id: 'crit_b', weight: 40, max: 10 });

  // sub_0 gets both required reviews; sub_1 gets one of two, so it must come
  // back provisional rather than ranked as if it were complete.
  await db.doc(`${base}/reviews/rev_1`).set({
    submissionId: 'sub_0', judgeId: 'j1', recused: false,
    criteriaScores: [{ criterionId: 'crit_a', value: 8 }, { criterionId: 'crit_b', value: 6 }],
  });
  await db.doc(`${base}/reviews/rev_2`).set({
    submissionId: 'sub_0', judgeId: 'j2', recused: false,
    criteriaScores: [{ criterionId: 'crit_a', value: 9 }, { criterionId: 'crit_b', value: 7 }],
  });
  await db.doc(`${base}/reviews/rev_3`).set({
    submissionId: 'sub_1', judgeId: 'j1', recused: false,
    criteriaScores: [{ criterionId: 'crit_a', value: 4 }, { criterionId: 'crit_b', value: 4 }],
  });

  await db.doc(`${base}/scores/score_trigger`).set({ submissionId: 'sub_0', at: Date.now() });

  const page = await until(async () => {
    const snap = await db.doc(`${base}/leaderboard/page_0`).get();
    const entries = snap.data()?.entries;
    return Array.isArray(entries) && entries.length ? snap.data() : null;
  }, 'leaderboard/page_0 to be rebuilt');

  check('leaderboard page_0 was written by the function', Boolean(page), '');
  check('every submission appears on the board', page.entries.length === 4, `got ${page.entries.length}`);

  const byName = Object.fromEntries(page.entries.map((e) => [e.displayName, e]));
  check(
    'the fully reviewed entry ranks first',
    page.entries[0].rank === 1 && page.entries[0].isProvisional === false,
    JSON.stringify(page.entries[0]),
  );
  check(
    'display names are joined from registrations, not left as ids',
    byName.Ada !== undefined,
    Object.keys(byName).join(','),
  );
  check(
    'an under-reviewed entry is provisional',
    page.entries.some((e) => e.isProvisional === true && e.reviewsDone < e.reviewsTotal),
    JSON.stringify(page.entries.map((e) => [e.displayName, e.reviewsDone, e.reviewsTotal, e.isProvisional])),
  );
  check(
    'an unscored entry keeps score 0 and is flagged provisional, never ranked as a real 0',
    page.entries.filter((e) => e.reviewsDone === 0).every((e) => e.isProvisional === true),
    '',
  );
  check('strategyId and schemaVersion are stamped', page.strategyId === 'average' && page.schemaVersion === 1, '');

  console.log(
    failures.length
      ? `\n${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}\n`
      : '\nAll Cloud Function checks passed against the emulator.\n',
  );
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error('\nverify.mjs threw:', error);
  process.exit(1);
});

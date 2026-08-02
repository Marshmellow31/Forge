/**
 * Clears the demo competitions and installs the real one.
 *
 *   npm run curate            # production, needs a service account key
 *   npm run curate:emulator   # against a running Firestore emulator
 *
 * ## Why this is a script and not a screen
 *
 * Everything here *can* be done from the admin panel by someone holding the
 * permissions — that is the point of the panel. This exists for the case the
 * panel cannot cover: the organization is seeded with demo data, nobody yet
 * holds a role in it, and the first real content has to arrive before there is
 * an administrator to create it. It is the same bootstrap problem ADR-020
 * solves for permissions, solved the same way — locally, with the Admin SDK,
 * once.
 *
 * It is **idempotent**: fixed document ids, deletes that tolerate a missing
 * document, and a create that overwrites rather than duplicating.
 *
 * ## What it removes
 *
 * The six challenges `scripts/seed.ts` writes from `src/mock/data.ts`, and
 * everything hanging off them — registrations, submissions, reviews, rubric,
 * leaderboard. It does **not** touch the organization, its members, the form
 * schemas or the user accounts: those are the scaffolding the app runs on, not
 * the fake competitions someone would mistake for real ones.
 *
 * Recoverable: `npm run seed` writes them all back.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

const ORG_ID = process.env.DEMO_ORG_ID ?? 'org_demo';

/**
 * `--emulator` rather than an inline environment variable, because `FOO=bar cmd`
 * is not portable to the shell npm uses on Windows — and a maintenance script
 * that only runs on one operating system is a script that gets run against
 * production by whoever is on the other one.
 */
if (process.argv.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
}
const USING_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

/**
 * The emulator accepts any project id and no credential at all; production
 * needs the real key. Branching here rather than requiring a key in both cases
 * is what lets the whole flow be rehearsed before it touches live data.
 */
if (USING_EMULATOR) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'forge-4d40a' });
  console.log(`Emulator mode — ${process.env.FIRESTORE_EMULATOR_HOST}\n`);
} else {
  const KEY_PATH =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ?? resolve(process.cwd(), 'serviceAccountKey.json');
  if (!existsSync(KEY_PATH)) {
    console.error(
      `\n  Service account key not found at:\n    ${KEY_PATH}\n\n` +
        '  Firebase console → Project settings → Service accounts → Generate new private key.\n' +
        '  Save it as ./serviceAccountKey.json (gitignored) or set GOOGLE_APPLICATION_CREDENTIALS.\n\n' +
        '  Or rehearse against the emulator first:  npm run curate:emulator\n',
    );
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) });
}

const db: Firestore = getFirestore();
const NOW = Timestamp.now();

/** The six challenges `src/mock/data.ts` defines. Fixed ids, so this is exact. */
const DEMO_CHALLENGE_IDS = [
  'ch_monsoon', 'ch_hack', 'ch_steps', 'ch_meme', 'ch_design', 'ch_pitch',
];

/** Everything that hangs off a challenge and would otherwise be orphaned. */
const CHALLENGE_SUBCOLLECTIONS = [
  'registrations', 'submissions', 'reviews', 'rubric', 'leaderboard', 'votes',
];

const base = (createdBy = 'system') => ({
  createdAt: NOW,
  updatedAt: NOW,
  createdBy,
  schemaVersion: 1,
});

const ts = (iso: string) => Timestamp.fromDate(new Date(`${iso}T00:00:00Z`));

/* ------------------------------------------------------------------ *
 * The competition                                                     *
 * ------------------------------------------------------------------ */

const CHALLENGE_ID = 'ch_milkyway';
const SCHEMA_ID = 'fs_milkyway';

/**
 * A verified public-domain ESO panorama, used as the cover.
 *
 * `resolveCoverUrl` (core/drive/links.ts) takes a Drive share link *or* a plain
 * https URL, so a hosted image works without a Drive account — which is what
 * this needs to be, since the cover has to render for a visitor who has not
 * signed in and holds no Drive permission of ours.
 */
const COVER_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/ESO_-_Milky_Way.jpg/1920px-ESO_-_Milky_Way.jpg';

/**
 * The entry form: **one `files` field, `maxFiles: 3`**.
 *
 * This is the shape the requirement always wanted — "max 3 photos" as a number
 * the schema states and the engine enforces, rather than three named slots
 * standing in for a count. It became available when `file`/`files` stopped
 * being stubs: their inputs used to fabricate a `FileRef` on click, so a form
 * using them reported an entry received while storing a photograph that was
 * never anywhere (ADR-026 replaces that with a real upload).
 *
 * Enforced in three places, deliberately: the browser filters by `accept`, the
 * form engine refuses a fourth file, and `api/drive/upload-session` checks size
 * and type again server-side — the only one of the three a determined caller
 * cannot skip.
 *
 * Field ids are permanent (hard rule 7). Answers are keyed by `key`.
 */
const FORM_SCHEMA = {
  id: SCHEMA_ID,
  orgId: ORG_ID,
  version: 1,
  status: 'published',
  title: 'Milky Way Photo Contest — Entry',
  description: 'Up to three photographs. One entry per person.',
  settings: {
    allowDrafts: true,
    showProgressBar: true,
    confirmationMessage: 'Entry received. Clear skies — results are published after judging.',
  },
  sections: [
    {
      id: 'mw_sec_you',
      title: 'About you',
      description: null,
      order: 0,
      visibleWhen: null,
      fields: [
        {
          id: 'mw_f1', key: 'full_name', type: 'shortText', label: 'Full name',
          help: 'As it should appear on the certificate', placeholder: 'Your name',
          required: true, order: 0, defaultValue: '', options: null,
          validation: { minLength: 2, maxLength: 80 }, config: {}, visibleWhen: null,
          width: 'half', piiLevel: 'high',
        },
        {
          id: 'mw_f2', key: 'email', type: 'email', label: 'Email',
          help: 'Results are sent here', placeholder: 'you@example.com',
          required: true, order: 1, defaultValue: '', options: null,
          validation: {}, config: {}, visibleWhen: null, width: 'half', piiLevel: 'high',
        },
      ],
    },
    {
      id: 'mw_sec_photos',
      title: 'Your photographs',
      description:
        'Up to three photographs. Choose them from your device — they upload directly and there is nothing to share or link afterwards.',
      order: 1,
      visibleWhen: null,
      fields: [
        {
          id: 'mw_f3', key: 'photos', type: 'files', label: 'Your photographs',
          help: 'JPEG, PNG, WebP or HEIC, up to 40 MB each. They upload straight into the organisers’ Drive — you do not need a Google account and there is nothing to share afterwards.',
          placeholder: null, required: true, order: 0, defaultValue: null, options: null,
          validation: {
            maxFiles: 3,
            maxFileSizeMB: 40,
            acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
          },
          config: {}, visibleWhen: null, width: 'full', piiLevel: 'none',
        },
        {
          id: 'mw_f6', key: 'capture_notes', type: 'longText', label: 'Where and how',
          help: 'Location, date, and the gear or settings if you have them. Max 400 characters.',
          placeholder: 'Sky-quality, exposure, stacking — whatever is worth knowing',
          required: false, order: 3, defaultValue: '', options: null,
          validation: { maxLength: 400 }, config: { rows: 4 }, visibleWhen: null,
          width: 'full', piiLevel: 'none',
        },
      ],
    },
    {
      id: 'mw_sec_declaration',
      title: 'Declaration',
      description: null,
      order: 2,
      visibleWhen: null,
      fields: [
        {
          id: 'mw_f7', key: 'original_work', type: 'checkbox',
          label: 'These are my own photographs. Stacking and normal processing are fine; compositing separate scenes is not.',
          help: null, placeholder: null, required: true, order: 0, defaultValue: false,
          options: null, validation: {}, config: { mustBeTrue: true }, visibleWhen: null,
          width: 'full', piiLevel: 'none',
        },
      ],
    },
  ],
};

const STAGES = ['Registration', 'Submission', 'Judging', 'Results'].map((name, i) => ({
  key: name.toLowerCase(),
  name,
  type: name.toLowerCase(),
  // Open at Submission: the competition is live and accepting entries, which is
  // the state it has to be in for anyone to be able to test it.
  state: i < 1 ? 'done' : i === 1 ? 'active' : 'locked',
}));

const CHALLENGE = {
  orgId: ORG_ID,
  workspaceId: 'ws_photo',
  title: 'Milky Way Photo Contest',
  slug: 'milky-way-photo-contest',
  description:
    'Photograph the Milky Way. Up to three frames per entrant — the core, an arch, a landscape under it, whatever you managed to catch. Stacking and ordinary processing are welcome; compositing a sky onto a foreground it was not shot with is not. Judged on composition, technical execution and the sense of place.',
  category: 'Photography',
  tags: ['photography', 'astrophotography', 'night-sky', 'open'],
  status: 'running',
  visibility: 'public',
  cover: COVER_URL,
  formSchemaId: SCHEMA_ID,
  formSchemaVersion: 1,
  stages: STAGES,
  timeline: {
    registrationClosesAt: ts('2026-09-15'),
    submissionClosesAt: ts('2026-09-30'),
    resultsAt: ts('2026-10-15'),
  },
  leaderboardMode: 'afterClose',
  prize: 'Featured on the org page, plus a printed exhibition slot',
  blindJudging: false,
  teamsEnabled: false,
  judgeIds: [],
  // Starts at zero and is moved by real registrations. Seeding a number here
  // would make the console's first screen a lie.
  counters: { registrations: 0, submissions: 0, reviewsCompleted: 0, reviewsPending: 0 },
  publishedAt: NOW,
};

/* ------------------------------------------------------------------ *
 * Run                                                                 *
 * ------------------------------------------------------------------ */

/** Deletes a collection in pages, so a large one does not blow the batch cap. */
async function deleteCollection(path: string): Promise<number> {
  let removed = 0;
  for (;;) {
    const snap = await db.collection(path).limit(300).get();
    if (snap.empty) return removed;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
  }
}

async function main() {
  const orgRef = db.doc(`organizations/${ORG_ID}`);
  const org = await orgRef.get();
  if (!org.exists) {
    console.error(`\n  Organization "${ORG_ID}" does not exist. Run \`npm run seed\` first.\n`);
    process.exit(1);
  }

  console.log(`Organization: ${ORG_ID}\n`);

  // ---- Remove the demo competitions ------------------------------------
  let removedChallenges = 0;
  let removedChildren = 0;

  for (const id of DEMO_CHALLENGE_IDS) {
    const ref = orgRef.collection('challenges').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  · ${id} — already gone`);
      continue;
    }
    for (const sub of CHALLENGE_SUBCOLLECTIONS) {
      removedChildren += await deleteCollection(`${ref.path}/${sub}`);
    }
    await ref.delete();
    removedChallenges += 1;
    console.log(`  ✗ ${id} — "${snap.get('title')}" deleted`);
  }

  console.log(
    `\nRemoved ${removedChallenges} demo challenge(s) and ${removedChildren} child document(s).\n`,
  );

  // ---- Drop the pre-joined snapshots -----------------------------------
  //
  // Load-bearing, not tidying. `snapshots/index` carries the whole challenge
  // list and `AppProviders` hydrates the query cache from it on boot — so
  // deleting the challenge documents while leaving the snapshot in place makes
  // the demo competitions *keep rendering*, from a cache that no longer matches
  // the database. That is the worst of both states.
  //
  // They are dropped rather than rebuilt because they are stale by construction
  // (see the header of `core/firebase/snapshot.ts`): they are written by the
  // seed, not by a trigger, and this organization is about to start taking real
  // writes. Their absence is handled — every hook falls through to its own
  // query, just more expensively, which is the right trade the moment the data
  // stops being fixed.
  const removedSnapshots = await deleteCollection(`${orgRef.path}/snapshots`);
  console.log(`Dropped ${removedSnapshots} pre-joined snapshot document(s).`);
  console.log('  (reads fall through to live queries — correct once data is real)\n');

  // ---- Install the real one --------------------------------------------
  await orgRef.collection('formSchemas').doc(SCHEMA_ID).set({ ...base(), ...FORM_SCHEMA });
  await orgRef.collection('challenges').doc(CHALLENGE_ID).set({ ...base(), ...CHALLENGE });

  // The org's own counter is denormalized and there is no Function to own it on
  // Spark (ADR-019), so it is recomputed here from what actually exists rather
  // than incremented — the whole point of this script is that the old number
  // is wrong.
  const remaining = await orgRef.collection('challenges').get();
  await orgRef.update({ challengeCount: remaining.size, updatedAt: NOW });

  console.log(`  ✓ ${SCHEMA_ID} — entry form, 3 photo slots (1 required)`);
  console.log(`  ✓ ${CHALLENGE_ID} — "${CHALLENGE.title}" (${CHALLENGE.status})`);
  console.log(`  ✓ organizations/${ORG_ID}.challengeCount = ${remaining.size}`);
  console.log(`\nOpen it at /c/${CHALLENGE.slug}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

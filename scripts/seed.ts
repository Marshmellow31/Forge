/**
 * Seeds Firestore with the demo dataset.
 *
 *   npm run seed
 *
 * Requires a service account key. Download it from
 * Firebase console → Project settings → Service accounts → Generate new private
 * key, save it OUTSIDE the repo (or as ./serviceAccountKey.json, which is
 * gitignored), and point GOOGLE_APPLICATION_CREDENTIALS at it.
 *
 * **Never commit that file.** It grants full admin access to the project.
 *
 * The script is idempotent: it writes fixed document ids, so running it twice
 * overwrites rather than duplicating. It uses the Admin SDK, which bypasses
 * security rules by design — that is why it runs locally and never in the app.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

import {
  orgs, workspaces, challenges, registrations, submissions, leaderboard,
  rubric, members, auditLog, badges, certificates, formSchemas, currentUser,
} from '../src/mock/data';

const ORG_ID = process.env.DEMO_ORG_ID ?? 'org_demo';
const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ?? resolve(process.cwd(), 'serviceAccountKey.json');

if (!existsSync(KEY_PATH)) {
  console.error(
    `\n  Service account key not found at:\n    ${KEY_PATH}\n\n` +
      '  Firebase console → Project settings → Service accounts → Generate new private key.\n' +
      '  Save it as ./serviceAccountKey.json (gitignored) or set GOOGLE_APPLICATION_CREDENTIALS.\n',
  );
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) });
const db: Firestore = getFirestore();

/** `'2026-07-24'` or `'2026-07-24 14:10'` → Timestamp. */
const ts = (s: string | undefined | null): Timestamp | null => {
  if (!s || s === '—') return null;
  const iso = s.includes(' ') ? s.replace(' ', 'T') + ':00Z' : s + 'T00:00:00Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
};

const NOW = Timestamp.now();
const base = (createdBy = 'system') => ({
  createdAt: NOW,
  updatedAt: NOW,
  createdBy,
  schemaVersion: 1,
});

/**
 * Firestore rejects `undefined` anywhere in a document.
 *
 * The per-document writes below build their payloads explicitly, but the
 * snapshots embed fixture objects wholesale, and optional fields there
 * (`clientSubmittedAt`, `serverReceivedAt`) are `undefined` on most rows.
 * Convert to `null` rather than enabling `ignoreUndefinedProperties`, which
 * would silently drop the key and make a missing value indistinguishable from
 * a field the seed forgot to write.
 */
function nullifyUndefined<T>(value: T): T {
  if (value === undefined) return null as T;
  if (Array.isArray(value)) return value.map(nullifyUndefined) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (typeof (value as { toDate?: unknown }).toDate === 'function') return value; // Timestamp
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, nullifyUndefined(v)]),
    ) as T;
  }
  return value;
}

/** Firestore caps a batch at 500 writes. */
async function commitAll(ops: Array<[FirebaseFirestore.DocumentReference, unknown]>) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const [ref, data] of ops.slice(i, i + 400)) {
      batch.set(ref, data as FirebaseFirestore.DocumentData);
    }
    await batch.commit();
  }
}

async function main() {
  console.log(`Seeding organization "${ORG_ID}" …`);
  const ops: Array<[FirebaseFirestore.DocumentReference, unknown]> = [];
  const org = orgs[0]!;
  const orgRef = db.doc(`organizations/${ORG_ID}`);

  ops.push([
    orgRef,
    {
      ...base(),
      name: org.name,
      slug: org.slug,
      description: 'Demo organization seeded from src/mock/data.ts.',
      type: org.type,
      ownerId: currentUser.id,
      logoColor: org.logoColor,
      initials: org.initials,
      memberCount: members.length,
      challengeCount: challenges.length,
      plan: org.plan,
      status: 'active',
    },
  ]);

  // The demo user, so the participant screens have a real identity to read.
  ops.push([
    db.doc(`users/${currentUser.id}`),
    {
      ...base(currentUser.id),
      email: currentUser.email,
      displayName: currentUser.name,
      username: null,
      photoURL: null,
      isPublic: true,
      stats: {
        challengesEntered: currentUser.challengesEntered,
        challengesWon: currentUser.challengesWon,
        submissions: submissions.length,
        points: currentUser.points,
        badges: currentUser.badges,
        certificates: currentUser.certificates,
        currentStreakDays: currentUser.streakDays,
        longestStreakDays: currentUser.streakDays,
      },
    },
  ]);

  for (const w of workspaces) {
    ops.push([
      orgRef.collection('workspaces').doc(w.id),
      { ...base(), name: w.name, description: '', challengeCount: w.challengeCount },
    ]);
  }

  for (const m of members) {
    ops.push([
      orgRef.collection('members').doc(m.id),
      {
        ...base(),
        userId: m.id,
        email: m.email,
        displayName: m.name,
        photoURL: null,
        roleIds: m.roles,
        // Seeded members are full admins so the demo's admin screens work.
        resolvedPermissions: [
          'org.update', 'member.manage', 'workspace.manage', 'role.manage',
          'form.manage', 'reward.manage', 'audit.read',
          'challenge.create', 'challenge.update', 'challenge.delete',
          'registration.read', 'registration.manage',
          'submission.read', 'review.read', 'review.write',
          'score.read', 'score.write',
        ],
        status: m.status,
        joinedAt: ts(m.joinedAt),
      },
    ]);
  }

  for (const [id, schema] of Object.entries(formSchemas)) {
    ops.push([
      orgRef.collection('formSchemas').doc(id),
      {
        ...base(),
        orgId: ORG_ID,
        version: schema.version,
        status: schema.status,
        title: schema.title,
        description: schema.description,
        sections: schema.sections,
        settings: schema.settings,
      },
    ]);
  }

  const BADGE_ICONS: Record<string, string> = {
    b1: 'rocket_launch', b2: 'bolt', b3: 'emoji_events', b4: 'favorite',
    b5: 'wb_twilight', b6: 'directions_run', b7: 'stars',
    b8: 'workspace_premium', b9: 'military_tech',
  };
  for (const b of badges) {
    ops.push([
      orgRef.collection('badges').doc(b.id),
      { ...base(), name: b.name, color: b.color, icon: BADGE_ICONS[b.id] ?? 'workspace_premium', criteria: '' },
    ]);
  }

  for (const a of auditLog) {
    ops.push([
      orgRef.collection('auditLogs').doc(a.id),
      {
        ...base(),
        actorId: 'u_seed',
        actorEmail: 'seed@forge.demo',
        actor: a.actor,
        action: a.action,
        targetType: 'challenge',
        targetId: '',
        target: a.target,
      },
    ]);
  }

  for (const ch of challenges) {
    const chRef = orgRef.collection('challenges').doc(ch.id);
    ops.push([
      chRef,
      {
        ...base(),
        orgId: ORG_ID,
        workspaceId: ch.workspaceId,
        title: ch.title,
        slug: ch.slug,
        description: ch.description,
        category: ch.category,
        tags: ch.tags,
        status: ch.status,
        visibility: ch.visibility,
        cover: ch.cover,
        formSchemaId: ch.formSchemaId,
        formSchemaVersion: formSchemas[ch.formSchemaId]?.version ?? 1,
        stages: ch.stages,
        timeline: {
          registrationClosesAt: ts(ch.timeline.registrationClosesAt),
          submissionClosesAt: ts(ch.timeline.submissionClosesAt),
          resultsAt: ts(ch.timeline.resultsAt),
        },
        leaderboardMode: ch.leaderboardMode,
        prize: ch.prize,
        judgeIds: [],
        counters: ch.counters,
        publishedAt: ch.status === 'draft' ? null : NOW,
      },
    ]);

    for (const r of registrations.filter((x) => x.challengeId === ch.id)) {
      ops.push([
        chRef.collection('registrations').doc(r.id),
        {
          ...base(r.userId),
          createdAt: ts(r.registeredAt) ?? NOW,
          challengeId: ch.id,
          userId: r.userId,
          name: r.name,
          email: r.email,
          avatarColor: r.avatarColor,
          team: null,
          status: r.status,
          currentStageKey: r.currentStageKey,
          formSchemaId: ch.formSchemaId,
          formSchemaVersion: formSchemas[ch.formSchemaId]?.version ?? 1,
          answers: r.answers,
          checkedInAt: r.checkedIn ? NOW : null,
        },
      ]);
    }

    for (const s of submissions.filter((x) => x.challengeId === ch.id)) {
      ops.push([
        chRef.collection('submissions').doc(s.id),
        {
          ...base(),
          challengeId: ch.id,
          registrationId: s.registrationId,
          userId: registrations.find((r) => r.id === s.registrationId)?.userId ?? 'u_unknown',
          participant: s.participant,
          anonymizedLabel: s.anonymizedLabel,
          stageKey: s.stageKey,
          formSchemaId: ch.formSchemaId,
          formSchemaVersion: formSchemas[ch.formSchemaId]?.version ?? 1,
          answers: s.answers,
          status: s.status,
          submittedAt: ts(s.submittedAt),
          isLate: s.isLate,
          clientSubmittedAt: ts(s.clientSubmittedAt),
          serverReceivedAt: ts(s.serverReceivedAt),
          fileCount: s.fileCount,
          reviewsDone: s.reviewsDone,
          reviewsTotal: s.reviewsTotal,
          score: s.score,
          isProvisional: s.isProvisional,
          variance: s.variance,
          attemptNumber: 1,
          clientMutationId: `seed_${s.id}`,
        },
      ]);
    }

    for (const [i, c] of rubric.entries()) {
      ops.push([
        chRef.collection('rubric').doc(c.id),
        { ...base(), name: c.name, description: c.description, weight: c.weight, max: c.max, order: i },
      ]);
    }

    // Materialized leaderboard, 50 entries per page — DATA_MODEL.md §2.
    if (ch.id === 'ch_monsoon') {
      for (let page = 0; page * 50 < leaderboard.length; page += 1) {
        ops.push([
          chRef.collection('leaderboard').doc(`page_${page}`),
          {
            ...base(),
            page,
            groupKey: null,
            entries: leaderboard.slice(page * 50, page * 50 + 50).map((e) => ({
              rank: e.rank,
              registrationId: e.registrationId,
              userId: registrations.find((r) => r.id === e.registrationId)?.userId ?? 'u_unknown',
              displayName: e.name,
              avatarColor: e.avatarColor,
              score: e.score,
              change: e.change,
              isProvisional: e.isProvisional,
              reviewsDone: e.reviewsDone,
              reviewsTotal: e.reviewsTotal,
            })),
            computedAt: NOW,
            strategyId: 'weightedAverage',
          },
        ]);
      }
    }
  }

  // Global collection — verification URLs work without org context.
  for (const c of certificates) {
    ops.push([
      db.doc(`certificates/${c.id}`),
      {
        ...base(),
        orgId: ORG_ID,
        orgName: c.org,
        challengeId: '',
        challengeTitle: c.challenge,
        userId: currentUser.id,
        recipientName: currentUser.name,
        rank: c.rank,
        awardLabel: c.award,
        issuedAt: ts(c.issuedAt) ?? NOW,
        verificationHash: `demo_${c.id}`,
        revoked: false,
      },
    ]);
  }

  // ---- Pre-joined snapshots -------------------------------------------
  // The whole point: one read per viewer instead of ~138. See
  // src/core/firebase/snapshot.ts for the arithmetic and the staleness caveat.
  const BADGE_EARNED = new Set(badges.filter((b) => b.earned).map((b) => b.id));

  const indexSnapshot = {
    // The demo profile travels in the snapshot so participant screens have a
    // name and stats without a signed-in user and without reading users/{uid},
    // which is rightly gated behind auth.
    profile: currentUser,
    org: {
      id: ORG_ID, name: org.name, slug: org.slug, type: org.type,
      logoColor: org.logoColor, initials: org.initials,
      memberCount: members.length, challengeCount: challenges.length, plan: org.plan,
    },
    workspaces: workspaces.map((w) => ({ ...w, orgId: ORG_ID })),
    challenges,
    members,
    badges: badges.map((b) => ({ id: b.id, name: b.name, color: b.color, earned: BADGE_EARNED.has(b.id) })),
    certificates,
    auditLog,
  };

  const snapshotOps: Array<[FirebaseFirestore.DocumentReference, unknown]> = [
    [orgRef.collection('snapshots').doc('index'), nullifyUndefined(indexSnapshot)],
  ];

  for (const ch of challenges) {
    snapshotOps.push([
      orgRef.collection('snapshots').doc(`challenge_${ch.id}`),
      nullifyUndefined({
        registrations: registrations.filter((r) => r.challengeId === ch.id),
        submissions: submissions.filter((s) => s.challengeId === ch.id),
        rubric,
        leaderboard: ch.id === 'ch_monsoon' ? leaderboard : [],
      }),
    ]);
  }

  // Firestore hard-caps a document at 1 MiB. Fail loudly rather than write a
  // snapshot that silently truncates the demo.
  const LIMIT = 1_048_576;
  for (const [ref, data] of snapshotOps) {
    const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
    if (bytes > LIMIT * 0.9) {
      console.error(
        `\n  Snapshot ${ref.path} is ${(bytes / 1024).toFixed(0)} KiB — too close to the 1 MiB ` +
          'document limit.\n  Split it, or drop the largest collection back to a live query.\n',
      );
      process.exit(1);
    }
    console.log(`  snapshot ${ref.id}: ${(bytes / 1024).toFixed(1)} KiB`);
  }
  ops.push(...snapshotOps);

  await commitAll(ops);
  console.log(`  ${ops.length} documents written.`);
  console.log(`\nDone. Set VITE_DEMO_ORG_ID=${ORG_ID} in your .env.local and on Vercel.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

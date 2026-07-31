import {
  deleteDoc, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc, writeBatch, Timestamp,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from './app';
import { challengeDoc, inviteDoc, memberDoc, notificationDoc, notificationsCol, rubricCol, submissionDoc } from './paths';
import { resolvedPermissionsFor, BUILT_IN_ROLE_LIST, isPermission } from '@core/rbac';
import type { FormSchema, Stage } from '@shared/types/domain';
import type { NotificationDoc } from './types';

/**
 * Firestore write primitives.
 *
 * Nothing calls these directly — they go through `core/sync`, per AGENT.md
 * hard rule 10. Components never import this module.
 *
 * Every write here is **idempotent by construction**: the document id is
 * derived from the actor and the target, never auto-generated. A replayed
 * mutation overwrites its own document instead of creating a duplicate, which
 * is what makes offline replay safe.
 */

export interface RegistrationInput {
  orgId: string;
  challengeId: string;
  userId: string;
  displayName: string;
  email: string;
  formSchemaId: string;
  formSchemaVersion: number;
  answers: Record<string, unknown>;
  clientMutationId: string;
}

/**
 * `registrationId` = `userId`, so "one entry per user" is enforced by the path
 * and needs no query — and a retry cannot create a second registration.
 * DATA_MODEL.md §2.
 */
export async function writeRegistration(input: RegistrationInput) {
  const ref = doc(
    db(),
    'organizations', input.orgId,
    'challenges', input.challengeId,
    'registrations', input.userId,
  );
  await setDoc(
    ref,
    {
      challengeId: input.challengeId,
      userId: input.userId,
      name: input.displayName,
      email: input.email,
      avatarColor: '#4f46e5',
      team: null,
      status: 'pending',
      currentStageKey: 'registration',
      formSchemaId: input.formSchemaId,
      // PINNED: this answer set is only ever valid against the version it was
      // filled in against. AGENT.md hard rule 6.
      formSchemaVersion: input.formSchemaVersion,
      answers: input.answers,
      checkedInAt: null,
      clientMutationId: input.clientMutationId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: input.userId,
      schemaVersion: 1,
    },
    { merge: true },
  );
  return ref.id;
}

/**
 * Whether this user already holds a registration for this challenge.
 *
 * A point read on a known id, not a query — `registrationId == userId` in
 * individual mode. Returns false on a permission error so a first-time
 * registration still proceeds; the write itself is the authority.
 */
export async function registrationExists(orgId: string, challengeId: string, userId: string) {
  try {
    const snap = await getDoc(
      doc(db(), 'organizations', orgId, 'challenges', challengeId, 'registrations', userId),
    );
    return snap.exists();
  } catch {
    return false;
  }
}

export interface ReviewInput {
  orgId: string;
  challengeId: string;
  submissionId: string;
  judgeId: string;
  stageKey: string;
  criteriaScores: Array<{ criterionId: string; score: number; comment: string | null }>;
  totalRaw: number;
  totalWeighted: number;
  comment: string | null;
  recused: boolean;
  clientMutationId: string;
}

/**
 * Writes the judge's review **and** an append-only score event in one batch.
 *
 * `reviewId` = `${submissionId}_${judgeId}` — one review per judge per
 * submission, enforced by the path. The `scores` ledger is never overwritten
 * (ADR-009); each event is keyed by the mutation id so a replay is a no-op
 * rather than a duplicate score.
 */
export async function writeReview(input: ReviewInput) {
  const challengePath = ['organizations', input.orgId, 'challenges', input.challengeId] as const;
  const reviewId = `${input.submissionId}_${input.judgeId}`;

  const batch = writeBatch(db());

  batch.set(
    doc(db(), ...challengePath, 'reviews', reviewId),
    {
      submissionId: input.submissionId,
      registrationId: '',
      judgeId: input.judgeId,
      stageKey: input.stageKey,
      status: input.recused ? 'recused' : 'submitted',
      criteriaScores: input.criteriaScores,
      totalRaw: input.totalRaw,
      totalWeighted: input.totalWeighted,
      comment: input.comment,
      recommendation: 'undecided',
      submittedAt: serverTimestamp(),
      timeSpentSeconds: 0,
      clientMutationId: input.clientMutationId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: input.judgeId,
      schemaVersion: 1,
    },
    { merge: true },
  );

  if (!input.recused) {
    batch.set(doc(db(), ...challengePath, 'scores', input.clientMutationId), {
      submissionId: input.submissionId,
      judgeId: input.judgeId,
      criteriaScores: input.criteriaScores,
      totalWeighted: input.totalWeighted,
      event: 'score.submit',
      at: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: input.judgeId,
      schemaVersion: 1,
    });
  }

  await batch.commit();
  return reviewId;
}

/**
 * Publishing edits a published schema, so it writes version n+1 as a NEW
 * document and leaves the old one untouched. AGENT.md hard rule 6: existing
 * submissions keep pointing at the version they were made against.
 *
 * Requires `form.manage`; a demo viewer will be denied by the rules, which is
 * intended — schema versions are shared org state.
 */
/* ================================================================== *
 * Challenge lifecycle                                                 *
 * ================================================================== */

export interface ChallengeInput {
  id: string;
  orgId: string;
  workspaceId: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published' | 'running' | 'judging' | 'completed';
  visibility: 'public' | 'organization' | 'invite';
  /** A Drive link, a plain image URL, or ''. See core/drive/links.ts. */
  cover: string;
  formSchemaId: string;
  formSchemaVersion: number;
  prize: string;
  blindJudging: boolean;
  teamsEnabled: boolean;
  maxTeamSize: number;
  leaderboardMode: 'hidden' | 'live' | 'afterClose' | 'public';
  /** Carries the workflow rules the stage designer sets. See core/workflow. */
  stages: Stage[];
  timeline: {
    registrationClosesAt: string | null;
    submissionClosesAt: string | null;
    resultsAt: string | null;
  };
}

/** `YYYY-MM-DD` → Timestamp, tolerating an empty or malformed value. */
function toTimestamp(value: string | null): Timestamp | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

/**
 * Creates or updates a challenge.
 *
 * `merge: true` with a caller-supplied id makes this idempotent and makes
 * "create" and "edit" the same code path — the difference is only whether the
 * id already exists. Counters are deliberately **not** written here: they are
 * denormalized values maintained by `bumpCounter`, and letting a form save
 * overwrite them would silently reset a live challenge's totals to whatever the
 * editor last rendered.
 */
export async function writeChallenge(input: ChallengeInput, userId: string, isNew: boolean) {
  const ref = challengeDoc(input.orgId, input.id);

  const payload: Record<string, unknown> = {
    orgId: input.orgId,
    workspaceId: input.workspaceId,
    title: input.title,
    slug: input.slug,
    description: input.description,
    category: input.category,
    tags: input.tags,
    status: input.status,
    visibility: input.visibility,
    cover: input.cover,
    formSchemaId: input.formSchemaId,
    formSchemaVersion: input.formSchemaVersion,
    prize: input.prize,
    blindJudging: input.blindJudging,
    teamsEnabled: input.teamsEnabled,
    maxTeamSize: input.maxTeamSize,
    leaderboardMode: input.leaderboardMode,
    stages: input.stages,
    timeline: {
      registrationClosesAt: toTimestamp(input.timeline.registrationClosesAt),
      submissionClosesAt: toTimestamp(input.timeline.submissionClosesAt),
      resultsAt: toTimestamp(input.timeline.resultsAt),
    },
    updatedAt: serverTimestamp(),
    schemaVersion: 1,
  };

  if (isNew) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = userId;
    payload.judgeIds = [];
    payload.counters = { registrations: 0, submissions: 0, reviewsCompleted: 0, reviewsPending: 0 };
    payload.publishedAt = input.status === 'draft' ? null : serverTimestamp();
  } else if (input.status !== 'draft') {
    // Stamp the first transition out of draft, and never re-stamp it.
    const existing = await getDoc(ref);
    if (existing.exists() && !existing.data().publishedAt) payload.publishedAt = serverTimestamp();
  }

  await setDoc(ref, payload, { merge: true });
  return input.id;
}

export async function deleteChallenge(orgId: string, challengeId: string) {
  // Subcollections are not removed: Firestore has no recursive delete from a
  // client, and orphaned registrations are strictly better than a half-deleted
  // challenge whose entries vanished. A Function does the sweep on Blaze.
  await deleteDoc(challengeDoc(orgId, challengeId));
}

export interface CriterionInput {
  id: string;
  name: string;
  description: string;
  weight: number;
  max: number;
  order: number;
}

/**
 * Replaces the rubric wholesale.
 *
 * Deleted criteria are removed rather than left dangling, because a score
 * ledger entry references a criterion id and an orphan would render as a blank
 * row on every past review. Existing scores are untouched — ADR-009 makes the
 * ledger append-only — so historical totals stay reproducible.
 */
export async function writeRubric(
  orgId: string,
  challengeId: string,
  criteria: CriterionInput[],
  removedIds: string[],
  userId: string,
) {
  const batch = writeBatch(db());
  const col = rubricCol(orgId, challengeId);

  for (const criterion of criteria) {
    batch.set(
      doc(col, criterion.id),
      {
        name: criterion.name,
        description: criterion.description,
        weight: criterion.weight,
        max: criterion.max,
        order: criterion.order,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: userId,
        schemaVersion: 1,
      },
      { merge: true },
    );
  }
  for (const id of removedIds) batch.delete(doc(col, id));

  await batch.commit();
}

/* ================================================================== *
 * Submissions                                                         *
 * ================================================================== */

export interface SubmissionInput {
  orgId: string;
  challengeId: string;
  userId: string;
  participant: string;
  stageKey: string;
  formSchemaId: string;
  formSchemaVersion: number;
  answers: Record<string, unknown>;
  fileCount: number;
  status: 'draft' | 'submitted';
  /** Judged against the challenge deadline by the caller; recorded, not trusted. */
  isLate: boolean;
  clientMutationId: string;
}

/**
 * One submission per user per stage, keyed by `${userId}_${stageKey}`, so a
 * double-tap or an offline replay overwrites rather than duplicating.
 *
 * Both clocks are stored (SPEC_OFFLINE §5): `clientSubmittedAt` is what the
 * device claimed and `serverReceivedAt` is what actually arrived. Lateness is
 * adjudicated from the server clock; the client's is evidence, not authority.
 */
export async function writeSubmission(input: SubmissionInput) {
  const sid = `${input.userId}_${input.stageKey}`;
  const ref = submissionDoc(input.orgId, input.challengeId, sid);

  await setDoc(
    ref,
    {
      challengeId: input.challengeId,
      registrationId: input.userId,
      userId: input.userId,
      participant: input.participant,
      anonymizedLabel: `Entry ${sid.slice(-4).toUpperCase()}`,
      stageKey: input.stageKey,
      formSchemaId: input.formSchemaId,
      formSchemaVersion: input.formSchemaVersion,
      answers: input.answers,
      status: input.status,
      submittedAt: input.status === 'submitted' ? serverTimestamp() : null,
      isLate: input.isLate,
      clientSubmittedAt: Timestamp.now(),
      serverReceivedAt: serverTimestamp(),
      fileCount: input.fileCount,
      reviewsDone: 0,
      reviewsTotal: 0,
      score: null,
      isProvisional: true,
      variance: 0,
      attemptNumber: 1,
      clientMutationId: input.clientMutationId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: input.userId,
      schemaVersion: 1,
    },
    { merge: true },
  );
  return sid;
}

/* ================================================================== *
 * Organization creation — ROADMAP 1.2                                 *
 * ================================================================== */

export interface OrgInput {
  id: string;
  name: string;
  slug: string;
  type: 'education' | 'company' | 'community' | 'creator' | 'nonprofit' | 'other';
  description: string;
  /** Drive share link or image URL; empty falls back to initials. */
  logoUrl?: string;
}

/**
 * Creates an organization and everything it needs to be usable.
 *
 * ROADMAP 1.2 calls this "transactional: org + owner member + seeded built-in
 * roles + settings singletons", and the ordering below is the whole reason it
 * was not attempted earlier:
 *
 *   1. the **org** must exist first, because the member rule reads `ownerId`
 *      off it to decide whether the caller may make themselves owner;
 *   2. the **owner membership** must exist second, because every subsequent
 *      write is gated on `hasPerm`, which reads that membership;
 *   3. roles, settings and the first workspace come last, once the creator
 *      actually has permission to write them.
 *
 * A batch cannot express that: all its writes are evaluated against the state
 * *before* the batch, so the membership write would be judged against an org
 * that does not yet exist and denied. So this is three sequential commits, and
 * every id is derived from `orgId` — a retry after a failure at any step
 * re-runs the earlier steps harmlessly and completes the later ones.
 */
export async function writeOrganization(input: OrgInput, user: {
  uid: string; email: string | null; displayName: string | null; photoURL: string | null;
}) {
  const orgRef = doc(db(), 'organizations', input.id);

  // 1. The org. `ownerId` is what the membership rule below checks.
  await setDoc(orgRef, {
    name: input.name,
    slug: input.slug,
    description: input.description,
    type: input.type,
    ownerId: user.uid,
    logoColor: '#241A00',
    initials: input.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    logoUrl: input.logoUrl ?? '',
    memberCount: 1,
    challengeCount: 0,
    plan: 'free',
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user.uid,
    schemaVersion: 1,
  });

  // 2. The owner membership. Everything after this depends on it.
  await setDoc(doc(db(), 'organizations', input.id, 'members', user.uid), {
    userId: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? user.email ?? 'Owner',
    photoURL: user.photoURL ?? null,
    roleIds: ['owner'],
    resolvedPermissions: resolvedPermissionsFor({ roleIds: ['owner'], status: 'active' }),
    directPermissions: [],
    scopedGrants: [],
    status: 'active',
    joinedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user.uid,
    schemaVersion: 1,
  });

  // 3. Built-in roles and a first workspace, now that the caller has rights.
  const batch = writeBatch(db());
  for (const role of BUILT_IN_ROLE_LIST) {
    batch.set(doc(db(), 'organizations', input.id, 'roles', role.id), {
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      isSystem: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      schemaVersion: 1,
    });
  }
  batch.set(doc(db(), 'organizations', input.id, 'workspaces', `ws_${input.id}_default`), {
    name: 'General',
    description: 'Default workspace',
    challengeCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user.uid,
    schemaVersion: 1,
  });
  await batch.commit();

  return input.id;
}

/* ================================================================== *
 * Webhooks — ROADMAP Phase 3 (configuration half)                     *
 * ================================================================== */

/**
 * Registers a webhook endpoint.
 *
 * **Configuration is client-side; delivery is not.** The signing secret lives
 * in this document and is read only by `functions/dispatchWebhook` — a browser
 * cannot sign a request without publishing the secret in its bundle, and an
 * unsigned webhook is one anybody can forge. So this screen stores intent, and
 * nothing is delivered until Cloud Functions are deployed on Blaze.
 *
 * That split is stated in the UI rather than implied: a webhook that silently
 * never fires is worse than one that says it is not connected yet.
 *
 * The secret is generated here rather than typed. People choose guessable
 * secrets, and there is no reason to let them.
 */
export async function writeWebhook(
  orgId: string,
  hook: { id: string; url: string; event: string; active: boolean; secret?: string },
  userId: string,
) {
  const secret = hook.secret ?? generateSecret();
  await setDoc(
    doc(db(), 'organizations', orgId, 'webhooks', hook.id),
    {
      url: hook.url.trim(),
      event: hook.event,
      active: hook.active,
      secret,
      lastStatus: null,
      lastAttemptAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId,
      schemaVersion: 1,
    },
    { merge: true },
  );
  return hook.id;
}

export async function deleteWebhook(orgId: string, webhookId: string) {
  await deleteDoc(doc(db(), 'organizations', orgId, 'webhooks', webhookId));
}

/** 32 bytes of CSPRNG output, hex-encoded. Never a timestamp or a UUID. */
function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ================================================================== *
 * Custom roles — ROADMAP Phase 2                                      *
 * ================================================================== */

/**
 * Creates or edits a custom role.
 *
 * Permissions are filtered against the catalog before writing, so a malformed
 * client cannot persist a permission string that does not exist. That is not
 * security — the rules are — but it keeps `resolvedPermissions` meaningful:
 * an unknown string in a role would silently grant nothing while *looking*
 * like a grant in the UI, which is the worst of both.
 *
 * System roles are refused here as well as by convention: the built-ins are
 * the vocabulary everything else is described against, and letting an org
 * redefine "Judge" to mean "can delete challenges" would make every audit log
 * and every support conversation ambiguous. Clone it instead.
 */
export async function writeRole(
  orgId: string,
  role: { id: string; name: string; description: string; permissions: string[] },
  userId: string,
) {
  if (BUILT_IN_ROLE_LIST.some((r) => r.id === role.id)) {
    throw new Error(
      `"${role.name}" is a built-in role and cannot be edited. Duplicate it to make a custom version.`,
    );
  }

  const permissions = role.permissions.filter(isPermission);
  await setDoc(
    doc(db(), 'organizations', orgId, 'roles', role.id),
    {
      name: role.name,
      description: role.description,
      permissions,
      isSystem: false,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      createdBy: userId,
      schemaVersion: 1,
    },
    { merge: true },
  );
  return role.id;
}

export async function deleteRole(orgId: string, roleId: string) {
  if (BUILT_IN_ROLE_LIST.some((r) => r.id === roleId)) {
    throw new Error('Built-in roles cannot be deleted.');
  }
  await deleteDoc(doc(db(), 'organizations', orgId, 'roles', roleId));
}

/* ================================================================== *
 * Check-in — ROADMAP Phase 2                                          *
 * ================================================================== */

/**
 * Marks a registrant present.
 *
 * Idempotent by construction: it sets a timestamp on a document keyed by the
 * registrant, so scanning the same badge twice is a no-op rather than a
 * double-count. At a door with a queue behind it, that matters more than it
 * sounds — the common failure is a volunteer scanning again because they were
 * not sure the first one took.
 */
export async function writeCheckIn(orgId: string, challengeId: string, registrationId: string) {
  await setDoc(
    doc(db(), 'organizations', orgId, 'challenges', challengeId, 'registrations', registrationId),
    { checkedInAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function undoCheckIn(orgId: string, challengeId: string, registrationId: string) {
  await setDoc(
    doc(db(), 'organizations', orgId, 'challenges', challengeId, 'registrations', registrationId),
    { checkedInAt: null, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/* ================================================================== *
 * Community voting — ROADMAP Phase 2                                  *
 * ================================================================== */

/**
 * Casts one vote.
 *
 * **The document id is the voter's uid**, which is the entire abuse-prevention
 * story and why it is not a query: one document per voter per challenge means
 * a second vote overwrites the first rather than adding to it. There is no
 * count to inflate by voting twice, and the rules enforce that the id equals
 * the caller — so ballot-stuffing needs one account per vote, which is the
 * honest bar for a free product.
 *
 * Voting for your own entry is refused. It is not enforceable in rules without
 * a read of the submission, so it is a client check plus a visible rule in the
 * UI — stated rather than silently permitted.
 */
export async function writeVote(
  orgId: string,
  challengeId: string,
  submissionId: string,
  voterId: string,
) {
  await setDoc(
    doc(db(), 'organizations', orgId, 'challenges', challengeId, 'votes', voterId),
    {
      voterId,
      submissionId,
      at: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: voterId,
      schemaVersion: 1,
    },
  );
  return voterId;
}

/* ================================================================== *
 * Workspaces — ROADMAP 1.4                                            *
 * ================================================================== */

export async function writeWorkspace(
  orgId: string,
  workspace: { id: string; name: string; description: string },
  userId: string,
  isNew: boolean,
) {
  const ref = doc(db(), 'organizations', orgId, 'workspaces', workspace.id);
  await setDoc(
    ref,
    {
      name: workspace.name,
      description: workspace.description,
      updatedAt: serverTimestamp(),
      ...(isNew
        ? { challengeCount: 0, createdAt: serverTimestamp(), createdBy: userId, schemaVersion: 1 }
        : {}),
    },
    { merge: true },
  );
  return workspace.id;
}

/**
 * Deleting a workspace is refused while it still holds challenges.
 *
 * Firestore has no referential integrity, so nothing would stop the delete —
 * the challenges would simply point at a workspace id that resolves to nothing
 * and quietly vanish from every workspace-filtered view. The caller counts
 * first and this throws a message a person can act on.
 */
export async function deleteWorkspace(orgId: string, workspaceId: string, challengeCount: number) {
  if (challengeCount > 0) {
    throw new Error(
      `This workspace still holds ${challengeCount} ${challengeCount === 1 ? 'challenge' : 'challenges'}. ` +
        'Move them to another workspace first — deleting now would orphan them.',
    );
  }
  await deleteDoc(doc(db(), 'organizations', orgId, 'workspaces', workspaceId));
}

/* ================================================================== *
 * Result publishing — SPEC_SCORING §5                                 *
 * ================================================================== */

export interface PublishInput {
  orgId: string;
  challengeId: string;
  challengeTitle: string;
  orgName: string;
  publishedBy: string;
  publishedByName: string;
  /** Ranked cohort, already aggregated by the pure engine. */
  entries: Array<{
    rank: number;
    submissionId: string;
    registrationId: string;
    userId: string;
    displayName: string;
    score: number | null;
    reviewsDone: number;
    reviewsTotal: number;
    isProvisional: boolean;
    award: string | null;
  }>;
}

/** Firestore caps a batch at 500 operations; stay well clear of it. */
const BATCH_LIMIT = 400;

/**
 * Publishes final results.
 *
 * SPEC_SCORING §5 assigns this to a callable Cloud Function, and it is the
 * single best argument for Blaze in the whole product: it must be atomic across
 * more documents than one batch holds, and a partial publish is the worst
 * outcome available — half the entrants told they won.
 *
 * On Spark it runs client-side, so the design leans entirely on **idempotency**
 * instead of atomicity. Every document id is derived, never generated:
 *
 *   leaderboard/page_{n}                  — overwritten, not appended
 *   certificates/{challengeId}_{userId}   — one per person per challenge
 *   registrations/{userId}                — merged, finalRank overwritten
 *
 * So a run that dies halfway can simply be run again: it converges on the same
 * state rather than double-awarding. That is a weaker guarantee than a
 * transaction and the UI says so — but it is a *safe* weaker guarantee, which
 * "mostly atomic" would not be.
 *
 * Recorded as ADR-022.
 */
export async function publishResults(input: PublishInput) {
  const { orgId, challengeId } = input;

  // Operations are collected as plain data — a ref and a payload — and only
  // bound to a batch at commit time. Capturing a mutable `batch` in a closure
  // works but reads as a bug; this cannot be one.
  const ops: Array<{ ref: DocumentReference; data: Record<string, unknown>; merge: boolean }> = [];
  const enqueue = (ref: DocumentReference, data: Record<string, unknown>, merge = false) =>
    ops.push({ ref, data, merge });

  // 1. Materialize the leaderboard, 50 rows per page.
  const rows = input.entries.map((e) => ({
    rank: e.rank,
    registrationId: e.registrationId,
    userId: e.userId,
    displayName: e.displayName,
    avatarColor: '#4f46e5',
    score: e.score ?? 0,
    change: 0,
    isProvisional: e.isProvisional,
    reviewsDone: e.reviewsDone,
    reviewsTotal: e.reviewsTotal,
  }));

  for (let page = 0; page * 50 < Math.max(rows.length, 1); page += 1) {
    const slice = rows.slice(page * 50, page * 50 + 50);
    enqueue(
      doc(db(), 'organizations', orgId, 'challenges', challengeId, 'leaderboard', `page_${page}`),
      {
        page,
        groupKey: null,
        entries: slice,
        computedAt: serverTimestamp(),
        strategyId: 'average',
        frozen: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: input.publishedBy,
        schemaVersion: 1,
      },
    );
  }

  // 2–3. Final position onto each registration, and a terminal status.
  for (const entry of input.entries) {
    enqueue(
      doc(db(), 'organizations', orgId, 'challenges', challengeId, 'registrations', entry.registrationId),
      {
        finalRank: entry.rank,
        finalScore: entry.score,
        status: entry.award ? 'winner' : 'active',
        updatedAt: serverTimestamp(),
      },
      true,
    );
  }

  // 4. Certificates, podium only. `awardFor` returns null below third, so this
  //    does not mint a certificate for finishing fortieth.
  for (const entry of input.entries) {
    if (!entry.award || !entry.userId) continue;
    enqueue(
      doc(db(), 'certificates', `${challengeId}_${entry.userId}`),
      {
        orgId,
        orgName: input.orgName,
        challengeId,
        challengeTitle: input.challengeTitle,
        userId: entry.userId,
        recipientName: entry.displayName,
        rank: entry.rank,
        awardLabel: entry.award,
        issuedAt: serverTimestamp(),
        // Derived, not random, so re-publishing produces the same code.
        verificationHash: `${challengeId}_${entry.userId}`,
        revoked: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: input.publishedBy,
        schemaVersion: 1,
      },
    );
  }

  // 6. The challenge itself is done.
  enqueue(
    doc(db(), 'organizations', orgId, 'challenges', challengeId),
    { status: 'completed', updatedAt: serverTimestamp() },
    true,
  );

  // 8. Audit. Write-once by rule, so a re-publish appends a second entry —
  //    which is correct: it happened twice and the log should say so.
  enqueue(
    doc(db(), 'organizations', orgId, 'auditLogs', `publish_${challengeId}_${Date.now()}`),
    {
      actorId: input.publishedBy,
      actorEmail: '',
      actor: input.publishedByName,
      action: 'result.publish',
      targetType: 'challenge',
      targetId: challengeId,
      target: input.challengeTitle,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: input.publishedBy,
      schemaVersion: 1,
    },
  );

  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db());
    for (const op of ops.slice(i, i + BATCH_LIMIT)) {
      if (op.merge) batch.set(op.ref, op.data, { merge: true });
      else batch.set(op.ref, op.data);
    }
    await batch.commit();
  }

  return input.entries.filter((e) => e.award).length;
}

/* ================================================================== *
 * Denormalized counters                                               *
 * ================================================================== */

/**
 * Atomically adjusts one of a challenge's counters.
 *
 * On Blaze these are a Function's job (DATA_MODEL.md §4) precisely because a
 * client can lie about them. On Spark there is no Function, so the choice is
 * between a client increment and counters that are simply wrong — and a wrong
 * "0 entrants" on a live challenge is a visible product failure.
 *
 * `increment()` is a server-side atomic operation, so concurrent registrations
 * do not lose updates; the residual risk is a malicious member inflating a
 * number, which is bounded by rules to members of that org and is recoverable
 * by recomputation. Recorded as ADR-019.
 */
export async function bumpCounter(
  orgId: string,
  challengeId: string,
  counter: 'registrations' | 'submissions' | 'reviewsCompleted' | 'reviewsPending',
  by = 1,
) {
  try {
    await updateDoc(challengeDoc(orgId, challengeId), {
      [`counters.${counter}`]: increment(by),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // A counter is a nicety; failing one must never fail the action that
    // triggered it. The registration itself already committed.
  }
}

/* ================================================================== *
 * In-app notifications                                                *
 * ================================================================== */

export interface NotifyInput {
  orgId: string;
  userId: string;
  type: NotificationDoc['type'];
  title: string;
  body: string;
  link?: string | null;
  challengeId?: string | null;
  /** Stable id makes delivery idempotent — a replay updates, never duplicates. */
  dedupeKey: string;
}

export async function writeNotification(input: NotifyInput) {
  await setDoc(
    doc(notificationsCol(input.orgId, input.userId), input.dedupeKey),
    {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      challengeId: input.challengeId ?? null,
      readAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: input.userId,
      schemaVersion: 1,
    },
    { merge: true },
  );
}

export async function markNotificationRead(orgId: string, userId: string, id: string) {
  await updateDoc(notificationDoc(orgId, userId, id), {
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(orgId: string, userId: string, ids: string[]) {
  const batch = writeBatch(db());
  for (const id of ids) {
    batch.update(notificationDoc(orgId, userId, id), {
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/* ================================================================== *
 * Membership                                                          *
 * ================================================================== */

/**
 * Issues an invitation.
 *
 * The `resolvedPermissions` are computed here from the pure engine and stored
 * alongside the role, because the rules compare the redeemed membership against
 * this document field-for-field — they cannot resolve a role themselves.
 */
export async function writeInvite(
  orgId: string,
  email: string,
  roleId: string,
  invitedBy: string,
) {
  const normalized = email.trim().toLowerCase();
  // Untyped ref: the read converter stamps `id` onto the object, which would
  // otherwise be demanded in the write payload. Same pattern as the other
  // writes in this file.
  await setDoc(doc(db(), 'organizations', orgId, 'invites', normalized), {
    email: normalized,
    roleIds: [roleId],
    resolvedPermissions: resolvedPermissionsFor({ roleIds: [roleId], status: 'active' }),
    invitedBy,
    status: 'pending',
    acceptedBy: null,
    acceptedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: invitedBy,
    schemaVersion: 1,
  });
  return normalized;
}

/** Revoking leaves the document in place as a record, rather than deleting it. */
export async function revokeInviteDoc(orgId: string, email: string) {
  await updateDoc(inviteDoc(orgId, email), {
    status: 'revoked',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Exchanges a pending invite for a real membership.
 *
 * The client chooses nothing here: the roles come from the invite document,
 * which only an existing admin (or the seed) could write. The security rules
 * re-check that the invite exists, that its email matches the caller's verified
 * token, and that the claimed roles equal the invite's — so a forged call
 * cannot grant itself anything the invite did not already carry.
 *
 * This is how the first admin exists at all without a Cloud Function.
 */
export async function redeemInvite(orgId: string, user: {
  uid: string; email: string; displayName: string | null; photoURL: string | null;
}) {
  const invite = await getDoc(inviteDoc(orgId, user.email));
  if (!invite.exists()) return null;

  const data = invite.data();
  if (data.status !== 'pending') return null;

  const batch = writeBatch(db());
  batch.set(
    memberDoc(orgId, user.uid),
    {
      userId: user.uid,
      email: user.email,
      displayName: user.displayName ?? user.email,
      photoURL: user.photoURL ?? null,
      roleIds: data.roleIds,
      resolvedPermissions: data.resolvedPermissions,
      status: 'active',
      joinedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.uid,
      schemaVersion: 1,
    },
    { merge: true },
  );
  batch.update(inviteDoc(orgId, user.email), {
    status: 'accepted',
    acceptedBy: user.uid,
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return data.roleIds;
}

export async function publishSchemaVersion(orgId: string, schema: FormSchema, userId: string) {
  const nextVersion = schema.version + 1;
  const nextId = `${schema.id.replace(/_v\d+$/, '')}_v${nextVersion}`;
  const ref = doc(db(), 'organizations', orgId, 'formSchemas', nextId);
  await setDoc(ref, {
    orgId,
    version: nextVersion,
    status: 'published',
    title: schema.title,
    description: schema.description ?? null,
    sections: schema.sections,
    settings: schema.settings,
    supersedes: schema.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    schemaVersion: 1,
  });
  return nextId;
}

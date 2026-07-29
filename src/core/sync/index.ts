import * as writes from '@core/firebase/writes';

/**
 * The mutation entry point. CLAUDE.md hard rule 10: participant-facing writes
 * go through here, never `setDoc` from a component.
 *
 * **Offline durability is delegated to the Firestore SDK**, not to a bespoke
 * IndexedDB queue. `core/firebase/app.ts` enables `persistentLocalCache`, which
 * already queues writes made while offline and replays them on reconnect, in
 * order, surviving a reload. Re-implementing that on top of Dexie — as
 * SPEC_OFFLINE describes — would duplicate it with more bugs and no benefit.
 *
 * What this layer adds on top, and why it still has to exist:
 *
 * 1. **Idempotency.** Every mutation carries a `clientMutationId` and every
 *    write derives its document id from the actor and target. A replay
 *    overwrites its own document; it never creates a second registration or a
 *    duplicate score event.
 * 2. **One choke point.** Every write in the app is visible in this file, which
 *    is what makes "did we ever write X without permission?" answerable.
 * 3. **A seam.** When a real queue, conflict policy or audit hook is needed,
 *    it goes here and no component changes.
 *
 * The divergence from SPEC_OFFLINE is recorded in STATUS.md.
 */

/**
 * Stable id for one logical user action.
 *
 * `crypto.randomUUID` is available in every browser this app targets; the
 * fallback keeps non-secure contexts (plain-HTTP previews) working.
 */
export function mutationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in to submit. The demo is read-only until you do.');
    this.name = 'NotSignedInError';
  }
}

/** Every mutation names its actor; an unauthenticated write is refused here
 *  as well as by the security rules, so the UI can explain itself. */
function requireUser(userId: string | undefined): string {
  if (!userId) throw new NotSignedInError();
  return userId;
}

export interface SubmitRegistrationArgs {
  orgId: string;
  challengeId: string;
  userId: string | undefined;
  displayName: string;
  email: string;
  formSchemaId: string;
  formSchemaVersion: number;
  answers: Record<string, unknown>;
}

export async function submitRegistration(args: SubmitRegistrationArgs) {
  const userId = requireUser(args.userId);

  // Whether this is a first registration or an edit decides both the counter
  // and whether a confirmation is worth sending. `registrationId == userId`, so
  // this is a point read, not a query.
  const isNew = !(await writes.registrationExists(args.orgId, args.challengeId, userId));

  const id = await writes.writeRegistration({
    orgId: args.orgId,
    challengeId: args.challengeId,
    userId,
    displayName: args.displayName,
    email: args.email,
    formSchemaId: args.formSchemaId,
    formSchemaVersion: args.formSchemaVersion,
    answers: args.answers,
    clientMutationId: mutationId(),
  });

  if (isNew) {
    await writes.bumpCounter(args.orgId, args.challengeId, 'registrations');
    await notify({
      orgId: args.orgId,
      userId,
      type: 'registration.confirmed',
      title: "You're registered",
      body: 'Your entry is confirmed. We will let you know when the submission window opens.',
      link: '/me/registrations',
      challengeId: args.challengeId,
      dedupeKey: `registration_${args.challengeId}`,
    });
  }
  return id;
}

export interface SubmitReviewArgs {
  orgId: string;
  challengeId: string;
  submissionId: string;
  judgeId: string | undefined;
  stageKey: string;
  criteriaScores: Array<{ criterionId: string; score: number; comment: string | null }>;
  totalRaw: number;
  totalWeighted: number;
  comment: string | null;
  recused?: boolean;
}

export async function submitReview(args: SubmitReviewArgs) {
  const judgeId = requireUser(args.judgeId);
  return writes.writeReview({
    orgId: args.orgId,
    challengeId: args.challengeId,
    submissionId: args.submissionId,
    judgeId,
    stageKey: args.stageKey,
    criteriaScores: args.criteriaScores,
    totalRaw: args.totalRaw,
    totalWeighted: args.totalWeighted,
    comment: args.comment,
    recused: args.recused ?? false,
    clientMutationId: mutationId(),
  });
}

export async function publishSchema(
  orgId: string,
  schema: Parameters<typeof writes.publishSchemaVersion>[1],
  userId: string | undefined,
) {
  return writes.publishSchemaVersion(orgId, schema, requireUser(userId));
}

/* ================================================================== *
 * Challenge lifecycle                                                 *
 * ================================================================== */

export async function saveChallenge(
  input: writes.ChallengeInput,
  userId: string | undefined,
  isNew: boolean,
) {
  return writes.writeChallenge(input, requireUser(userId), isNew);
}

export async function removeChallenge(orgId: string, challengeId: string, userId: string | undefined) {
  requireUser(userId);
  return writes.deleteChallenge(orgId, challengeId);
}

export async function saveRubric(
  orgId: string,
  challengeId: string,
  criteria: writes.CriterionInput[],
  removedIds: string[],
  userId: string | undefined,
) {
  return writes.writeRubric(orgId, challengeId, criteria, removedIds, requireUser(userId));
}

/* ================================================================== *
 * Submissions                                                         *
 * ================================================================== */

export interface SubmitEntryArgs {
  orgId: string;
  challengeId: string;
  userId: string | undefined;
  participant: string;
  stageKey: string;
  formSchemaId: string;
  formSchemaVersion: number;
  answers: Record<string, unknown>;
  fileCount: number;
  status: 'draft' | 'submitted';
  isLate: boolean;
}

export async function submitEntry(args: SubmitEntryArgs) {
  const userId = requireUser(args.userId);
  const sid = await writes.writeSubmission({
    orgId: args.orgId,
    challengeId: args.challengeId,
    userId,
    participant: args.participant,
    stageKey: args.stageKey,
    formSchemaId: args.formSchemaId,
    formSchemaVersion: args.formSchemaVersion,
    answers: args.answers,
    fileCount: args.fileCount,
    status: args.status,
    isLate: args.isLate,
    clientMutationId: mutationId(),
  });

  // A draft is not an event worth counting or announcing.
  if (args.status === 'submitted') {
    await writes.bumpCounter(args.orgId, args.challengeId, 'submissions');
    await notify({
      orgId: args.orgId,
      userId,
      type: 'submission.received',
      title: 'Entry received',
      body: 'Your submission is in. You can still see it under My entries.',
      link: '/me/registrations',
      challengeId: args.challengeId,
      // Keyed by the submission, so re-submitting updates one notification
      // rather than stacking a new one on every save.
      dedupeKey: `submission_${sid}`,
    });
  }
  return sid;
}

/* ================================================================== *
 * Custom roles, check-in and voting — ROADMAP Phase 2                 *
 * ================================================================== */

export async function saveRole(
  orgId: string,
  role: { id: string; name: string; description: string; permissions: string[] },
  userId: string | undefined,
) {
  return writes.writeRole(orgId, role, requireUser(userId));
}

export async function removeRole(orgId: string, roleId: string, userId: string | undefined) {
  requireUser(userId);
  return writes.deleteRole(orgId, roleId);
}

export async function checkIn(
  orgId: string,
  challengeId: string,
  registrationId: string,
  present: boolean,
  userId: string | undefined,
) {
  requireUser(userId);
  return present
    ? writes.writeCheckIn(orgId, challengeId, registrationId)
    : writes.undoCheckIn(orgId, challengeId, registrationId);
}

export async function castVote(
  orgId: string,
  challengeId: string,
  submissionId: string,
  voterId: string | undefined,
) {
  return writes.writeVote(orgId, challengeId, submissionId, requireUser(voterId));
}

/* ================================================================== *
 * Organizations                                                       *
 * ================================================================== */

export async function createOrganization(
  input: writes.OrgInput,
  user: { uid: string | undefined; email: string | null; displayName: string | null; photoURL: string | null },
) {
  const uid = requireUser(user.uid);
  return writes.writeOrganization(input, { ...user, uid });
}

/* ================================================================== *
 * Workspaces                                                          *
 * ================================================================== */

export async function saveWorkspace(
  orgId: string,
  workspace: { id: string; name: string; description: string },
  userId: string | undefined,
  isNew: boolean,
) {
  return writes.writeWorkspace(orgId, workspace, requireUser(userId), isNew);
}

export async function removeWorkspace(
  orgId: string,
  workspaceId: string,
  challengeCount: number,
  userId: string | undefined,
) {
  requireUser(userId);
  return writes.deleteWorkspace(orgId, workspaceId, challengeCount);
}

/* ================================================================== *
 * Result publishing                                                   *
 * ================================================================== */

/**
 * Publishes results, then tells everyone.
 *
 * Notification fan-out happens *after* the write commits and is best-effort:
 * telling someone they won and then failing to record it would be far worse
 * than recording it and failing to tell them, which the inbox corrects on their
 * next visit.
 */
export async function publishResults(
  input: Omit<writes.PublishInput, 'publishedBy'>,
  userId: string | undefined,
) {
  const publishedBy = requireUser(userId);
  const awarded = await writes.publishResults({ ...input, publishedBy });

  await Promise.all(
    input.entries
      .filter((e) => e.userId)
      .map((e) =>
        notify({
          orgId: input.orgId,
          userId: e.userId,
          type: 'results.published',
          title: e.award ? `You placed #${e.rank}` : 'Results are in',
          body: e.award
            ? `${input.challengeTitle}: ${e.award}. Your certificate is on your Awards page.`
            : `${input.challengeTitle} has finished. You placed #${e.rank}.`,
          link: e.award ? '/me/achievements' : `/c/${input.challengeId}/leaderboard`,
          challengeId: input.challengeId,
          // One results notification per person per challenge, so re-publishing
          // updates it rather than notifying twice.
          dedupeKey: `results_${input.challengeId}`,
        }),
      ),
  );

  return awarded;
}

/* ================================================================== *
 * Notifications                                                       *
 * ================================================================== */

/**
 * Delivery is best-effort by design.
 *
 * A notification is a courtesy attached to an action that has already
 * committed; if writing it fails, the registration or submission still
 * happened. Throwing here would roll back nothing and would turn a successful
 * action into a visible error, which is strictly worse.
 */
export async function notify(input: writes.NotifyInput) {
  try {
    await writes.writeNotification(input);
  } catch {
    /* the action it accompanies has already succeeded */
  }
}

export async function readNotification(orgId: string, userId: string, id: string) {
  return writes.markNotificationRead(orgId, userId, id);
}

export async function readAllNotifications(orgId: string, userId: string, ids: string[]) {
  if (ids.length === 0) return;
  return writes.markAllNotificationsRead(orgId, userId, ids);
}

/* ================================================================== *
 * Membership                                                          *
 * ================================================================== */

export async function inviteMember(
  orgId: string,
  email: string,
  roleId: string,
  userId: string | undefined,
) {
  return writes.writeInvite(orgId, email, roleId, requireUser(userId));
}

export async function revokeInvite(orgId: string, email: string, userId: string | undefined) {
  requireUser(userId);
  return writes.revokeInviteDoc(orgId, email);
}

export async function claimInvite(
  orgId: string,
  user: { uid: string; email: string | null; displayName: string | null; photoURL: string | null },
) {
  if (!user.email) return null;
  return writes.redeemInvite(orgId, { ...user, email: user.email });
}

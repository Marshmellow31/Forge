import type { Timestamp } from 'firebase/firestore';
import type {
  Org, Workspace, Challenge, Registration, Submission, LeaderboardEntry,
  Criterion, Member, CurrentUser, Badge, Certificate, AuditEntry, FormSchema,
} from '@shared/types/domain';
import type {
  OrgDoc, WorkspaceDoc, ChallengeDoc, RegistrationDoc, SubmissionDoc,
  LeaderboardPageDoc, RubricDoc, MemberDoc, UserDoc, BadgeDoc, CertificateDoc,
  AuditLogDoc, FormSchemaDoc,
} from './types';

/**
 * Firestore document → UI domain type.
 *
 * This is the only place a `Timestamp` is allowed to become a string. Screens
 * never import a Firebase type; if a mapper is missing, add it here rather than
 * leaking the stored shape upward.
 */

/** `Timestamp | null` → `YYYY-MM-DD`, or `'—'` when absent. */
export const day = (ts: Timestamp | null | undefined): string =>
  ts ? ts.toDate().toISOString().slice(0, 10) : '—';

/** `Timestamp | null` → `YYYY-MM-DD HH:mm`, or `'—'` when absent. */
export const stamp = (ts: Timestamp | null | undefined): string => {
  if (!ts) return '—';
  const d = ts.toDate();
  return `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const toOrg = (d: OrgDoc): Org => ({
  id: d.id,
  name: d.name,
  slug: d.slug,
  type: d.type,
  logoColor: d.logoColor,
  initials: d.initials,
  memberCount: d.memberCount,
  challengeCount: d.challengeCount,
  plan: d.plan,
});

export const toWorkspace = (d: WorkspaceDoc, orgId: string): Workspace => ({
  id: d.id,
  orgId,
  name: d.name,
  icon: 'Folder',
  challengeCount: d.challengeCount,
});

export const toChallenge = (d: ChallengeDoc): Challenge => ({
  id: d.id,
  orgId: d.orgId,
  workspaceId: d.workspaceId,
  title: d.title,
  slug: d.slug,
  description: d.description,
  category: d.category,
  tags: d.tags,
  // 'archived' and 'cancelled' exist in the stored shape but not in the UI
  // union; they are surfaced as 'completed' until a screen needs to tell them
  // apart. See DATA_MODEL.md §2.
  status: d.status === 'archived' || d.status === 'cancelled' ? 'completed' : d.status,
  visibility: d.visibility === 'unlisted' ? 'public' : d.visibility,
  cover: d.cover,
  formSchemaId: d.formSchemaId,
  stages: d.stages,
  timeline: {
    registrationClosesAt: day(d.timeline.registrationClosesAt),
    submissionClosesAt: day(d.timeline.submissionClosesAt),
    resultsAt: day(d.timeline.resultsAt),
  },
  counters: d.counters,
  leaderboardMode: d.leaderboardMode === 'topN' ? 'live' : d.leaderboardMode,
  prize: d.prize,
});

export const toRegistration = (d: RegistrationDoc): Registration => ({
  id: d.id,
  challengeId: d.challengeId,
  userId: d.userId,
  name: d.name,
  email: d.email,
  avatarColor: d.avatarColor,
  status:
    d.status === 'withdrawn' || d.status === 'disqualified' ? 'eliminated' : d.status,
  currentStageKey: d.currentStageKey,
  registeredAt: day(d.createdAt),
  checkedIn: d.checkedInAt !== null,
  answers: d.answers,
});

export const toSubmission = (d: SubmissionDoc): Submission => ({
  id: d.id,
  challengeId: d.challengeId,
  registrationId: d.registrationId,
  participant: d.participant,
  anonymizedLabel: d.anonymizedLabel,
  stageKey: d.stageKey,
  status: d.status === 'rejected' ? 'reviewed' : d.status,
  submittedAt: stamp(d.submittedAt),
  isLate: d.isLate,
  ...(d.clientSubmittedAt ? { clientSubmittedAt: stamp(d.clientSubmittedAt) } : {}),
  ...(d.serverReceivedAt ? { serverReceivedAt: stamp(d.serverReceivedAt) } : {}),
  fileCount: d.fileCount,
  reviewsDone: d.reviewsDone,
  reviewsTotal: d.reviewsTotal,
  score: d.score,
  isProvisional: d.isProvisional,
  variance: d.variance,
  answers: d.answers,
});

export const toCriterion = (d: RubricDoc): Criterion => ({
  id: d.id,
  name: d.name,
  description: d.description,
  weight: d.weight,
  max: d.max,
});

/** Flattens the materialized, paginated leaderboard back into a single list. */
export const toLeaderboard = (pages: LeaderboardPageDoc[]): LeaderboardEntry[] =>
  pages
    .sort((a, b) => a.page - b.page)
    .flatMap((p) => p.entries)
    .map((e) => ({
      rank: e.rank,
      registrationId: e.registrationId,
      name: e.displayName,
      avatarColor: e.avatarColor,
      score: e.score,
      change: e.change,
      isProvisional: e.isProvisional,
      reviewsDone: e.reviewsDone,
      reviewsTotal: e.reviewsTotal,
    }));

export const toMember = (d: MemberDoc): Member => ({
  id: d.userId,
  name: d.displayName,
  email: d.email,
  avatarColor: '#4f46e5',
  roles: d.roleIds,
  status: d.status,
  joinedAt: day(d.joinedAt),
});

export const toCurrentUser = (d: UserDoc): CurrentUser => ({
  id: d.id,
  name: d.displayName,
  email: d.email,
  avatarColor: '#4f46e5',
  points: d.stats.points,
  badges: d.stats.badges,
  certificates: d.stats.certificates,
  streakDays: d.stats.currentStreakDays,
  challengesEntered: d.stats.challengesEntered,
  challengesWon: d.stats.challengesWon,
});

export const toBadge = (d: BadgeDoc, earnedIds: Set<string>): Badge => ({
  id: d.id,
  name: d.name,
  color: d.color,
  earned: earnedIds.has(d.id),
});

export const toCertificate = (d: CertificateDoc): Certificate => ({
  id: d.id,
  challenge: d.challengeTitle,
  org: d.orgName,
  award: d.awardLabel,
  rank: d.rank,
  issuedAt: day(d.issuedAt),
});

export const toAuditEntry = (d: AuditLogDoc): AuditEntry => ({
  id: d.id,
  actor: d.actor,
  action: d.action,
  target: d.target,
  at: stamp(d.createdAt),
});

/**
 * The form engine owns its own schema type; the stored document carries the
 * sections as opaque JSON so Firestore never dictates the engine's shape.
 */
export const toFormSchema = (d: FormSchemaDoc): FormSchema =>
  ({
    id: d.id,
    orgId: d.orgId,
    version: d.version,
    status: d.status,
    title: d.title,
    description: d.description,
    sections: d.sections,
    settings: d.settings,
  }) as FormSchema;

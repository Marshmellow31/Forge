import type { Timestamp } from 'firebase/firestore';
import type { AdvanceRule } from '@core/workflow/types';

/**
 * Firestore document shapes, per DATA_MODEL.md §2.
 *
 * These are the *stored* shapes — timestamps are `Timestamp`, not display
 * strings. `mappers.ts` converts them into the UI-facing domain types in
 * `@shared/types/domain`. Screens never see a `Timestamp`.
 *
 * Where the demo stores a subset of a documented shape, the field is marked
 * `// subset:` with what is missing and why. See STATUS.md for the running list.
 */

export interface BaseDoc {
  id: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  /** Shape version of THIS document type. Readers must tolerate n-1. */
  schemaVersion: number;
}

export interface UserDoc extends BaseDoc {
  email: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  isPublic: boolean;
  /** Function-maintained in production; seeded here. Never client-writable. */
  stats: {
    challengesEntered: number;
    challengesWon: number;
    submissions: number;
    points: number;
    badges: number;
    certificates: number;
    currentStreakDays: number;
    longestStreakDays: number;
  };
}

export interface OrgDoc extends BaseDoc {
  name: string;
  slug: string;
  description: string;
  type: 'education' | 'company' | 'community' | 'creator' | 'nonprofit' | 'other';
  ownerId: string;
  logoColor: string;
  initials: string;
  memberCount: number;
  challengeCount: number;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended';
}

export interface WorkspaceDoc extends BaseDoc {
  name: string;
  description: string;
  challengeCount: number;
}

export interface MemberDoc extends BaseDoc {
  userId: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  roleIds: string[];
  /** Flattened for the rules fast path — see DATA_MODEL.md §6 `hasPerm`. */
  resolvedPermissions: string[];
  /** Additive grants outside any role. SPEC_RBAC §1. */
  directPermissions?: string[];
  /** Grants that apply only within a workspace or challenge. SPEC_RBAC §5. */
  scopedGrants?: Array<{
    scope: { type: 'org' | 'workspace' | 'challenge'; id: string };
    permissions: string[];
  }>;
  status: 'invited' | 'active' | 'suspended';
  joinedAt: Timestamp | null;
}

export interface RoleDoc extends BaseDoc {
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

/**
 * A pending invitation, keyed by lowercased email.
 *
 * This is how someone becomes an admin without a Cloud Function: an existing
 * admin (or the seed script) writes the invite, and the invitee's first
 * sign-in exchanges it for a membership. The security rules only permit that
 * exchange when the invite's email matches the caller's verified token email
 * and the roles claimed match the invite exactly — so the client chooses
 * *nothing*, it merely redeems what was already granted.
 */
export interface InviteDoc extends BaseDoc {
  email: string;
  roleIds: string[];
  resolvedPermissions: string[];
  invitedBy: string;
  status: 'pending' | 'accepted' | 'revoked';
  acceptedBy: string | null;
  acceptedAt: Timestamp | null;
}

/**
 * In-app notification. Delivery is a Firestore read, not a push — the product
 * decision (and the Spark plan) is that the inbox is the source of truth and
 * push is an optional echo of it.
 */
export interface NotificationDoc extends BaseDoc {
  userId: string;
  type:
    | 'registration.confirmed'
    | 'submission.received'
    | 'deadline.approaching'
    | 'results.published'
    | 'review.assigned'
    | 'announcement';
  title: string;
  body: string;
  /** In-app route to open. Never an external URL. */
  link: string | null;
  challengeId: string | null;
  readAt: Timestamp | null;
}

export interface StageDoc {
  key: string;
  name: string;
  type: string;
  state: 'done' | 'active' | 'locked';
  /**
   * Optional so every already-seeded challenge keeps loading. A stage with no
   * rule is read as `{ mode: 'manual' }` — nobody advances until a human says
   * so, which is the right default for a value that was never chosen.
   */
  advanceRule?: AdvanceRule;
  window?: { opensAt: number | null; closesAt: number | null } | null;
}

export interface ChallengeDoc extends BaseDoc {
  orgId: string;
  workspaceId: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published' | 'running' | 'judging' | 'completed' | 'archived' | 'cancelled';
  visibility: 'public' | 'unlisted' | 'organization' | 'invite';
  cover: string;
  formSchemaId: string;
  /** PINNED — submissions keep pointing at the version they were made against. */
  formSchemaVersion: number;
  stages: StageDoc[];
  timeline: {
    registrationClosesAt: Timestamp | null;
    submissionClosesAt: Timestamp | null;
    resultsAt: Timestamp | null;
  };
  leaderboardMode: 'hidden' | 'live' | 'afterClose' | 'topN' | 'public';
  prize: string;
  /** SPEC_SCORING blind judging. Absent reads as false. */
  blindJudging?: boolean;
  teamsEnabled?: boolean;
  maxTeamSize?: number;
  judgeIds: string[];
  /** Function-maintained in production; seeded here. Client-read-only. */
  counters: {
    registrations: number;
    submissions: number;
    reviewsCompleted: number;
    reviewsPending: number;
  };
  publishedAt: Timestamp | null;
}

export interface RegistrationDoc extends BaseDoc {
  challengeId: string;
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  team: { id: string; name: string; memberIds: string[] } | null;
  status: 'pending' | 'active' | 'withdrawn' | 'disqualified' | 'eliminated' | 'winner';
  currentStageKey: string;
  formSchemaId: string;
  formSchemaVersion: number;
  answers: Record<string, unknown>;
  checkedInAt: Timestamp | null;
}

export interface SubmissionDoc extends BaseDoc {
  challengeId: string;
  registrationId: string;
  userId: string;
  participant: string;
  /** Shown to judges in blind mode instead of any identifying field. */
  anonymizedLabel: string;
  stageKey: string;
  formSchemaId: string;
  formSchemaVersion: number;
  answers: Record<string, unknown>;
  status: 'draft' | 'submitted' | 'underReview' | 'reviewed' | 'rejected';
  submittedAt: Timestamp | null;
  isLate: boolean;
  /** Both clocks are recorded; the client's is never trusted. SPEC_OFFLINE §5. */
  clientSubmittedAt: Timestamp | null;
  serverReceivedAt: Timestamp | null;
  fileCount: number;
  reviewsDone: number;
  reviewsTotal: number;
  /** null until enough reviews land — never shown as zero. SPEC_SCORING §8. */
  score: number | null;
  isProvisional: boolean;
  variance: number;
  attemptNumber: number;
  clientMutationId: string;
}

export interface ReviewDoc extends BaseDoc {
  submissionId: string;
  registrationId: string;
  judgeId: string;
  stageKey: string;
  status: 'assigned' | 'inProgress' | 'submitted' | 'recused';
  criteriaScores: Array<{ criterionId: string; score: number; comment: string | null }>;
  totalRaw: number;
  totalWeighted: number;
  comment: string | null;
  recommendation: 'advance' | 'eliminate' | 'undecided';
  submittedAt: Timestamp | null;
  timeSpentSeconds: number;
}

export interface RubricDoc extends BaseDoc {
  name: string;
  description: string;
  weight: number;
  max: number;
  order: number;
}

export interface LeaderboardPageDoc extends BaseDoc {
  page: number;
  groupKey: string | null;
  entries: Array<{
    rank: number;
    registrationId: string;
    userId: string;
    displayName: string;
    avatarColor: string;
    score: number;
    change: number;
    isProvisional: boolean;
    reviewsDone: number;
    reviewsTotal: number;
  }>;
  computedAt: Timestamp;
  strategyId: string;
}

export interface FormSchemaDoc extends BaseDoc {
  orgId: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  title: string;
  description: string | null;
  /** Stored as JSON — the engine's own types live in core/forms. */
  sections: unknown[];
  settings: {
    allowDrafts: boolean;
    showProgressBar: boolean;
    confirmationMessage: string | null;
  };
}

export interface BadgeDoc extends BaseDoc {
  name: string;
  color: string;
  icon: string;
  criteria: string;
}

export interface CertificateDoc extends BaseDoc {
  orgId: string;
  orgName: string;
  challengeId: string;
  challengeTitle: string;
  userId: string;
  recipientName: string;
  rank: number | null;
  awardLabel: string;
  issuedAt: Timestamp;
  verificationHash: string;
  revoked: boolean;
}

export interface AuditLogDoc extends BaseDoc {
  actorId: string;
  actorEmail: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  target: string;
}

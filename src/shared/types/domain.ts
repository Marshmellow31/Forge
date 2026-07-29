/**
 * UI-facing domain types.
 *
 * These are what screens and components consume. Two producers exist:
 *   • `src/mock/data.ts`        — the in-memory demo fixture
 *   • `src/core/firebase/mappers.ts` — Firestore documents, converted
 *
 * Dates are display strings here, never `Timestamp` — no screen should import
 * a Firebase type. The stored shapes live in `core/firebase/types.ts`.
 */
import type { FormSchema } from '@core/forms/types';
import type { AdvanceRule } from '@core/workflow/types';

export type { FormSchema, AdvanceRule };

export interface Org {
  id: string;
  name: string;
  slug: string;
  type: string;
  logoColor: string;
  initials: string;
  memberCount: number;
  challengeCount: number;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface Workspace {
  id: string;
  orgId: string;
  name: string;
  icon: string;
  challengeCount: number;
}

export type ChallengeStatus = 'draft' | 'published' | 'running' | 'judging' | 'completed';

export interface Stage {
  key: string;
  name: string;
  type: string;
  state: 'done' | 'active' | 'locked';
  /**
   * How participants leave this stage. Optional so every existing seeded
   * challenge keeps working — a stage without one is treated as `{ mode:
   * 'manual' }`, which holds everybody and is the safe default: an organiser
   * who has not chosen a rule should not have people advanced automatically.
   */
  advanceRule?: AdvanceRule;
  /** Epoch millis. Only `deadline` rules read it. */
  window?: { opensAt: number | null; closesAt: number | null } | null;
}

export interface Challenge {
  id: string;
  orgId: string;
  workspaceId: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  status: ChallengeStatus;
  visibility: 'public' | 'organization' | 'invite';
  cover: string;
  formSchemaId: string;
  stages: Stage[];
  timeline: { registrationClosesAt: string; submissionClosesAt: string; resultsAt: string };
  counters: { registrations: number; submissions: number; reviewsCompleted: number; reviewsPending: number };
  leaderboardMode: 'hidden' | 'live' | 'afterClose' | 'public';
  prize: string;
  /**
   * Withhold entrant identity from judges. Optional so existing challenges keep
   * loading; absent reads as `false`, because turning blind judging *on* by
   * accident would be a surprising change to how a live competition behaves.
   */
  blindJudging?: boolean;
  /** Team entries. `Registration.team` has existed since day one. */
  teamsEnabled?: boolean;
  maxTeamSize?: number;
}

export interface Registration {
  id: string;
  challengeId: string;
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  status: 'pending' | 'active' | 'eliminated' | 'winner';
  currentStageKey: string;
  registeredAt: string;
  checkedIn: boolean;
  answers: Record<string, unknown>;
}

export interface Submission {
  id: string;
  challengeId: string;
  registrationId: string;
  participant: string;
  anonymizedLabel: string;
  stageKey: string;
  status: 'draft' | 'submitted' | 'underReview' | 'reviewed';
  submittedAt: string;
  isLate: boolean;
  clientSubmittedAt?: string;
  serverReceivedAt?: string;
  fileCount: number;
  reviewsDone: number;
  reviewsTotal: number;
  score: number | null;
  isProvisional: boolean;
  variance: number;
  answers: Record<string, unknown>;
}

export interface LeaderboardEntry {
  rank: number;
  registrationId: string;
  name: string;
  avatarColor: string;
  score: number;
  change: number;
  isProvisional: boolean;
  reviewsDone: number;
  reviewsTotal: number;
}

export interface Criterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  max: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  roles: string[];
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string;
}


export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  points: number;
  badges: number;
  certificates: number;
  streakDays: number;
  challengesEntered: number;
  challengesWon: number;
}

export interface Badge {
  id: string;
  name: string;
  color: string;
  earned: boolean;
}

export interface Certificate {
  id: string;
  challenge: string;
  org: string;
  award: string;
  rank: number | null;
  issuedAt: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
}

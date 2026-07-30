import { doc, getDoc } from 'firebase/firestore';
import type { QueryClient } from '@tanstack/react-query';
import { db, demoOrgId } from './app';
import { qk } from './keys';
import type {
  Org, Workspace, Challenge, Registration, Submission, LeaderboardEntry,
  Criterion, Member, Badge, Certificate, AuditEntry, CurrentUser,
} from '@shared/types/domain';

/**
 * Read amplification is the whole cost story on Firestore.
 *
 * A full walkthrough of this demo costs ~138 document reads if every screen
 * queries its own collections. At 700 concurrent viewers that is ~96,600 reads
 * against a 50,000/day free quota — the demo dies about a third of the way in.
 *
 * So the seed script also writes two *pre-joined snapshot documents*, and the
 * app hydrates its entire query cache from them:
 *
 *   snapshots/index          → org, workspaces, challenges, members, badges,
 *                              certificates, auditLog
 *   snapshots/challenge_{id} → registrations, submissions, rubric, leaderboard
 *
 * That is 1–2 reads per viewer instead of 138 — a ~70× reduction, and it turns
 * a hard scaling ceiling into a rounding error.
 *
 * The trade-off is honest and worth stating: snapshots are **stale by
 * construction**. They are rebuilt by `npm run seed`, not by a trigger. That is
 * correct for a fixed demo dataset and wrong for live data — when writes land,
 * these become a Cloud Function's job (DATA_MODEL.md §4) or get dropped in
 * favour of live queries.
 *
 * Firestore caps a document at 1 MiB. `npm run seed` fails loudly if a snapshot
 * exceeds it rather than writing a truncated one.
 */

export interface IndexSnapshot {
  /** Demo profile; avoids an auth-gated users/{uid} read. */
  profile: CurrentUser;
  org: Org;
  workspaces: Workspace[];
  challenges: Challenge[];
  members: Member[];
  badges: Badge[];
  certificates: Certificate[];
  auditLog: AuditEntry[];
}

export interface ChallengeSnapshot {
  registrations: Registration[];
  submissions: Submission[];
  rubric: Criterion[];
  leaderboard: LeaderboardEntry[];
}

export async function fetchIndexSnapshot(orgId = demoOrgId()): Promise<IndexSnapshot | null> {
  const snap = await getDoc(doc(db(), 'organizations', orgId, 'snapshots', 'index'));
  return snap.exists() ? (snap.data() as IndexSnapshot) : null;
}

export async function fetchChallengeSnapshot(
  cid: string,
  orgId = demoOrgId(),
): Promise<ChallengeSnapshot | null> {
  const snap = await getDoc(doc(db(), 'organizations', orgId, 'snapshots', `challenge_${cid}`));
  return snap.exists() ? (snap.data() as ChallengeSnapshot) : null;
}

/**
 * Writes the snapshot into the exact query keys the screens already read, so
 * every `useChallenges()` / `useMembers()` / … call is served from cache with
 * no further network traffic. Hooks stay unchanged; only their source moves.
 */
export function hydrateFromIndex(qc: QueryClient, s: IndexSnapshot, orgId = demoOrgId()) {
  if (s.profile) qc.setQueryData(qk.user(s.profile.id), s.profile);
  qc.setQueryData(qk.org(orgId), s.org);
  qc.setQueryData(qk.workspaces(orgId), s.workspaces);
  qc.setQueryData(qk.challenges(orgId), s.challenges);
  qc.setQueryData(qk.members(orgId), s.members);
  qc.setQueryData(qk.badges(orgId), s.badges);
  qc.setQueryData(qk.auditLog(orgId), s.auditLog);
  qc.setQueryData(qk.certificates(), s.certificates);

  // Individual challenge lookups, by id and by slug, so detail screens do not
  // re-read a document the list already contains.
  for (const ch of s.challenges) {
    qc.setQueryData(qk.challenge(orgId, ch.id), ch);
    qc.setQueryData(qk.challengeBySlug(orgId, ch.slug), ch);
  }
}

export function hydrateFromChallenge(
  qc: QueryClient,
  cid: string,
  s: ChallengeSnapshot,
  orgId = demoOrgId(),
) {
  qc.setQueryData(qk.registrations(orgId, cid), s.registrations);
  qc.setQueryData(qk.submissions(orgId, cid), s.submissions);
  qc.setQueryData(qk.rubric(orgId, cid), s.rubric);
  qc.setQueryData(qk.leaderboard(orgId, cid), s.leaderboard);
}

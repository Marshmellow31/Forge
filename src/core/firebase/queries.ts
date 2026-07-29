import { getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import {
  orgDoc, workspacesCol, challengesCol, challengeDoc, registrationsCol,
  submissionsCol, rubricCol, leaderboardCol, formSchemasCol, membersCol,
  auditLogsCol, badgesCol, certificatesCol, userDoc,
} from './paths';
import {
  toOrg, toWorkspace, toChallenge, toRegistration, toSubmission, toCriterion,
  toLeaderboard, toMember, toCurrentUser, toBadge, toCertificate, toAuditEntry,
  toFormSchema,
} from './mappers';
import type { FormSchema } from '@shared/types/domain';

/**
 * Tenant-scoped reads. Every function takes `orgId` — CLAUDE.md hard rule 2.
 *
 * These are plain async functions with no React in them; the hooks in
 * `@core/firebase/hooks` wrap them for TanStack Query.
 */

export async function fetchOrg(orgId: string) {
  const snap = await getDoc(orgDoc(orgId));
  return snap.exists() ? toOrg(snap.data()) : null;
}

export async function fetchWorkspaces(orgId: string) {
  const snap = await getDocs(workspacesCol(orgId));
  return snap.docs.map((d) => toWorkspace(d.data(), orgId));
}

export async function fetchChallenges(orgId: string) {
  const snap = await getDocs(query(challengesCol(orgId), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => toChallenge(d.data()));
}

export async function fetchChallenge(orgId: string, cid: string) {
  const snap = await getDoc(challengeDoc(orgId, cid));
  return snap.exists() ? toChallenge(snap.data()) : null;
}

export async function fetchChallengeBySlug(orgId: string, slug: string) {
  const snap = await getDocs(query(challengesCol(orgId), where('slug', '==', slug)));
  const first = snap.docs[0];
  return first ? toChallenge(first.data()) : null;
}

export async function fetchRegistrations(orgId: string, cid: string) {
  const snap = await getDocs(registrationsCol(orgId, cid));
  return snap.docs.map((d) => toRegistration(d.data()));
}

export async function fetchSubmissions(orgId: string, cid: string) {
  const snap = await getDocs(query(submissionsCol(orgId, cid), orderBy('submittedAt', 'asc')));
  return snap.docs.map((d) => toSubmission(d.data()));
}

export async function fetchRubric(orgId: string, cid: string) {
  const snap = await getDocs(query(rubricCol(orgId, cid), orderBy('order', 'asc')));
  return snap.docs.map((d) => toCriterion(d.data()));
}

export async function fetchLeaderboard(orgId: string, cid: string) {
  const snap = await getDocs(leaderboardCol(orgId, cid));
  return toLeaderboard(snap.docs.map((d) => d.data()));
}

export async function fetchFormSchemas(orgId: string): Promise<Record<string, FormSchema>> {
  const snap = await getDocs(formSchemasCol(orgId));
  return Object.fromEntries(snap.docs.map((d) => [d.id, toFormSchema(d.data())]));
}

export async function fetchMembers(orgId: string) {
  const snap = await getDocs(membersCol(orgId));
  return snap.docs.map((d) => toMember(d.data()));
}

export async function fetchAuditLog(orgId: string) {
  const snap = await getDocs(query(auditLogsCol(orgId), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => toAuditEntry(d.data()));
}

export async function fetchBadges(orgId: string, earnedIds: string[] = []) {
  const snap = await getDocs(badgesCol(orgId));
  const earned = new Set(earnedIds);
  return snap.docs.map((d) => toBadge(d.data(), earned));
}

/** Global collection — public verification URLs must work without org context. */
export async function fetchCertificates() {
  const snap = await getDocs(certificatesCol());
  return snap.docs.map((d) => toCertificate(d.data()));
}

export async function fetchUser(userId: string) {
  const snap = await getDoc(userDoc(userId));
  return snap.exists() ? toCurrentUser(snap.data()) : null;
}

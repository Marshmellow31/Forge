import {
  collection, collectionGroup, getDoc, getDocs, limit, orderBy, query, where,
} from 'firebase/firestore';
import { db } from './app';
import {
  orgDoc, workspacesCol, challengesCol, challengeDoc, registrationsCol,
  submissionsCol, rubricCol, leaderboardCol, formSchemasCol, membersCol,
  auditLogsCol, badgesCol, certificatesCol, userDoc, memberDoc, rolesCol,
  notificationsCol, invitesCol,
} from './paths';
import {
  toOrg, toWorkspace, toChallenge, toRegistration, toSubmission, toCriterion,
  toLeaderboard, toMember, toCurrentUser, toBadge, toCertificate, toAuditEntry,
  toFormSchema, toParticipantEntry, stamp,
} from './mappers';
import type { FormSchema } from '@shared/types/domain';
import type { MemberLike, RoleDefinition } from '@core/rbac';
import type { RegistrationDoc } from './types';

/**
 * Tenant-scoped reads. Every function takes `orgId` — AGENT.md hard rule 2.
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

/**
 * Every registration in the organization, across every challenge.
 *
 * **Why a fan-out and not a `collectionGroup`.** There is exactly one
 * collection-group rule for registrations (ADR-018) and it admits a document
 * only when `resource.data.userId == uid()` — "my registrations". A group query
 * for *everyone's* would need a second root-level rule, and a root-level rule
 * cannot see the `orgId` in the path, so it could not be scoped to one tenant.
 * That is hard rule 2 refusing to be worked around, correctly. The nested rule
 * already grants `registration.read` per challenge, so N reads it is.
 *
 * N is the number of challenges in one organization, which is tens, not
 * thousands — and the caller already holds the challenge list for their titles.
 * If it ever stops being tens, the answer is a server-side aggregate, not a
 * looser rule.
 *
 * One challenge failing does not fail the rest: a challenge the caller cannot
 * read contributes nothing instead of taking the whole console down with it.
 */
export async function fetchAllRegistrations(
  orgId: string,
  challenges: { id: string; title: string }[],
) {
  const perChallenge = await Promise.all(
    challenges.map(async (ch) => {
      try {
        const snap = await getDocs(registrationsCol(orgId, ch.id));
        return snap.docs.map((d) => toParticipantEntry(d.data(), ch.title));
      } catch {
        return [];
      }
    }),
  );
  // Newest first: an admin console is almost always opened because of something
  // that just happened.
  return perChallenge.flat().sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
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

/* ---------------------------------------------------------------- *
 * RBAC                                                              *
 * ---------------------------------------------------------------- */

/**
 * The caller's own membership, in the shape `core/rbac` resolves from.
 *
 * Returns null rather than throwing when the document is missing or unreadable:
 * "not a member" is the normal case for a signed-out visitor browsing public
 * challenges, and it must resolve to zero permissions, not to an error screen.
 */
export async function fetchMember(orgId: string, userId: string): Promise<MemberLike | null> {
  try {
    const snap = await getDoc(memberDoc(orgId, userId));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      roleIds: d.roleIds ?? [],
      directPermissions: d.directPermissions ?? [],
      scopedGrants: d.scopedGrants ?? [],
      status: d.status === 'active' ? 'active' : d.status === 'invited' ? 'invited' : 'suspended',
    };
  } catch {
    return null;
  }
}

/** Custom roles only; built-ins are resolved from code, not read. */
export async function fetchRoles(orgId: string): Promise<RoleDefinition[]> {
  try {
    const snap = await getDocs(rolesCol(orgId));
    return snap.docs.map((d) => {
      const r = d.data();
      return {
        id: d.id,
        name: r.name ?? d.id,
        description: r.description ?? '',
        permissions: (r.permissions ?? []) as RoleDefinition['permissions'],
        isSystem: Boolean(r.isSystem),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Returns `[]` rather than throwing when the caller cannot read invites — a
 * member without `member.read` is a normal visitor to this screen, not an
 * error, and the list simply appears empty for them.
 */
export async function fetchInvites(orgId: string) {
  try {
    const snap = await getDocs(invitesCol(orgId));
    return snap.docs.map((d) => ({
      id: d.id,
      email: d.data().email ?? d.id,
      roleIds: d.data().roleIds ?? [],
      status: d.data().status ?? 'pending',
    }));
  } catch {
    return [];
  }
}

/** Webhook endpoints. Returns `[]` for anyone without `integration.manage`. */
export async function fetchWebhooks(orgId: string) {
  try {
    const snap = await getDocs(collection(db(), 'organizations', orgId, 'webhooks'));
    return snap.docs.map((d) => ({
      id: d.id,
      url: String(d.data().url ?? ''),
      event: String(d.data().event ?? ''),
      active: Boolean(d.data().active),
      lastStatus: (d.data().lastStatus ?? null) as number | null,
    }));
  } catch {
    return [];
  }
}

/**
 * Vote tallies for a challenge.
 *
 * Returns counts per submission plus this user's own vote — never the full
 * ballot list. Who voted for whom is deliberately not surfaced: a visible
 * tally that named voters would change how people vote.
 */
export async function fetchVotes(orgId: string, cid: string, userId?: string) {
  try {
    const snap = await getDocs(
      collection(db(), 'organizations', orgId, 'challenges', cid, 'votes'),
    );
    const tally: Record<string, number> = {};
    let mine: string | null = null;
    for (const d of snap.docs) {
      const submissionId = String(d.data().submissionId ?? '');
      if (!submissionId) continue;
      tally[submissionId] = (tally[submissionId] ?? 0) + 1;
      if (userId && d.id === userId) mine = submissionId;
    }
    return { tally, mine, total: snap.size };
  } catch {
    // A participant may not read the whole collection; their own vote still
    // resolves from the optimistic cache after they cast it.
    return { tally: {}, mine: null, total: 0 };
  }
}

/* ---------------------------------------------------------------- *
 * Notifications                                                     *
 * ---------------------------------------------------------------- */

/**
 * Newest 50. The inbox is a UI affordance, not an archive — an unbounded read
 * here would be a per-visit cost that grows forever.
 */
export async function fetchNotifications(orgId: string, userId: string) {
  try {
    const snap = await getDocs(
      query(notificationsCol(orgId, userId), orderBy('createdAt', 'desc'), limit(50)),
    );
    return snap.docs.map((d) => {
      const n = d.data();
      return {
        id: d.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link ?? null,
        challengeId: n.challengeId ?? null,
        read: n.readAt !== null && n.readAt !== undefined,
        at: stamp(n.createdAt),
      };
    });
  } catch {
    // A missing index or a signed-out user must not break the shell.
    return [];
  }
}

/**
 * Every registration this user holds, across every challenge in the org.
 *
 * `registrationId == userId` in individual mode, so this is a collection-group
 * query filtered by that id. The `orgId` filter keeps it tenant-scoped, which
 * AGENT.md hard rule 2 requires of a `collectionGroup` — see ADR-018.
 */
export async function fetchMyRegistrations(orgId: string, userId: string) {
  const snap = await getDocs(
    query(collectionGroup(db(), 'registrations'), where('userId', '==', userId), limit(100)),
  );
  return snap.docs
    // Path check rather than trust: a collection-group query spans tenants by
    // definition, so the org boundary is re-asserted here as well as in rules.
    .filter((d) => d.ref.path.startsWith(`organizations/${orgId}/`))
    // A collectionGroup query has no converter attached, so the snapshot is
    // untyped. `toRegistration` tolerates missing fields, and the id comes from
    // the snapshot rather than the payload.
    .map((d) => toRegistration({ ...(d.data() as RegistrationDoc), id: d.id }));
}

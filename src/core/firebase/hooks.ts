import { useQuery, useQueryClient } from '@tanstack/react-query';
import { demoOrgId } from './app';
import { qk } from './keys';
import * as q from './queries';
import { fetchChallengeSnapshot, hydrateFromChallenge } from './snapshot';

/**
 * Read hooks. Components use these; they never import `firebase/firestore`
 * (CONVENTIONS.md §5).
 *
 * The demo reads from a single organization, so `orgId` defaults to
 * `DEMO_ORG_ID` rather than coming from an org switcher. When multi-org lands,
 * these take the active org from context — the query keys are already
 * org-first, so nothing below changes shape.
 */

export const useOrg = (orgId = demoOrgId()) =>
  useQuery({ queryKey: qk.org(orgId), queryFn: () => q.fetchOrg(orgId) });

export const useWorkspaces = (orgId = demoOrgId()) =>
  useQuery({ queryKey: qk.workspaces(orgId), queryFn: () => q.fetchWorkspaces(orgId) });

export const useChallenges = (orgId = demoOrgId()) =>
  useQuery({ queryKey: qk.challenges(orgId), queryFn: () => q.fetchChallenges(orgId) });

export const useChallenge = (cid: string | undefined, orgId = demoOrgId()) =>
  useQuery({
    queryKey: qk.challenge(orgId, cid ?? ''),
    queryFn: () => q.fetchChallenge(orgId, cid!),
    enabled: Boolean(cid),
  });

export const useChallengeBySlug = (slug: string | undefined, orgId = demoOrgId()) =>
  useQuery({
    queryKey: qk.challengeBySlug(orgId, slug ?? ''),
    queryFn: () => q.fetchChallengeBySlug(orgId, slug!),
    enabled: Boolean(slug),
  });

export const useRegistrations = (cid: string | undefined, orgId = demoOrgId()) =>
  useQuery({
    queryKey: qk.registrations(orgId, cid ?? ''),
    queryFn: () => q.fetchRegistrations(orgId, cid!),
    enabled: Boolean(cid),
  });

export const useSubmissions = (cid: string | undefined, orgId = demoOrgId()) =>
  useQuery({
    queryKey: qk.submissions(orgId, cid ?? ''),
    queryFn: () => q.fetchSubmissions(orgId, cid!),
    enabled: Boolean(cid),
  });

export const useRubric = (cid: string | undefined, orgId = demoOrgId()) =>
  useQuery({
    queryKey: qk.rubric(orgId, cid ?? ''),
    queryFn: () => q.fetchRubric(orgId, cid!),
    enabled: Boolean(cid),
  });

export const useLeaderboard = (cid: string | undefined, orgId = demoOrgId()) =>
  useQuery({
    queryKey: qk.leaderboard(orgId, cid ?? ''),
    queryFn: () => q.fetchLeaderboard(orgId, cid!),
    enabled: Boolean(cid),
  });

export const useFormSchemas = (orgId = demoOrgId()) =>
  useQuery({ queryKey: qk.formSchemas(orgId), queryFn: () => q.fetchFormSchemas(orgId) });

export const useMembers = (orgId = demoOrgId()) =>
  useQuery({ queryKey: qk.members(orgId), queryFn: () => q.fetchMembers(orgId) });

export const useAuditLog = (orgId = demoOrgId()) =>
  useQuery({ queryKey: qk.auditLog(orgId), queryFn: () => q.fetchAuditLog(orgId) });

export const useBadges = (earnedIds: string[] = [], orgId = demoOrgId()) =>
  useQuery({ queryKey: qk.badges(orgId), queryFn: () => q.fetchBadges(orgId, earnedIds) });

export const useCertificates = () =>
  useQuery({ queryKey: qk.certificates(), queryFn: () => q.fetchCertificates() });

export const useCurrentUser = (userId: string | undefined) =>
  useQuery({
    queryKey: qk.user(userId ?? ''),
    queryFn: () => q.fetchUser(userId!),
    enabled: Boolean(userId),
  });

/**
 * Hydrates the four per-challenge collections from one pre-joined document.
 *
 * The control room alone costs ~44 document reads if registrations,
 * submissions, rubric and leaderboard are each queried; this makes it 1.
 * Call it before the individual hooks on any screen that needs several of
 * them — they will then read straight from the cache it fills.
 */
export function useChallengeSnapshot(cid: string | undefined, orgId = demoOrgId()) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['org', orgId, 'challenge', cid ?? '', 'snapshot'],
    enabled: Boolean(cid),
    queryFn: async () => {
      const snap = await fetchChallengeSnapshot(cid!, orgId);
      if (snap) hydrateFromChallenge(qc, cid!, snap, orgId);
      return snap ?? null;
    },
  });
}

/**
 * TanStack Query keys. CONVENTIONS.md §4.
 *
 * Always hierarchical, always org-first: switching organizations invalidates
 * everything beneath it with one call, and it is structurally hard to leak
 * another tenant's cache. Never inline a key array in a component.
 */
export const qk = {
  org: (orgId: string) => ['org', orgId] as const,
  workspaces: (orgId: string) => ['org', orgId, 'workspaces'] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  auditLog: (orgId: string) => ['org', orgId, 'auditLog'] as const,
  badges: (orgId: string) => ['org', orgId, 'badges'] as const,
  formSchemas: (orgId: string) => ['org', orgId, 'formSchemas'] as const,

  challenges: (orgId: string) => ['org', orgId, 'challenges'] as const,
  challenge: (orgId: string, cid: string) => ['org', orgId, 'challenge', cid] as const,
  challengeBySlug: (orgId: string, slug: string) =>
    ['org', orgId, 'challenge', 'slug', slug] as const,

  registrations: (orgId: string, cid: string) =>
    ['org', orgId, 'challenge', cid, 'registrations'] as const,
  submissions: (orgId: string, cid: string) =>
    ['org', orgId, 'challenge', cid, 'submissions'] as const,
  rubric: (orgId: string, cid: string) =>
    ['org', orgId, 'challenge', cid, 'rubric'] as const,
  leaderboard: (orgId: string, cid: string) =>
    ['org', orgId, 'challenge', cid, 'leaderboard'] as const,

  user: (userId: string) => ['user', userId] as const,
  certificates: () => ['certificates'] as const,
} as const;

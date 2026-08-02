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

  /** The signed-in user's membership, which is what permissions resolve from. */
  member: (orgId: string, userId: string) => ['org', orgId, 'member', userId] as const,
  roles: (orgId: string) => ['org', orgId, 'roles'] as const,
  invites: (orgId: string) => ['org', orgId, 'invites'] as const,
  votes: (orgId: string, cid: string) => ['org', orgId, 'challenge', cid, 'votes'] as const,
  webhooks: (orgId: string) => ['org', orgId, 'webhooks'] as const,

  user: (userId: string) => ['user', userId] as const,
  certificates: () => ['certificates'] as const,

  /** In-app notification inbox, per user per org. */
  notifications: (orgId: string, userId: string) =>
    ['org', orgId, 'notifications', userId] as const,

  /** Every registration this user holds, across challenges. */
  myRegistrations: (orgId: string, userId: string) =>
    ['org', orgId, 'myRegistrations', userId] as const,

  /**
   * Every registration in the organization — the admin console's roster.
   *
   * The challenge ids are part of the key because the query fans out over them:
   * a challenge created or deleted changes the answer, and a key that ignored
   * that would serve a roster missing a whole competition until something else
   * happened to invalidate it.
   */
  allRegistrations: (orgId: string, challengeIds: string[]) =>
    ['org', orgId, 'allRegistrations', [...challengeIds].sort().join(',')] as const,
} as const;

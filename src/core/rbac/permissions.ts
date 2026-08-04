/**
 * The permission catalog and the built-in roles. PURE — no React, no Firebase.
 *
 * SPEC_RBAC §2–3. This list is the whole vocabulary: a permission that is not
 * here does not exist, and `Permission` being a union of literals means a typo
 * in a `can()` call is a compile error rather than a silent `false` that hides
 * a button forever.
 *
 * Permissions are **additive only** (SPEC_RBAC §1). There are no deny rules;
 * denial is the absence of a grant. That keeps resolution order-independent and
 * therefore testable.
 */

export const PERMISSIONS = [
  'org.read', 'org.update', 'org.delete', 'org.billing',
  'member.read', 'member.invite', 'member.manage',
  'role.manage',
  'workspace.create', 'workspace.update', 'workspace.delete',
  'challenge.read', 'challenge.create', 'challenge.update', 'challenge.delete', 'challenge.publish',
  'form.manage',
  'workflow.manage', 'workflow.migrate',
  'registration.read', 'registration.manage', 'registration.checkIn', 'registration.export',
  'submission.read', 'submission.manage', 'submission.assign',
  'score.read', 'score.write', 'score.override',
  'review.read', 'review.write',
  'leaderboard.read', 'leaderboard.manage',
  'result.publish',
  'reward.manage',
  'certificate.issue',
  'notification.send',
  'analytics.read',
  'audit.read',
  'storage.connect',
  'integration.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as Permission[];

export type BuiltInRoleId =
  | 'owner' | 'admin' | 'organizer' | 'judge' | 'reviewer' | 'volunteer' | 'viewer';

/** Administrative accounts manage competitions; they do not enter them. */
export const ADMINISTRATIVE_ROLE_IDS = ['owner', 'admin'] as const;

export function isAdministrativeRole(roleId: string): boolean {
  return (ADMINISTRATIVE_ROLE_IDS as readonly string[]).includes(roleId);
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  /** System roles are seeded, clonable, and not editable. SPEC_RBAC §3. */
  isSystem: boolean;
}

const ORGANIZER: Permission[] = [
  'org.read', 'member.read',
  'workspace.create', 'workspace.update',
  'challenge.read', 'challenge.create', 'challenge.update', 'challenge.publish',
  'form.manage', 'workflow.manage',
  'registration.read', 'registration.manage', 'registration.checkIn', 'registration.export',
  'submission.read', 'submission.assign',
  'score.read', 'review.read',
  'leaderboard.read', 'leaderboard.manage',
  'result.publish', 'reward.manage', 'certificate.issue',
  'notification.send', 'analytics.read',
];

/**
 * Judge deliberately cannot delete anything, publish results, or manage
 * registrations — SPEC_RBAC §3 "deliberate exclusions". Scoping to assigned
 * challenges is a separate mechanism (`scopedGrants`), not a different role.
 */
const JUDGE: Permission[] = [
  'org.read', 'challenge.read',
  'submission.read',
  'score.read', 'score.write',
  'review.read', 'review.write',
  'leaderboard.read',
];

/** A reviewer gives feedback but never a number that affects rank. */
const REVIEWER: Permission[] = [
  'org.read', 'challenge.read', 'submission.read', 'review.read', 'review.write',
];

const VOLUNTEER: Permission[] = [
  'org.read', 'challenge.read', 'registration.read', 'registration.checkIn',
];

const VIEWER: Permission[] = ['org.read', 'challenge.read', 'leaderboard.read', 'analytics.read'];

export const BUILT_IN_ROLES: Record<BuiltInRoleId, RoleDefinition> = {
  owner: {
    id: 'owner',
    name: 'Owner',
    description: 'Full control, including billing and deleting the organization. Exactly one per organization.',
    permissions: ALL,
    isSystem: true,
  },
  admin: {
    id: 'admin',
    name: 'Admin',
    description: 'Everything except billing and deleting the organization.',
    permissions: ALL.filter((p) => p !== 'org.delete' && p !== 'org.billing'),
    isSystem: true,
  },
  organizer: {
    id: 'organizer',
    name: 'Organizer',
    description: 'Creates and runs challenges end to end. Cannot manage members or roles.',
    permissions: ORGANIZER,
    isSystem: true,
  },
  judge: {
    id: 'judge',
    name: 'Judge',
    description: 'Scores submissions on challenges they are assigned to.',
    permissions: JUDGE,
    isSystem: true,
  },
  reviewer: {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Leaves qualitative feedback. Never submits a score.',
    permissions: REVIEWER,
    isSystem: true,
  },
  volunteer: {
    id: 'volunteer',
    name: 'Volunteer',
    description: 'Checks participants in. Cannot see scores.',
    permissions: VOLUNTEER,
    isSystem: true,
  },
  viewer: {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to the organization and its public challenges.',
    permissions: VIEWER,
    isSystem: true,
  },
};

export const BUILT_IN_ROLE_LIST: RoleDefinition[] = Object.values(BUILT_IN_ROLES);

/** Guards data arriving from Firestore, where a role id is just a string. */
export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

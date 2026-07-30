/**
 * Permission resolution. PURE — SPEC_RBAC §4.
 *
 * Effective permissions at a scope =
 *   union(org-role perms, direct perms, matching scoped-grant perms)
 *
 * Because grants are additive with no deny rules, the union is
 * order-independent: the same inputs always produce the same set regardless of
 * the sequence they are applied in. That property is what makes this testable
 * in isolation and is worth preserving — a deny rule would cost it.
 */
import { BUILT_IN_ROLES, isPermission, type Permission, type RoleDefinition } from './permissions';

export type ScopeType = 'org' | 'workspace' | 'challenge';

export interface Scope {
  type: ScopeType;
  id: string;
}

export interface ScopedGrant {
  scope: Scope;
  permissions: string[];
}

/** The membership shape this engine needs; the stored document may hold more. */
export interface MemberLike {
  roleIds: string[];
  directPermissions?: string[];
  scopedGrants?: ScopedGrant[];
  status: 'active' | 'invited' | 'suspended';
}

export interface ResolveInput {
  member: MemberLike | null | undefined;
  /** Custom roles from `organizations/{orgId}/roles`. Built-ins are implicit. */
  roles?: RoleDefinition[];
  scope: Scope;
}

/**
 * A grant applies at the scope it was made at, and at everything narrower.
 *
 * An org-scoped grant reaches every challenge in the org; a challenge-scoped
 * grant reaches only that challenge and never widens back out to the org. That
 * asymmetry is the whole point of scoping — a judge assigned to one challenge
 * must not thereby gain the same power over the next one.
 */
function grantApplies(grant: ScopedGrant, scope: Scope): boolean {
  if (grant.scope.type === 'org') return true;
  if (grant.scope.type === scope.type) return grant.scope.id === scope.id;
  // workspace grant + challenge scope: the caller must pass the workspace id as
  // part of the scope chain to widen it. Without that link, refuse rather than
  // guess — guessing here would silently grant access across a workspace.
  return false;
}

export function resolvePermissions(input: ResolveInput): Set<Permission> {
  const out = new Set<Permission>();
  const { member } = input;

  // A suspended or merely invited member has no permissions at all. This is the
  // one place status is allowed to matter; everything downstream is additive.
  if (!member || member.status !== 'active') return out;

  const custom = new Map((input.roles ?? []).map((r) => [r.id, r]));

  const add = (value: string) => {
    if (isPermission(value)) out.add(value);
    // An unknown permission string is ignored rather than thrown on: rules are
    // the real enforcement layer, and a stale role document must not crash a
    // screen. It cannot grant anything, because only catalog members are added.
  };

  for (const roleId of member.roleIds ?? []) {
    const role = custom.get(roleId) ?? BUILT_IN_ROLES[roleId as keyof typeof BUILT_IN_ROLES];
    role?.permissions.forEach(add);
  }

  member.directPermissions?.forEach(add);

  for (const grant of member.scopedGrants ?? []) {
    if (grantApplies(grant, input.scope)) grant.permissions.forEach(add);
  }

  return out;
}

export function can(perms: Set<Permission>, permission: Permission): boolean {
  return perms.has(permission);
}

export function canAny(perms: Set<Permission>, permissions: Permission[]): boolean {
  return permissions.some((p) => perms.has(p));
}

export function canAll(perms: Set<Permission>, permissions: Permission[]): boolean {
  return permissions.every((p) => perms.has(p));
}

/**
 * The set the *server* already computed, denormalized onto the member document
 * so a security rule can check membership in one `get()` rather than walking
 * roles (SPEC_RBAC §6, and the reason Q2 in STATUS.md accepts that read).
 *
 * Recomputed here from the same pure function, so client and rules cannot drift
 * apart without a test noticing.
 */
export function resolvedPermissionsFor(member: MemberLike, roles: RoleDefinition[] = []): Permission[] {
  return [...resolvePermissions({ member, roles, scope: { type: 'org', id: '*' } })].sort();
}

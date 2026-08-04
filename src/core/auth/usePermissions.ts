import { useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useMember, useRoles } from '@core/firebase/hooks';
import { isAdministrativeRole, resolvePermissions, can as canFn, type Permission, type Scope } from '@core/rbac';

/**
 * The signed-in user's permissions at a scope, resolved by the pure engine.
 *
 * Lives here rather than in `core/rbac` because that directory is React-free by
 * contract (hard rule 8) and the ESLint config enforces it. The engine stays
 * testable in isolation; this is the thin binding to it.
 *
 * **This is UX only** (SPEC_RBAC §4). Hiding a button is not security. Every
 * `can()` here has a twin in `firestore.rules`, and the rules are what actually
 * hold — a caller who forges a member document client-side still gets denied on
 * write, because rules read the *stored* document, not this one.
 */
/** Module-level so the default argument is a stable identity across renders. */
const DEFAULT_SCOPE: Scope = { type: 'org', id: '*' };

export function usePermissions(scope: Scope = DEFAULT_SCOPE) {
  const { user, ready } = useAuth();
  const { data: member, isLoading: memberLoading } = useMember(user?.uid);
  const { data: roles = [], isLoading: rolesLoading } = useRoles();

  // Depend on the scope's *fields*, not the object: callers routinely pass an
  // inline literal, and a fresh identity every render would recompute forever.
  const { type: scopeType, id: scopeId } = scope;
  const permissions = useMemo(
    () => resolvePermissions({ member, roles, scope: { type: scopeType, id: scopeId } }),
    [member, roles, scopeType, scopeId],
  );

  return useMemo(
    () => ({
      permissions,
      can: (permission: Permission) => canFn(permissions, permission),
      canAny: (list: Permission[]) => list.some((p) => permissions.has(p)),
      canAll: (list: Permission[]) => list.every((p) => permissions.has(p)),
      /** True once identity *and* membership have resolved. Screens that gate on
       *  a permission should wait for this rather than flashing a denied state. */
      ready: ready && !memberLoading && !rolesLoading,
      isMember: Boolean(member),
      isAdmin: Boolean(member?.roleIds.some(isAdministrativeRole)),
      isSignedIn: Boolean(user),
    }),
    [permissions, ready, memberLoading, rolesLoading, member, user],
  );
}

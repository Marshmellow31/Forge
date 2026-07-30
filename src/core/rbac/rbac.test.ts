import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS, BUILT_IN_ROLES, BUILT_IN_ROLE_LIST, isPermission,
  resolvePermissions, resolvedPermissionsFor, can, canAny, canAll,
  type MemberLike, type Permission, type RoleDefinition,
} from './index';

const orgScope = { type: 'org' as const, id: 'org_1' };

function member(over: Partial<MemberLike> = {}): MemberLike {
  return { roleIds: [], status: 'active', ...over };
}

describe('permission catalog', () => {
  it('has no duplicate entries', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('uses resource.action form throughout', () => {
    for (const p of PERMISSIONS) expect(p, `${p} is malformed`).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
  });

  it('recognises only catalog members', () => {
    expect(isPermission('challenge.create')).toBe(true);
    expect(isPermission('challenge.destroy')).toBe(false);
    expect(isPermission('')).toBe(false);
  });
});

describe('built-in roles', () => {
  it('gives Owner every permission in the catalog', () => {
    expect(new Set(BUILT_IN_ROLES.owner.permissions)).toEqual(new Set(PERMISSIONS));
  });

  it('withholds exactly billing and deletion from Admin', () => {
    const admin = new Set(BUILT_IN_ROLES.admin.permissions);
    const missing = PERMISSIONS.filter((p) => !admin.has(p));
    expect(missing.sort()).toEqual(['org.billing', 'org.delete']);
  });

  it('marks every built-in as a system role, so none is editable', () => {
    for (const role of BUILT_IN_ROLE_LIST) expect(role.isSystem).toBe(true);
  });

  it('grants only catalog permissions in every role', () => {
    for (const role of BUILT_IN_ROLE_LIST) {
      for (const p of role.permissions) {
        expect(isPermission(p), `${role.id} grants unknown ${p}`).toBe(true);
      }
    }
  });

  // SPEC_RBAC §3 "deliberate exclusions worth remembering".
  it('never lets a Judge delete, publish results, or export registrant PII', () => {
    const judge = new Set(BUILT_IN_ROLES.judge.permissions);
    for (const forbidden of ['challenge.delete', 'submission.manage', 'result.publish', 'registration.export'] as Permission[]) {
      expect(judge.has(forbidden), `judge wrongly has ${forbidden}`).toBe(false);
    }
  });

  it('never lets a Reviewer submit a score', () => {
    const reviewer = new Set(BUILT_IN_ROLES.reviewer.permissions);
    expect(reviewer.has('score.write')).toBe(false);
    expect(reviewer.has('review.write')).toBe(true);
  });

  it('never lets a Volunteer see scores', () => {
    const volunteer = new Set(BUILT_IN_ROLES.volunteer.permissions);
    expect(volunteer.has('score.read')).toBe(false);
    expect(volunteer.has('registration.checkIn')).toBe(true);
  });

  it('never lets an Organizer manage members or roles', () => {
    const organizer = new Set(BUILT_IN_ROLES.organizer.permissions);
    expect(organizer.has('member.manage')).toBe(false);
    expect(organizer.has('role.manage')).toBe(false);
    expect(organizer.has('challenge.create')).toBe(true);
  });

  it('gives Viewer no write permission of any kind', () => {
    for (const p of BUILT_IN_ROLES.viewer.permissions) {
      expect(p, `viewer has write-ish ${p}`).not.toMatch(/\.(create|update|delete|write|manage|publish|issue|send|invite|override|assign|checkIn|export|migrate|connect|billing)$/);
    }
  });
});

describe('resolvePermissions', () => {
  it('gives nothing to a member with no roles', () => {
    expect(resolvePermissions({ member: member(), scope: orgScope }).size).toBe(0);
  });

  it('gives nothing when there is no member at all', () => {
    expect(resolvePermissions({ member: null, scope: orgScope }).size).toBe(0);
    expect(resolvePermissions({ member: undefined, scope: orgScope }).size).toBe(0);
  });

  it('gives nothing to a suspended member, whatever their roles say', () => {
    const perms = resolvePermissions({ member: member({ roleIds: ['owner'], status: 'suspended' }), scope: orgScope });
    expect(perms.size).toBe(0);
  });

  it('gives nothing to an invited member who has not accepted', () => {
    expect(resolvePermissions({ member: member({ roleIds: ['admin'], status: 'invited' }), scope: orgScope }).size).toBe(0);
  });

  it('resolves a built-in role without needing it passed in', () => {
    const perms = resolvePermissions({ member: member({ roleIds: ['organizer'] }), scope: orgScope });
    expect(can(perms, 'challenge.create')).toBe(true);
    expect(can(perms, 'org.delete')).toBe(false);
  });

  it('unions two roles rather than letting the last one win', () => {
    const perms = resolvePermissions({ member: member({ roleIds: ['judge', 'volunteer'] }), scope: orgScope });
    expect(can(perms, 'score.write')).toBe(true);        // from judge
    expect(can(perms, 'registration.checkIn')).toBe(true); // from volunteer
  });

  it('is order-independent, which is what having no deny rules buys', () => {
    const a = resolvePermissions({ member: member({ roleIds: ['judge', 'organizer'] }), scope: orgScope });
    const b = resolvePermissions({ member: member({ roleIds: ['organizer', 'judge'] }), scope: orgScope });
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('adds direct permissions on top of roles', () => {
    const perms = resolvePermissions({
      member: member({ roleIds: ['viewer'], directPermissions: ['result.publish'] }),
      scope: orgScope,
    });
    expect(can(perms, 'result.publish')).toBe(true);
  });

  it('ignores an unknown permission string instead of throwing', () => {
    const perms = resolvePermissions({
      member: member({ roleIds: ['viewer'], directPermissions: ['challenge.launchRocket'] }),
      scope: orgScope,
    });
    expect(perms.has('challenge.launchRocket' as Permission)).toBe(false);
    expect(can(perms, 'org.read')).toBe(true);
  });

  it('ignores an unknown role id instead of throwing', () => {
    expect(() => resolvePermissions({ member: member({ roleIds: ['sorcerer'] }), scope: orgScope })).not.toThrow();
  });

  it('resolves a custom role passed in from Firestore', () => {
    const custom: RoleDefinition = {
      id: 'role_mc', name: 'Master of ceremonies', description: '',
      permissions: ['notification.send'], isSystem: false,
    };
    const perms = resolvePermissions({ member: member({ roleIds: ['role_mc'] }), roles: [custom], scope: orgScope });
    expect(can(perms, 'notification.send')).toBe(true);
  });

  it('lets a custom role shadow a built-in id, so an org can retune one', () => {
    const narrowed: RoleDefinition = {
      id: 'judge', name: 'Judge', description: '', permissions: ['submission.read'], isSystem: false,
    };
    const perms = resolvePermissions({ member: member({ roleIds: ['judge'] }), roles: [narrowed], scope: orgScope });
    expect(can(perms, 'score.write')).toBe(false);
  });
});

describe('scoped grants', () => {
  const scopedJudge = member({
    roleIds: ['viewer'],
    scopedGrants: [{ scope: { type: 'challenge', id: 'ch_1' }, permissions: ['score.write'] }],
  });

  it('applies a challenge grant on that challenge', () => {
    const perms = resolvePermissions({ member: scopedJudge, scope: { type: 'challenge', id: 'ch_1' } });
    expect(can(perms, 'score.write')).toBe(true);
  });

  it('does NOT leak that grant to a sibling challenge', () => {
    const perms = resolvePermissions({ member: scopedJudge, scope: { type: 'challenge', id: 'ch_2' } });
    expect(can(perms, 'score.write')).toBe(false);
  });

  it('does NOT widen a challenge grant back up to the org', () => {
    const perms = resolvePermissions({ member: scopedJudge, scope: orgScope });
    expect(can(perms, 'score.write')).toBe(false);
  });

  it('narrows an org-scoped grant down to every challenge', () => {
    const orgWide = member({
      roleIds: [],
      scopedGrants: [{ scope: { type: 'org', id: 'org_1' }, permissions: ['submission.read'] }],
    });
    expect(can(resolvePermissions({ member: orgWide, scope: { type: 'challenge', id: 'anything' } }), 'submission.read')).toBe(true);
  });
});

describe('can / canAny / canAll', () => {
  const perms = resolvePermissions({ member: member({ roleIds: ['judge'] }), scope: orgScope });

  it('can', () => {
    expect(can(perms, 'score.write')).toBe(true);
    expect(can(perms, 'org.delete')).toBe(false);
  });

  it('canAny is true when one matches', () => {
    expect(canAny(perms, ['org.delete', 'score.write'])).toBe(true);
    expect(canAny(perms, ['org.delete', 'org.billing'])).toBe(false);
    expect(canAny(perms, [])).toBe(false);
  });

  it('canAll requires every one', () => {
    expect(canAll(perms, ['score.write', 'review.write'])).toBe(true);
    expect(canAll(perms, ['score.write', 'org.delete'])).toBe(false);
    expect(canAll(perms, [])).toBe(true);
  });
});

describe('resolvedPermissionsFor', () => {
  it('produces the sorted denormalized array the member document stores', () => {
    const list = resolvedPermissionsFor(member({ roleIds: ['volunteer'] }));
    expect(list).toEqual([...list].sort());
    expect(list).toContain('registration.checkIn');
  });

  it('produces an empty list for a suspended member, so rules deny them', () => {
    expect(resolvedPermissionsFor(member({ roleIds: ['owner'], status: 'suspended' }))).toEqual([]);
  });

  it('matches what the client resolves, so rules and UI cannot drift', () => {
    const m = member({ roleIds: ['organizer'] });
    const denormalized = new Set(resolvedPermissionsFor(m));
    const live = resolvePermissions({ member: m, scope: orgScope });
    expect(denormalized).toEqual(live);
  });
});

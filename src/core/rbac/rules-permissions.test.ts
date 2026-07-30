import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERMISSIONS, BUILT_IN_ROLE_LIST, type Permission } from './index';

/**
 * Cross-checks `firestore.rules` against the permission catalog.
 *
 * A security rule can be wrong in a way nothing else catches: naming a
 * permission that does not exist. `hasPerm(orgId, 'workspace.manage')` is
 * perfectly valid rules syntax, deploys without complaint, and silently denies
 * every request forever — because no role grants a permission that is not in
 * the catalog.
 *
 * That exact bug shipped in this file's first version and was found by writing
 * this test, not by reading the rules. It is cheap insurance: the two lists
 * live in different languages and cannot be typechecked against each other.
 */

const rulesSource = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

/** Every `hasPerm(x, 'permission')` literal in the rules file. */
function permissionsUsedInRules(): string[] {
  const found = new Set<string>();
  const re = /hasPerm\(\s*[^,]+,\s*'([^']+)'\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(rulesSource)) !== null) found.add(match[1]);
  return [...found].sort();
}

describe('firestore.rules ↔ permission catalog', () => {
  const used = permissionsUsedInRules();

  it('finds the hasPerm calls at all — a zero here would make this test vacuous', () => {
    expect(used.length).toBeGreaterThan(10);
  });

  it('every permission the rules check exists in the catalog', () => {
    const catalog = new Set<string>(PERMISSIONS);
    const unknown = used.filter((p) => !catalog.has(p));
    expect(unknown, `firestore.rules checks permissions that do not exist: ${unknown.join(', ')}`)
      .toEqual([]);
  });

  it('every permission the rules check is granted by at least one role', () => {
    // A permission no role grants is unreachable: the rule can never pass.
    const granted = new Set(BUILT_IN_ROLE_LIST.flatMap((r) => r.permissions));
    const orphaned = used.filter((p) => !granted.has(p as Permission));
    expect(orphaned, `no built-in role grants: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('the owner role can satisfy every rule in the file', () => {
    const owner = new Set(BUILT_IN_ROLE_LIST.find((r) => r.id === 'owner')!.permissions);
    expect(used.filter((p) => !owner.has(p as Permission))).toEqual([]);
  });

  it('still denies the writes that must never be client-writable', () => {
    // Guards against someone "fixing" a denied write by relaxing the rule.
    for (const collection of ['snapshots', 'publicChallenges']) {
      const block = new RegExp(`match /${collection}/\\{[^}]+\\}[\\s\\S]*?\\n\\s*\\}`, 'm');
      const section = block.exec(rulesSource)?.[0] ?? '';
      expect(section, `${collection} block not found`).not.toBe('');
      expect(section, `${collection} became client-writable`).toMatch(/allow write: if false/);
    }
  });

  it('keeps the score ledger append-only (ADR-009)', () => {
    expect(rulesSource).toMatch(/match \/scores\/\{scoreId\}[\s\S]*?allow update, delete: if false/);
  });

  it('keeps audit logs write-once', () => {
    expect(rulesSource).toMatch(/match \/auditLogs\/\{logId\}[\s\S]*?allow update, delete: if false/);
  });

  it('still requires a verified email to redeem an invite (ADR-020)', () => {
    expect(rulesSource).toContain('email_verified == true');
  });

  it('still bounds the counter escape hatch to two keys (ADR-019)', () => {
    expect(rulesSource).toMatch(/onlyChanges\(\['counters', 'updatedAt'\]\)/);
  });

  it('flags the ADR-016 demo scaffolding so its removal is not forgotten', () => {
    // When this fails because the predicates are gone, delete the test — that
    // is the intended end state, and the failure is the reminder.
    expect(rulesSource).toContain('function isDemoOrg(orgId)');
  });
});

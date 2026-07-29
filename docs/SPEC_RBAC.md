# SPEC_RBAC.md — Roles, Permissions, Isolation

Permission-based, not role-based. Roles are *bundles* of permissions and exist
for human convenience only. Every check in code asks about a **permission**.

Lives in `src/core/rbac` (pure) + `firestore.rules` (enforcement).

---

## 1. Model

```
User ──▶ Member(org) ──▶ roleIds[] ──▶ Role ──▶ permissions[]
                     └──▶ directPermissions[]        (additive)
                     └──▶ scopedGrants[]             (workspace / challenge scope)
```

Effective permissions at a scope =
`union(org-role perms, direct perms, matching scoped-grant perms)`.

**Permissions are additive only.** There are no deny rules in v1. Denial is the
absence of a grant. Deny-overrides make resolution order-dependent and rules
untestable; if a real need appears, it gets an ADR.

## 2. Permission catalog

Format: `resource.action`. This list is the whole vocabulary — adding a
permission means adding a row here **and** a rules test.

| Permission | Allows |
|---|---|
| `org.read` | View organization |
| `org.update` | Edit org profile, branding |
| `org.delete` | Delete organization (owner only, always) |
| `org.billing` | Manage plan |
| `member.read` | View member list |
| `member.invite` | Invite members |
| `member.manage` | Change roles, suspend, remove |
| `role.manage` | Create/edit custom roles |
| `workspace.create` / `.update` / `.delete` | Workspace lifecycle |
| `challenge.create` / `.update` / `.delete` | Challenge lifecycle |
| `challenge.publish` | Make a challenge live |
| `form.manage` | Create/edit form schemas |
| `workflow.manage` | Create/edit workflow definitions |
| `workflow.migrate` | Move a live challenge to a new workflow version |
| `registration.read` | See registrant list + answers |
| `registration.manage` | Approve, reject, withdraw, disqualify |
| `registration.checkIn` | QR / attendance check-in |
| `registration.export` | Export registrant data (PII) |
| `submission.read` | View submissions |
| `submission.manage` | Delete / restore submissions |
| `submission.assign` | Assign submissions to judges |
| `score.read` | See scores |
| `score.write` | Submit scores |
| `score.override` | Change another judge's score (audited) |
| `review.read` / `review.write` | Qualitative reviews |
| `leaderboard.manage` | Change visibility, force recompute |
| `result.publish` | Publish final results |
| `reward.manage` | Badges, points, rewards |
| `certificate.issue` | Issue/revoke certificates |
| `notification.send` | Broadcast to participants |
| `analytics.read` | View analytics |
| `audit.read` | Read audit logs |
| `storage.connect` | Connect the org's storage account |
| `integration.manage` | Webhooks, Slack, Discord |

## 3. Built-in roles

| Role | Permissions |
|---|---|
| **Owner** | Everything, implicitly. Cannot be removed; exactly one per org; transferable. |
| **Admin** | All except `org.delete`, `org.billing` |
| **Organizer** | Challenge + form + workflow + registration + notification + analytics |
| **Judge** | `submission.read`, `score.read`, `score.write`, `review.*`, `challenge.read` — scoped to assigned challenges |
| **Reviewer** | `submission.read`, `review.read`, `review.write` — no scoring |
| **Volunteer** | `registration.read`, `registration.checkIn` |
| **Participant** | Implicit. Not a member role — derived from having a Registration. |
| **Viewer** | `org.read`, `challenge.read`, `leaderboard.read`, `analytics.read` |

Built-ins are seeded as documents in `organizations/{orgId}/roles` at org creation
so they can be **cloned into custom roles**, but built-ins themselves are
`isSystem: true` and not editable.

### Deliberate exclusions worth remembering

* Judge cannot delete anything, cannot publish results, cannot see registrant PII
  when blind judging is on.
* Volunteer can check people in but cannot see scores or publish anything.
* Reviewer gives feedback but never a number that affects rank.

## 4. Resolution (pure)

```ts
// core/rbac/resolve.ts — pure, no I/O
export function resolvePermissions(input: {
  member: Member;
  roles: Role[];
  scope: { type: 'org' | 'workspace' | 'challenge'; id: string };
}): Set<Permission>;

export function can(
  perms: Set<Permission>,
  permission: Permission,
): boolean;
```

Client usage:

```tsx
const { can } = usePermissions();            // resolved for the active scope
{can('result.publish') && <PublishButton />}
```

**This is UX only.** Hiding a button is not security. Every `can()` in the UI must
have a matching rule in `firestore.rules` or a check in the Cloud Function.
A PR that adds a `can()` without its server-side twin is incomplete.

## 5. Scoping

```ts
scopedGrants: [
  { scope: 'challenge', scopeId: 'chal_123', roleIds: ['judge'], permissions: [] }
]
```

A judge invited for one challenge gets a challenge-scoped grant, not an org-wide
Judge role. Resolution for scope `{type:'challenge', id:'chal_123'}` unions org
perms with grants whose `scopeId` matches, plus grants on the parent workspace.

Scope precedence: `org ⊆ workspace ⊆ challenge` (broader grants also apply
narrower). There is no narrowing — see §1, additive only.

## 6. Enforcement in Firestore rules

The problem: rules cannot iterate a permission set cheaply, and `get()` costs a
document read per evaluation (cached per request, but still billed).

**Two-tier strategy:**

1. **Custom claims fast path.** `onMemberWrite` maintains a compact claim:
   `{ orgs: { "<orgId>": "owner" | "admin" | "staff" | "member" } }`.
   Owner/admin checks resolve with zero reads. Claims are limited to 1000 bytes,
   so this stores a coarse tier only — roughly 40–60 orgs per user before
   truncation. Users beyond that fall back to tier 2 (correct, just slower).
2. **Resolved-permission array.** `member.resolvedPermissions: Permission[]` is
   denormalized by the same Function. Rules do
   `perm in memberDoc(orgId).data.resolvedPermissions`. One `get()`, cached for
   the rest of that request.

`resolvedPermissions` is **Function-written and client-immutable**:

```javascript
allow update: if hasPerm(orgId, 'member.manage')
  && !request.resource.data.diff(resource.data)
       .affectedKeys().hasAny(['resolvedPermissions', 'roleIds']);
```

Role changes go through a callable Function, never a direct client write. That
Function is the only writer of `roleIds` **and** `resolvedPermissions`, which
keeps them consistent by construction.

Claim propagation lags by up to one token refresh (≤ 1 h, or immediate on
`getIdToken(true)`). After any role change, the Function returns a flag telling
the client to force-refresh its token. Rules must never depend on claims alone
for anything destructive — tier 2 is the correctness path.

## 7. Isolation testing (Phase 0 deliverable)

A rules test suite that proves, for every collection in
[DATA_MODEL.md](DATA_MODEL.md):

1. A member of org A cannot read **any** document under org B.
2. A member of org A cannot write **any** document under org B.
3. An unauthenticated user reads only: public challenges, public profiles,
   certificates.
4. A judge cannot write `result.publish`-gated documents.
5. A participant cannot read another participant's submission.
6. A participant cannot write their own `finalRank`, `finalScore`, or
   `currentStageKey`.
7. Nobody can write `leaderboard/*` or `certificates/*` from a client.
8. Nobody can update or delete an `auditLogs` document.

These tests run in CI against the emulator. **A rule without a test does not
ship.** This is the single highest-leverage test suite in the project — a tenancy
leak is the one bug that ends the product.

## 8. Audit requirements

These actions must write an `AuditLog` entry in the same batch as the mutation:

`member.manage` · `role.manage` · `score.override` · `result.publish` ·
`certificate.issue` (and revoke) · `registration.manage` (disqualify) ·
`workflow.migrate` · `challenge.delete` · `storage.connect` · `registration.export`

If the audit write fails, the mutation fails. They are one transaction.

// Assertions come from `assertFails` / `assertSucceeds`, which throw on their
// own — `expect` is deliberately unused here.
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionGroup,
  getDocs, query, where,
} from 'firebase/firestore';

/**
 * Security rules test suite. DATA_MODEL.md §6 and SPEC_RBAC §7 require these;
 * Phase 0 deliverable 0.6 lists them as an exit criterion.
 *
 * **The one bug that ends this product is a tenant leak**, so the isolation
 * cases here are not box-ticking — they are the reason the suite exists. Every
 * `can()` in the UI is meant to have a twin here.
 *
 * Run with `npm run test:rules`, which wraps this in `firebase emulators:exec`.
 * The emulator needs **JDK 21+**.
 */

const PROJECT_ID = 'forge-rules-test';
const ORG = 'org_a';
const OTHER_ORG = 'org_b';
const CHALLENGE = 'ch_1';

let env: RulesTestEnvironment;

/** A signed-in context with a verified email, as Google sign-in produces. */
const asUser = (uid: string, email?: string) =>
  env.authenticatedContext(uid, email ? { email, email_verified: true } : undefined).firestore();

const asGuest = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();

  // Seed through a context that bypasses rules, so setup cannot accidentally
  // depend on the rules under test.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    for (const orgId of [ORG, OTHER_ORG]) {
      await setDoc(doc(db, 'organizations', orgId), {
        name: orgId, slug: orgId, status: 'active', ownerId: 'u_owner',
      });
      await setDoc(doc(db, 'organizations', orgId, 'challenges', CHALLENGE), {
        orgId, title: 'A challenge', slug: 'a-challenge', visibility: 'organization',
        status: 'published', counters: { registrations: 0, submissions: 0, reviewsCompleted: 0, reviewsPending: 0 },
      });
    }

    // An organizer in org_a only.
    await setDoc(doc(db, 'organizations', ORG, 'members', 'u_organizer'), {
      userId: 'u_organizer', status: 'active', roleIds: ['organizer'],
      resolvedPermissions: [
        'org.read', 'challenge.read', 'challenge.create', 'challenge.update', 'challenge.delete',
        'registration.read', 'submission.read', 'form.manage', 'member.read', 'member.invite',
      ],
    });

    // A plain member with no permissions at all.
    await setDoc(doc(db, 'organizations', ORG, 'members', 'u_member'), {
      userId: 'u_member', status: 'active', roleIds: ['viewer'], resolvedPermissions: ['org.read'],
    });

    // A suspended member — active membership is not the same as existing.
    await setDoc(doc(db, 'organizations', ORG, 'members', 'u_suspended'), {
      userId: 'u_suspended', status: 'suspended', roleIds: ['organizer'],
      resolvedPermissions: ['challenge.update'],
    });

    await setDoc(doc(db, 'organizations', ORG, 'invites', 'invited@example.com'), {
      email: 'invited@example.com', status: 'pending',
      roleIds: ['organizer'], resolvedPermissions: ['challenge.create'],
      invitedBy: 'u_organizer', acceptedBy: null, acceptedAt: null,
    });
  });
});

/* ================================================================== *
 * Tenant isolation — the cases that matter most                       *
 * ================================================================== */

describe('tenant isolation', () => {
  it('denies an org_a organizer reading org_b members', async () => {
    const db = asUser('u_organizer');
    await assertFails(getDoc(doc(db, 'organizations', OTHER_ORG, 'members', 'u_organizer')));
  });

  it('denies an org_a organizer writing an org_b challenge', async () => {
    const db = asUser('u_organizer');
    await assertFails(
      setDoc(doc(db, 'organizations', OTHER_ORG, 'challenges', 'ch_new'), { title: 'Intruder' }),
    );
  });

  it('denies reading another org\'s registrations', async () => {
    const db = asUser('u_organizer');
    await assertFails(getDocs(collection(db, 'organizations', OTHER_ORG, 'challenges', CHALLENGE, 'registrations')));
  });

  it('denies an org_a organizer reading org_b audit logs', async () => {
    const db = asUser('u_organizer');
    await assertFails(getDocs(collection(db, 'organizations', OTHER_ORG, 'auditLogs')));
  });
});

/* ================================================================== *
 * Challenge lifecycle                                                 *
 * ================================================================== */

describe('challenges', () => {
  it('lets an organizer create one', async () => {
    const db = asUser('u_organizer');
    await assertSucceeds(setDoc(doc(db, 'organizations', ORG, 'challenges', 'ch_new'), {
      orgId: ORG, title: 'New', slug: 'new', visibility: 'organization', status: 'draft',
    }));
  });

  it('denies a permissionless member creating one', async () => {
    const db = asUser('u_member');
    await assertFails(setDoc(doc(db, 'organizations', ORG, 'challenges', 'ch_new'), { title: 'Nope' }));
  });

  it('denies a suspended member with the permission on paper', async () => {
    const db = asUser('u_suspended');
    await assertFails(updateDoc(doc(db, 'organizations', ORG, 'challenges', CHALLENGE), { title: 'Hijacked' }));
  });

  it('denies a signed-out visitor creating one', async () => {
    await assertFails(setDoc(doc(asGuest(), 'organizations', ORG, 'challenges', 'ch_new'), { title: 'Nope' }));
  });

  it('denies deletion without challenge.delete', async () => {
    await assertFails(deleteDoc(doc(asUser('u_member'), 'organizations', ORG, 'challenges', CHALLENGE)));
  });
});

/* ================================================================== *
 * ADR-019 — the counters escape hatch, and its bounds                 *
 * ================================================================== */

describe('counters (ADR-019)', () => {
  it('lets any signed-in user bump a counter', async () => {
    const db = asUser('u_member');
    await assertSucceeds(updateDoc(doc(db, 'organizations', ORG, 'challenges', CHALLENGE), {
      'counters.registrations': 1,
      updatedAt: new Date(),
    }));
  });

  it('denies a signed-out visitor bumping a counter', async () => {
    await assertFails(updateDoc(doc(asGuest(), 'organizations', ORG, 'challenges', CHALLENGE), {
      'counters.registrations': 1, updatedAt: new Date(),
    }));
  });

  // The whole point of `hasOnly`: the door opens exactly two keys wide.
  it('denies smuggling a title change alongside a counter bump', async () => {
    const db = asUser('u_member');
    await assertFails(updateDoc(doc(db, 'organizations', ORG, 'challenges', CHALLENGE), {
      'counters.registrations': 1,
      title: 'Hijacked',
      updatedAt: new Date(),
    }));
  });

  it('denies changing status through the counter door', async () => {
    const db = asUser('u_member');
    await assertFails(updateDoc(doc(db, 'organizations', ORG, 'challenges', CHALLENGE), {
      'counters.submissions': 5, status: 'completed', updatedAt: new Date(),
    }));
  });
});

/* ================================================================== *
 * Registrations and submissions                                       *
 * ================================================================== */

describe('registrations', () => {
  const regPath = (uid: string) => ['organizations', ORG, 'challenges', CHALLENGE, 'registrations', uid] as const;

  it('lets a user register themselves', async () => {
    const db = asUser('u_member');
    await assertSucceeds(setDoc(doc(db, ...regPath('u_member')), { userId: 'u_member', status: 'pending' }));
  });

  it('denies registering as somebody else', async () => {
    const db = asUser('u_member');
    await assertFails(setDoc(doc(db, ...regPath('u_someone_else')), { userId: 'u_someone_else', status: 'pending' }));
  });

  it('denies a userId that disagrees with the document id', async () => {
    const db = asUser('u_member');
    await assertFails(setDoc(doc(db, ...regPath('u_member')), { userId: 'u_other', status: 'pending' }));
  });

  it('denies a signed-out visitor registering', async () => {
    await assertFails(setDoc(doc(asGuest(), ...regPath('anon')), { userId: 'anon' }));
  });

  it('lets a user read their own registration but not a stranger\'s', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...regPath('u_other')), { userId: 'u_other', status: 'active' });
    });
    const db = asUser('u_member');
    await assertFails(getDoc(doc(db, ...regPath('u_other'))));
  });

  it('lets an organizer with registration.read see any registration', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...regPath('u_other')), { userId: 'u_other', status: 'active' });
    });
    await assertSucceeds(getDoc(doc(asUser('u_organizer'), ...regPath('u_other'))));
  });
});

/* ================================================================== *
 * ADR-018 — the collection-group read                                 *
 * ================================================================== */

describe('my registrations across challenges (ADR-018)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // One of mine in each org, and one belonging to somebody else.
      for (const orgId of [ORG, OTHER_ORG]) {
        await setDoc(doc(db, 'organizations', orgId, 'challenges', CHALLENGE, 'registrations', 'u_member'), {
          userId: 'u_member', status: 'active',
        });
      }
      await setDoc(doc(db, 'organizations', ORG, 'challenges', CHALLENGE, 'registrations', 'u_other'), {
        userId: 'u_other', status: 'active',
      });
    });
  });

  it('allows a group query filtered to my own userId', async () => {
    const db = asUser('u_member');
    await assertSucceeds(getDocs(
      query(collectionGroup(db, 'registrations'), where('userId', '==', 'u_member')),
    ));
  });

  it('denies an unfiltered group query — that would span every tenant', async () => {
    await assertFails(getDocs(collectionGroup(asUser('u_member'), 'registrations')));
  });

  it('denies a group query filtered to someone else', async () => {
    const db = asUser('u_member');
    await assertFails(getDocs(
      query(collectionGroup(db, 'registrations'), where('userId', '==', 'u_other')),
    ));
  });

  it('denies a signed-out group query', async () => {
    await assertFails(getDocs(
      query(collectionGroup(asGuest(), 'registrations'), where('userId', '==', 'u_member')),
    ));
  });
});

describe('submissions', () => {
  const subPath = (sid: string) => ['organizations', ORG, 'challenges', CHALLENGE, 'submissions', sid] as const;

  it('lets a user submit their own entry', async () => {
    const db = asUser('u_member');
    await assertSucceeds(setDoc(doc(db, ...subPath('u_member_submission')), {
      userId: 'u_member', status: 'draft',
    }));
  });

  it('denies submitting on behalf of another user', async () => {
    const db = asUser('u_member');
    await assertFails(setDoc(doc(db, ...subPath('x')), { userId: 'u_other', status: 'draft' }));
  });

  it('freezes a submitted entry — only a draft is editable', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...subPath('frozen')), { userId: 'u_member', status: 'submitted' });
    });
    await assertFails(updateDoc(doc(asUser('u_member'), ...subPath('frozen')), { answers: { a: 1 } }));
  });

  it('allows editing a draft you own', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...subPath('mine')), { userId: 'u_member', status: 'draft' });
    });
    await assertSucceeds(updateDoc(doc(asUser('u_member'), ...subPath('mine')), { answers: { a: 1 } }));
  });

  it('never allows deleting a submission, even by its owner', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...subPath('mine')), { userId: 'u_member', status: 'draft' });
    });
    await assertFails(deleteDoc(doc(asUser('u_member'), ...subPath('mine'))));
  });
});

/* ================================================================== *
 * Append-only score ledger (ADR-009)                                  *
 * ================================================================== */

describe('scores are append-only', () => {
  const scorePath = (id: string) => ['organizations', ORG, 'challenges', CHALLENGE, 'scores', id] as const;

  it('denies overwriting an existing score event', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...scorePath('s1')), { judgeId: 'u_judge', totalWeighted: 80 });
    });
    await assertFails(updateDoc(doc(asUser('u_judge'), ...scorePath('s1')), { totalWeighted: 100 }));
  });

  it('denies deleting a score event', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...scorePath('s1')), { judgeId: 'u_judge', totalWeighted: 80 });
    });
    await assertFails(deleteDoc(doc(asUser('u_judge'), ...scorePath('s1'))));
  });

  it('denies writing a score attributed to another judge', async () => {
    await assertFails(setDoc(doc(asUser('u_judge'), ...scorePath('s2')), { judgeId: 'u_other_judge' }));
  });
});

/* ================================================================== *
 * ADR-020 — invite redemption is the only self-service membership     *
 * ================================================================== */

describe('invite redemption (ADR-020)', () => {
  const memberPath = (uid: string) => ['organizations', ORG, 'members', uid] as const;

  it('lets an invitee claim exactly what the invite granted', async () => {
    const db = asUser('u_invitee', 'invited@example.com');
    await assertSucceeds(setDoc(doc(db, ...memberPath('u_invitee')), {
      userId: 'u_invitee', status: 'active',
      roleIds: ['organizer'], resolvedPermissions: ['challenge.create'],
    }));
  });

  // If only one test in this file survived, it should be this one.
  it('DENIES claiming more than the invite granted', async () => {
    const db = asUser('u_invitee', 'invited@example.com');
    await assertFails(setDoc(doc(db, ...memberPath('u_invitee')), {
      userId: 'u_invitee', status: 'active',
      roleIds: ['owner'], resolvedPermissions: ['org.delete', 'challenge.create'],
    }));
  });

  it('denies redeeming an invite addressed to someone else', async () => {
    const db = asUser('u_attacker', 'attacker@example.com');
    await assertFails(setDoc(doc(db, ...memberPath('u_attacker')), {
      userId: 'u_attacker', status: 'active',
      roleIds: ['organizer'], resolvedPermissions: ['challenge.create'],
    }));
  });

  it('denies redemption when the email is unverified', async () => {
    const db = env.authenticatedContext('u_spoof', {
      email: 'invited@example.com', email_verified: false,
    }).firestore();
    await assertFails(setDoc(doc(db, ...memberPath('u_spoof')), {
      userId: 'u_spoof', status: 'active',
      roleIds: ['organizer'], resolvedPermissions: ['challenge.create'],
    }));
  });

  it('denies self-issuing a membership with no invite at all', async () => {
    const db = asUser('u_nobody', 'nobody@example.com');
    await assertFails(setDoc(doc(db, ...memberPath('u_nobody')), {
      userId: 'u_nobody', status: 'active', roleIds: ['admin'], resolvedPermissions: ['org.update'],
    }));
  });

  it('denies a member escalating their own roles after joining', async () => {
    await assertFails(updateDoc(doc(asUser('u_member'), ...memberPath('u_member')), {
      roleIds: ['owner'], resolvedPermissions: ['org.delete'],
    }));
  });

  it('lets a member update only their own display name', async () => {
    await assertSucceeds(updateDoc(doc(asUser('u_member'), ...memberPath('u_member')), {
      displayName: 'New Name', updatedAt: new Date(),
    }));
  });

  it('denies smuggling roleIds alongside a display-name change', async () => {
    await assertFails(updateDoc(doc(asUser('u_member'), ...memberPath('u_member')), {
      displayName: 'New Name', roleIds: ['owner'], updatedAt: new Date(),
    }));
  });
});

/* ================================================================== *
 * ROADMAP 1.2 — creating an organization                              *
 * ================================================================== */

describe('organization creation', () => {
  it('lets a signed-in user create an org they own', async () => {
    await assertSucceeds(setDoc(doc(asUser('u_founder'), 'organizations', 'org_new'), {
      name: 'New Org', slug: 'new-org', ownerId: 'u_founder', status: 'active',
    }));
  });

  it('denies creating an org owned by someone else', async () => {
    await assertFails(setDoc(doc(asUser('u_founder'), 'organizations', 'org_new'), {
      name: 'New Org', slug: 'new-org', ownerId: 'u_victim', status: 'active',
    }));
  });

  it('denies a signed-out visitor creating an org', async () => {
    await assertFails(setDoc(doc(asGuest(), 'organizations', 'org_new'), {
      name: 'New Org', ownerId: 'anon', status: 'active',
    }));
  });

  it('lets the named owner make themselves a member of their new org', async () => {
    const db = asUser('u_founder');
    await assertSucceeds(setDoc(doc(db, 'organizations', 'org_new'), {
      name: 'New Org', slug: 'new-org', ownerId: 'u_founder', status: 'active',
    }));
    await assertSucceeds(setDoc(doc(db, 'organizations', 'org_new', 'members', 'u_founder'), {
      userId: 'u_founder', status: 'active', roleIds: ['owner'], resolvedPermissions: ['org.delete'],
    }));
  });

  // The escalation this path could enable if it were written carelessly.
  it('DENIES making yourself owner-member of an org you do not own', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', 'org_theirs'), {
        name: 'Theirs', ownerId: 'u_someone_else', status: 'active',
      });
    });
    await assertFails(setDoc(doc(asUser('u_attacker'), 'organizations', 'org_theirs', 'members', 'u_attacker'), {
      userId: 'u_attacker', status: 'active', roleIds: ['owner'], resolvedPermissions: ['org.delete'],
    }));
  });

  it('denies making somebody else a member via the owner path', async () => {
    const db = asUser('u_founder');
    await assertSucceeds(setDoc(doc(db, 'organizations', 'org_new'), {
      name: 'New Org', ownerId: 'u_founder', status: 'active',
    }));
    await assertFails(setDoc(doc(db, 'organizations', 'org_new', 'members', 'u_friend'), {
      userId: 'u_friend', status: 'active', roleIds: ['owner'], resolvedPermissions: ['org.delete'],
    }));
  });

  it('never allows deleting an organization', async () => {
    await assertFails(deleteDoc(doc(asUser('u_organizer'), 'organizations', ORG)));
  });
});

/* ================================================================== *
 * Workspaces (ADR-023 — the permissions the rules name must exist)    *
 * ================================================================== */

describe('workspaces', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', ORG, 'members', 'u_wsadmin'), {
        userId: 'u_wsadmin', status: 'active', roleIds: ['organizer'],
        resolvedPermissions: ['workspace.create', 'workspace.update'],
      });
    });
  });

  it('lets someone with workspace.create make one', async () => {
    await assertSucceeds(setDoc(
      doc(asUser('u_wsadmin'), 'organizations', ORG, 'workspaces', 'ws_new'),
      { name: 'New workspace', challengeCount: 0 },
    ));
  });

  it('denies creating one without the permission', async () => {
    await assertFails(setDoc(
      doc(asUser('u_member'), 'organizations', ORG, 'workspaces', 'ws_new'),
      { name: 'Nope' },
    ));
  });

  // workspace.delete is a distinct permission from workspace.update.
  it('denies deleting one with only create and update', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', ORG, 'workspaces', 'ws_x'), { name: 'X' });
    });
    await assertFails(deleteDoc(doc(asUser('u_wsadmin'), 'organizations', ORG, 'workspaces', 'ws_x')));
  });
});

/* ================================================================== *
 * Notifications                                                       *
 * ================================================================== */

describe('notification inbox', () => {
  const notifPath = (uid: string, id: string) =>
    ['organizations', ORG, 'members', uid, 'notifications', id] as const;

  it('lets a user write and read their own', async () => {
    const db = asUser('u_member');
    await assertSucceeds(setDoc(doc(db, ...notifPath('u_member', 'n1')), {
      userId: 'u_member', type: 'announcement', title: 'Hi', body: 'There', readAt: null,
    }));
    await assertSucceeds(getDoc(doc(db, ...notifPath('u_member', 'n1'))));
  });

  it('denies reading another user\'s inbox', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...notifPath('u_other', 'n1')), { userId: 'u_other', title: 'Private' });
    });
    await assertFails(getDoc(doc(asUser('u_member'), ...notifPath('u_other', 'n1'))));
  });

  it('allows marking read, and nothing else', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...notifPath('u_member', 'n1')), {
        userId: 'u_member', title: 'Hi', readAt: null,
      });
    });
    const db = asUser('u_member');
    await assertSucceeds(updateDoc(doc(db, ...notifPath('u_member', 'n1')), {
      readAt: new Date(), updatedAt: new Date(),
    }));
    await assertFails(updateDoc(doc(db, ...notifPath('u_member', 'n1')), { title: 'Rewritten' }));
  });
});

/* ================================================================== *
 * Documents no client may ever write                                  *
 * ================================================================== */

/* ================================================================== *
 * ADR-022 — result publishing, and the two rules it relaxes           *
 * ================================================================== */

describe('result publishing (ADR-022)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // A publisher holds result.publish + certificate.issue; the organizer
      // fixture above deliberately does not.
      await setDoc(doc(ctx.firestore(), 'organizations', ORG, 'members', 'u_publisher'), {
        userId: 'u_publisher', status: 'active', roleIds: ['organizer'],
        resolvedPermissions: ['result.publish', 'certificate.issue', 'registration.manage'],
      });
    });
  });

  it('lets a publisher write a leaderboard page', async () => {
    await assertSucceeds(setDoc(
      doc(asUser('u_publisher'), 'organizations', ORG, 'challenges', CHALLENGE, 'leaderboard', 'page_0'),
      { page: 0, entries: [] },
    ));
  });

  it('denies a leaderboard write without result.publish', async () => {
    await assertFails(setDoc(
      doc(asUser('u_organizer'), 'organizations', ORG, 'challenges', CHALLENGE, 'leaderboard', 'page_0'),
      { page: 0, entries: [] },
    ));
  });

  it('denies deleting a leaderboard page even with result.publish', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', ORG, 'challenges', CHALLENGE, 'leaderboard', 'page_0'), { page: 0 });
    });
    await assertFails(deleteDoc(
      doc(asUser('u_publisher'), 'organizations', ORG, 'challenges', CHALLENGE, 'leaderboard', 'page_0'),
    ));
  });

  it('lets a publisher issue a certificate for their own org', async () => {
    await assertSucceeds(setDoc(doc(asUser('u_publisher'), 'certificates', 'c1'), {
      orgId: ORG, userId: 'u_member', rank: 1, awardLabel: 'Winner', revoked: false,
    }));
  });

  // The one that matters: `certificates` is a global collection, so the path
  // carries no tenant and the payload is the only thing naming an org.
  it('DENIES minting a certificate that claims to be from another org', async () => {
    await assertFails(setDoc(doc(asUser('u_publisher'), 'certificates', 'c2'), {
      orgId: OTHER_ORG, userId: 'u_member', rank: 1, awardLabel: 'Winner', revoked: false,
    }));
  });

  it('denies issuing a certificate without certificate.issue', async () => {
    await assertFails(setDoc(doc(asUser('u_member'), 'certificates', 'c3'), {
      orgId: ORG, userId: 'u_member', rank: 1, awardLabel: 'Winner', revoked: false,
    }));
  });

  it('denies moving an existing certificate to another org', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'certificates', 'c4'), { orgId: ORG, revoked: false });
    });
    await assertFails(updateDoc(doc(asUser('u_publisher'), 'certificates', 'c4'), { orgId: OTHER_ORG }));
  });

  it('never allows deleting a certificate — revoke, never erase', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'certificates', 'c5'), { orgId: ORG, revoked: false });
    });
    await assertFails(deleteDoc(doc(asUser('u_publisher'), 'certificates', 'c5')));
  });

  it('keeps certificates world-readable, since verification links are public', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'certificates', 'c6'), { orgId: ORG, revoked: false });
    });
    await assertSucceeds(getDoc(doc(asGuest(), 'certificates', 'c6')));
  });
});

describe('Function-only collections', () => {

  it('denies writing a publicChallenges entry', async () => {
    await assertFails(setDoc(doc(asUser('u_organizer'), 'publicChallenges', 'ch_1'), { title: 'Fake' }));
  });

  it('denies writing an org snapshot', async () => {
    await assertFails(setDoc(
      doc(asUser('u_organizer'), 'organizations', ORG, 'snapshots', 'index'), { challenges: [] },
    ));
  });

  it('denies editing or deleting an audit log entry', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', ORG, 'auditLogs', 'a1'), { action: 'x' });
    });
    const db = asUser('u_organizer');
    await assertFails(updateDoc(doc(db, 'organizations', ORG, 'auditLogs', 'a1'), { action: 'y' }));
    await assertFails(deleteDoc(doc(db, 'organizations', ORG, 'auditLogs', 'a1')));
  });

  it('denies a client touching user.stats', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'u_member'), { email: 'a@b.c', stats: { points: 0 } });
    });
    await assertFails(updateDoc(doc(asUser('u_member'), 'users', 'u_member'), { stats: { points: 9999 } }));
  });
});

# DATA_MODEL.md — Firestore Schema

Authoritative. If code and this file disagree, fix one of them in the same PR.

**Tenancy rule:** all tenant data lives under `organizations/{orgId}/…`.
Global collections are the explicitly enumerated exceptions in §3.

---

## 1. Collection map

```
users/{userId}                                        global identity
users/{userId}/memberships/{orgId}                    reverse index: "my orgs"
users/{userId}/participations/{participationId}       cross-org portfolio
users/{userId}/notifications/{notificationId}
usernames/{username}                                  uniqueness index

organizations/{orgId}
  ├── members/{userId}
  ├── roles/{roleId}                                  built-in + custom
  ├── settings/{settingId}                            singletons: branding|storage|notifications|billing
  ├── workspaces/{workspaceId}
  ├── formSchemas/{formSchemaId}
  ├── workflowDefinitions/{workflowDefinitionId}
  ├── challengeTemplates/{templateId}
  ├── badges/{badgeId}
  ├── rewards/{rewardId}
  ├── auditLogs/{auditLogId}
  └── challenges/{challengeId}
        ├── registrations/{registrationId}
        ├── submissions/{submissionId}
        ├── reviews/{reviewId}
        ├── scores/{scoreId}
        ├── leaderboard/{pageId}                      materialized, paginated
        └── announcements/{announcementId}

publicChallenges/{challengeId}                        discovery index (denormalized)
publicProfiles/{username}                             portfolio index (denormalized)
certificates/{certificateId}                          public verification (org-agnostic URL)
```

**Why subcollections over `orgId` fields:** security rules read the path, so
isolation is structural rather than conditional. A missing `where('orgId','==',…)`
cannot leak data because the path itself cannot address another tenant.
Trade-off: cross-org queries need `collectionGroup` (rare, rule-gated) or the
denormalized global indexes above. See ADR-001.

## 2. Document shapes

All documents carry:

```ts
interface BaseDoc {
  id: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;         // userId
  schemaVersion: number;     // shape version of THIS document type
}
```

### users/{userId}

```ts
interface User extends BaseDoc {
  email: string;
  displayName: string;
  username: string | null;        // claimed later; unique via usernames/
  photoURL: string | null;
  bio: string | null;
  isPublic: boolean;              // controls publicProfiles mirror
  stats: {
    challengesEntered: number;
    challengesWon: number;
    submissions: number;
    points: number;
    badges: number;
    certificates: number;
    currentStreakDays: number;
    longestStreakDays: number;
  };
  lastActiveAt: Timestamp;
}
```

`stats` is denormalized and updated by Function only. Never client-writable.

### organizations/{orgId}

```ts
interface Organization extends BaseDoc {
  name: string;
  slug: string;                   // unique, url-safe
  description: string;
  logoUrl: string | null;
  type: 'education' | 'company' | 'community' | 'creator' | 'nonprofit' | 'other';
  ownerId: string;
  memberCount: number;            // sharded counter mirror
  challengeCount: number;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended';
}
```

### organizations/{orgId}/settings/{settingId}

Fixed ids: `branding`, `storage`, `notifications`, `billing`.

```ts
interface BrandingSettings { primaryColor: string; accentColor: string; logoUrl: string|null; bannerUrl: string|null; customDomain: string|null; }

interface StorageSettings {
  provider: 'googleDrive' | 'firebase' | 's3' | 'r2';
  connected: boolean;
  connectedAccountEmail: string | null;
  rootFolderId: string | null;     // provider container
  // NEVER store tokens here. Refresh tokens live in Secret Manager, keyed by orgId.
}
```

### organizations/{orgId}/members/{userId}

```ts
interface Member extends BaseDoc {
  userId: string;
  email: string;
  displayName: string;             // denormalized for member lists
  photoURL: string | null;
  roleIds: string[];               // org-scope roles
  directPermissions: Permission[]; // additive grants
  scopedGrants: Array<{            // narrower than org scope
    scope: 'workspace' | 'challenge';
    scopeId: string;
    roleIds: string[];
    permissions: Permission[];
  }>;
  status: 'invited' | 'active' | 'suspended';
  joinedAt: Timestamp | null;
}
```

### organizations/{orgId}/challenges/{challengeId}

```ts
interface Challenge extends BaseDoc {
  workspaceId: string;
  title: string;
  slug: string;
  description: string;             // markdown
  rules: string;                   // markdown
  bannerUrl: string | null;
  category: string;                // free-form, org-defined
  tags: string[];

  visibility: 'public' | 'unlisted' | 'organization' | 'invite';
  status: 'draft' | 'published' | 'running' | 'judging' | 'completed' | 'archived' | 'cancelled';

  workflowDefinitionId: string;
  workflowVersion: number;         // PINNED

  timeline: {
    registrationOpensAt: Timestamp | null;
    registrationClosesAt: Timestamp | null;
    submissionOpensAt: Timestamp | null;
    submissionClosesAt: Timestamp | null;
    reviewOpensAt: Timestamp | null;
    reviewClosesAt: Timestamp | null;
    resultsAt: Timestamp | null;
  };

  participation: {
    mode: 'individual' | 'team' | 'both';
    teamSize: { min: number; max: number } | null;
    maxParticipants: number | null;
    requiresApproval: boolean;
  };

  leaderboard: {
    mode: 'hidden' | 'live' | 'afterClose' | 'topN' | 'public';
    topN: number | null;
    groupBy: string | null;        // a form field key, e.g. "department"
  };

  rewardSummary: string | null;
  judgeIds: string[];              // denormalized for fast queue queries

  counters: {                      // Function-maintained
    registrations: number;
    submissions: number;
    reviewsCompleted: number;
    reviewsPending: number;
  };

  publishedAt: Timestamp | null;
}
```

### organizations/{orgId}/formSchemas/{formSchemaId}

Shape defined in [SPEC_FORM_ENGINE.md](SPEC_FORM_ENGINE.md). Published versions
are immutable; edits create a new document version.

### organizations/{orgId}/challenges/{cid}/registrations/{registrationId}

`registrationId` = `userId` for individual mode (guarantees one entry per user,
enforceable in rules without a query).

```ts
interface Registration extends BaseDoc {
  challengeId: string;
  userId: string;                  // individual, or team captain
  team: {                          // null in individual mode; present from day 1 to avoid migration
    id: string;
    name: string;
    memberIds: string[];
  } | null;

  status: 'pending' | 'active' | 'withdrawn' | 'disqualified' | 'eliminated' | 'winner';

  currentStageKey: string;
  stageHistory: Array<{
    stageKey: string;
    enteredAt: Timestamp;
    exitedAt: Timestamp | null;
    outcome: 'advanced' | 'eliminated' | 'withdrew' | 'pending';
    decidedBy: string | null;      // userId or 'system'
  }>;

  formSchemaId: string;
  formSchemaVersion: number;       // PINNED
  answers: Record<string, unknown>;// keyed by field key
  files: FileRef[];

  checkedInAt: Timestamp | null;
  finalRank: number | null;
  finalScore: number | null;
}
```

### …/submissions/{submissionId}

```ts
interface Submission extends BaseDoc {
  challengeId: string;
  registrationId: string;
  userId: string;
  stageKey: string;

  formSchemaId: string;
  formSchemaVersion: number;       // PINNED
  answers: Record<string, unknown>;
  files: FileRef[];

  status: 'draft' | 'submitted' | 'underReview' | 'reviewed' | 'rejected';
  submittedAt: Timestamp | null;
  isLate: boolean;

  attemptNumber: number;
  clientMutationId: string;        // idempotency key for offline replay
  anonymizedLabel: string;         // e.g. "Entry #0042" — used in blind judging
}
```

### …/reviews/{reviewId} and …/scores/{scoreId}

`reviewId` = `${submissionId}_${judgeId}` — one review per judge per submission,
enforceable in rules without a query.

```ts
interface Review extends BaseDoc {
  submissionId: string;
  registrationId: string;
  judgeId: string;
  stageKey: string;
  status: 'assigned' | 'inProgress' | 'submitted' | 'recused';
  criteriaScores: Array<{ criterionId: string; score: number; comment: string | null }>;
  totalRaw: number;
  totalWeighted: number;
  comment: string | null;
  recommendation: 'advance' | 'eliminate' | 'undecided';
  submittedAt: Timestamp | null;
  timeSpentSeconds: number;
}
```

`scores` is an **append-only** ledger of individual score events (who, when, old,
new) used for audit and to make offline replay safe. Never overwrite a score;
write a new event and let aggregation take the latest per `(judge, criterion)`.

### …/leaderboard/{pageId}

`pageId` = `page_0`, `page_1`, … (50 entries each) plus `meta`.

```ts
interface LeaderboardPage extends BaseDoc {
  page: number;
  groupKey: string | null;         // when grouped by a field
  entries: Array<{
    rank: number;
    registrationId: string;
    userId: string;
    displayName: string;           // denormalized
    photoURL: string | null;
    teamName: string | null;
    score: number;
    tiebreakers: number[];
    change: number;                // rank delta since last computation
  }>;
  computedAt: Timestamp;
  strategyId: string;
}
```

### certificates/{certificateId} (global, public-readable)

```ts
interface Certificate extends BaseDoc {
  orgId: string;
  orgName: string;
  challengeId: string;
  challengeTitle: string;
  userId: string;
  recipientName: string;
  rank: number | null;
  awardLabel: string;              // "Winner", "Participant", "Runner-up"
  issuedAt: Timestamp;
  templateId: string;
  fileRef: FileRef | null;         // rendered PDF
  verificationHash: string;        // sha256 of canonical payload, signed by Function
  revoked: boolean;
}
```

Public read is intentional: `/{certificateId}` is the verification URL. It
exposes only the fields above — never the org's other data.

### organizations/{orgId}/auditLogs/{auditLogId}

```ts
interface AuditLog extends BaseDoc {
  actorId: string;
  actorEmail: string;
  action: string;                  // 'result.publish', 'member.remove', 'score.override'
  targetType: string;
  targetId: string;
  before: unknown | null;
  after: unknown | null;
  ip: string | null;
  userAgent: string | null;
}
```

Write-once. Rules: `allow create: if hasPerm(...); allow update, delete: if false;`

## 3. Global collections and why each is allowed

| Collection | Justification |
|---|---|
| `users` | Identity is cross-org by definition; the portfolio is the moat |
| `usernames` | Uniqueness index; documents contain only `{ userId }` |
| `publicChallenges` | Discovery must query across tenants; contains only fields the org marked public |
| `publicProfiles` | Same, opt-in via `user.isPublic` |
| `certificates` | Verification URLs must work without org context |

Anything not on this list must be org-scoped. Adding to this list requires an ADR.

## 4. Denormalization contract

| Denormalized field | Source of truth | Kept in sync by |
|---|---|---|
| `member.displayName/photoURL` | `users/{uid}` | `onUserUpdate` Function (batched) |
| `challenge.counters.*` | Sharded counters | `onRegistrationWrite` / `onSubmissionWrite` |
| `user.stats.*` | Aggregate of participations | `onResultPublish` |
| `publicChallenges/*` | `organizations/*/challenges/*` | `onChallengeWrite`, only when `visibility === 'public'` |
| `leaderboard pages` | `scores` | `onScoreWrite` (30 s debounce) |

Rule: **anything denormalized is Function-written and client-read-only.** No
exceptions; a client-writable denormalized field is a data-integrity bug waiting.

## 5. Required composite indexes

Commit these to `firestore.indexes.json` as they are introduced.

| Collection | Fields | Serves |
|---|---|---|
| `challenges` | `status ASC, timeline.registrationClosesAt ASC` | "closing soon" |
| `challenges` | `workspaceId ASC, status ASC, createdAt DESC` | workspace board |
| `registrations` | `status ASC, currentStageKey ASC` | stage cohorts |
| `registrations` | `userId ASC, createdAt DESC` | "my registrations" |
| `submissions` | `stageKey ASC, status ASC, submittedAt ASC` | judge queue (FIFO) |
| `reviews` | `judgeId ASC, status ASC` | a judge's pending work |
| `publicChallenges` | `category ASC, timeline.registrationClosesAt ASC` | discovery |
| `auditLogs` | `actorId ASC, createdAt DESC` | audit trail |

## 6. Security-rule skeleton

```javascript
rules_version = '2';
service cloud.firestore {
  function isSignedIn() { return request.auth != null; }
  function uid() { return request.auth.uid; }

  function memberDoc(orgId) {
    return get(/databases/$(database)/documents/organizations/$(orgId)/members/$(uid()));
  }
  function isMember(orgId) {
    return isSignedIn() && exists(/databases/$(database)/documents/organizations/$(orgId)/members/$(uid()))
           && memberDoc(orgId).data.status == 'active';
  }
  // Fast path: compact custom claim avoids a get() for the common owner/admin case.
  function claimRole(orgId) { return request.auth.token.orgs[orgId]; }
  function hasPerm(orgId, perm) {
    return claimRole(orgId) == 'owner'
        || perm in memberDoc(orgId).data.resolvedPermissions;
  }

  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if isSignedIn();
      allow create, update: if uid() == userId
        && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['stats']);
      allow delete: if false;
    }

    match /organizations/{orgId} {
      allow read: if isMember(orgId) || resource.data.status == 'active';
      allow update: if hasPerm(orgId, 'org.update');
      allow delete: if false;

      match /members/{memberId} {
        allow read: if isMember(orgId);
        allow write: if hasPerm(orgId, 'member.manage');
      }

      match /challenges/{cid} {
        allow read: if isMember(orgId) || resource.data.visibility == 'public';
        allow create: if hasPerm(orgId, 'challenge.create');
        allow update: if hasPerm(orgId, 'challenge.update');
        allow delete: if hasPerm(orgId, 'challenge.delete');

        match /registrations/{rid} {
          allow read:   if rid == uid() || hasPerm(orgId, 'registration.read');
          allow create: if rid == uid() && registrationWindowOpen(orgId, cid);
          allow update: if (rid == uid() && onlyOwnEditableFields())
                        || hasPerm(orgId, 'registration.manage');
        }

        match /submissions/{sid} {
          allow read:   if resource.data.userId == uid() || hasPerm(orgId, 'submission.read');
          allow create: if request.resource.data.userId == uid() && submissionWindowOpen(orgId, cid);
          allow update: if resource.data.userId == uid() && resource.data.status == 'draft';
        }

        match /scores/{scoreId} {
          allow read:   if hasPerm(orgId, 'score.read');
          allow create: if hasPerm(orgId, 'score.write');
          allow update, delete: if false;              // append-only ledger
        }

        match /leaderboard/{pageId} {
          allow read: if leaderboardVisible(orgId, cid);
          allow write: if false;                        // Functions only
        }
      }

      match /auditLogs/{logId} {
        allow read: if hasPerm(orgId, 'audit.read');
        allow create: if isMember(orgId);
        allow update, delete: if false;
      }
    }

    match /certificates/{certId} {
      allow read: if true;                              // public verification
      allow write: if false;                            // Functions only
    }
  }
}
```

**Every rule above must have an emulator test before it ships.** A rules test
suite that proves cross-tenant reads fail is a Phase 0 deliverable.

## 7. Migration policy

* `schemaVersion` on every document. Readers must tolerate `n-1`.
* Migrations are additive first: add field → backfill → switch reads → remove old
  field in a later release. Never a destructive single-step migration.
* Backfills run as idempotent Functions, resumable by cursor, logged to
  `auditLogs`.

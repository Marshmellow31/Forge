# ARCHITECTURE.md

How the system is laid out and why. Read with [BRAIN.md](BRAIN.md) for intent and
[DATA_MODEL.md](DATA_MODEL.md) for persistence.

---

## 1. Shape of the system

```
┌──────────────────────────────────────────────────────────┐
│  Browser (React PWA, installable, offline-capable)       │
│                                                          │
│  app/      routing · providers · error boundaries        │
│  modules/  feature verticals (challenges, judging, …)    │
│  core/     PURE ENGINES  (forms, workflow, rbac,         │
│            judging, storage, sync, firebase adapter)     │
│  shared/   ui primitives · hooks · utils · types         │
└───────┬──────────────────────────┬───────────────────────┘
        │ Firestore SDK            │ HTTPS
        │ (realtime + offline)     │
┌───────▼──────────────┐   ┌───────▼────────────────────────┐
│ Firebase             │   │ Cloud Functions (minimal)      │
│  Auth (Google)       │   │  · mint Drive upload session   │
│  Firestore + Rules   │   │  · aggregate leaderboards      │
│  FCM                 │   │  · publish results / certs     │
└──────────────────────┘   │  · resolve stage advancement   │
                           │  · audit log writes            │
                           └───────┬────────────────────────┘
                                   │ OAuth (server-held refresh token)
                           ┌───────▼────────────────────────┐
                           │ Customer storage               │
                           │  Google Drive (MVP)            │
                           │  S3 / R2 / Firebase (later)    │
                           └────────────────────────────────┘
```

**Client-heavy by design.** Firestore's realtime + offline persistence does most
of the work. Cloud Functions exist only for the four things the client cannot be
trusted with: secrets, aggregation authority, cross-document consistency, and
publication.

## 2. Layering rules (lint-enforced)

```
app  ──▶  modules  ──▶  core  ──▶  shared
```

| Layer | May import | Contains | Must not contain |
|---|---|---|---|
| `app` | everything | Router, providers, layouts, error boundaries | Business logic |
| `modules` | `core`, `shared` | Feature verticals: UI + hooks + data access for one domain area | Imports of sibling modules |
| `core` | `shared` | Pure engines + the Firebase adapter | React components, feature knowledge |
| `shared` | — | Design-system primitives, generic hooks, utils, base types | Anything domain-specific |

Enforce with `eslint-plugin-boundaries`. A violation fails CI.

**Why "no module imports another module":** challenges, judging and leaderboards
all want each other. Once they import each other, the dependency graph becomes a
ball of mud and the "configurable, extensible" promise dies. Cross-module needs
go through a `core` contract or a shared type.

## 3. Folder tree (create exactly this)

```
src/
├── app/
│   ├── main.tsx
│   ├── App.tsx                  the route tree (no separate router/ yet — ADR-015)
│   ├── theme.ts                 MUI theme, derived from shared/design/tokens.ts
│   ├── index.css                fonts, keyframes, base element styles
│   ├── providers/               AppProviders — Query + Auth + snapshot hydration
│   └── layouts/
│       └── AppShell.tsx         THE shell — sidebar on desktop, bottom nav on mobile
│
├── modules/
│   ├── auth/                    sign-in, session, account
│   ├── organizations/           create org, settings, branding, members
│   ├── workspaces/
│   ├── challenges/              CRUD, templates, publish
│   ├── forms/                   BUILDER ui + RENDERER ui (uses core/forms)
│   ├── workflow/                stage designer ui (uses core/workflow)
│   ├── registrations/
│   ├── submissions/
│   ├── judging/                 judge queue, rubric ui, blind mode
│   ├── leaderboards/
│   ├── rewards/                 badges, points, certificates
│   ├── notifications/
│   ├── analytics/
│   ├── participants/            participant home, my entries, awards
│   ├── profile/                 public portfolio
│   └── discovery/               landing + public challenge browse
│
├── core/
│   ├── forms/                   field registry · schema types · zod compiler · condition evaluator
│   │                            + validateSchema.ts (cycle + integrity gate)   PURE, TESTED
│   ├── workflow/                stage machine · advancement rules · pure transitions  (not built)
│   ├── rbac/                    permission catalog · built-in roles · resolve()  PURE, TESTED
│   ├── challenges/              slug + id generation · default stages           PURE, TESTED
│   ├── drive/                   Drive link parsing · FileRef · cover URLs (ADR-017)  PURE, TESTED
│   ├── judging/                 strategy registry · aggregation · rank computation  (not built)
│   ├── auth/                    AuthContext · usePermissions   ◀ React lives here, not in the engines
│   ├── storage/                 the StorageProvider interface + providers/     (not built — see ADR-017)
│   ├── sync/                    THE write choke point · idempotency · notification delivery
│   └── firebase/                app init · typed refs · queries · writes · mutations · snapshots
│
├── shared/
│   ├── design/
│   │   └── tokens.ts            ◀ THE ONLY PLACE A HEX IS WRITTEN (moved here, ADR-021)
│   ├── ui/                      primitives.tsx (Hero, StatTile, StatusPill,
│   │                            TableHead, EmptyState…) · Icon.tsx
│   │                            · ErrorBoundary · NotificationBell
│   │                            · CoverImage · DriveLinkInput · PwaPrompts
│   ├── hooks/                   useDebounce, useMediaQuery, useLocalStorage  (not built)
│   ├── utils/                   date, id, result<T,E>, assert, invariant     (not built)
│   └── types/                   domain.ts — the UI-facing types every screen consumes
│
├── mock/                        SEED SOURCE ONLY — read by scripts/seed.ts, never
│                                by the running app. Nothing in core/ may import it.
│
└── config/                      env parsing (zod), feature flags, constants

tests/rules/                     emulator security-rules suite (needs JDK 21)
scripts/                         seed.ts · generate-icons.ts
functions/                       Cloud Functions — NOT PRESENT (Spark plan; see ADR-019)
firestore.rules
firestore.indexes.json
public/icons/                    PWA icons, generated by `npm run icons`
docs/
```

### Inside a module (uniform shape)

```
modules/challenges/
├── components/          presentational + composed UI
├── hooks/               useChallenges, useChallenge, useCreateChallenge
├── api/                 Firestore reads/writes for THIS module only
├── types.ts             module-local types (shared ones go to core/shared)
├── schemas.ts           Zod schemas for this module's documents
└── index.ts             the module's public surface — nothing else is importable
```

## 4. Data flow: a submission, end to end

```
1. Participant opens challenge stage
2. modules/forms/Renderer reads FormSchema (version-pinned) from cache/Firestore
3. core/forms compiles schema → Zod validator + visibility graph
4. React Hook Form drives inputs from the field registry
5. File field → core/storage.initUpload()
     → Cloud Function mints a resumable Drive session URL (token never reaches browser)
     → browser PUTs bytes DIRECTLY to Drive
     → completeUpload() returns a FileRef
6. Submit → core/sync enqueues the mutation (IndexedDB)
7. Online → replay writes submissions/{id} with { schemaVersion, answers, files[] }
8. Firestore rules verify: member? stage open? permission submission.create? own registration?
9. Cloud Function trigger → workflow engine evaluates advancement → updates registration
10. Judges' queue updates in realtime
```

**The load-bearing detail is step 5.** Bytes never touch our infrastructure. That
single choice is what makes the free tier viable.

## 5. Rendering and routing

* Routes are lazy per module — the admin bundle never ships to participants.
* Three route trees: `/` (public + discovery), `/app` (participant),
  `/org/:orgId` (admin/judge). Guards resolve org membership and permissions
  before the tree mounts.
* The active organization lives in `OrgProvider` and is part of every TanStack
  Query key. Switching orgs invalidates cleanly rather than leaking cache.

## 6. State ownership

| State | Owner | Notes |
|---|---|---|
| Server data | TanStack Query | Key convention in [CONVENTIONS.md](CONVENTIONS.md) |
| Realtime data (leaderboard, judge queue) | Firestore `onSnapshot` → Query cache | Subscribe in a hook, never a component |
| Form state | React Hook Form | Never mirrored into global state |
| Session / active org | React Context | Two small providers, no store library |
| Offline queue | IndexedDB via `core/sync` | Source of truth while offline |
| URL state (filters, tabs, page) | React Router search params | Shareable, back-button correct |

No Redux/Zustand until something genuinely needs it. Record an ADR if it does.

## 7. Cloud Functions — the minimal set

| Function | Trigger | Why it cannot be client-side |
|---|---|---|
| `mintUploadSession` | HTTPS callable | Holds the org's OAuth refresh token |
| `onScoreWrite` | Firestore trigger | Aggregation authority; prevents score tampering |
| `publishResults` | HTTPS callable | Atomic multi-doc write + notification fan-out |
| `advanceStage` | Callable + scheduled | Authoritative workflow transition |
| `issueCertificate` | Callable | Signs the verification hash |
| `onMemberWrite` | Firestore trigger | Syncs compact custom claims for rule fast-path |
| `scheduledReminders` | Cron | Deadline notifications |

If you are about to add a ninth function, ask whether rules + client can do it.

## 8. Performance budget

| Metric | Target |
|---|---|
| Initial route JS (participant) | < 200 KB gzipped |
| LCP on 3G, mid-tier Android | < 2.5 s |
| Firestore reads per dashboard load | < 15 |
| Form render for 50 fields | < 100 ms |
| Leaderboard page size | 50 rows per document |

## 9. Scaling notes

* **Hot documents:** a challenge's participant counter is a write hotspot at
  registration open. Use a **sharded counter** (10 shards) not a single field.
* **Leaderboards:** never compute by client query. Materialized, paginated,
  recomputed by Function with a 30 s debounce window.
* **Fan-out notifications:** batched via FCM topics per challenge, not per-user
  loops.
* **Index discipline:** every composite query must have an entry in
  `firestore.indexes.json` committed alongside the query.

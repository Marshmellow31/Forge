# SPEC_OFFLINE.md — Offline-First & PWA

The target user is on a phone, on campus wifi, at a deadline, with 400 other
people. **Loss of connectivity must never lose user input.**

Lives in `src/core/sync` + Workbox service worker config.

---

## 1. What must work offline

| Capability | Offline behaviour |
|---|---|
| Browse cached challenges | Read from Firestore's IndexedDB persistence |
| Open a form | Schema cached at first view; renders and validates locally |
| Fill and save a draft | Written to IndexedDB immediately |
| Submit | Enqueued as a mutation; replayed on reconnect |
| Upload a file | Queued; Workbox Background Sync retries the resumable PUT |
| Check in (volunteer, QR) | Queued; replayed |
| View my registrations | Cached |
| Judge scoring | Queued; ledger design makes replay safe |
| Leaderboards | Last-known snapshot, marked stale |

**Never offline:** result publishing, role changes, storage connection, anything
requiring server authority. Those show a "requires connection" state.

## 2. Layers

```
┌───────────────────────────────────────────────┐
│ Workbox service worker                        │
│  · precache app shell (Vite manifest)         │
│  · runtime cache: images, fonts, schemas      │
│  · Background Sync queue for file uploads     │
├───────────────────────────────────────────────┤
│ Firestore offline persistence                 │
│  · IndexedDB-backed; reads + simple writes    │
│  · handles cache-first reads automatically    │
├───────────────────────────────────────────────┤
│ core/sync — OUR mutation queue (Dexie)        │
│  · the authority for participant writes       │
│  · idempotency, ordering, conflict policy     │
└───────────────────────────────────────────────┘
```

**Why our own queue on top of Firestore's:** Firestore's offline writes are
fire-and-forget with no user-visible state, no ordering guarantee across
documents, and no way to run a Cloud Function precondition. A submission is a
multi-step operation (upload files → validate → write submission → trigger
advancement) that Firestore's queue cannot express. See ADR-007.

## 3. The mutation queue

```ts
interface QueuedMutation {
  id: string;                       // clientMutationId — the idempotency key
  type: MutationType;
  orgId: string;
  payload: unknown;                 // Zod-validated before enqueue
  createdAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  lastError: string | null;
  status: 'pending' | 'inFlight' | 'failed' | 'conflicted' | 'done';
  dependsOn: string[];              // other mutation ids that must land first
}

type MutationType =
  | 'registration.create' | 'registration.update'
  | 'submission.saveDraft' | 'submission.submit'
  | 'review.saveDraft' | 'review.submit' | 'score.write'
  | 'checkIn.record' | 'profile.update';
```

**Rules:**
* Every mutation carries a client-generated `clientMutationId` (uuid v4),
  persisted on the target document. The server treats a repeat as a no-op.
  Retries are therefore always safe — this is the whole design.
* `dependsOn` handles the real ordering case: a submission depends on its file
  uploads completing. The queue is a small DAG, drained in topological order.
* Backoff: 1 s, 2 s, 4 s, 8 s, 30 s, 60 s, then hourly. Cap at 24 h, then
  `failed` and surface it to the user with a retry button. Never silently drop.
* The queue survives a browser restart. It is inspectable from a debug panel.

## 4. Conflict policy — per mutation type

There is no single correct policy. Choosing one globally is the bug.

| Mutation | Policy |
|---|---|
| `submission.saveDraft` | Last-write-wins on the whole draft (single author) |
| `submission.submit` | Server wins if already submitted; client shows "already submitted" |
| `score.write` | **Append-only** — no conflict is possible by construction |
| `review.saveDraft` | Last-write-wins per judge (single author per review doc) |
| `registration.update` | Field-level merge; server wins on server-owned fields (`status`, `currentStageKey`, `finalRank`) |
| `checkIn.record` | First-write-wins; later duplicates are no-ops |
| `profile.update` | Last-write-wins |

Server-owned fields are stripped from any client payload before send. A client
that tries to write `currentStageKey` is rejected by rules, not by trust.

## 5. Deadline handling — the honesty problem

A participant submits offline at 23:58 and reconnects at 00:03. Was it on time?

**Policy:** the submission records both `clientSubmittedAt` and
`serverReceivedAt`. `isLate` is computed **server-side** from
`serverReceivedAt` against the stage window, but the queued-at timestamp is
preserved and shown to the admin. Admins get a "submitted offline before
deadline, received after" state and a one-click grace decision.

Do not trust the client clock for lateness. Do not silently discard the client's
claim either — surface both and let a human decide. Every alternative here is
either exploitable or unfair.

## 6. Service worker strategy

| Asset | Strategy |
|---|---|
| App shell (JS/CSS) | Precache, cache-first, versioned by Vite hash |
| Form schemas | Stale-while-revalidate, 7-day expiry |
| Org branding / logos | Cache-first, 30-day expiry |
| Challenge banners | Cache-first, 30-day, max 60 entries |
| Firestore | Not intercepted — SDK handles its own persistence |
| File uploads | Background Sync queue, retry 24 h |
| API/Function calls | Network-only; queued by `core/sync` when offline |

Update flow: new SW installs → app shows a non-blocking "Update available"
toast → user taps → `skipWaiting()` + reload. **Never auto-reload mid-form.**

## 7. PWA requirements

* `manifest.webmanifest`: name, short_name, icons (192/512/maskable), theme and
  background colours, `display: standalone`, `start_url: /app`.
* Per-organization theming applies at runtime; the manifest stays generic until
  white-label (Phase 3).
* Installable: passes Lighthouse PWA audit.
* iOS: `apple-touch-icon`, splash screens, and an explicit note that
  Background Sync is unsupported on iOS Safari — the fallback is
  **retry-on-app-foreground**, which must be implemented, not assumed.

## 8. UX contract

The user must always know what state their data is in.

| State | Indicator |
|---|---|
| Online, synced | Nothing (silence is the success state) |
| Offline | Persistent banner: "Offline — your work is saved on this device" |
| Pending mutations | Badge with count, tappable to a queue detail view |
| Syncing | Inline progress on the affected item |
| Failed | Inline error + retry, never a toast that disappears |
| Conflict | Explicit dialog showing both values; user chooses |

**Optimistic UI everywhere.** TanStack Query `onMutate` applies the change
locally, the queue handles durability, and rollback happens only on a terminal
failure — not on a retryable one.

## 9. Testing requirements

| Test | Why |
|---|---|
| Queue survives page reload with pending mutations | Core promise |
| Replaying the same `clientMutationId` twice creates one document | Idempotency |
| `dependsOn` ordering: submission never lands before its uploads | DAG correctness |
| Score replay out of order yields the latest value | Ledger design |
| Offline draft → reconnect → submit produces exactly one submission | End-to-end |
| Server-owned fields stripped from client payloads | Security |
| Lighthouse PWA audit passes | Installability |
| Queue drains 100 mutations without exhausting rate limits | Scale |

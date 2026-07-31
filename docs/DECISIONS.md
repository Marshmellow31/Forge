# DECISIONS.md — Architecture Decision Record

Append-only. Never edit a decided ADR; supersede it with a new one and mark the
old `Superseded by ADR-NNN`.

Format: Context → Decision → Consequences → Alternatives rejected.

---

## ADR-001 — Org-scoped subcollections for tenant isolation
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Multi-tenant Firestore has two shapes: top-level collections with an
`orgId` field, or subcollections under `organizations/{orgId}`.

**Decision.** All tenant data lives under `organizations/{orgId}/…`. Five global
collections are enumerated exceptions ([DATA_MODEL.md §3](DATA_MODEL.md)).

**Consequences.**
* Isolation is structural. A forgotten `where('orgId','==',x)` cannot leak data,
  because the path cannot address another tenant.
* Security rules read the path — simpler and cheaper to evaluate.
* Cross-tenant queries need `collectionGroup` (rule-gated, rare) or the
  denormalized global indexes.
* Adding a global collection now requires an ADR. That friction is intentional.

**Rejected.** Flat collections with `orgId`: one missing filter is a tenancy
breach, and the rule for every query becomes a conditional rather than a path.

---

## ADR-002 — Files live in customer storage; we store references
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Submissions are media-heavy (videos, ZIPs, design files). Hosting
them is the dominant cost driver and would make a free tier impossible.

**Decision.** Files upload directly from the browser to the organization's own
Google Drive. We persist `FileRef` metadata only. Bytes never transit our
infrastructure.

**Consequences.**
* Marginal storage cost per org ≈ 0. A free tier is viable.
* Organizations own and retain their data — a genuine trust advantage, and it
  means deleting a tenant never destroys customer files.
* We inherit Drive's rate limits and its sharing model's rough edges.
* Requires a Cloud Function to mint upload sessions (a token must never reach the
  browser).

**Rejected.** Firebase Storage as default: simple, but the cost curve kills the
free tier at the first video contest.

---

## ADR-003 — Published schemas are immutable; edits create a new version
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Admins will edit forms and workflows after people have already
submitted against them.

**Decision.** `FormSchema` and `WorkflowDefinition` carry a `version`. Publishing
freezes that version. Every `Registration` and `Submission` pins the exact
version it was created against. Only cosmetic fields may be edited in place.

**Consequences.**
* Historical submissions always render and validate correctly.
* Storage grows with versions (cheap — these are small documents).
* Readers must always fetch `(id, version)`. Fetching "latest" is a bug class we
  accept the need to police in review.

**Rejected.** Mutable schemas with a migration script: silently re-interprets
past answers, which is unacceptable when results are contested.

---

## ADR-004 — Core engines are pure
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Form validation, workflow advancement, permission resolution and
score aggregation decide who wins. They must be testable and defensible.

**Decision.** `core/forms`, `core/workflow`, `core/rbac`, `core/judging` contain
no Firebase, no React, no I/O, no `Date.now()`, no `Math.random()`. Clocks and
seeds are injected parameters.

**Consequences.**
* Fast, exhaustive unit tests without an emulator.
* The same code runs in the client (preview/optimistic) and in Cloud Functions
  (authoritative) with identical results.
* A contested result can be replayed exactly, including seeded tiebreakers.
* Slightly more plumbing at call sites.

---

## ADR-005 — Permission-based access control, additive only
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Roles alone are too coarse. The brief explicitly asks for
configurable permissions ("Judge can score, cannot delete").

**Decision.** Permissions are the primitive; roles are named bundles. Custom
roles per org. Grants are **additive only** — no deny rules.

**Consequences.**
* Resolution is a set union: order-independent, trivially testable.
* Rules check `perm in member.resolvedPermissions`.
* Genuinely-needed denials must be modelled as narrower grants instead.

**Rejected.** Deny-overrides: makes resolution order-dependent and rules nearly
impossible to reason about or test.

---

## ADR-006 — Materialized, paginated leaderboards
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Ranking requires every review in the challenge. Client-side ranking
at 500 participants × 3 judges = 1 500 reads *per viewer*.

**Decision.** A Cloud Function recomputes on score write (30 s debounce) and
writes `leaderboard/page_N` documents of 50 entries each.

**Consequences.**
* One read per viewer per page.
* Up to 30 s staleness on "live" leaderboards — acceptable, and shown as a
  "last updated" timestamp.
* Pagination avoids the 1 MB document limit at scale.
* Recomputation cost is bounded by debouncing, not by viewer count.

---

## ADR-007 — Our own mutation queue on top of Firestore offline persistence
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Firestore's offline writes are fire-and-forget: no user-visible
state, no cross-document ordering, no way to run a server-side precondition.
A submission is a multi-step operation (upload → validate → write → advance).

**Decision.** `core/sync` maintains an explicit IndexedDB queue with idempotency
keys, a `dependsOn` DAG, per-type conflict policies, and visible status.

**Consequences.**
* Users can see and retry pending work; nothing fails silently.
* Ordering guarantees (files before submission) are expressible.
* Requires `clientMutationId` on documents and server-side dedup.
* Duplicated responsibility with Firestore's queue — we use Firestore's for
  reads and simple writes, ours for participant-facing operations.

---

## ADR-008 — Field types via a registry, not a union switch
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** ~28 field types are specified, and more will be requested forever.

**Decision.** Each type is a `FieldTypeDefinition` (config editor, input,
display, validator builder, exporter) registered into a map.

**Consequences.**
* Adding a type touches exactly one new file plus one registration line.
* MVP ships 8 types without blocking the other 20.
* Third-party/plugin field types become possible later at no extra cost.
* Slight indirection cost when reading the code.

**Rejected.** A `switch (field.type)` in the renderer: every new type edits four
existing files and the switch becomes the merge-conflict hotspot.

---

## ADR-009 — Score ledger is append-only
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Scores must be auditable, and offline replay must not clobber newer
values.

**Decision.** `scores` is an append-only event log. Aggregation takes the latest
event per `(judgeId, criterionId)`. Rules forbid update and delete.

**Consequences.**
* Out-of-order offline replay is safe by construction — no conflict resolution
  needed for the most contested data in the system.
* Full audit trail of every score change, free.
* More documents; aggregation must reduce rather than read a single value.

---

## ADR-010 — Client-heavy architecture with minimal Cloud Functions
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Cost and complexity both scale with backend surface area.

**Decision.** Firestore + rules do the work. Functions exist only for: secrets
(Drive tokens), aggregation authority (scores, leaderboards), cross-document
consistency (publishing), and scheduled work (reminders, advancement).

**Consequences.**
* Realtime and offline come nearly free from the SDK.
* Security rules become load-bearing — hence the mandatory rules test suite.
* Cold starts affect only the seven listed operations, none of which are in a
  hot interactive path.
* Some logic exists twice (client-optimistic and server-authoritative) — mitigated
  by ADR-004: it is the *same* pure function called from both sides.

---

## ADR-012 — The field registry is split into a pure half and a React half
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** SPEC_FORM_ENGINE §4 originally defined `FieldTypeDefinition` with
`ConfigEditor`, `Input` and `Display` as React components living in
`core/forms/`. AGENT.md hard rule 8 says `core/` contains no React. Both cannot
be true. The contradiction surfaced the moment the registry was actually built.

**Decision.** Split the registry across the layer boundary:

* `core/forms/registry.ts` — pure: `type`, `label`, `group`, `defaultConfig`,
  `hasOptions`, `isFileBased`, `supportsBlindJudging`, `buildValidator`,
  `toExportValue`.
* `modules/forms/fieldComponents.tsx` — React: the `Input` component, looked up
  by `getFieldInput(type)`.

**Consequences.**
* `core/` stays testable with no DOM and no React renderer.
* Adding a field type now touches exactly two files, one per half, and still no
  switch statement anywhere.
* The two maps can drift — a type registered in one half and not the other fails
  at runtime, not compile time. `getFieldInput` throws a named error rather than
  rendering nothing, and a registry-parity test is owed (STATUS §5).
* SPEC_FORM_ENGINE §4 has been corrected to describe the split.

**Rejected.** Relaxing hard rule 8 to allow React in `core/`: the purity of the
engines is what makes the same code runnable client-side for optimistic UI and
server-side for authority (ADR-004). Not worth trading for one less file.

---

## ADR-013 — Demo forms use a bespoke `useFormEngine` hook, not React Hook Form
**Date:** 2026-07-29 · **Status:** Proposed — **deviation, revisit before backend**

**Context.** CONVENTIONS §6 mandates React Hook Form + `zodResolver` for all
forms. The dynamic renderer instead uses a small `useFormEngine` hook holding
answers in `useState` and recomputing `validateAnswers` on change.

**Decision.** Ship the demo on `useFormEngine`. Do not treat this as settled.

**Why it happened.** The compiled validator changes shape as answers change,
because visibility changes which fields are in the schema at all. Threading a
per-keystroke-varying resolver through RHF is possible but was not the fastest
path to a working demo, and the demo was the goal.

**Consequences.**
* Simpler to read, and the visibility/validation coupling is explicit.
* **We lose what RHF is actually good at**: uncontrolled inputs, per-field
  subscriptions, and not re-rendering the whole form on every keystroke. At 50+
  fields this will be felt, against the < 100 ms render budget in
  ARCHITECTURE §8.
* The codebase now has two form idioms — this one for dynamic forms and
  (eventually) RHF for static ones. That is a real inconsistency, not a style
  preference.
* Revisit before building any more forms on it. Tracked as STATUS §4 Q7.

---

## ADR-014 — Tailwind is imported without preflight
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Tailwind's preflight and MUI's `CssBaseline` both reset base
element styles. Loading both means Tailwind silently flattens MUI's typography
and form-control baseline.

**Decision.** Import only Tailwind's theme and utilities layers, never
`preflight`:

```css
@layer theme, base, components, utilities;
@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/utilities.css' layer(utilities);
```

**Consequences.**
* MUI owns the baseline; Tailwind provides layout and spacing utilities only,
  which is exactly the division CONVENTIONS §7 asks for.
* Tailwind utilities that assume a preflight reset (notably `border-*` without
  an explicit `border-style`) need the style stated explicitly.
* Anyone adding `@import "tailwindcss"` wholesale will silently break MUI's
  look. The import block carries a comment saying so.

---

## ADR-011 — Template
```
## ADR-0NN — <decision in one line>
**Date:** YYYY-MM-DD · **Status:** Proposed | Accepted | Superseded by ADR-NNN

**Context.** What forced a choice.
**Decision.** What we chose, stated actively.
**Consequences.** What gets easier, what gets harder, what we now must police.
**Rejected.** The alternative and the specific reason it loses.
```

---

## ADR-015 — One application shell, and design tokens are the single source of colour
**Date:** 2026-07-29 · **Status:** Accepted

**Context.** The Forge design system (Agent Design project "Material Design 3
SaaS UI", `Forge.dc.html`) was imported and implemented. It specifies a single
shell — a persistent sidebar on desktop with two nav groups ("For you" and
"Organizing"), a bottom navigation bar plus FAB on mobile — covering all twelve
screens. The app had three shells (`AdminLayout`, `ParticipantLayout`,
`PublicLayout`) and treated the form builder, registration form and scoring
screen as chrome-less "Shell E" full-screen routes.

**Decision.** Collapse the three layouts into one `app/layouts/AppShell.tsx`, and
put every screen inside it except the marketing landing page. Colour, radius,
elevation and motion live in `app/tokens.ts`; `app/theme.ts` derives the MUI
theme from those tokens and nothing else.

**Consequences.**
* An organizer and a participant are the same person in one navigation tree, so
  role-based nav filtering becomes a visibility concern inside `AppShell`, not a
  routing concern. When RBAC lands, `NAV_GROUPS` is the one place to gate.
* Shell E is gone. The former full-screen screens now open with the sidebar
  present and use a close/back affordance in the content area instead.
* No component may hardcode a hex. `tokens.ts` carries that instruction at the
  top; `index.css` mirrors a small subset as CSS custom properties for the
  handful of rules that cannot read TS, and the two must be kept in step.
* Icons are Material Symbols Rounded via `shared/ui/Icon.tsx`, not
  `@mui/icons-material`. The icon font is loaded in `index.html`.
* The landing page is the one screen with no design-system counterpart. It keeps
  its own full-bleed layout but draws entirely from the tokens.

**Rejected.** Keeping three shells and theming each. It would have contradicted
the design's navigation model — the sidebar's whole point is that organizing and
participating are one continuous surface — and it triples the cost of every
future nav change.

---

## ADR-016 — The demo organization is world-readable; the demo does not authenticate
**Date:** 2026-07-29 · **Status:** Accepted — **demo scaffolding, must be removed**

**Context.** The Vercel demo must show admin, judging and control-room screens to
a visitor with no account, and must survive ~700 concurrent viewers. Those reads
are gated behind org membership by [DATA_MODEL.md §6](DATA_MODEL.md), correctly —
AGENT.md hard rule 3 says the client is never the authority.

The first attempt used anonymous sign-in plus a self-issued read-only membership.
Two things killed it: enabling Identity Platform programmatically requires
billing on the project, and 700 viewers would mint 700 throwaway anonymous
accounts for no benefit.

**Decision.** The single organization named by `VITE_DEMO_ORG_ID` is readable
without authentication. `firestore.rules` carries one predicate,
`demoReadable(orgId)`, which appears **only in read rules and never in a write
rule**. Sign-in still exists and still names the user in the shell, but nothing
depends on it. The demo profile travels inside the index snapshot, so participant
screens need no auth-gated `users/{uid}` read.

**Consequences.**

* Anyone who knows the project id can read the demo org. That org contains
  fixture data seeded from `src/mock/data.ts` and nothing else.
* Every write path is still permission-gated, and every other organization is
  still fully isolated. Verified live against `forge-4d40a`: 17/17 checks pass
  while signed out, including three cross-tenant isolation cases.
* **Before real customer data exists in any organization, delete `isDemoOrg` and
  `demoReadable` from `firestore.rules` and redeploy.** That one edit restores
  membership-gated reads everywhere.

**Rejected.** Relaxing `isMember()` globally — that makes every org readable by
anyone signed in, which is exactly the tenant leak hard rule 2 exists to prevent,
and it would not have been reversible by deleting one function.

---

## ADR-017 — Google Drive integration is link-first, not upload-first

**Date.** 2026-07-29 · **Status.** Accepted

**Context.** SPEC_STORAGE and ROADMAP 1.9 describe a Drive upload pipeline:
`mintUploadSession` server-side, resumable `PUT` from the browser, then
`completeUpload`. Minting a session needs a service credential, which needs a
Cloud Function, which needs the Blaze plan. The project is deliberately on
Spark. So the documented pipeline cannot exist yet, and the choice was between
shipping nothing and shipping a different shape.

**Decision.** File references are created from a **pasted Drive share link**.
`core/drive/links.ts` parses every URL shape Google emits, derives the file id,
and builds a `FileRef`. Images render through `drive.google.com/thumbnail?id=…`,
which is Google's own CDN and what Drive's own UI uses.

**Consequences.**

* No OAuth consent screen, no client id, no Google verification review, and
  nothing to configure before it works.
* The file never leaves its owner's Drive, so we inherit their quota, retention
  and access control instead of underwriting it — hard rule 5 taken further than
  the original design took it.
* There is no upload to fail at a submission deadline, which is the slowest and
  most failure-prone moment in a challenge.
* **Nothing can verify the file exists or is shared.** Only an authenticated
  Drive API call could. `analyzeDriveLink` is therefore explicit about what it
  knows versus what it guesses: a `/u/0/` or `usp=drive_web` URL raises a
  warning because it very often is not link-shared, and the organiser sees their
  own cover fine while every participant sees a broken one.
* Broken images degrade to the category gradient rather than a torn-icon box
  (`shared/ui/CoverImage.tsx`). A dead link looks unset, not broken.
* `sizeBytes` is stored as `0` and mime type is inferred from the link shape.
  An honest zero beats a confident wrong number.

**Rejected.** `uc?export=view` for images — it returns an interstitial HTML page
for larger files and is aggressively rate-limited, so it works in development
and fails under real traffic. Firebase Storage — stores bytes on our own infra,
breaking the cost invariant, and needs Blaze on new projects anyway.

**Revisit when** billing is enabled: the full resumable pipeline becomes
possible, and the Google Picker can sit on top of this without changing `FileRef`.

---

## ADR-018 — `collectionGroup` for "my registrations", with a path re-check

**Date.** 2026-07-29 · **Status.** Accepted

**Context.** A participant's dashboard needs every registration they hold across
challenges. Reading each challenge's `registrations` subcollection is N reads for
N challenges. AGENT.md hard rule 2 requires a `collectionGroup` query to carry
an explicit security-rule justification recorded here.

**Decision.** `fetchMyRegistrations` issues one `collectionGroup('registrations')`
query filtered by `userId == uid()`, then **re-asserts the org boundary in code**
by filtering on `ref.path.startsWith('organizations/{orgId}/')`.

**Consequences.**

* One query instead of N, and it stays one as the org grows.
* A collection-group query spans tenants by definition, so the boundary is
  enforced twice: the rules only permit reading a registration whose `userId`
  is yours, and the client discards anything outside the active org. Neither
  check is load-bearing on its own.

**Two things that are easy to get wrong here, and both were, initially:**

1. **The nested rule does not apply.** A `match /organizations/{orgId}/…
   /registrations/{rid}` block never matches a `collectionGroup()` query — only
   a root-level `match /{path=**}/registrations/{rid}` does. Without that block
   the query fails with permission-denied regardless of what the nested rules
   permit.
2. **The condition must test a field, not the document id.** For a *list*
   operation Firestore evaluates rules against the query's constraints, not
   against documents it has not read yet. `rid == uid()` is unverifiable in that
   context and denies everything; `resource.data.userId == uid()` is satisfied
   by the query's own `where('userId', '==', uid)` filter. The two look
   interchangeable because `registrationId == userId` in individual mode — they
   are not.

Also requires the `userId` field indexed at **`COLLECTION_GROUP`** scope.
Firestore's automatic single-field indexes are `COLLECTION`-scoped only, so this
needs an explicit `fieldOverrides` entry in `firestore.indexes.json`.

---

## ADR-019 — Denormalized counters are incremented by the client, bounded by rules

**Date.** 2026-07-29 · **Status.** Accepted, with a known trade-off

**Context.** DATA_MODEL §4 assigns `challenge.counters` to a Cloud Function,
precisely because a client can lie about them. On Spark there is no Function.
Registering has to move `counters.registrations`, and a challenge that
permanently reads "0 entrants" while people are entering is a visible product
failure — worse, day to day, than a number someone could inflate.

**Decision.** `bumpCounter` uses Firestore's server-side atomic `increment()`.
The security rule permits any signed-in user to update a challenge **only** when
`affectedKeys().hasOnly(['counters', 'updatedAt'])`.

**Consequences.**

* Concurrent registrations do not lose updates — `increment()` is atomic
  server-side, not a read-modify-write.
* The blast radius is two keys. A participant cannot retitle, reschedule,
  republish or unpublish a challenge through this door.
* A member of that org could inflate a count. It is visible, bounded to their
  own tenant, and fully recomputable from the registrations themselves.
* A failing counter never fails the action that triggered it — `bumpCounter`
  swallows its error, because the registration has already committed and a
  courtesy number is not worth reporting a false failure over.

**Revisit when** billing is enabled: move to a Function trigger and tighten the
rule back to `hasPerm(orgId, 'challenge.update')`.

---

## ADR-020 — Admin access is bootstrapped by redeemable invites, not by a Function

**Date.** 2026-07-29 · **Status.** Accepted

**Context.** Someone has to be the first admin. Membership documents are what
the rules read to decide permissions, so a client that can freely write its own
membership can grant itself anything — the whole security model gone. Normally a
Cloud Function or the Admin SDK writes that first member. Neither is available
at runtime on Spark.

**Decision.** An `invites/{lowercased-email}` document, writable only by someone
holding `member.invite` (or by the seed script via the Admin SDK), carries the
roles being granted. The invitee's first sign-in **redeems** it: the rules allow
creating your own membership if and only if a pending invite exists for your
**verified** token email, and the claimed `roleIds` and `resolvedPermissions`
equal the invite's exactly.

**Consequences.**

* The client redeems a grant; it never mints one. It chooses nothing.
* `email_verified == true` is required — without it, anyone able to set an
  arbitrary email claim could redeem someone else's invite.
* A member may update their own `displayName` and `photoURL` and nothing else;
  `hasOnly` pins the privilege boundary shut.
* This is real Phase 1.3 (member invite + roles), not scaffolding, and it
  survives the deletion of the ADR-016 demo predicates.

---

## ADR-021 — Design tokens and the auth context move out of `app/`

**Date.** 2026-07-29 · **Status.** Accepted

**Context.** Turning on `eslint-plugin-boundaries` (Phase 0 deliverable 0.2)
surfaced **21 violations** of the dependency direction AGENT.md documents.
Every one had the same two causes: `app/tokens.ts` and the `useAuth` context in
`app/providers/AppProviders.tsx` are needed by every module and every shared
primitive, so both were imported *upwards* from `modules/` into `app/`.

This is the same class of contradiction ADR-012 resolved: a doc naming a
location the dependency rule forbids.

**Decision.** Resolve it the same way — move the code, correct the doc.

* `app/tokens.ts` → **`shared/design/tokens.ts`**. Tokens are a design-system
  primitive consumed by every layer, which is exactly what `shared/` is for.
* The auth context → **`core/auth/`**. Identity is a `core` concern that modules
  consume; `app/` now only mounts the provider.

**Consequences.**

* The documented direction `app → modules → core → shared` is now true and
  enforced rather than aspirational. All 21 violations were fixed, not excused.
* React in `core/auth` is fine: hard rule 8 names the four *pure engines*
  (`forms`, `workflow`, `rbac`, `judging`), not the whole directory, and
  `core/firebase/hooks.ts` was already a React module for the same reason.
  ESLint enforces purity on exactly those four directories.

**Note worth keeping.** The boundary rule silently passed until
`eslint-import-resolver-typescript` was configured — without it the `@app/…`
aliases were unresolvable and every check trivially succeeded. A lint rule that
*cannot* fail is worse than no rule, because it is believed. It was verified by
confirming it reported the known violations before they were fixed.

---

## ADR-022 — Result publishing is idempotent rather than atomic

**Date.** 2026-07-29 · **Status.** Accepted, with a known trade-off

**Context.** SPEC_SCORING §5 assigns `publishResults` to a callable Cloud
Function, and it is the strongest argument for Blaze in the whole product.
Publishing touches more documents than one batch holds — a leaderboard page per
50 entrants, a registration per entrant, a certificate per podium place, the
challenge itself, an audit entry — and **a partial publish is the worst outcome
available**: half the entrants told they won.

On Spark there is no Function, so true atomicity is not on the table.

**Decision.** Lean entirely on **idempotency** instead. Every document id is
derived, never generated:

| Document | Id |
|---|---|
| Leaderboard page | `page_{n}` |
| Certificate | `{challengeId}_{userId}` |
| Registration | `{userId}` |
| Verification hash | `{challengeId}_{userId}` |

A run that dies halfway can simply be run again: it converges on the same state
rather than double-awarding. The UI says exactly that on the error path.

**Consequences.**

* Re-publishing is safe and is the documented recovery, so the failure mode is
  "run it again" rather than "reconcile by hand".
* Two security rules were relaxed, and this is the real cost:
  * `leaderboard` — from `write: if false` to
    `create, update: if hasPerm(orgId, 'result.publish')`. This is a
    *privileged org member*, not any signed-in client, and `delete` stays false.
  * `certificates` — from `write: if false` to
    `create: if hasPerm(request.resource.data.orgId, 'certificate.issue')`.
    Because this is a **global** collection the path carries no tenant, so the
    permission is checked against the org named *in the payload*. A rules test
    asserts a member of org A cannot mint a certificate claiming to be from
    org B. `delete` stays false — revoke, never erase.
* Notification fan-out happens **after** the write commits and is best-effort.
  Telling someone they won and then failing to record it is far worse than
  recording it and failing to tell them, which the inbox corrects on their next
  visit.
* The pure ranking engine (`core/judging`) is shared with the screen, so the
  organiser previews the exact ranking that will be written before it is.
* Publishing is **blocked behind an explicit acknowledgement** when any entry is
  unscored or provisional. A missing review is never a zero, so publishing over
  one ranks someone last for a judge's inaction — then freezes and announces it.

**Revisit when** billing is enabled: move to a callable Function with a
checkpoint document and `publishBatchId`, exactly as SPEC_SCORING §5 describes,
and restore both rules to `write: if false`.

---

## ADR-023 — The rules file is cross-checked against the permission catalog

**Date.** 2026-07-29 · **Status.** Accepted

**Context.** A security rule can be wrong in a way nothing catches.
`hasPerm(orgId, 'workspace.manage')` is valid rules syntax, compiles, and
deploys without complaint — then denies every request forever, because
`workspace.manage` is not in the catalog and so no role grants it. The catalog
defines `workspace.create`, `.update` and `.delete`.

That exact bug was live in this repo. Reading the rules did not find it.

**Decision.** `core/rbac/rules-permissions.test.ts` reads `firestore.rules` as
text, extracts every `hasPerm(_, 'x')` literal, and asserts each one:

1. exists in `PERMISSIONS`,
2. is granted by at least one built-in role — an unreachable rule is a bug, and
3. is satisfiable by `owner`.

It also pins the invariants a well-meaning edit would quietly undo: `snapshots`
and `publicChallenges` stay unwritable, the score ledger stays append-only,
audit logs stay write-once, invite redemption keeps requiring `email_verified`,
and the ADR-019 counter hatch stays bounded to two keys.

**Consequences.**

* The two lists live in different languages and cannot be typechecked against
  each other. This is the substitute, and it runs in `npm run test` rather than
  needing an emulator.
* The test asserts it found more than ten `hasPerm` calls, so a regex that stops
  matching fails loudly instead of passing vacuously — the same trap ADR-021
  records for the boundary rule.
* One test deliberately asserts the **presence** of the ADR-016 demo
  scaffolding. When it fails because the predicates are gone, delete the test —
  the failure is the reminder.

---

## ADR-024 — Email and password is the only sign-in method, and `/admin` sits behind a bundled key

**Date.** 2026-07-31 · **Status.** Accepted

**Context.** Sign-in was Google plus an anonymous guest handshake. Three
problems, in increasing order of how much they cost:

1. **Google sign-in is a deployment dependency, not just a code path.** It needs
   an OAuth consent screen and an authorized-domain entry per host. The failure
   mode is `auth/unauthorized-domain` on a fresh preview URL — an error that
   reads as "you are not allowed" to the person seeing it and as a forgotten
   console setting to everyone else.
2. **Two credential shapes mean two recovery stories.** A Google account
   recovers through Google; an anonymous one cannot recover at all. Every
   account question — reset, verification, "I lost access" — had to be answered
   twice, or answered once and be wrong half the time.
3. **The guest handshake minted real accounts for people who wanted to look
   around.** Browsing needs no identity at all, so the honest alternative to
   signing in is *not signing in*, which the product already supports.

Separately, there was no admin panel and no route that gathered the organizing
surfaces into one place.

**Decision.** Two parts.

**Email and password only.** `core/firebase/auth.ts` exposes sign-in, sign-up,
password reset and email verification, and nothing else. We own recovery, which
is why reset and verification live in that module rather than being left to
callers. Verification is load-bearing rather than decorative: ADR-020 grants
every real permission through a redeemable invite, and `firestore.rules`
requires `email_verified == true` to redeem one. Google accounts arrived
verified; a password account does not, so sign-up sends the mail and the admin
panel says so when it has not been acted on.

**The admin panel is behind a key, and the key is a gate rather than a lock.**
`/admin` requires a signed-in account plus `VITE_ADMIN_SECRET`, compared in the
browser against a value that ships in the bundle. Anyone who opens devtools can
read it. That is stated plainly in `core/auth/adminKey.ts`, in the gate's own
UI, and in `.env.example`, because a gate that looks like a vault eventually has
something put behind it that needed a real lock.

It is nonetheless worth having, because hard rule 3 means it does not have to be
the enforcement layer: every action the panel offers is a Firestore write
evaluated against the caller's stored membership. Someone who forces the gate
gets the chrome and `permission-denied` on everything they try. The key decides
who is *shown* the console; the membership decides what works inside it.

**Consequences.**

* One credential shape, one recovery story, one place errors are explained
  (`explain()` in `AuthContext`, which translates configuration failures into
  the console setting that actually fixes them instead of the raw code).
* No consent screen and no per-domain OAuth setup, so a new deploy host needs
  one authorized-domain entry for Auth and nothing else.
* We now carry password-reset and verification email delivery, and the
  deliverability problems that come with them. `resendVerification` exists
  because the first send can fail and must not strand the account.
* The unlock is bound to a uid and stored in `sessionStorage`, so it ends with
  the tab and does not survive a change of user on a shared machine.
* **The upgrade path, when Blaze lands:** move the check behind a Cloud Function
  that mints a custom claim, and gate the rules on the claim. `verifyAdminKey`
  already compares in constant time so the comparison that moves server-side is
  the right one rather than a `===` someone has to remember to replace.
* Provisioning after sign-in is best-effort and cannot fail the session
  (`provisionQuietly`). Firebase Auth has already issued the token by the time
  Firestore is touched, so a `unavailable` on the user document is not a failed
  sign-in and must not be reported as one.

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

---

## ADR-025 — Three doors in, one admin console, and the demo data is not the product

**Date.** 2026-08-01 · **Status.** Accepted · **Amends** ADR-024

**Context.** ADR-024 made email and password the only way in, and its reasoning
about deployment cost still holds. What it got wrong was the audience: it
optimized for *one* recovery story at the price of the sign-in a participant
actually has. Google was enabled on the project the whole time, and turning it
off did not remove the per-domain configuration it costs — it only removed the
one-tap option from people who already had a Google account.

Separately, the panel ADR-024 introduced could not do the thing an admin panel
exists for. It aggregated and linked; it owned nothing. There was no screen
anywhere in the product that started from *a person* — the control room manages
a challenge, and a participant in three challenges appeared in three places and
nowhere as themselves.

And the organization was still full of the six fake competitions
`scripts/seed.ts` writes from `src/mock/data.ts`. Demo scaffolding that outlives
the demo stops being scaffolding and starts being wrong data.

**Decision.** Three parts.

**Three doors, and they are not equal.** `/signin` offers Google, email and
password, and a guest session, on a *member* tab; an *admin* tab takes an email
address, a password and the access key together. The admin door has no Google
(the key must be typed by someone who knows it — one tap is the wrong ceremony),
no sign-up (it is not where accounts are created) and no guest (an anonymous
session has no name for the audit trail). `signInAdmin` checks the key **before**
touching the network, so a wrong key costs no round trip and no rate-limit entry
against the address, and the unlock is bound to the uid that call returns rather
than to `user` in state, which has not landed yet.

**Guest sign-in is scaffolding and is labelled as such.** It needs the Anonymous
provider enabled in the console; without it the raw failure is
`auth/admin-restricted-operation`, which reads as a permissions bug in the app
rather than a toggle in the console, so `explain()` names the toggle. A guest
cannot be granted a role (no verified email for `firestore.rules` to address an
invite to), cannot own an organization and cannot recover the session. All three
are stated on the button rather than discovered later.

**The panel owns participants.** `/admin/participants` lists every registration
in the organization — a fan-out over the challenge list, *not* a
`collectionGroup`, because the only group rule for registrations admits
`resource.data.userId == uid()` and a root-level rule cannot see the `orgId` in
the path. That is hard rule 2 refusing to be worked around, and N reads over tens
of challenges is the correct price. `ParticipantEntry` is a second domain type
beside `Registration` for one reason: `Registration` folds `withdrawn` and
`disqualified` into `eliminated`, which is right for the participant reading
their own entry and useless for the administrator who sets them.

**Consequences.**

* `resolvedPermissions` is recomputed and written on every member-access change
  (`writeMemberAccess`), exactly as `writeInvite` does. `hasPerm` in the rules
  reads that field — writing `roleIds` alone would grant a role the UI shows and
  the database ignores.
* Check-in stays a separate control backed by `registration.checkIn`, and the
  status write never carries `checkedInAt`. The volunteer on the door marks
  people present and cannot disqualify anyone; that separation only survives if
  the wide permission's write stays narrow.
* Deleting a registration decrements `counters.registrations` best-effort, for
  the same Spark-plan reason as ADR-019. The deletion stands if the counter
  write fails; the count is recomputable and the row is not.
* `scripts/curate.ts` removes the six demo challenges with their subcollections
  and installs one real competition. It is reversible — `npm run seed` writes
  the demo set back — and it recomputes `challengeCount` rather than
  incrementing it, because the point of running it is that the old number is
  wrong.
* The Milky Way entry form asks for **three `driveLink` fields, one required**,
  not one `files` field with `maxFiles: 3`. The `file`/`files` inputs in
  `shared/ui/forms/fieldComponents.tsx` fabricate a placeholder `FileRef` — real
  in-app upload is Phase 3 behind the Drive picker, and needs OAuth plus the
  Drive API. A form that silently records a fake photograph is worse than one
  that asks for a link.
* **`driveLink` gained `config.purpose: 'image'`**, honoured by both halves of
  the registry. Without it a folder link validates, and "up to three
  photographs" is not a rule if one link can be forty. The default stays
  permissive: an attachment field may legitimately point at a folder, and
  narrowing it globally would retroactively invalidate submissions already made
  against those fields.
* `VITE_ADMIN_SECRET` defaults to `FORGE2026`. It ships in the bundle and
  everything ADR-024 said about it being a gate and not a lock is unchanged.

---

## ADR-026 — Real uploads: files go into the organiser's Drive, via our own server

**Date.** 2026-08-01 · **Status.** Accepted · **Amends** ADR-017, ADR-025

**Context.** ADR-017 chose link-first storage and was right for the constraints
it had: no Cloud Functions on Spark, no consent screen, no upload to fail at a
deadline. But it left the entrant doing the work — upload to Drive, remember to
set "Anyone with the link", paste the URL — and the step they forget is the
sharing one, which produces an entry that looks submitted and shows the judges a
blank frame.

Worse, the `file` and `files` field types existed and *looked* implemented.
Their inputs fabricated a `FileRef` on click. A form using them reported "entry
received" while storing a photograph that was never anywhere. That is the most
dangerous kind of stub and it had been in the tree for two phases.

The alternative considered and rejected was the **Google Picker**: the entrant
picks from their own Drive, the app sets the permission for them, no server at
all. It is cheaper and keeps storage on the entrant. It was rejected because it
requires every entrant to have a Google account, and a public photography
competition cannot assume that.

**Decision.** Files upload into the **organiser's** Drive folder, through two
serverless endpoints of our own.

**The credential is a refresh token, not a service account.** A service account
is the obvious choice and does not work: service accounts have no Drive storage
quota, so an upload into a folder shared with them fails `storageQuotaExceeded`
— the account would own the file and has nowhere to put it. The documented fix
is a Shared Drive, which needs Google Workspace; this project runs on consumer
Gmail. So the app acts *as the folder's owner* with a refresh token granted once
by `npm run drive:connect`, scoped to `drive.file` — per-file access limited to
files this app creates, which is why the consent screen asks for nothing
restricted and a leaked token is bounded to files we made.

**Bytes never pass through our server.** `POST /api/drive/upload-session` mints
a resumable session URL and the browser PUTs straight to Google. A serverless
request body caps out around 4.5 MB and a photograph is routinely 10–40, so
relaying would fail on exactly the files the feature exists for. It is also the
safer shape: what the client receives is single-use and scoped to one file in
one folder, and cannot be replayed to write anywhere else.

**The server sets the sharing permission** (`POST /api/drive/finalize`). This is
the point of the whole exercise — it removes the step entrants forget.

**Consequences.**

* **The organiser now underwrites storage.** Entries land on their 15 GB. This
  reverses the cost position of ADR-017 and is the price of not requiring a
  Google account. Worth a quota warning on the admin panel before a large
  competition; not built yet.
* `core/storage/` finally exists, which is what hard rule 4 has described since
  the beginning. `providers/googleDrive.ts` is the only client file that knows
  Drive is involved.
* ID tokens are verified in `api/_lib/auth.ts` by hand against Google's public
  certs rather than with `firebase-admin` — 10 MB of dependency for one RS256
  check would dominate the cold start on the request a person is waiting on.
* **Known gap:** the endpoint verifies the caller is a signed-in Forge user but
  *not* that they are registered for the challenge. That needs a Firestore read,
  which needs the Admin SDK and a second long-lived credential in the serverless
  environment. The exposure is a signed-in user uploading to a challenge they
  have not entered. The fix is an Admin SDK read of `registrations/{uid}` when
  there is a reason to hold that key.
* Size and MIME are enforced in three places — browser `accept`, the form
  engine, and the endpoint. Only the third cannot be skipped.
* The Milky Way form reverts to **one `files` field with `maxFiles: 3`**, which
  is what "max three photos" always wanted to be. ADR-025's three `driveLink`
  slots were a workaround for the stub, and `driveLink` remains the right field
  for an entrant who would rather link something they already have in Drive.
* **The seven-day trap:** while the OAuth consent screen is in "Testing" Google
  expires refresh tokens after a week and uploads start failing `invalid_grant`.
  Publishing the screen is required before relying on this; with only
  `drive.file` requested it does not trigger Google's verification review.

---

## ADR-027 — Security hardening: the demo org stopped being a demo

**Date.** 2026-08-01 · **Status.** Accepted · **Amends** ADR-016

**Context.** A security review of the whole application, prompted by real
entrants existing for the first time.

The headline finding was written into `firestore.rules` a phase earlier, by
whoever added the demo scaffolding:

> *"Delete this function and its call sites before real customer data lives in
> any organization."*

`demoReadable(orgId)` returned true for the entirety of `org_demo`, making every
collection beneath it world-readable with no sign-in: **members, registrations,
submissions, reviews, scores and the audit log**. That was a defensible trade
while the org held only fixture data from `src/mock/data.ts` — ADR-016 took it
deliberately to avoid 700 throwaway anonymous accounts. It stopped being
defensible the moment ADR-025/026 put a real competition in `org_demo`: a
participant's name, email address and answers were readable by anybody who knew
the project id.

Nothing about this was exploited and nothing was written that should not have
been — the *write* rules were always correct. What leaked was reading.

**Decision.**

* `demoReadable` is replaced by `publicBrowse`, which survives only on
  collections a signed-out visitor needs and which hold no personal data: the
  organization, public challenges, form schemas, rubric, leaderboard,
  workspaces, badges, announcements.
* `demoWriter` is gone. It let *any* signed-in account write reviews and scores
  in `org_demo` — score manipulation on a live competition, not convenience.
* `/users/{userId}` read was `isSignedIn()`: one throwaway sign-up enumerated
  every display name and email address on the platform. Now your own document,
  or a profile whose owner set `isPublic`.
* A **strict CSP** ships in `vercel.json`, plus HSTS, `X-Frame-Options: DENY`
  and `Cross-Origin-Opener-Policy: same-origin-allow-popups` (`same-origin`
  would break `signInWithPopup`). The build emits no inline script, so
  `script-src` needs no `unsafe-inline`; `style-src` does, because Emotion
  injects at runtime and there is no hash to pin.
* `AdminGate` additionally requires org membership. The key is in the bundle and
  never gated anything against someone who looked; the *writes* were always
  safe, but the console displays the roster, so seeing it should cost more than
  reading a string out of devtools.
* `api/` and `scripts/` are now in `tsconfig.json`. They were never typechecked
  — "typecheck clean" had been claiming coverage it did not have.
* Upload endpoint: the filename is sanitised (path separators, control
  characters, leading dots) and the challenge id is validated against an
  allow-list before being interpolated into a Drive query expression.

**Two bugs this surfaced, both in the sign-in path.**

1. **The first admin never got their role, silently.** Hardening `members` to
   `isMember(orgId)` was circular: `provision` reads your own membership to
   decide whether to redeem an invite, and `usePermissions` reads it to learn
   what you may do — so requiring membership to read it means you can never
   discover you have it. `claimInvite` swallows refusals by design (ADR-024), so
   it failed with no error anywhere. The rule now allows reading **your own**
   member document, present or absent.
2. **A stale cache told a new admin they did not belong.** Sign-in provisions
   *after* the query cache has already answered "no membership" for that
   account. The database said `owner`; the panel said "not a member" until a
   manual reload. Sign-in now invalidates the identity queries.

**Consequences.**

* One tenant-isolation assertion was deliberately relaxed and split in two,
  rather than quietly flipped: a caller may read *their own* absent membership
  in any org (the bootstrap depends on it), and may still read nothing else
  there. The test names the reasoning.
* **87 rules tests**, up from 75. The nine new ones each name the personal data
  they protect, so anyone tempted to reopen the demo hatch has to read what
  they would be publishing.
* Still open, recorded rather than fixed: the ADR-019 counter hatch lets any
  signed-in user move `counters` on any challenge; `api/drive/upload-session`
  does not verify the caller is registered for the challenge (ADR-026); and
  uploaded photos are shared `anyone/reader`, so a Drive link is a public URL
  — correct for a photography competition, wrong for anything confidential.

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
`core/forms/`. CLAUDE.md hard rule 8 says `core/` contains no React. Both cannot
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

**Context.** The Forge design system (Claude Design project "Material Design 3
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

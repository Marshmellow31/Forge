# STATUS.md — Living Project State

> **This is the first file any agent reads and the last file any agent writes.**
> It is the handoff between sessions. Keep it accurate over keeping it pretty.
> Stable truths belong in [BRAIN.md](BRAIN.md), not here.

---

**Last updated:** 2026-07-29
**Updated by:** Claude (live Firebase backend on branch feat/firebase-backend)
**Current phase:** Phase 1 — MVP frontend on a live read-only backend
**Repo state:** 14 screens reading live Firestore (project forge-4d40a, org_demo seeded)
**Build health:** typecheck + build clean · 13 routes walked cold with 0 console errors · rules 17/17 live checks pass

---

## 1. Where we are, in one paragraph

The demo runs end to end and now wears the **Forge design system** — a Material
Design 3 "expressive" warm-amber scheme imported from the Claude Design project
`Forge.dc.html`. Colour, radius, elevation and motion live in `app/tokens.ts`;
`app/theme.ts` derives the MUI theme from them. The three old shells were
collapsed into one `AppShell` (sidebar on desktop, bottom nav + FAB on mobile)
per the design — see ADR-015. Fourteen screens are restyled and two new ones
(S-55 My entries, S-62 Awards) were built to fill the design's nav. Icons are
Material Symbols Rounded via `shared/ui/Icon.tsx`. Thirteen routes were walked in
a real browser at desktop and mobile widths with zero console errors. The form
engine — pure schema types, condition evaluator, Zod compiler, two-half field
registry — is still the architectural set-piece, and it still has **zero tests**.
That is the largest gap and the next thing worth doing.

The backend is now **live** on branch `feat/firebase-backend` — see §8.

## 2. Progress by area

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked/broken

### Phase 0 — Foundation
- [x] Product vision, architecture, data model, engine specs, ADRs, conventions
- [x] Repo scaffold — Vite 6, React 18, TS strict, Tailwind v4, MUI 6, Zod
- [x] Path aliases (`@core`, `@modules`, `@shared`, `@app`, `@mock`)
- [x] `npm install` — clean (`@types/node` added so `vite.config.ts` typechecks)
- [x] Design system — imported, not hand-built. See ROADMAP 0.8 and ADR-015.
- [ ] `eslint-plugin-boundaries` dependency rule (ESLint not configured at all yet)
- [ ] Vitest + first unit tests **← the form engine has zero tests, and it is the
      one thing in this repo that most needs them**
- [x] Firebase project / env contract / typed data layer — **live**, see §8
- [ ] CI

### Phase 1 — MVP frontend (live read-only backend)

**Core engine — done and real**
- [x] `core/forms/types.ts` — schema, field, condition, FileRef types
- [x] `core/forms/conditions.ts` — condition DSL, `computeVisibility`, `stripHiddenAnswers`
- [x] `core/forms/registry.ts` — pure half: 14 field types, Zod validator builders, exporters
- [x] `core/forms/compiler.ts` — `compileSchema`, `validateAnswers`, `completionPercent`
- [x] `modules/forms/fieldComponents.tsx` — React half: 14 input components
- [x] `modules/forms/FormRenderer.tsx` — JSON → live validated form
- [x] `modules/forms/FormBuilder.tsx` — palette / canvas / config, live preview

**Design system** (imported from `Forge.dc.html`, ADR-015)
- [x] `app/tokens.ts` — colour, radius, elevation, motion, cover + status maps.
      **The only place a hex may be written.**
- [x] `app/theme.ts` — MUI theme derived from tokens (M3 filled fields, pill
      buttons, amber slider/tabs/dialogs)
- [x] `app/index.css` — Figtree + IBM Plex Mono + Material Symbols, keyframes,
      range inputs, scrollbars, reduced-motion
- [x] `shared/ui/Icon.tsx` — Material Symbols Rounded (`fill` = filled variant)
- [x] `shared/ui/primitives.tsx` — Hero, Blobs, PageTitle, SectionLabel, Eyebrow,
      StatTile, StatusPill, Tag, ProgressBar, EmptyState, TableHead, Num,
      PersonCell, ScoreCell

**Shells and chrome**
- [x] `app/layouts/AppShell.tsx` — the single shell. Sidebar (two nav groups) on
      desktop; bottom nav + FAB on mobile. Replaces AdminLayout /
      ParticipantLayout / PublicLayout, all three now deleted.
- [x] `app/main.tsx` (root + ThemeProvider + BrowserRouter) · `app/App.tsx` (route tree)
- [x] `shared/ui/NotBuiltYet.tsx` — placeholder for unwritten screens
- [x] `.claude/launch.json` — `preview_start` config for the dev server

**Screens written (14)** — all on the design system
- [x] S-01 Landing (the one screen outside `AppShell`) · S-03 Discover ·
      S-04 Public challenge detail
- [x] S-13 Admin dashboard · S-26 Challenges list · S-28 Challenge control room
      (Overview / Registrations / Submissions / Judging / Leaderboard tabs)
- [x] S-30 Form builder · S-54 Registration form (dynamic)
- [x] S-46 Judge queue · S-47 Scoring screen (blind mode, recusal, weighted rubric)
- [x] S-51 Participant dashboard · S-55 My entries · S-62 Awards
      (`modules/participants/`)
- [x] `modules/challenges/components.tsx` — ChallengeCard, StageStepper

**Screens NOT written** (all routed to `NotBuiltYet`, none 404)
- [ ] S-16 Members · S-23 Audit log · S-24 Analytics · S-14 Workspaces · S-19..22 Settings
- [ ] S-07 Certificate verification · S-59 Leaderboard (participant) · S-60 Results
- [ ] Everything else in `UI_SCREENS.md`

**Demo data** (now the seed source, not a runtime dependency)
- [x] `src/mock/data.ts` — 3 orgs, 4 workspaces, 6 challenges (photography,
      hackathon, wellness, meme, design, pitch), 5 form schemas, 18 registrations,
      16 submissions, leaderboard, rubric, members, audit log, badges, certificates

### Phase 2 / 3
Not started. See [ROADMAP.md](ROADMAP.md).

## 3. Next three actions (in order)

1. **Test the form engine.** Add Vitest and write the seven cases in
   [SPEC_FORM_ENGINE §10](SPEC_FORM_ENGINE.md) against `core/forms/conditions.ts`
   and `core/forms/compiler.ts`. It is the one piece of real logic in the repo and
   it is completely unguarded — see §5.
2. **Widen the mock data.** Only `ch_monsoon` has submissions, so "My entries"
   shows a single row and the Judged/Archived tabs are empty. Give two or three
   more challenges submissions so the design's list states are exercised.
3. **Configure ESLint + `eslint-plugin-boundaries`** so the
   `app → modules → core → shared` rule is enforced rather than merely documented.
   There is no linter in the repo at all right now.

## 4. Open questions (need a human decision)

| # | Question | Why it matters | Default if unanswered |
|---|---|---|---|
| Q1 | Firestore region | Cannot be changed later | `asia-south1` |
| Q2 | Accept `get()` cost in security rules? | 1 extra read per rule eval | Yes, with compact custom claims — [SPEC_RBAC §6](SPEC_RBAC.md) |
| Q3 | Drive OAuth: per-org account or platform service account? | Quota ownership + trust story | Per-org (matches the cost invariant) |
| Q4 | Free tier limits | Shapes billing + rules | Unlimited during MVP |
| Q5 | Teams in MVP or Phase 2? | Registration shape | Phase 2; `Registration.team` exists from day one so no migration |
| Q6 | White-label / custom domains timing | Hosting + branding | Phase 3 |
| **Q7** | **Keep `useFormEngine`, or move to React Hook Form as CONVENTIONS §6 mandates?** | The demo deviates from the documented stack — see ADR-013 | Revisit before the backend lands; do not build more forms on it until decided |
| **Q8** | **Is the product called ChallengeOS or Forge?** | The running app, the `<title>`, the repo directory and the imported design system all say **Forge**; every doc (README, BRAIN, CLAUDE) says **ChallengeOS**. Both names are currently shipping. | Unresolved — **not renamed unilaterally.** Pick one, then sweep the docs or the UI to match |

## 5. Known risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Form engine has no tests** | It decides validation for every challenge on the platform; a regression is silent and product-wide | Vitest + the seven cases in [SPEC_FORM_ENGINE §10](SPEC_FORM_ENGINE.md) — do this before adding a 15th field type |
| ~~Nothing has compiled yet~~ | Resolved — typecheck and production build are both clean | — |
| Drive API quota at deadline peaks | Uploads fail when it matters most | Resumable + backoff + client queue |
| Security rules grow untestable | Tenant leak — the one bug that ends the product | Emulator rule tests from the first rule written |
| Firestore 1 MB doc limit on leaderboards | Large challenges break | Paginated leaderboard pages, 50 rows each |
| Offline sync conflicts on scores | Silent data loss | Append-only score ledger (ADR-009) |

## 6. Decisions made this session

**This session:** **ADR-015** — one application shell, and `app/tokens.ts` is the
single source of colour. Recorded in [DECISIONS.md](DECISIONS.md).

Also: the route tree lives in `App.tsx`; no separate `router.tsx` was created
(revisit if lazy loading or data routers land). `@types/node` added as a dev
dependency so `vite.config.ts` typechecks. `npm run typecheck` is `tsc -b
--noEmit`. `@mui/icons-material` is now unused by app code — the design uses
Material Symbols Rounded — but is left installed pending a sweep.

**Previous session** — three ADRs recorded in [DECISIONS.md](DECISIONS.md):

* **ADR-012 — Field registry is split into a pure half and a React half.**
  Resolves a genuine contradiction: SPEC_FORM_ENGINE §4 put React components in
  `core/forms`, while CLAUDE.md hard rule 8 forbids React in `core/`. The spec
  has been corrected to match.
* **ADR-013 — Demo forms use a bespoke `useFormEngine` hook, not React Hook Form.**
  Recorded as a **deviation to revisit**, not a settled improvement. See Q7.
* **ADR-014 — Tailwind v4 imported without preflight** so it cannot reset MUI's
  baseline.

Stack deviations from the documented tech stack, all deliberate for a
backend-free demo: React 18 (not 19), no TanStack Query (mock data is
synchronous), no Framer Motion (one CSS keyframe instead), no React Hook Form
(see ADR-013). `src/mock/` is a new top-level directory, now recorded in
[ARCHITECTURE.md §3](ARCHITECTURE.md).

## 7. Update protocol (for agents)

When you finish a unit of work, edit **this file only** as follows:

* Flip the relevant checkbox(es) in §2.
* Rewrite §1 in one paragraph if the situation changed.
* Rewrite §3 so the next agent has three concrete actions.
* Add to §4/§5 if you discovered something; remove entries that were resolved.
* Update the header block (date, who, phase, build health).

Do **not** paste diffs, file lists, or narrative history here. Git holds that.
This file answers exactly one question: *"What should I do next, and what will
bite me?"*

---

## 8. Backend status (branch `feat/firebase-backend`)

**Live.** Firebase project `forge-4d40a`. Firestore seeded with `org_demo`
(108 documents). Rules and indexes deployed. All 14 screens read live data;
`src/mock/data.ts` is now only the seed source, not a runtime dependency.

**Verified against the live project, not reasoned about:**

| Check | Result |
|---|---|
| Reads the demo needs, signed out | 8/8 allowed |
| Writes that must never happen | 6/6 denied |
| Cross-tenant isolation | 3/3 denied |
| Routes walked cold | 13, zero console errors |
| Read cost per viewer | **2** (vs 95 per-collection) |

**Read cost is the load-bearing number.** A full walkthrough querying each
collection costs 95 document reads; at 700 viewers that is 66,500 against a
50,000/day free quota — the demo dies partway through. Two pre-joined snapshot
documents bring it to 2 reads/viewer, 1,400 for 700 people, 2.8% of quota, with
headroom for ~25,000 viewers/day. See `src/core/firebase/snapshot.ts`.

**Still not built** — the full list is in [DEPLOY.md](../DEPLOY.md#what-is-not-built):
no Cloud Functions (so `counters`, `user.stats` and leaderboard pages are seeded,
not maintained); the app reads but does not write; no Drive uploads; the judge
queue is not assignment-driven; **rules have no emulator test suite** — the 17
live checks are a probe, not the suite DATA_MODEL.md §6 requires.

**Two things to undo before real customers:**
1. ADR-016 — delete `isDemoOrg` / `demoReadable` from `firestore.rules`.
2. Rotate the service-account key used to seed; one was exposed in a chat
   transcript on 2026-07-29 and must be deleted in the Firebase console.

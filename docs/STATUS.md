# STATUS.md — Living Project State

> **This is the first file any agent reads and the last file any agent writes.**
> It is the handoff between sessions. Keep it accurate over keeping it pretty.
> Stable truths belong in [BRAIN.md](BRAIN.md), not here.

---

**Last updated:** 2026-07-29
**Updated by:** Claude (production hardening — writes, RBAC, Drive, tooling)
**Current phase:** **Phases 0, 1 and 2 complete.** Phase 3 is blocked on Blaze, not effort
**Repo state:** 15 screens on live Firestore (project forge-4d40a, org_demo seeded); the app now **writes**
**Build health:** typecheck clean · lint clean (0 errors, 0 warnings) ·
**345 unit tests + 75 security-rules tests, all passing** · production build
clean, service worker generated · **22 routes walked in a real browser with 0
console errors** · no route renders `NotBuiltYet` any more
**Rules + indexes are DEPLOYED to `forge-4d40a`** (2026-07-29) and reads were
re-verified against them afterwards.

---

## 1. Where we are, in one paragraph

**This session** turned a read-only demo into something with a spine. The three
Phase 0 gaps that had been open since the beginning are closed: there is a test
suite (**187 tests** over the form engine, the Drive parser, RBAC and slugging),
ESLint runs with `eslint-plugin-boundaries`, and the layer rule is now *enforced*
— which immediately surfaced 21 real violations, all fixed by moving design
tokens to `shared/design/` and the auth context to `core/auth/` (ADR-021). Two
engines that were specified but unbuilt now exist and are pure and tested:
`core/rbac` (permission catalog, seven built-in roles, scoped grants) and
`core/drive` (link parsing, `FileRef` construction, cover resolution). The app
writes: challenge create/edit/delete, rubric editing, registrations, submissions,
judge reviews and schema publishing all persist, each with a matching security
rule. Admin bootstrapping is real via redeemable invites (ADR-020) rather than
scaffolding. Google Drive is integrated link-first (ADR-017) — paste a share
link for an event cover or a file answer, with validation that explains what is
wrong instead of failing silently.

### The story before this session

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
- [x] `eslint-plugin-boundaries` dependency rule — **enforced.** `npm run lint`.
      Caught 21 violations on first run; all fixed, not excused (ADR-021).
      Note: the rule needs `eslint-import-resolver-typescript` or it silently
      passes — see the note on ADR-021.
- [x] Vitest + unit tests — **187 passing.** `npm run test`
      · `core/forms` (86) — all seven cases from SPEC_FORM_ENGINE §10
      · `core/drive` (45) · `core/rbac` (34) · `core/challenges` (22)
- [x] Firebase project / env contract / typed data layer — **live**, see §8
- [x] **Rules test suite — 48 tests, executed and passing** against the real
      Firestore emulator. `npm run test:rules`. Covers tenant isolation,
      privilege escalation via invites (ADR-020), the ADR-019 counter bound,
      the ADR-018 collection-group read, append-only scores, and every
      Function-only collection.
      **On this machine `java` is 8, which the emulator refuses.** JDK 21 ships
      with Android Studio — point `JAVA_HOME` at
      `C:\Program Files\Android\Android Studio\jbr` first. See the header
      comment in `vitest.rules.config.ts`.
- [x] **CI** — `.github/workflows/ci.yml`. Two jobs: typecheck + lint + unit
      tests + production build, and a separate rules job with JDK 21 for the
      emulator. The rules job is the one that matters — a tenant leak is the bug
      that ends this product, so its suite runs in CI rather than being dropped
      for being inconvenient. Uses `npm ci`, so CI cannot silently test a
      different dependency tree than the one that ships.

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

**Screens added this session (10) — every route now resolves to a real screen**
- [x] **S-27 Challenge editor** (`ChallengeEditor.tsx`) — create and edit in one
      screen, six tabs: Basics, Cover (Drive), Timeline, Stages, Scoring rubric,
      Visibility. Publish gating, live validation, delete with confirmation.
      This is "admins have full control", and every field is data.
- [x] **S-16 Members** (`organizations/Members.tsx`) — member list plus
      invitations. How anyone gets permission to do anything (ADR-020).
- [x] **S-59 Leaderboard** (`challenges/Leaderboard.tsx`) — respects
      `leaderboardMode`, explains an absence rather than rendering nothing,
      marks provisional rows, highlights your own.

- [x] **S-56 Submit entry** (`submissions/SubmitScreen.tsx`) — Drive-linked work,
      draft vs submit, frozen once submitted, late entries accepted and flagged
      rather than rejected.
- [x] **S-23 Audit log** — filterable, with the write-once property stated
- [x] **S-24 Analytics** — entry→submission conversion, judging progress,
      entrants by category. No charting library: every figure is a ratio, and a
      chart bundle would cost 40–100 kB on a screen opened twice.
- [x] **S-14 Workspaces** — read-only list with live challenge counts
- [x] **S-19..22 Settings** — org profile plus a **permission inspector** that
      shows exactly which of the 40 permissions you hold and why. A hidden
      control is otherwise indistinguishable from a missing feature.
- [x] **S-07 Certificate verification** — public, works signed out

- [x] **S-60 Publish results** (`challenges/PublishResults.tsx`) — previews the
      exact ranking before writing it, blocks behind an explicit acknowledgement
      when anything is unscored or provisional, materializes the leaderboard,
      issues podium certificates, completes the challenge, writes an audit entry
      and notifies every entrant. Idempotent by derived ids (ADR-022).

- [x] **S-12 Create an organization** (`organizations/CreateOrganization.tsx`) —
      ROADMAP 1.2. Org → owner membership → roles + first workspace, in that
      order, because each write is authorized by the one before it. A single
      batch cannot express that (all its writes are evaluated against
      pre-batch state), so it is three sequential commits with derived ids so a
      retry resumes. **This is what makes admin control reachable without the
      seed script.**
- [x] **S-00 Welcome / onboarding** (`onboarding/Welcome.tsx`) — three doors:
      enter challenges, run challenges, or look around with no account. The
      choice sets which *surface* you see (`core/auth/mode.ts`), never what you
      may do; permissions still come from `core/rbac` and the rules. The shell
      hides the Organizing nav group from participants, because a wall of
      permission-denied screens reads as a broken app rather than as
      "not for you".

**Screens still NOT written**
- [ ] Everything else in `UI_SCREENS.md` (Phase 2+)

**Infrastructure added this session**
- [x] `shared/ui/ErrorBoundary.tsx` — a render error no longer white-screens the
      app. Resets on navigation; detects a stale-chunk failure after a redeploy
      and offers a reload, which is the only thing that actually fixes it.
- [x] `shared/ui/NotificationBell.tsx` — the in-app inbox, with real unread counts
- [x] `shared/ui/DriveLinkInput.tsx` · `shared/ui/CoverImage.tsx` — Drive covers
- [x] **PWA** — `vite-plugin-pwa`, generated manifest, service worker, install
      prompt and update prompt. Icons are generated by `npm run icons` from
      `scripts/generate-icons.ts` (a hand-written PNG encoder, no binary assets
      to drift from `tokens.ts`).
- [x] Nav badges are now live counts. They were hardcoded `'3'` and `'24'`.

**Demo data** (now the seed source, not a runtime dependency)
- [x] `src/mock/data.ts` — 3 orgs, 4 workspaces, 6 challenges (photography,
      hackathon, wellness, meme, design, pitch), 5 form schemas, 18 registrations,
      16 submissions, leaderboard, rubric, members, audit log, badges, certificates

**Phase 1 feature status**

| # | Feature | State |
|---|---|---|
| 1.1 | Google authentication | [x] sign-in, guest, `users/{uid}` bootstrap, invite redemption |
| 1.2 | Organization creation | [x] **done** — S-12, creator becomes owner |
| 1.3 | Member invite + roles | [x] **done** — invites + 7 built-in roles (ADR-020) |
| 1.4 | Workspaces | [x] **done** — create, rename, delete (refused while non-empty) |
| 1.5 | Challenge CRUD | [x] **done** — S-27 editor, draft→publish, delete |
| 1.6 | Form builder | [x] publishes real versioned schemas |
| 1.7 | Form renderer | [x] compiled Zod, conditional visibility |
| 1.8 | Registration flow | [x] writes, counts, notifies |
| 1.9 | Drive pipeline | [x] link-first (ADR-017); resumable upload needs Blaze |
| 1.10 | Submissions | [x] **done** — S-56, drafts, freeze-on-submit, late flagging |
| 1.11 | Participant dashboard | [x] |
| 1.12 | Admin dashboard | [x] |
| 1.13 | Judging | [x] scores + reviews persist to the append-only ledger |
| 1.14 | Leaderboard | [x] S-59; pages are now materialized by publishing (ADR-022) |
| 1.15 | Result publishing | [x] **done** — S-60, idempotent, audited, notifies (ADR-022) |
| 1.16 | Notifications | [x] **in-app**; push (FCM) deliberately out of scope |
| 1.17 | Installable PWA | [x] **done** |

### Phase 2 — started

- [x] **`core/workflow`** — the last unbuilt pure engine. 49 tests. Expresses all
      four shapes SPEC_WORKFLOW_ENGINE §1 demands (simple, multi-round, ongoing,
      voting) as **the same code path with different documents**. Clock and
      random seed are injected, so advancement is reproducible — an appeal can
      be re-adjudicated from the same inputs months later, and every decision
      carries a human-readable `reason`.
- [x] **CSV export** — registrations, submissions and scores, redacted by
      `piiLevel` by default. Formula injection (`=`, `+`, `-`, `@`, DDE
      payloads) is neutralised on every cell; an exported registrant list is
      untrusted input. 36 tests.
- [x] **Certificates** — issued by publishing, with a public verification page
- [x] **Public challenge discovery** — Discover screen
- [x] **Analytics dashboard**
- [x] **Workflow designer UI** (`challenges/StageDesigner.tsx`) — the Stages tab
      of the challenge editor. Stage kind, advance rule and its parameters,
      deadline windows, reordering. Validated live through the real engine, so
      the designer cannot disagree with what will run.
      It edits the **challenge's own stages** rather than a separate
      `WorkflowDefinition` document: a definition that is not the thing being
      executed is a second source of truth, and its first bug is a challenge
      running a workflow its designer does not show.
- [x] **Ten more field types** — 14 → **24**. phone, time, datetime, currency,
      slider, linearScale, ranking, driveLink, videoUrl, address. Purely
      additive: one entry in `core/forms/registry.ts` and one in
      `modules/forms/fieldComponents.tsx` each, and nothing else in the app
      changed — no code switches on `field.type` (ADR-012).
      `driveLink` is a first-class Drive field using the real parser, so a
      participant gets the same diagnosis an organiser gets on a cover image.
      `ranking` requires every option exactly once: a partial ranking is
      ambiguous — is an omitted item last, or unranked? — and cannot be scored
      honestly.
- [x] **Blind judging, end-to-end.** It was *hardcoded* in the judge screens —
      a challenge that had never chosen it still told judges names were hidden,
      while showing them. Now a real per-challenge setting that flows through
      the queue, the scoring screen and the CSV export (exporting names would
      otherwise undo it in one click).
- [x] **Challenge templates** — duplicate any challenge as a draft. Carries the
      shape, deliberately not the counters, timeline or entrants: a copy should
      be a blank competition shaped like the original, not a second one claiming
      184 entrants who never entered.
- [x] **Team entries** — `teamsEnabled` + `maxTeamSize`; `Registration.team` has
      existed since day one, so no migration.
- [x] **S-09 Public organization page** (`/o/:slug`) — shareable, works signed
      out, shows only public challenges.
- [x] **Community voting** (`/c/:slug/vote`) — one vote per account, enforced by
      the **document id being the voter's uid**. That is the whole
      abuse-prevention design: a second vote overwrites the first rather than
      adding to it, so there is no count to inflate by voting twice, and
      ballot-stuffing costs one account per vote. Changing your mind is the same
      write — a system that punishes a misclick trains people not to participate.
- [x] **QR check-in** (`/org/challenges/:cid/check-in`) — built for someone at a
      door with a queue behind them: search is the primary control (a QR scan
      resolves to the same id as typing a name, so it works without a camera),
      check-in is optimistic, undo is one tap, and it works offline because the
      Firestore SDK queues and replays the writes.
- [x] **Custom roles** — a builder over the 40-permission catalog, in Settings.
      Built-ins are **cloned, not edited**: they are the vocabulary everything
      else is described against, and letting an org redefine "Judge" would make
      every audit entry and support conversation ambiguous.

- [x] **Organization logos from Drive** (`shared/ui/OrgLogo.tsx`) — same parser
      as challenge covers, so "paste a Drive link" means one thing everywhere.
      Falls back to initials on the brand colour, which is the design rather
      than a placeholder. Renders with `contain`, not `cover`: a photo crops
      well, a mark does not.

**Phase 2 is now complete** apart from the offline sync queue, which
`core/sync` documents as deliberately delegated to the Firestore SDK's own
persistence rather than reimplemented on Dexie.

### Where Google Drive images appear (ADR-017)

One parser, `core/drive/links.ts`, behind three surfaces:

| Surface | Control |
|---|---|
| **Challenge cover / event photo** | Challenge editor → Cover tab, with a live preview *and* a card preview |
| **Organization logo** | Create organization → Logo |
| **Participant file answers** | The `driveLink` field type, and the submission screen's "your work" |

All four accept a Drive share link or a plain image URL, warn on the
`/u/0/`-style links that usually are not shared, and degrade to a gradient or
initials rather than a broken-image box.

**Architecture fix found while doing this.** `PublicOrgPage` needed
`ChallengeCard`, which lived in `modules/challenges` — a module importing
another module. Investigating why lint had not caught it revealed the
`boundaries/dependencies` same-module selector **silently fails to match**, so
the policy degraded to "modules → modules, always" and the rule could never
fire. Confirmed with a deliberate probe.

Replaced with a path rule that is verified to fail, which then surfaced **three
real pre-existing violations**. Fixed by moving genuinely shared code to
`shared/ui`: `ChallengeCard`, `StageStepper`, and the form engine's React half
(`FormRenderer` + `fieldComponents`, which ADR-012 always described as the
React counterpart to the pure `core/forms`).

### Phase 3 — blocked on billing, not effort

Webhooks, a public REST API, enterprise SSO, Slack/Discord delivery and AI
review all need a server to hold a secret or receive an inbound request. Spark
has no Cloud Functions, so none of them can exist client-side. Webhooks are the
clearest case: the signature that proves a request came from Forge needs a
secret the browser cannot hold, and an *unsigned* webhook is one anybody can
forge — worse than none.

**The client half of webhooks is built** — Settings → Webhooks registers
endpoints and generates a signing secret. The screen says plainly that nothing
is delivered yet, because a webhook that silently never fires is worse than one
that admits it is not connected. That is the maximum Phase 3 progress available
without a server, and it means enabling Blaze is a deploy rather than a build.

**`functions/` now exists**, written and waiting. `cd functions && npm install
&& npm run deploy` the day billing is on. **It has never run** — treat every
line as unverified until it has executed once against a real project.

| Function | Retires / unblocks |
|---|---|
| `onRegistrationWrite` · `onSubmissionWrite` | ADR-019 — client-incremented counters. Uses `count()` aggregation rather than increments, so the number is *derived* and cannot drift. |
| `onScoreWrite` | Stale leaderboards (SPEC_SCORING §4). **This is the function that makes ranks move.** |
| `dispatchWebhook` | Phase 3 signed webhooks |

**The duplication hazard is closed.** `onScoreWrite` imports the app's own
`core/judging/aggregate.ts` rather than reimplementing it — that file has no
imports of its own, so the Functions `tsconfig` reaches up and compiles the real
thing. The 32 judging tests therefore cover the Cloud Function too. Verified:
`cd functions && npx tsc` compiles clean and `main` resolves.

**Still to do before deploying:** tighten the rules back. `leaderboard` and
`certificates` return to `write: if false`, and the challenge rule drops its
`counters` hatch. Those relaxations exist only because there was no server;
leaving them once there is one would be the worst of both.

**All four pure engines named in CLAUDE.md hard rule 8 now exist and are tested:**
`core/forms` (86) · `core/workflow` (49) · `core/rbac` (44) · `core/judging` (32).

## 3. Next three actions (in order)

1. **Get admin control.** Two routes, and the first needs nothing from anyone:
   * **Create your own org.** Sign in at `/welcome` → "I want to run
     challenges" → "Create an organization". You become its owner with every
     permission, immediately. No seed, no service-account key.
   * **Take ownership of the seeded demo org** (`org_demo`) instead:
     `OWNER_EMAIL=you@gmail.com npm run seed`. This needs a service-account key
     at `./serviceAccountKey.json` — the Admin SDK has no other credential, and
     there is none in the repo (correctly).
2. **Decide on Blaze.** Phases 0–2 are complete; everything still outstanding is
   downstream of this one choice. Enabling it lets you deploy `functions/`,
   which retires ADR-019 and ADR-022 and makes leaderboards live — then tighten
   the two relaxed rules back to `write: if false`.
3. **Three console actions only you can do**, none of which block the branch:
   rotate the service-account key exposed on 2026-07-29, add the Vercel env vars
   and authorized domain, and — *only if real customer data will live in this
   project* — delete `isDemoOrg`/`demoReadable` (ADR-016). While it is a demo,
   the world-readable org is the "see demo data" feature, not a leak.

## 4. Open questions (need a human decision)

| # | Question | Why it matters | Default if unanswered |
|---|---|---|---|
| Q1 | Firestore region | Cannot be changed later | `asia-south1` |
| Q2 | Accept `get()` cost in security rules? | 1 extra read per rule eval | Yes, with compact custom claims — [SPEC_RBAC §6](SPEC_RBAC.md) |
| ~~Q3~~ | ~~Drive OAuth: per-org or platform service account?~~ | **Resolved 2026-07-29** — neither. Drive is link-first, so there is no OAuth at all (ADR-017). The question returns if the resumable upload pipeline is built on Blaze. | — |
| Q4 | Free tier limits | Shapes billing + rules | Unlimited during MVP |
| Q5 | Teams in MVP or Phase 2? | Registration shape | Phase 2; `Registration.team` exists from day one so no migration |
| Q6 | White-label / custom domains timing | Hosting + branding | Phase 3 |
| **Q7** | **Keep `useFormEngine`, or move to React Hook Form as CONVENTIONS §6 mandates?** | The demo deviates from the documented stack — see ADR-013 | Revisit before the backend lands; do not build more forms on it until decided |
| **Q8** | **Is the product called ChallengeOS or Forge?** | The running app, the `<title>`, the repo directory and the imported design system all say **Forge**; every doc (README, BRAIN, CLAUDE) says **ChallengeOS**. Both names are currently shipping. | Unresolved — **not renamed unilaterally.** Pick one, then sweep the docs or the UI to match |

## 5. Known risks

| Risk | Impact | Mitigation |
|---|---|---|
| ~~Rules are written but unproven~~ | Resolved — **48 rules tests pass against the emulator**, including four cross-tenant isolation cases and six privilege-escalation attempts | Keep the suite green; add a case with every new rule |
| ~~The deployed rules are older than this repo~~ | Resolved — deployed 2026-07-29, and all reads re-verified against them with 0 console errors | Re-deploy on every rules change; the tests prove the *file*, not what Firebase is enforcing |
| **Publishing is idempotent, not atomic** | A mid-flight failure leaves a partial publish until it is re-run | Every id is derived, so re-running converges rather than double-awarding (ADR-022). Becomes a Function on Blaze |
| ~~Form engine has no tests~~ | Resolved — 86 tests, all seven SPEC_FORM_ENGINE §10 cases | — |
| ~~Nothing has compiled yet~~ | Resolved — typecheck, lint and build all clean | — |
| **Counters are client-written** | A member could inflate a count | Bounded to two keys by `hasOnly` and recomputable; ADR-019. Reverts to a Function on Blaze |
| **Leaderboard pages are seeded, not computed** | Ranks do not move when scores land | Needs a scheduled Function (Blaze). The score ledger holds the truth meanwhile |
| Drive link rot | A cover silently stops loading when someone un-shares a file | Degrades to the category gradient, never a broken-image box; the editor warns on link shapes that are usually unshared |
| Firestore 1 MB doc limit on leaderboards *and snapshots* | Large orgs break | Paginated leaderboard pages; the seed fails loudly if a snapshot exceeds 1 MiB |
| Offline sync conflicts on scores | Silent data loss | Append-only score ledger (ADR-009) |

## 6. Decisions made this session

**This session — five ADRs**, all in [DECISIONS.md](DECISIONS.md):

* **ADR-017 — Drive is link-first, not upload-first.** Paste a share link; we
  derive a `FileRef`. No OAuth, no consent screen, no bytes stored, and no
  upload to fail at a deadline. What it cannot do is verify sharing, so the UI
  is explicit about what it knows versus guesses.
* **ADR-018 — `collectionGroup` for "my registrations"**, with the org boundary
  re-asserted in code as well as in rules.
* **ADR-019 — counters are client-incremented**, bounded to two keys by
  `hasOnly`. A known trade-off, taken because "0 entrants" on a live challenge
  is a worse daily failure than a number someone could inflate.
* **ADR-020 — admin access is bootstrapped by redeemable invites.** The client
  redeems a grant, it never mints one. Requires a verified email.
* **ADR-021 — tokens moved to `shared/design/`, auth context to `core/auth/`.**
  Forced by turning the boundary rule on, which found 21 real violations.

**Also worth knowing:** the boundary rule silently passed until
`eslint-import-resolver-typescript` was added — the `@app/…` aliases were
unresolvable, so every check trivially succeeded. If you add a lint rule, verify
it can fail before trusting it.

**Previously:** **ADR-015** — one application shell, and the token file is the
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

**The app now writes.** Registrations, submissions, judge reviews, score-ledger
events, challenge create/edit/delete, rubric edits, schema publishing, invites
and notifications all persist, each with a matching rule. `firestore.rules` grew
correspondingly — invites, the notification inbox, the bounded counter update,
and self-service membership with an escalation guard.

> **The new rules have not been deployed or executed.** Run
> `npm run rules:deploy` before expecting any write to succeed against
> `forge-4d40a`, and `npm run test:rules` (JDK 21) before trusting them.

**Still not built:** no Cloud Functions, so `user.stats` and leaderboard pages
are seeded rather than maintained, and results publishing (1.15) has no owner.
No resumable Drive upload — links only, by decision (ADR-017). The judge queue
is still not assignment-driven. No CI.

**Three things to undo before real customers:**
1. ADR-016 — delete `isDemoOrg` / `demoReadable` from `firestore.rules`.
2. ADR-019 — move counters to a Function and re-tighten the challenge update rule.
3. Rotate the service-account key used to seed; one was exposed in a chat
   transcript on 2026-07-29 and must be deleted in the Firebase console.

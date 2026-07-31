# Forge

**The operating system for engagement.**

A multi-tenant SaaS platform that lets any organization create, manage, judge and
reward challenges, competitions, campaigns and submission-based activities — from
a single configurable deployment. One codebase, thousands of isolated
organizations.

> The goal is not to replace Google Forms.
> The goal is to replace the fragmented workflow spread across Google Forms,
> Drive, WhatsApp, Excel, Email and manual result announcements.

---

## Contents

1. [What it does](#what-it-does)
2. [How the app works](#how-the-app-works)
3. [How to use it](#how-to-use-it)
4. [What's built](#whats-built)
5. [What's left](#whats-left)
6. [Running it locally](#running-it-locally)
7. [Architecture](#architecture)
8. [Design principles](#design-principles)
9. [Documentation](#documentation)

---

## What it does

One object sits at the centre: the **Challenge**. It can be a photography
contest, a hackathon, an employee engagement campaign, a step challenge, an
assignment submission, a scholarship application, or a meme contest.
Organizations **configure** it rather than requesting a feature.

| Instead of | Forge gives you |
|---|---|
| Google Forms | A JSON-driven form builder — 24 field types, conditional logic, live validation |
| Google Drive + email | Drive links validated and stored as structured file references |
| Excel + WhatsApp judging | Rubrics, judge queues, blind judging, pluggable scoring |
| A PDF on WhatsApp | Materialized leaderboards with configurable visibility |
| Canva, one file per person | Templated certificates with public verification |
| Nothing | Analytics, audit logs, CSV export with PII controls, a participant portfolio |

---

## How the app works

### Three people, three experiences

Forge separates **who you are** from **what you are looking at**. A single
account can be an organizer in one org and a participant in another, so the app
asks which door you want rather than inferring it.

* **Participant** — discovers challenges, registers, submits, votes, collects
  awards and certificates. Sees *concise* detail: what to do, by when, and what
  they have already done.
* **Organizer** — creates challenges, frames the questions, defines the stages
  and rubric, runs judging, publishes results. Sees the full control room.
* **Demo** — a read-only walk-through of a fully seeded organization. **No
  account required.**

The chosen mode is a **view preference, never a permission**. Permissions come
from your membership document and are enforced by Firestore Security Rules;
switching mode cannot grant you anything.

### The four engines

Everything configurable is decided by a **pure engine** — no React, no Firebase,
no I/O. They take data and return data, which is why the same code can run in the
browser for instant feedback and on the server for authority, with identical
results.

| Engine | Decides |
|---|---|
| `core/forms` | Field types, conditional visibility, Zod validation, publish-safety |
| `core/workflow` | Stages, rounds, who advances and who is eliminated |
| `core/rbac` | 41 permissions across 7 built-in roles, plus custom roles |
| `core/judging` | Score aggregation, provisional scores, ranking, ties |

Two fairness invariants live in the workflow engine and are worth knowing: an
**unscored entry is held, never eliminated**, and a **top-N cut is refused
entirely while anyone is still unscored**. A missing review is never a zero.

### The data path

```
Component → hook (TanStack Query) → core/firebase → Firestore
                                          ↑
                             Security Rules decide, always
```

Components never import `firebase/firestore` — ESLint forbids it. Every read and
write is scoped under `organizations/{orgId}/…`, so a forgotten filter cannot leak
another tenant's data; it is a structural property of the path, not a discipline.

Participant-facing writes enqueue through `core/sync`, so they survive going
offline. The app is an installable PWA with a Workbox service worker.

### Where images come from

Forge **stores references, not bytes** — files stay in the organization's own
storage, which is what makes a free tier possible.

For a challenge cover or an org logo you **paste any link**. If it is a Google
Drive link, `core/drive` extracts the file id and rewrites it to
`drive.google.com/thumbnail?id=…&sz=w1600` — the form that actually renders in an
`<img>` and is not rate-limited the way `uc?export=view` is. Any other `https://`
image URL is used as-is. Links of the `/u/2/` or `usp=drive_web` shape are
flagged, because those are personal-session links that are usually not shared and
will 404 for everyone but you.

**The one thing to get right:** the Drive file must be shared as *Anyone with the
link → Viewer*. Forge cannot make it public for you.

---

## How to use it

### As an organizer

1. **Sign in** at `/welcome` → *"I want to run challenges"*.
2. **Create an organization.** You become its owner with every permission
   immediately — no seed script, no service-account key.
3. **New challenge** (`/org/challenges/new`). Six tabs, and nothing is
   hardcoded:
   * **Basics** — title, type, summary, description
   * **Cover** — paste a Drive or image link; live preview
   * **Timeline** — registration and submission windows
   * **Stages** — the workflow designer: rounds, advance rules, cuts
   * **Scoring** — rubric criteria and weights, blind judging on/off
   * **Visibility** — public, org-only, or unlisted; teams on/off
4. **Frame the questions** in the form builder (`…/form`). Drag from a palette of
   24 field types, set conditional logic ("show this only if…"), and preview
   exactly what an entrant sees. Publishing a schema **freezes it** — editing a
   published form creates version *n+1*, and existing submissions keep pointing
   at the version they were made against, so answers can never be reinterpreted
   under a new schema.
5. **Run it** from the control room (`/org/challenges/:cid`): registrations,
   submissions, check-in, judge assignment, progress.
6. **Judge** (`/judge`) — a queue, a rubric, keyboard-driven scoring, recusal.
   Blind judging is a real per-challenge setting that flows through the queue,
   the scoring screen *and* the CSV export.
7. **Publish results** (`…/publish`) — freezes the leaderboard and issues
   certificates.
8. **Export** — CSV with formula-injection escaping and PII redaction gated by
   the exporting member's permissions.

### As a participant

`/discover` → open a challenge → **Register** → **Submit** → watch the
leaderboard, vote if community voting is on, collect awards at
`/me/achievements`. Entries live at `/me/registrations`. Certificates carry a
public verification URL (`/verify/:certId`) that anyone can check without an
account.

### As a visitor

`/welcome` → *"Just show me around"*. No account. A seeded organization with six
challenges, real submissions, scores and leaderboards.

### In-app notifications

A notification centre in the header, per user per org: registration confirmed,
stage advanced, scored, results published. **In-app only, by decision** — push
notifications (FCM) are deliberately not wired.

---

## What's built

Phases 0, 1 and 2 are **complete**. Phase 3's server code is written and
**emulator-verified**, awaiting only a billing decision to deploy.

**Verified state:** 29 routes · 91 source files · 345 unit tests · 75 security
rules tests · 22 Cloud Function assertions · typecheck, lint and production build
clean · 0 inert controls and 0 console errors across every route.

| Area | State |
|---|---|
| Form engine | ✅ 24 field types, conditional logic, Zod compilation, cycle detection, immutable versioning |
| Form builder UI | ✅ Palette, live preview, publish gate |
| Workflow engine + designer | ✅ 8 advance rules, deterministic (injected clock + seed) |
| RBAC | ✅ 41 permissions, 7 built-in roles, custom roles, scoped grants |
| Security rules | ✅ Deployed, 75 tests, tenant isolation + collection-group rules |
| Auth | ✅ Google + anonymous, separated organizer/participant/demo onboarding |
| Challenge editor | ✅ Full organizer control over every aspect of their own competition |
| Judging | ✅ Queues, rubrics, blind judging, recusal, provisional scores |
| Leaderboards | ✅ Materialized, paginated, provisional-aware |
| Community voting | ✅ One vote per account, changeable |
| QR check-in | ✅ |
| Certificates | ✅ Templated, publicly verifiable |
| Google Drive | ✅ Link parsing, thumbnail rewriting, `FileRef`, covers and logos |
| CSV export | ✅ Formula-injection escaping, permission-gated PII redaction |
| In-app notifications | ✅ |
| PWA | ✅ Installable, Workbox service worker, offline sync queue |
| Analytics + audit log | ✅ |
| Cloud Functions | ⏸ Written, emulator-verified, **not deployed** (needs Blaze) |
| Webhooks | ⏸ Configuration + signing secrets built; delivery needs Blaze |
| CI | ✅ 3 jobs: unit/lint/build, security rules, Cloud Functions |
| Vercel | ✅ `vercel.json` with correct cache headers for hashed assets vs. `sw.js` |

---

## What's left

### Blocked on one decision: the Firebase **Blaze** plan

The project is on **Spark (free)**, which has no Cloud Functions. That single
fact is what everything outstanding hangs off. The code is written and verified —
this is a deploy, not a build:

```bash
npm --prefix functions install && npm --prefix functions run deploy
```

| Unlocks | Why it needs a server |
|---|---|
| Live leaderboards | `onScoreWrite` is the function that makes ranks move |
| Drift-proof counters | `count()` aggregations replace client increments (ADR-019) |
| Webhook **delivery** | The HMAC signature needs a secret a browser cannot hold |
| Public REST API, SSO, Slack/Discord, AI review | All need a reachable inbound endpoint |

Immediately after deploying, **tighten the rules back**: `leaderboard` and
`certificates` return to `write: if false`, and the challenge-update rule drops
its `counters` escape hatch. Those two relaxations exist *only* because there was
no server.

### Console actions only the account owner can do

These do not block merging the branch:

1. **Rotate the service-account key** exposed in a chat transcript on 2026-07-29.
2. **Vercel** — set the 7 `VITE_` env vars, and add the deployed domain to
   Firebase → Authentication → Authorized domains.
3. **Delete the demo predicates** (`isDemoOrg` / `demoReadable`, ADR-016) — but
   *only* once real customer data will live in this project. While it is a demo,
   the world-readable org is the "show me around" feature, not a leak.

### Known gaps, honestly

* **Push notifications are not built** — in-app only, by decision.
* **React Hook Form is absent** (ADR-013) — a bespoke `useFormEngine` instead,
  flagged for revisit.
* The emulator proves the functions' logic but cannot prove **hosting**: IAM,
  region placement, cold starts, and egress to the public internet.

---

## Running it locally

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your Firebase web config. These
values are **public** by design — they ship in the client bundle, and access is
controlled by `firestore.rules`, not by hiding them. Full walkthrough in
[DEPLOY.md](DEPLOY.md).

```bash
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build + PWA service worker |
| `npm run verify` | typecheck + lint + unit tests |
| `npm run test:rules` | Security rules against the Firestore emulator (**needs JDK 21**) |
| `npm run test:functions` | Cloud Functions against the emulator (**needs JDK 21**) |
| `npm run rules:deploy` | Deploy rules and indexes only |
| `npm run seed` | Seed the demo org (needs a service-account key you provide) |
| `npm run icons` | Regenerate PWA icons |

⚠️ Use `npm run rules:deploy`, never a bare `firebase deploy` — `firebase.json`
declares a `functions` block so the emulator can load them, and deploying
functions fails on Spark.

---

## Architecture

```
React PWA  ──▶  Firestore (+ Security Rules)  ──▶  Cloud Functions (4, minimal)
                                                          │
                                            Customer's own Google Drive
```

Client-heavy by design. Files never touch our infrastructure — organizations use
their own storage quota, which is what makes a free tier possible.

Four layers, strictly one-directional and **enforced by ESLint**, not convention:

```
app  ──▶  modules  ──▶  core  ──▶  shared
```

`app/` routing and theme · `modules/` feature screens · `core/` pure engines and
the data layer · `shared/` design tokens and reusable UI.

**No module imports another module.** Cross-feature needs go through `core/` or a
shared contract type.

**Stack.** React 18 · Vite 6 · TypeScript strict · Tailwind v4 · MUI 6 · React
Router · Zod · TanStack Query · Firebase Auth + Firestore · Vitest ·
vite-plugin-pwa (Workbox) · Vercel.

---

## Design principles

1. **Configuration over code.** If a customer might want it different, it is data
   — not a `switch` statement.
2. **Generic over vertical.** No layer assumes "college", "hackathon", or any
   single customer type.
3. **Extension over modification.** New field types, storage providers, judging
   strategies and stage types are registered, never patched in.
4. **The client is never the authority.** UI permission checks are UX; security
   rules are enforcement. Every client guard has a server-side twin.
5. **Tenant isolation is structural.** Data lives under `organizations/{orgId}/…`,
   so a forgotten filter cannot leak another org.
6. **Schemas are immutable once published.** Editing creates version *n+1*; field
   ids are forever, because answers are keyed by them.
7. **A control you cannot use is hidden, not disabled.** A greyed-out button is
   indistinguishable from a bug, so screens explain *which role* would grant it.

---

## Documentation

| Doc | What it answers |
|---|---|
| [AGENT.md](AGENT.md) | Agent router + the ten hard rules |
| [DEPLOY.md](DEPLOY.md) | Firebase and Vercel setup, step by step |
| [docs/STATUS.md](docs/STATUS.md) | Where we are, what's next, what's blocked |
| [docs/BRAIN.md](docs/BRAIN.md) | Vision, domain model, vocabulary, invariants |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layering, folder tree, data flow |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Firestore schema, indexes, security rules |
| [docs/SPEC_FORM_ENGINE.md](docs/SPEC_FORM_ENGINE.md) | The dynamic form engine |
| [docs/SPEC_WORKFLOW_ENGINE.md](docs/SPEC_WORKFLOW_ENGINE.md) | Stages and progression |
| [docs/SPEC_RBAC.md](docs/SPEC_RBAC.md) | Permissions and tenant isolation |
| [docs/SPEC_STORAGE.md](docs/SPEC_STORAGE.md) | Pluggable storage, Drive flow |
| [docs/SPEC_SCORING.md](docs/SPEC_SCORING.md) | Judging, leaderboards, rewards, certificates |
| [docs/SPEC_OFFLINE.md](docs/SPEC_OFFLINE.md) | Offline-first sync and PWA |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | Code style and definition of done |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision records (ADR-001…023) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase sequencing and scope |
| [docs/AGENT_PLAYBOOK.md](docs/AGENT_PLAYBOOK.md) | How to work in this repo |

# Forge

**The operating system for engagement.**

A multi-tenant SaaS platform that lets any organization create, manage, judge and
reward challenges, competitions, campaigns and submission-based activities — from
a single configurable system.

> The goal is not to replace Google Forms.
> The goal is to replace the fragmented workflow spread across Google Forms,
> Drive, WhatsApp, Excel, Email, Discord, Slack and manual result announcements.

---

## What it does

One object sits at the centre: the **Challenge**. It can be a photography
contest, a hackathon, an employee engagement campaign, a sales leaderboard, an
assignment submission, a fitness challenge, a scholarship application, or a meme
contest. Organizations configure it rather than requesting a feature.

| Instead of | ChallengeOS gives you |
|---|---|
| Google Forms | A dynamic, JSON-driven form builder — 28 field types, conditional logic |
| Google Drive + email | Direct-to-your-own-Drive uploads with structured metadata |
| Excel + WhatsApp judging | Rubrics, judge queues, blind judging, pluggable scoring strategies |
| A PDF on WhatsApp | Materialized leaderboards with configurable visibility |
| Canva, one file per person | Templated certificates with public verification |
| Nothing | Analytics, audit logs, and a permanent participant portfolio |

## Status

**Phase 1 — MVP frontend, demo mode.** A running React app with no backend: the
form engine is real (schema types, condition evaluator, Zod compiler, field
registry), fourteen screens are built on the imported **Forge design system**
(Material Design 3, warm amber), and all data comes from `src/mock/`. Firebase,
auth, security rules and CI are still Phase 0 items and have not started.

`npm run dev` works. `npm run typecheck` and `npm run build` are clean.

The one thing to know before touching the form engine: **it has no tests yet**,
and it decides validation for every challenge on the platform.

See [docs/STATUS.md](docs/STATUS.md) for live state and the next three actions.

## Documentation

| Doc | What it answers |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Agent router + the ten hard rules |
| [docs/BRAIN.md](docs/BRAIN.md) | Vision, domain model, vocabulary, invariants |
| [docs/STATUS.md](docs/STATUS.md) | Where we are, what's next, what's blocked |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layering, folder tree, data flow |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Firestore schema, indexes, security rules |
| [docs/SPEC_FORM_ENGINE.md](docs/SPEC_FORM_ENGINE.md) | The dynamic form engine |
| [docs/SPEC_WORKFLOW_ENGINE.md](docs/SPEC_WORKFLOW_ENGINE.md) | Stages and participant progression |
| [docs/SPEC_RBAC.md](docs/SPEC_RBAC.md) | Permissions and tenant isolation |
| [docs/SPEC_STORAGE.md](docs/SPEC_STORAGE.md) | Pluggable storage, Drive upload flow |
| [docs/SPEC_SCORING.md](docs/SPEC_SCORING.md) | Judging, leaderboards, rewards, certificates |
| [docs/SPEC_OFFLINE.md](docs/SPEC_OFFLINE.md) | Offline-first sync and PWA |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | Code style and definition of done |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision records |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase sequencing and scope |
| [docs/AGENT_PLAYBOOK.md](docs/AGENT_PLAYBOOK.md) | How to work in this repo |

## Architecture at a glance

```
React PWA  ──▶  Firestore (+ Security Rules)  ──▶  Cloud Functions (7, minimal)
                                                          │
                                            Customer's own Google Drive
```

Client-heavy by design. Files never touch our infrastructure — organizations use
their own storage quota, which is what makes a free tier possible.

Four layers, strictly one-directional:

```
app  ──▶  modules  ──▶  core  ──▶  shared
```

`core/` holds the pure engines — forms, workflow, RBAC, judging, storage, sync —
with no React, no Firebase and no I/O, so the same code runs client-side for
optimistic UI and server-side for authority, with identical results.

## Tech stack

**Frontend** React · Vite · TypeScript (strict) · Tailwind · MUI · React Router ·
React Hook Form · Zod · TanStack Query · Framer Motion · Workbox · IndexedDB

**Backend** Firebase Auth · Cloud Firestore · FCM · Cloud Functions

**Storage** Google Drive API (MVP) → Firebase Storage / S3 / R2 (pluggable)

**Deploy** Vercel · Firebase · Sentry

## Getting started

```bash
npm install
```

```bash
npm run dev
```

> Scaffold not yet created — see [docs/STATUS.md](docs/STATUS.md) §3 for the
> first three tasks.

## Design principles

1. **Configuration over code.** If a customer might want it different, it is
   data — not a `switch` statement.
2. **Generic over vertical.** No layer assumes "college", "hackathon", or any
   single customer type.
3. **Extension over modification.** New field types, storage providers, judging
   strategies and stage types are registered, never patched in.
4. **The client is never the authority.** UI permission checks are UX; security
   rules are enforcement.
5. **Tenant isolation is structural.** Data lives under
   `organizations/{orgId}/…`, so a forgotten filter cannot leak another org.

# ChallengeOS — Agent Operating Manual

> Multi-tenant SaaS to create, run, judge and reward **challenges** of any kind.
> One deployment. Thousands of isolated organizations.
> **Everything is configuration. Nothing is hardcoded.**

This file is loaded into every agent context. Keep it under ~150 lines.
It is a **router**, not a spec. Load only the doc your task actually needs.

---

## Doc router

| Your task touches… | Read |
|---|---|
| Product intent, domain vocabulary, invariants | [docs/BRAIN.md](docs/BRAIN.md) |
| What exists right now, what's next | [docs/STATUS.md](docs/STATUS.md) |
| Folder layout, layering, dependency rules | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Firestore paths, document shapes, indexes, rules | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| Dynamic form builder / renderer / field types | [docs/SPEC_FORM_ENGINE.md](docs/SPEC_FORM_ENGINE.md) |
| Stages, rounds, participant progression | [docs/SPEC_WORKFLOW_ENGINE.md](docs/SPEC_WORKFLOW_ENGINE.md) |
| Roles, permissions, security rules | [docs/SPEC_RBAC.md](docs/SPEC_RBAC.md) |
| File uploads, Google Drive, providers | [docs/SPEC_STORAGE.md](docs/SPEC_STORAGE.md) |
| Judging, rubrics, leaderboards, rewards, certificates | [docs/SPEC_SCORING.md](docs/SPEC_SCORING.md) |
| Offline, sync queue, PWA | [docs/SPEC_OFFLINE.md](docs/SPEC_OFFLINE.md) |
| Colour, spacing, icons, shells, "how should this look?" | `src/shared/design/tokens.ts` + [docs/CONVENTIONS.md §7](docs/CONVENTIONS.md) |
| Permissions, roles, who-can-do-what | `src/core/rbac/` + [docs/SPEC_RBAC.md](docs/SPEC_RBAC.md) |
| Google Drive links, covers, `FileRef` | `src/core/drive/links.ts` + ADR-017 |
| Code style, naming, query keys, testing | [docs/CONVENTIONS.md](docs/CONVENTIONS.md) |
| "Why is it built this way?" | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Phase/feature sequencing | [docs/ROADMAP.md](docs/ROADMAP.md) |
| How to pick up and finish a task | [docs/AGENT_PLAYBOOK.md](docs/AGENT_PLAYBOOK.md) |

**Do not read all docs.** Router first, one or two specs, then work.

---

## The ten hard rules

These are invariants. Violating one is a bug even if tests pass.

1. **No hardcoded domain.** Never hardcode a challenge type, form field, workflow
   stage, judging formula, role, or reward type. If a customer would want it
   different, it is data — not a `switch` statement.
2. **Every read and write is tenant-scoped.** No Firestore query may exist without
   an `orgId` boundary in its path. `collectionGroup` queries require an explicit
   security-rule justification recorded in `docs/DECISIONS.md`.
3. **The client is never the authority.** UI permission checks are UX only.
   Firestore Security Rules + Cloud Functions are the enforcement layer.
   Every client-side guard must have a server-side twin.
4. **Storage is behind an interface.** Never import a provider SDK outside
   `src/core/storage/providers/`. Application code sees `StorageProvider` and
   `FileRef` only.
5. **We store references, not bytes.** Files live in the customer's own storage
   (Drive first). We persist `FileRef` metadata. This is a cost invariant.
6. **Schemas are versioned and immutable once published.** Editing a published
   `FormSchema` or `WorkflowDefinition` creates version `n+1`. Existing
   submissions keep pointing at the version they were made against.
7. **Field `id`s are forever.** Never rename, reuse, or reorder-by-mutating a
   form field id. Answers are keyed by it.
8. **Engines are pure.** `core/forms`, `core/workflow`, `core/rbac`,
   `core/judging` contain no Firebase imports, no React, no I/O. They take data,
   return data, and are unit-testable in isolation.
9. **Zod at every boundary.** Anything crossing the network, storage, or a
   `JSON.parse` is parsed with a Zod schema. `any` is banned; `unknown` + parse.
10. **Writes go through the sync layer.** Participant-facing mutations enqueue via
    `core/sync` so they survive offline. Never call `setDoc` directly from a
    component.

---

## Dependency direction (enforced)

```
app/  ──▶  modules/  ──▶  core/  ──▶  shared/
```

* `modules/*` may import `core/*` and `shared/*`.
* `core/*` may import `shared/*` only.
* `shared/*` imports nothing from the app.
* **No module imports another module.** Cross-feature needs go through `core/`
  or a shared contract type. If you feel the urge, that is a design smell —
  record it in `docs/STATUS.md` under Open Questions instead of doing it.

---

## Stack (do not substitute without an ADR)

**Target:** React 19 · Vite · TypeScript (strict) · Tailwind · MUI · React Router ·
React Hook Form + Zod · TanStack Query · Framer Motion · Workbox + IndexedDB (Dexie) ·
Firebase Auth / Firestore / FCM · Cloud Functions (minimal) · Google Drive API · Vercel

**Actually installed today:** React **18** · Vite 6 · TS strict · Tailwind v4
(no preflight, ADR-014) · MUI 6 · React Router · Zod · **TanStack Query** ·
**Firebase** (Auth + Firestore, live) · **Vitest** · **ESLint +
eslint-plugin-boundaries** · **vite-plugin-pwa** (Workbox).

Deliberately absent: React Hook Form (ADR-013 — a bespoke `useFormEngine`
instead, flagged for revisit as Q7), Framer Motion (CSS keyframes instead),
Dexie (the Firestore SDK's own IndexedDB persistence replaces it — see the
comment at the top of `core/sync/index.ts`), Cloud Functions (Spark plan; see
ADR-019 and DEPLOY.md for exactly what that costs us), FCM push (in-app
notifications only, by decision).

**Look and feel:** the Forge design system — Material Design 3 expressive, warm
amber — imported from a Agent Design project. Tokens in `src/shared/design/tokens.ts`,
theme in `src/app/theme.ts`, icons are Material Symbols Rounded. See ADR-015.

---

## Before you finish any task

1. `npm run typecheck && npm run lint && npm run test` all clean.
2. New engine logic has unit tests. New Firestore paths have rule tests.
3. If you changed a schema, bump its version and note it in `docs/DECISIONS.md`.
4. **Update [docs/STATUS.md](docs/STATUS.md).** This is not optional — it is how
   the next agent avoids redoing your work.

---

## Session start checklist

* Read `docs/STATUS.md` — never assume the repo is where you last left it.
* Confirm which phase you're in (`docs/ROADMAP.md`) before proposing features.
* If the request conflicts with a hard rule above, say so in one sentence,
  propose the configurable alternative, then proceed.

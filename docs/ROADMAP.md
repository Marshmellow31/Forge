# ROADMAP.md

Sequencing and scope. Live checkbox state lives in [STATUS.md](STATUS.md) — this
file defines *what* and *in what order*, not *how far along*.

---

## Phase 0 — Foundation

Nothing in Phase 1 starts until these land, because everything depends on them.

| # | Deliverable | Exit criteria |
|---|---|---|
| 0.1 | Repo scaffold | Vite + TS strict + Tailwind + MUI + Router + Query + RHF/Zod + Vitest all running |
| 0.2 | Layer boundaries | `eslint-plugin-boundaries` fails CI on a `modules → modules` import |
| 0.3 | Firebase project | Auth, Firestore, FCM enabled; emulator suite runs locally |
| 0.4 | Env contract | `config/env.ts` parses `import.meta.env` with Zod; app refuses to boot on a missing key |
| 0.5 | Typed data layer | Converters + typed refs for every path in DATA_MODEL.md |
| 0.6 | Rules skeleton + isolation tests | The 8 tests in SPEC_RBAC §7 pass against the emulator |
| 0.7 | CI | typecheck + lint + unit + rules tests on every push |
| 0.8 | Design system | **Scope changed 2026-07-29 (ADR-015):** rather than hand-building primitives, the Forge design system was imported from a Claude Design project. Exit criteria are now `app/tokens.ts` + `app/theme.ts` + `shared/ui/primitives.tsx` covering every screen, which is met. Toast and Skeleton remain unbuilt. |

## Phase 1 — MVP

The definition of MVP: **one organization can run one real challenge end to end
without touching any other tool.**

| # | Feature | Depends on | Notes |
|---|---|---|---|
| 1.1 | Google authentication | 0.3 | Sign in, session, `users/{uid}` bootstrap |
| 1.2 | Organization creation | 1.1 | Transactional: org + owner member + seeded built-in roles + settings singletons |
| 1.3 | Member invite + roles | 1.2, RBAC | Invite by email, assign built-in roles |
| 1.4 | Workspaces | 1.2 | CRUD, simple |
| 1.5 | Challenge CRUD | 1.4 | Draft → publish, timeline, visibility |
| 1.6 | **Form builder** | 0.5 | 8 MVP field types, drag-reorder, preview, publish/version |
| 1.7 | **Form renderer** | 1.6 | Compiled Zod validation, conditional visibility, drafts |
| 1.8 | Registration flow | 1.5, 1.7 | Individual mode; `team` field present but unused |
| 1.9 | **Drive upload pipeline** | 1.2 | Connect flow, `mintUploadSession`, resumable PUT, `completeUpload` |
| 1.10 | Submissions | 1.7, 1.9 | Draft, submit, late detection, one submission per stage |
| 1.11 | Participant dashboard | 1.8 | Upcoming, my registrations, my submissions, notifications |
| 1.12 | Admin dashboard | 1.5 | Active challenges, counts, submission rate, pending reviews |
| 1.13 | Judging | 1.10 | Rubric config, judge queue, `average` strategy, assignment |
| 1.14 | Leaderboard | 1.13 | Materialized pages, visibility modes |
| 1.15 | Result publishing | 1.14 | Atomic, idempotent, audited, notifies |
| 1.16 | Push notifications | 1.1 | FCM token lifecycle, 5 event types |
| 1.17 | Installable PWA | 0.1 | Manifest, SW precache, install prompt, Lighthouse pass |

**Explicitly deferred out of MVP** (say no to these until Phase 1 ships): teams,
certificates, custom roles, community voting, blind judging, analytics charts,
public org pages, the other 20 field types, offline submission queue.

Simple workflow only in MVP: `Registration → Submission → Judging → Results`,
delivered as a **seeded WorkflowDefinition**, not as hardcoded logic. The engine
is real from day one; only the designer UI is deferred.

## Phase 2 — Depth

| Feature | Notes |
|---|---|
| Workflow designer UI | Multi-round, screening, custom stages — the engine already supports it |
| Remaining field types | Purely additive via the registry |
| Certificates | Templates, placeholders, bulk issue, public verification page |
| Public organization pages | `/{orgSlug}` — branding, live challenges, past winners |
| Public challenge discovery | Browse, filter, category — reads `publicChallenges` |
| Team challenges | Team formation, invites, per-team submission |
| Community voting | Vote strategy, abuse prevention (one vote per verified user) |
| Blind judging | Identity + filename suppression end to end |
| Analytics dashboard | Participation growth, drop-off, completion, judge activity, criterion variance |
| **Offline sync** | The full `core/sync` queue from SPEC_OFFLINE |
| QR check-in | Volunteer flow, offline-capable |
| Custom roles | Role builder UI over the existing permission catalog |
| Challenge templates | Clone-to-create, org template library |
| CSV export | Registrations, submissions, scores — PII-redacted by `piiLevel` |

## Phase 3 — Platform

| Feature | Notes |
|---|---|
| AI review assistance | Suggested scores, summaries, auto-feedback — **always human-confirmed** |
| Duplicate/plagiarism detection | Perceptual hashing on images, text similarity |
| Content moderation | Auto-flag, human queue |
| Automation engine | If-this-then-that over challenge events |
| Webhooks | Signed, retried, per-org secrets |
| Slack / Discord / Teams | Announce, notify, register from chat |
| Public API + marketplace | REST, API keys, rate limits, docs |
| Enterprise SSO | SAML / OIDC |
| White-label | Custom domains, per-tenant manifest and branding |
| Additional storage providers | S3, R2, Firebase Storage |
| Mobile apps | React Native, sharing `core/` |
| GraphQL | Only if REST demonstrably fails a real consumer |

## Cut lines (say no here)

These are permanently out unless the vision changes:

* Payment disbursement — cash rewards are recorded, not paid.
* Code execution / automated judging of code correctness — point at a repo.
* Video hosting or transcoding.
* A social feed, following, or DMs.
* Real-time collaborative editing.
* Self-hosting before Phase 3.

## How to sequence within a phase

1. **Data + rules first.** Never build UI against a schema you have not written
   rules for.
2. **Engine before UI.** `core/` pure logic with tests, then the module.
3. **One vertical slice at a time.** Ship "create a challenge" fully (rules,
   engine, UI, states, tests) before starting the next feature.
4. **States are part of the feature.** Loading, empty, error, offline,
   permission-denied — not a follow-up ticket.

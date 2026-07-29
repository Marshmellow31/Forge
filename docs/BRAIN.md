# BRAIN.md — The Durable Mind of ChallengeOS

> Everything in this file is **stable**. It changes only when the product's
> identity changes. Volatile state lives in [STATUS.md](STATUS.md).
> If an implementation detail contradicts this file, the implementation is wrong.

---

## 1. The one-sentence product

**ChallengeOS is a multi-tenant SaaS platform that lets any organization create,
manage, judge and reward challenges, competitions, campaigns and
submission-based activities from a single configurable system.**

## 2. The problem, stated precisely

Running a challenge today means stitching together:

| Job to be done | Tool people actually use today |
|---|---|
| Announce | WhatsApp / Discord / Instagram / notice board |
| Register | Google Forms |
| Collect submissions | Google Drive / email / WeTransfer |
| Track participants | Excel |
| Judge | Excel + WhatsApp group of judges |
| Announce results | PDF on WhatsApp |
| Certificates | Canva + manual export, one per person |
| Analytics | Nobody does this |

Seven tools, zero memory, no audit trail, no participant history. The pain is
not "forms are bad." The pain is **fragmentation**.

**ChallengeOS is not a form builder. It replaces the workflow, not the form.**

Success metric: *an organization deletes six tools from its process.*
Not: *"we made a nicer Google Form."*

## 3. Core philosophy

The platform revolves around **one object: the Challenge.**
Everything else exists because a challenge exists.

Three commitments follow from that:

1. **Configuration over code.** Organizations configure forms, workflows,
   permissions, judging and rewards. They never wait on a developer.
2. **Generic over vertical.** No layer of the architecture may assume "college",
   "hackathon", or any single customer type. If a term like `studentId` or
   `department` appears in core code, it is a bug — it belongs in a
   customer-defined form field.
3. **Extension over modification.** New field types, storage providers, judging
   strategies and stage types are added by **registering** an implementation, not
   by editing a `switch`.

## 4. What a "challenge" can be

Photography competition · coding contest · hackathon · weekly employee challenge ·
sales leaderboard · innovation campaign · assignment submission · fitness
challenge · meme contest · referral program · design challenge · startup pitch ·
scholarship application · internal HR activity · community event · creator contest

**Design test:** any feature you build must work for *all* of these, or be
expressible as configuration. If it only works for hackathons, it is wrong.

## 5. Who we serve

| Segment | Examples | What they care most about |
|---|---|---|
| Education | Universities, schools, clubs, technical chapters | Volume, certificates, zero cost |
| Companies | HR engagement, innovation weeks, sales contests | SSO, analytics, branding |
| Communities | Discord, Telegram, Reddit, OSS | Public pages, integrations |
| Creators | Photo/video/art/prompt contests | Media handling, voting |
| Organizations | NGOs, government, CSR, apartment communities | Simplicity, offline, reporting |

## 6. Domain model — the object graph

```
Organization  (tenant boundary — hard isolation)
  ├── Members ──▶ Roles ──▶ Permissions
  ├── Settings (branding, storage connection, notifications)
  ├── Workspace           e.g. "HR", "Photography Club", "Sales"
  │     └── Challenge     ◀── THE CENTER OF THE UNIVERSE
  │           ├── FormSchema        (versioned JSON → renders the UI)
  │           ├── WorkflowDefinition(versioned stage list → drives progression)
  │           ├── Registration      (a person/team entering)
  │           │     └── stageHistory
  │           ├── Submission        (answers + FileRefs, per stage)
  │           ├── Review / Score    (per judge, per rubric criterion)
  │           ├── Leaderboard       (materialized, visibility-controlled)
  │           └── Result / Reward / Certificate
  ├── ChallengeTemplate   (clone-to-create)
  └── AuditLog
User (global identity, cross-org portfolio: badges, points, history, streak)
```

**Key relationships**

* A `Challenge` **has one** `WorkflowDefinition` (a version pin).
* A `WorkflowStage` **may have** a `FormSchema` (a version pin) and a
  `JudgingConfig`.
* A `Registration` is a participant's **journey**; a `Submission` is a single
  **artifact** produced at one stage. One registration → many submissions.
* A `User` exists globally and independently of any org. Their portfolio spans
  organizations; their *permissions* never do.

## 7. Ubiquitous language (use these exact words in code)

| Term | Means | Does **not** mean |
|---|---|---|
| **Organization** | The tenant. Isolation boundary. | A team or department |
| **Workspace** | A folder/department inside an org | A tenant |
| **Challenge** | The root activity object | Only a competition |
| **FormSchema** | Versioned JSON describing fields | The rendered form |
| **Field** | One input definition inside a schema | The answer to it |
| **Answer** | A participant's value for a field | The field |
| **WorkflowDefinition** | Ordered stage config, versioned | A running instance |
| **Stage** | One step (registration, round 1, judging…) | A date |
| **Registration** | A participant's entry + journey state | A submission |
| **Submission** | Answers + files for one stage | A registration |
| **Review** | A judge's full evaluation of a submission | A single number |
| **Score** | One numeric value on one rubric criterion | The final rank |
| **Leaderboard** | Materialized, ordered, visibility-gated result set | Live query |
| **FileRef** | Pointer to a file in customer storage | The file |
| **Permission** | `resource.action` string | A role |
| **Role** | A named bundle of permissions | A permission |
| **Member** | A user's binding to an org, with roles | A user |
| **Participant** | A user in the context of one challenge | A role |

## 8. Non-negotiable invariants

1. **Tenant isolation.** No document read path exists that can return another
   org's data. Enforced in security rules, not application code.
2. **Configuration completeness.** Every behavioural difference between two
   challenges must be representable as data in Firestore.
3. **Version pinning.** A submission always resolves against the exact schema
   version it was created with. Historical data never re-interprets.
4. **Cost asymmetry.** Files live in the customer's storage quota; we store
   metadata. Our per-org marginal storage cost stays near zero.
5. **Determinism in engines.** Given the same inputs, the workflow engine, the
   validation compiler, the permission resolver and the judging aggregator
   always return the same output. No clocks, no randomness, no I/O inside.
6. **Auditability.** Every permission-bearing mutation (publish result, change
   score, remove member, edit published schema) writes an `AuditLog` entry.
7. **Graceful offline.** A participant on a bad connection can register, draft
   and queue a submission. Loss of connectivity never loses user input.

## 9. The five engineering set-pieces

These are the reasons this project is engineering, not CRUD. Protect them.

| Engine | The hard part | Spec |
|---|---|---|
| **Form Engine** | JSON → validated, conditional, typed React UI with a pluggable field registry | [SPEC_FORM_ENGINE.md](SPEC_FORM_ENGINE.md) |
| **Workflow Engine** | Config-driven state machine over participants, with advancement rules | [SPEC_WORKFLOW_ENGINE.md](SPEC_WORKFLOW_ENGINE.md) |
| **RBAC** | Permission resolution across org/workspace/challenge scopes, mirrored in rules | [SPEC_RBAC.md](SPEC_RBAC.md) |
| **Storage Abstraction** | Direct-to-Drive resumable upload without ever exposing a token to the browser | [SPEC_STORAGE.md](SPEC_STORAGE.md) |
| **Offline Sync** | Idempotent, conflict-aware replay of a queued mutation log | [SPEC_OFFLINE.md](SPEC_OFFLINE.md) |

## 10. Explicit non-goals (v1)

* Not a general workflow/BPM tool — workflows are challenge-shaped.
* Not a video host, code runner, or CI system — we point at artifacts.
* Not a payments platform — cash rewards are *recorded*, not disbursed.
* Not a social network — profiles are portfolios, not feeds.
* Not self-hosted or white-label yet (Phase 3).
* Not real-time collaborative editing of anything.

## 11. Long-term vision

ChallengeOS becomes the default platform an organization reaches for whenever it
needs to **engage participants, collect structured submissions, evaluate them
fairly, publish transparent results, and build durable achievement history** —
scaling from a five-person student club to an enterprise, on one architecture,
without a fork.

The compounding asset is the **participant's portfolio**: a permanent, verifiable
record of everything they've entered, submitted and won, across every
organization. That is the moat, and it is why `users` is a global collection.

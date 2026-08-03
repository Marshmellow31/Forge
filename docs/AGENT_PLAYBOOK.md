# AGENT_PLAYBOOK.md — How to Work in This Repo

Written for AI agents. The goal is to make a fresh session productive in three
file reads instead of twenty.

---

## 1. Session start (always, in this order)

1. Read `AGENT.md` — it is auto-loaded; it is the router.
2. Read [STATUS.md](STATUS.md) — where things actually stand, what's next,
   what's blocked. **Never assume the repo is where you last left it.**
3. Read *at most two* specs, chosen from the router table for your task.

Do not read every doc. Do not read `BRAIN.md` for a bug fix. Do not read
`DATA_MODEL.md` to rename a CSS class. Token discipline is part of the job — the
doc set is designed for selective loading.

## 2. Choosing what to work on

If the user gave a task, do that. Otherwise take the first unchecked item from
STATUS.md §3 "Next three actions".

Before starting, verify the prerequisite exists. Half of all wasted agent work
is building on a layer that was never scaffolded.

## 3. The loop for a feature

```
1. Locate    → which module owns this? (ARCHITECTURE.md §3)
2. Model     → what documents change? (DATA_MODEL.md)
3. Secure    → what rules and permissions? (SPEC_RBAC.md)
4. Engine    → is there pure logic? Write it in core/ WITH TESTS FIRST.
5. Data      → module api/ layer: typed refs, converters, query keys
6. Hooks     → module hooks/: useX, useCreateX
7. UI        → module components/
8. States    → loading, empty, error, offline, permission-denied
9. Verify    → typecheck, lint, test, rules test
10. Document → STATUS.md always; spec if behaviour changed; ADR if non-obvious
```

Steps 3 and 4 are the ones agents skip and the ones that matter most.

## 4. Hard checks before you write code

Ask yourself, every time:

* **Am I hardcoding a domain concept?** If a customer might want it different, it
  is data. (`switch (challengeType)` is always wrong.)
* **Is this query tenant-scoped?** Path must contain `organizations/{orgId}`.
* **Does my client-side permission check have a server-side twin?** A `can()` in
  the UI without a rule is a security bug, not a TODO.
* **Am I importing a provider SDK outside `core/storage/providers/`?**
* **Am I importing another module?** Go through `core/` or a shared type.
* **Did I put I/O in a `core/` engine?** Move it out; inject the data.
* **Am I fetching a schema without its version?** Always `(id, version)`.
* **Did I add a composite query?** Add the index in the same commit.

## 5. When the spec is silent

Order of resort:

1. Check [DECISIONS.md](DECISIONS.md) — the question may already be answered.
2. Apply the philosophy in [BRAIN.md §3](BRAIN.md): configurable over hardcoded,
   generic over vertical, extension over modification.
3. Pick the option that is **additive** — the one that a future change can extend
   without editing existing files.
4. Implement it, then record it: a new ADR if it is architectural, an entry in
   STATUS.md §4 if it needs a human.

Do not stop and ask for anything you can decide reasonably. Do stop for: money,
data deletion, anything irreversible, and anything in STATUS.md §4.

## 6. When you disagree with the spec

Say so in one or two sentences, state your recommendation, then **build what was
asked** under the stated assumption. Record the disagreement in STATUS.md §4 so a
human can settle it. Do not silently build something different.

## 7. Ending a session

Before you finish, update [STATUS.md](STATUS.md):

* Flip the checkboxes you completed.
* Rewrite §1 (one paragraph: where we are).
* Rewrite §3 (three concrete next actions).
* Add anything you discovered to §4 (open questions) or §5 (risks).
* Update the header: date, who, phase, build health.

Then state, to the user, in this order: what you built, what you verified and
how, what you did **not** do and why, and the single next action.

## 8. Anti-patterns seen in this kind of project

| Anti-pattern | Why it's fatal here |
|---|---|
| A `switch` on field type in the renderer | Kills the registry; every new type edits four files |
| `where('orgId', '==', orgId)` on a flat collection | One forgotten filter is a tenancy breach |
| Fetching the "latest" form schema | Silently re-interprets historical submissions |
| Overwriting a score document | Breaks the audit trail and offline replay |
| Client-side leaderboard computation | 1 500 reads per viewer |
| `Date.now()` inside `core/` | Non-deterministic results in a contested competition |
| Hiding a button as the permission check | Trivially bypassed |
| Building UI before rules | You'll discover the rule can't express your query |
| Storing a Drive token in Firestore | Grants full account access to anyone who can read it |
| Adding Redux "for later" | The state model in ARCHITECTURE.md §6 is deliberate |

## 9. Fast answers to common questions

| Question | Answer |
|---|---|
| Where does business logic go? | `core/` if pure and reusable; module `hooks/` if feature-specific |
| Where do I add a new field type? | `core/forms/fields/<type>.tsx` + one `registerFieldType()` |
| Where do I add a permission? | Catalog table in SPEC_RBAC §2 + a rules test |
| How do I add a Firestore collection? | DATA_MODEL.md §1 + shape + rules + rules test + converter |
| Can I add a Cloud Function? | Only if rules + client genuinely cannot do it (ARCHITECTURE.md §7) |
| Can I add a dependency? | Small and obvious: yes. Framework-scale: ADR first. |
| How do I handle a missing score? | `isProvisional: true`. **Never zero.** |
| Where does a user-facing string live? | `modules/`, never `core/` |
| Cross-module data need? | A `core/` contract or a shared type — never a direct import |

## 10. Token-efficiency rules for agents

* Router first. Two specs maximum. Do not bulk-read `docs/`.
* Grep before reading a file whole.
* When you need a document shape, read that section of `DATA_MODEL.md`, not the
  whole file.
* Do not restate the spec back to the user — link to it.
* Keep STATUS.md edits surgical: this file is read by every future session, and
  every line of narrative history you add is a tax on all of them.

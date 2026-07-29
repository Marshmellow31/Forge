# Deploying the demo

Five steps. Steps 1–3 need your Google account, so they are yours to do; nothing
in this repo can create a Firebase project on your behalf.

Steps 1–3 have been run against the live project `forge-4d40a`.

The security rules are covered by **48 emulator tests that pass**
(`npm run test:rules`). The emulator needs **JDK 21**; if `java -version` says 8,
Android Studio bundles a modern one — point `JAVA_HOME` at
`C:\Program Files\Android\Android Studio\jbr` first.

Rules and indexes were **deployed to `forge-4d40a` on 2026-07-29**, and all
reads were re-verified against them afterwards. Re-run `npm run rules:deploy`
after any further change to `firestore.rules` or `firestore.indexes.json` —
the tests prove the file, not what Firebase is currently enforcing.

---

## 1. Create the Firebase project

1. <https://console.firebase.google.com> → **Add project**. Analytics is optional.
2. **Build → Firestore Database → Create database.** Start in **production mode**
   (the rules in this repo replace the defaults). Pick a region — **this cannot
   be changed later.** `asia-south1` if you are in India.
3. **Build → Authentication → Get started.** Enable:
   - **Anonymous** — the demo's "Continue as guest" button.
   - **Google** — optional, for signing in as yourself.
4. **Project settings → General → Your apps → Web (`</>`)** → register an app.
   Copy the `firebaseConfig` values.

The Spark (free) plan covers all of this. Cloud Functions would need Blaze, which
is why none are *deployed* yet — see "What is not built" below.

They are written and verified, though. Spark blocks deploying functions; it does
not block the emulator, so `npm run test:functions` runs them locally and asserts
what their triggers write. The day you enable Blaze:

```bash
npm --prefix functions install && npm --prefix functions run deploy
```

Then tighten `firestore.rules` back: `leaderboard` and `certificates` return to
`write: if false`, and the challenge-update rule drops its `counters` hatch.

⚠️ `firebase.json` carries a `functions` block so the emulator can load them, so
a bare `firebase deploy` will try to deploy functions and **fail on Spark**.
Deploy rules with `npm run rules:deploy` (`--only firestore:rules,firestore:indexes`).

## 2. Configure locally

```bash
cp .env.example .env.local
```

Fill `.env.local` with the config from step 1.4. These values are **public** —
they ship in the client bundle by design, and access is controlled by
`firestore.rules`, not by hiding them.

## 3. Deploy rules, then seed

```bash
npx firebase login
npx firebase use --add          # pick the project you just created
npm run rules:deploy            # firestore.rules + firestore.indexes.json
```

Then get an admin key for the seed script:
**Project settings → Service accounts → Generate new private key.** Save it as
`serviceAccountKey.json` in the repo root — it is gitignored.

> **This key grants full admin access and bypasses every security rule.**
> Never commit it, never paste it into a chat, never put it in a Vercel env var.

```bash
OWNER_EMAIL=you@gmail.com npm run seed
```

This writes the demo organization `org_demo` — challenges, form schemas,
registrations, submissions, rubric, leaderboard pages, members, roles, badges,
certificates and audit log — from `src/mock/data.ts`. It is idempotent: fixed
document ids, so re-running overwrites rather than duplicating.

> **`OWNER_EMAIL` is not optional in practice.** The seeded members are fixture
> rows whose document ids are `m0`, `m1`, … — no real Google account will ever
> match one, so without this every admin screen is correctly read-only and you
> cannot create or edit a challenge.
>
> Setting it writes a pending **owner** invite for that address. Sign in with
> that exact Google account and the invite is redeemed on first load, granting
> full control. The security rules verify the email is *verified* and that the
> roles claimed match the invite exactly, so this is not a backdoor — see
> ADR-020. Invite anyone else from **Organization → Members**.

Verify locally before deploying:

```bash
npm run dev
```

You should land on the sign-in door → **Continue as guest** → the demo data.

## 4. Deploy to Vercel

Import the repo, branch `feat/firebase-backend`. `vercel.json` already sets the
build command, output directory and the SPA rewrite.

Add the **same seven variables** from `.env.local` to
**Vercel → Settings → Environment Variables** (all environments), except set:

```
VITE_USE_EMULATOR=false
```

If any variable is missing the app renders a "Configuration error" page naming
it, rather than a blank screen.

`vercel.json` already handles the rest, and two of its rules are load-bearing:

* **`/assets/*` is cached for a year, `immutable`.** Filenames are content
  hashed, so they can never go stale. This is where most repeat-visit latency
  goes.
* **`sw.js` is `max-age=0, must-revalidate`.** The service worker is *not*
  content-hashed, so a cached copy pins every returning visitor to the build
  that installed it — they would stop receiving updates permanently and no
  redeploy could reach them. Same for `manifest.webmanifest` and `index.html`.

Icons are committed under `public/`, so the build needs no extra step.
Regenerate them with `npm run icons` if the brand colours change.

## 5. Authorize the Vercel domain

**Firebase console → Authentication → Settings → Authorized domains → Add
domain**, and add your `*.vercel.app` domain. Sign-in fails with
`auth/unauthorized-domain` until you do.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Configuration error" naming a variable | That env var is missing in Vercel. Redeploy after adding — Vite inlines env at build time. |
| "Not permitted to read this" | Rules not deployed (`npm run rules:deploy`), or `VITE_DEMO_ORG_ID` does not match the seeded org. |
| Sign-in popup closes immediately | Vercel domain not in Firebase authorized domains (step 5). |
| Empty lists, no error | Seed did not run, or ran against a different project. Check Firestore in the console for `organizations/org_demo`. |
| `The query requires an index` | Deploy indexes: `npm run rules:deploy`. Composite indexes take a few minutes to build. |

## What is not built

Honest list, so nothing here surprises you in front of an audience:

- **No Cloud Functions**, because the project is on Spark by choice. Consequences:
  `user.stats` and leaderboard pages are *seeded*, not maintained, so ranks do
  not move as scores land. `challenge.counters` **are** maintained, by a bounded
  client increment (ADR-019). Result publishing (ROADMAP 1.15) has no owner.
- **Result publishing is idempotent, not atomic** (ADR-022). A mid-flight
  failure leaves a partial publish; re-running converges rather than
  double-awarding, because every document id is derived. A Cloud Function would
  make it atomic.
- **No organization creation** (1.2). A transactional write that would orphan
  data if half-completed. The demo runs on one seeded org, so nothing is blocked.
- **No resumable Drive upload.** Files are referenced by pasted share link
  (ADR-017) — deliberate, not missing. The resumable pipeline needs Blaze.
- **The judge queue is not assignment-driven.** It shows submissions needing
  reviews on the first judging challenge, rather than reviews assigned to you.
- **Push notifications are out of scope.** The in-app inbox is complete and is
  the source of truth; FCM was deliberately not built.
- **These Phase 3 items cannot be built on Spark at all:** webhooks, a public
  REST API, enterprise SSO, Slack/Discord delivery, AI review assistance. Each
  needs a server to hold a secret or receive an inbound request.
- **ADR-016 is demo scaffolding.** The demo org is world-readable and guest
  sign-in self-issues a read-only membership. Remove both before a second real
  tenant exists.

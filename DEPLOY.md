# Deploying the demo

Five steps. Steps 1–3 need your Google account, so they are yours to do; nothing
in this repo can create a Firebase project on your behalf.

**Everything below is unverified against a live project** — no Firebase project
existed while this was written, and the Firestore emulator could not run locally
(it needs Java 21+). The code typechecks and builds; the rules and seed script
have not executed. Expect to hit at least one thing on the first run.

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
is why none are used yet — see "What is not built" below.

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
npm run seed
```

This writes the demo organization `org_demo` — challenges, form schemas,
registrations, submissions, rubric, leaderboard pages, members, badges,
certificates and audit log — from `src/mock/data.ts`. It is idempotent: fixed
document ids, so re-running overwrites rather than duplicating.

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

- **No Cloud Functions.** Denormalized values (`challenge.counters`,
  `user.stats`, leaderboard pages) are *seeded*, not maintained. They will not
  update if you change data. DATA_MODEL.md §4 specifies Functions as their owner.
- **The app reads; it does not write.** Registration submit, score submit and
  schema publish all render their success dialogs without persisting. The write
  paths, offline queue (`core/sync`) and versioned schema publishing are not
  implemented.
- **No Drive uploads.** File fields simulate an upload. The real pipeline mints a
  resumable session server-side, which needs Functions (Blaze).
- **The judge queue is not assignment-driven.** It shows submissions needing
  reviews on the first judging challenge, rather than reviews assigned to you.
- **Rules have no tests.** DATA_MODEL.md §6 requires emulator tests proving
  cross-tenant reads fail, and Phase 0 lists them as a deliverable. They do not
  exist, and the emulator could not run here to write them. **Do not treat the
  current rules as proven.**
- **ADR-016 is demo scaffolding.** Guest sign-in self-issues a read-only
  membership in one org. Remove it before a second real tenant exists.

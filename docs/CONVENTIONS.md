# CONVENTIONS.md

Mechanical rules. Follow them without deliberation so the interesting decisions
get the attention instead.

---

## 1. Naming

| Thing | Convention | Example |
|---|---|---|
| Directories | kebab-case | `form-builder/` |
| React components | PascalCase, one per file | `ChallengeCard.tsx` |
| Hooks | `use` + camelCase | `useChallenge.ts` |
| Non-component modules | camelCase | `resolvePermissions.ts` |
| Types & interfaces | PascalCase, no `I` prefix | `FormSchema` |
| Zod schemas | `<Type>Schema` | `formSchemaSchema` → prefer `FormSchemaZ` |
| Constants | SCREAMING_SNAKE | `MAX_FILE_SIZE_MB` |
| Firestore fields | camelCase | `registrationClosesAt` |
| Permissions | `resource.action` | `result.publish` |
| Form field keys | snake_case | `github_repo_url` |
| Event/analytics names | `noun_verb_past` | `challenge_published` |
| Test files | co-located `*.test.ts` | `engine.test.ts` |

Booleans read as predicates: `isPublished`, `hasSubmitted`, `canPublish`,
`shouldNotify`. Dates end in `At`; durations end in a unit: `timeoutMs`,
`maxFileSizeMB`, `streakDays`.

## 2. TypeScript

* `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`.
* **`any` is banned.** Use `unknown` and narrow with Zod. One escape hatch:
  `// eslint-disable-next-line` with a one-line reason.
* Branded ids prevent the classic mix-up:
  ```ts
  type OrgId = string & { readonly __brand: 'OrgId' };
  type ChallengeId = string & { readonly __brand: 'ChallengeId' };
  ```
* Prefer discriminated unions over optional-field soup:
  ```ts
  type UploadState =
    | { status: 'idle' }
    | { status: 'uploading'; progress: number }
    | { status: 'done'; ref: FileRef }
    | { status: 'error'; message: string };
  ```
* Fallible operations return `Result<T, E>` rather than throwing, except at
  boundaries where an error boundary catches.
  ```ts
  type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
  ```
* Exhaustiveness: `switch` on a union ends with
  `default: assertNever(x)`.

## 3. React

* Function components only. No class components, no `React.FC` annotation
  (it hurts generics) — type props directly.
* One component per file; co-locate its sub-components in the same folder only if
  they are not reused.
* Component bodies do three things in order: hooks → derived values → JSX.
  If a component exceeds ~150 lines or has more than 8 hooks, extract.
* No business logic in components. Logic goes to `core/` (pure) or a module hook.
* Props: no prop-drilling deeper than two levels — use composition or context.
* Lists always keyed by a stable id, never index.
* `useEffect` is for synchronizing with something outside React. Deriving state
  in an effect is a bug; compute it during render.

## 4. TanStack Query

**Key convention — always hierarchical, always org-first:**

```ts
['org', orgId]
['org', orgId, 'challenges']
['org', orgId, 'challenges', { status: 'published' }]
['org', orgId, 'challenge', challengeId]
['org', orgId, 'challenge', challengeId, 'registrations']
['org', orgId, 'challenge', challengeId, 'leaderboard', page]
['user', userId, 'participations']
```

Org-first means switching organizations invalidates everything beneath it with
one call — and makes it structurally hard to leak another tenant's cache.

Centralize keys in each module's `api/keys.ts`. Never inline a key array in a
component.

Defaults: `staleTime: 30_000`, `gcTime: 5 * 60_000`, `retry: 2`,
`refetchOnWindowFocus: false`. Realtime data uses `onSnapshot` writing into the
query cache via `queryClient.setQueryData`, with `staleTime: Infinity`.

Mutations: always `onMutate` (optimistic) + `onError` (rollback) +
`onSettled` (invalidate). Participant-facing mutations route through
`core/sync`, not directly to Firestore.

## 5. Firestore access

* Only `modules/*/api/*` and `core/firebase` touch the SDK. Components never
  import `firebase/firestore`.
* Every collection has a typed converter:
  ```ts
  export const challengeConverter: FirestoreDataConverter<Challenge> = {
    toFirestore: (c) => ChallengeZ.parse(c),
    fromFirestore: (snap) => ChallengeZ.parse({ id: snap.id, ...snap.data() }),
  };
  ```
  Parsing on read is deliberate: bad data fails loudly at the boundary instead of
  producing `undefined` three components later.
* Server timestamps via `serverTimestamp()`, never `new Date()`.
* Every composite query gets an entry in `firestore.indexes.json` in the same
  commit.
* Never `getDocs` on an unbounded collection. Always `limit()`.

## 6. Forms

* React Hook Form + `zodResolver`, always.
* Dynamic forms get their resolver from `compileSchema()` — never hand-written.
* Static forms (login, org settings) still define a Zod schema; no ad-hoc
  validation.
* Field errors render inline, next to the field. Form-level errors render at the
  submit button. Never a toast for a validation error.

## 7. Styling

* Tailwind for layout, spacing, and one-off styling.
* MUI for complex interactive primitives (DataGrid, DatePicker, Autocomplete,
  Menu). Do not use MUI's `Box`/`Stack` for layout — that is Tailwind's job.
* Org branding via CSS custom properties set on `<html>` at runtime:
  `--color-primary`, `--color-accent`. Tailwind config references them so
  `bg-primary` follows the tenant.
* No inline `style` except for genuinely dynamic values (progress width,
  certificate placeholder position).
* Dark mode: `class` strategy, both themes styled from day one.

## 8. Errors

* `core/` returns `Result`. It does not throw for expected failures.
* `modules/` translates `Result.error` into user-facing copy. Error codes are
  enums; **user-facing strings are never produced in `core/`.**
* Error boundary per route tree, plus one per lazy module.
* Sentry captures unhandled errors with `orgId`, `userId`, route, and the last
  five query keys as context. Never capture form answer values (PII).

## 9. Testing

| Layer | Tool | Bar |
|---|---|---|
| `core/*` engines | Vitest | **90 % coverage — non-negotiable** |
| `modules/*` hooks | Vitest + Testing Library | Happy path + one failure path |
| Components | Testing Library | Behaviour, not implementation. No snapshot tests. |
| Firestore rules | `@firebase/rules-unit-testing` + emulator | Every rule, plus the §7 isolation suite in SPEC_RBAC |
| E2E | Playwright | The five critical journeys (§ below) |

Critical E2E journeys: create org → create challenge with a built form →
participant registers and submits with a file → judge scores → results publish
and appear on the participant's profile.

Test naming: `it('rejects a submission after the stage window closes')` — a
sentence about behaviour, not `it('works')`.

## 10. Commits & PRs

Conventional Commits, scoped by module:

```
feat(forms): add conditional visibility to the field renderer
fix(storage): verify drive metadata before returning FileRef
refactor(rbac): extract permission resolution into a pure function
docs(status): mark auth complete
test(rules): add cross-tenant isolation suite
chore(deps): bump vite to 6.1
```

PR must state: what changed, why, which docs were updated, and how it was
verified. A PR touching a schema must say whether a version bump occurred.

## 11. Definition of done

1. `npm run typecheck && npm run lint && npm run test` clean.
2. New `core/` logic has unit tests at the coverage bar.
3. New Firestore paths have rules **and** rules tests.
4. New composite queries have index entries committed.
5. Loading, empty, error, and offline states all implemented — not just the happy
   path.
6. Keyboard navigable; labels associated; focus visible.
7. Docs updated: `STATUS.md` always; the relevant spec if behaviour changed;
   `DECISIONS.md` if a non-obvious choice was made.

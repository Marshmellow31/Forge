# SPEC_FORM_ENGINE.md

The single most important engineering piece. An admin builds a form visually; the
participant UI is generated entirely from stored JSON. **No hardcoded forms
anywhere in the product.**

Lives in `src/core/forms` (pure) + `src/modules/forms` (UI).

---

## 1. Design goals

| Goal | Consequence |
|---|---|
| Admins never need a developer | Visual builder, every option is data |
| Adding a field type is additive | Registry pattern, one file per type |
| Answers survive schema evolution | Version pinning + immutable field ids |
| Validation is one source of truth | Zod compiled from the same JSON the UI renders |
| Conditional logic without code | Declarative condition DSL, evaluated by a pure function |
| Works offline | Schema cached in IndexedDB; validation is client-local |

## 2. Schema types

```ts
type FieldId = string;    // stable uuid, NEVER reused or renamed
type FieldKey = string;   // snake_case answer key, unique within schema

interface FormSchema {
  id: string;
  orgId: string;
  version: number;                 // 1, 2, 3… published versions are immutable
  status: 'draft' | 'published' | 'archived';
  title: string;
  description: string | null;
  sections: FormSection[];
  settings: {
    allowDrafts: boolean;
    showProgressBar: boolean;
    oneFieldPerPage: boolean;
    shuffleSections: boolean;
    confirmationMessage: string | null;
  };
  createdAt: Timestamp; updatedAt: Timestamp; createdBy: string;
}

interface FormSection {
  id: string;
  title: string;
  description: string | null;
  order: number;
  fields: FormField[];
  visibleWhen: Condition | null;
}

interface FormField {
  id: FieldId;
  key: FieldKey;
  type: FieldType;
  label: string;
  help: string | null;
  placeholder: string | null;
  required: boolean;
  order: number;
  defaultValue: unknown;
  options: FieldOption[] | null;   // choice-family fields
  validation: FieldValidation;
  config: Record<string, unknown>; // type-specific, validated by the type's configSchema
  visibleWhen: Condition | null;
  readOnlyWhen: Condition | null;
  width: 'full' | 'half' | 'third';
  piiLevel: 'none' | 'low' | 'high';  // drives export redaction + blind judging
}

interface FieldOption { id: string; label: string; value: string; disabled?: boolean }

interface FieldValidation {
  min?: number; max?: number;                // number, rating
  minLength?: number; maxLength?: number;    // text
  pattern?: string; patternMessage?: string; // regex (validated safe at build time)
  minSelections?: number; maxSelections?: number;
  minDate?: string; maxDate?: string;        // ISO
  maxFileSizeMB?: number;
  acceptedMimeTypes?: string[];
  maxFiles?: number;
  customMessage?: string;
}
```

## 3. Field type catalog

| `type` | Value shape | Key config |
|---|---|---|
| `shortText` | `string` | `maxLength` |
| `longText` | `string` | `rows`, `maxLength` |
| `markdown` | `string` | `toolbar`, `previewMode` |
| `number` | `number` | `min`, `max`, `step`, `unit` |
| `email` | `string` | `allowedDomains[]` |
| `phone` | `{ country: string; number: string }` | `defaultCountry` |
| `dropdown` | `string` | `options`, `searchable` |
| `multiSelect` | `string[]` | `options`, `min/maxSelections` |
| `checkbox` | `boolean` | `mustBeTrue` (consent) |
| `checkboxGroup` | `string[]` | `options` |
| `radio` | `string` | `options`, `layout` |
| `date` | `string` (ISO) | `min`, `max`, `disablePast` |
| `time` | `string` (`HH:mm`) | `step` |
| `dateTime` | `string` (ISO) | `timezone` |
| `rating` | `number` | `scale`, `icon`, `labels` |
| `file` | `FileRef` | `maxFileSizeMB`, `acceptedMimeTypes` |
| `files` | `FileRef[]` | `maxFiles`, per-file limits |
| `image` | `FileRef` | `aspectRatio`, `maxDimension` |
| `video` | `FileRef` | `maxDurationSeconds` |
| `pdf` | `FileRef` | `maxPages` |
| `zip` | `FileRef` | `maxUncompressedMB` |
| `url` | `string` | `allowedHosts[]` |
| `githubRepo` | `{ url; owner; repo }` | `requirePublic`, `requireReadme` |
| `figmaLink` | `{ url; fileKey }` | `requireViewAccess` |
| `canvaLink` | `{ url }` | — |
| `driveLink` | `{ url; fileId }` | `requireAnyoneWithLink` |
| `signature` | `FileRef` (png) | `penColor` |
| `location` | `{ lat; lng; address }` | `restrictToCountry` |
| `section` | — | layout only, no answer |

**MVP subset (ship these 8 first):** `shortText`, `longText`, `number`, `email`,
`dropdown`, `date`, `file`, `url`. The registry makes the other 20 purely
additive — no core change required.

## 4. The field registry (the extension point)

```ts
interface FieldTypeDefinition<TConfig = unknown, TValue = unknown> {
  type: FieldType;
  label: string;                       // shown in the builder palette
  icon: ReactNode;
  group: 'text' | 'choice' | 'date' | 'number' | 'media' | 'link' | 'advanced';

  defaultConfig: TConfig;
  configSchema: ZodType<TConfig>;      // validates admin-authored config

  /** Admin-side: renders the field's options panel in the builder. */
  ConfigEditor: FC<{ field: FormField; onChange: (patch: Partial<FormField>) => void }>;

  /** Participant-side: the actual input. Controlled via RHF. */
  Input: FC<FieldInputProps<TValue>>;

  /** Judge/admin-side: read-only presentation of an answer. */
  Display: FC<{ field: FormField; value: TValue }>;

  /** Pure: compiles this field to a Zod validator. */
  buildValidator: (field: FormField) => ZodTypeAny;

  /** Pure: value → string for CSV export. */
  toExportValue: (value: TValue) => string;

  isFileBased: boolean;                // routes through core/storage
  supportsBlindJudging: boolean;       // false for name/email-ish types
}

// core/forms/registry.ts
export const fieldRegistry = new Map<FieldType, FieldTypeDefinition>();
export function registerFieldType(def: FieldTypeDefinition): void;
export function getFieldType(type: FieldType): FieldTypeDefinition;  // throws on unknown
```

**Adding a field type = create `core/forms/fields/<type>.tsx` + one
`registerFieldType()` call.** No file outside that directory changes. If your
change requires editing a `switch` on `FieldType`, you have done it wrong.

## 5. Condition DSL

Declarative, JSON-serializable, evaluated by a pure function.

```ts
type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: FieldKey; op: ConditionOp; value?: unknown };

type ConditionOp =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'nin' | 'contains' | 'notContains'
  | 'isEmpty' | 'isNotEmpty' | 'startsWith' | 'endsWith';
```

```json
{
  "all": [
    { "field": "submission_type", "op": "eq", "value": "video" },
    { "any": [
      { "field": "duration_minutes", "op": "gt", "value": 5 },
      { "field": "has_music", "op": "eq", "value": true }
    ]}
  ]
}
```

```ts
// core/forms/conditions.ts — pure, no React
export function evaluateCondition(c: Condition | null, answers: Answers): boolean;
export function computeVisibility(schema: FormSchema, answers: Answers): {
  visibleFieldIds: Set<FieldId>;
  visibleSectionIds: Set<string>;
};
```

**Rules:**
* A hidden field is **excluded from validation** and its answer is **dropped** on
  submit (no ghost data).
* Cycles are rejected at save time by a topological check in the builder.
* A condition may only reference fields that appear **earlier** in the schema
  order — enforced in the builder, keeps evaluation single-pass.

## 6. Validation compilation

```ts
// core/forms/compiler.ts — pure
export function compileSchema(schema: FormSchema, answers: Answers): ZodObject<...>;
```

Process:
1. Compute visibility from current answers.
2. For each visible field, call its `buildValidator(field)`.
3. Wrap in `.optional()` unless `required`.
4. Assemble into a `z.object()` keyed by `field.key`.
5. Attach cross-field refinements from `schema.settings`.

The compiled validator is memoized on `(schema.id, schema.version, visibilityHash)`.
Recompilation on every keystroke is a performance bug.

**One source of truth:** the same compiled schema validates in the builder
preview, in the participant form, in the offline queue before enqueue, and in the
Cloud Function on submit. Never write a second, hand-maintained validator.

## 7. Answer storage

```ts
interface AnswerEnvelope {
  formSchemaId: string;
  formSchemaVersion: number;      // PINNED at fill time
  answers: Record<FieldKey, unknown>;
  files: FileRef[];               // flattened for rules + storage cleanup
  completedAt: Timestamp | null;
}
```

* Keyed by `field.key`, not `field.id` — human-readable exports, stable diffing.
  The **id** guarantees identity; the **key** is what appears in data. Renaming a
  key is therefore a **new version** with a documented migration map.
* File answers store a `FileRef`, never a base64 blob or a raw URL.
* Unknown keys encountered when reading old data are preserved, not stripped.

## 8. Versioning rules

| Edit to a **draft** schema | Edit to a **published** schema |
|---|---|
| Mutates in place | Creates version `n+1` |
| No migration concerns | Old submissions keep pointing at version `n` |

Renderer resolution: `getSchema(id, version)` — always both. A renderer that
fetches "latest" is a bug that silently re-interprets historical answers.

Allowed in-place edits to a published version (cosmetic only): `label`, `help`,
`placeholder`. Anything touching `type`, `key`, `required`, `validation`,
`options`, or `visibleWhen` forces a version bump.

## 9. Builder UX contract

* Left: field palette grouped by `FieldTypeDefinition.group`.
* Centre: canvas, drag-to-reorder (dnd-kit), inline label editing.
* Right: `ConfigEditor` for the selected field.
* Top: Preview toggle — renders the participant form against the in-memory draft.
* Save is explicit; autosave to draft every 5 s.
* Publish shows a diff vs. the previous version and states whether a version
  bump will occur.

## 10. Testing requirements

| Test | Why |
|---|---|
| Round-trip: schema → compile → validate valid/invalid answers | The core contract |
| Visibility: hidden required field does not block submit | Classic bug |
| Hidden field's answer is dropped on submit | Data hygiene |
| Every registered type compiles to a working Zod validator | Registry integrity |
| Version pin: old answers render against old version | Historical correctness |
| Condition cycle is rejected at save | Builder safety |
| 100-field schema compiles in < 50 ms | Performance budget |

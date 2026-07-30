/**
 * Field type registry — PURE half.
 *
 * Holds everything about a field type that is not React: metadata, default
 * config, the Zod validator builder, and the export serializer.
 *
 * The React half (Input / Display / ConfigEditor) lives in
 * `modules/forms/fields/` so that `core/` stays free of React, per the
 * dependency rules in CLAUDE.md. Adding a field type means touching exactly
 * two files — one here, one there — and no switch statement anywhere.
 *
 * See docs/SPEC_FORM_ENGINE.md §4
 */
import { z, type ZodTypeAny } from 'zod';
import type { FieldType, FormField } from './types';

export type FieldGroup = 'text' | 'choice' | 'number' | 'date' | 'media' | 'link';

export interface FieldTypeDefinition {
  type: FieldType;
  label: string;
  group: FieldGroup;
  icon: string;
  defaultConfig: Record<string, unknown>;
  hasOptions: boolean;
  isFileBased: boolean;
  supportsBlindJudging: boolean;
  buildValidator: (field: FormField) => ZodTypeAny;
  toExportValue: (value: unknown) => string;
}

const registry = new Map<FieldType, FieldTypeDefinition>();

export function registerFieldType(def: FieldTypeDefinition): void {
  registry.set(def.type, def);
}

export function getFieldType(type: FieldType): FieldTypeDefinition {
  const def = registry.get(type);
  if (!def) throw new Error(`Unregistered field type: ${type}`);
  return def;
}

export function listFieldTypes(): FieldTypeDefinition[] {
  return [...registry.values()];
}

/* ------------------------------------------------------------------ */
/* Registrations                                                       */
/* ------------------------------------------------------------------ */

const str = (f: FormField) => {
  let s = z.string();
  if (f.validation.minLength) s = s.min(f.validation.minLength, `Minimum ${f.validation.minLength} characters`);
  if (f.validation.maxLength) s = s.max(f.validation.maxLength, `Maximum ${f.validation.maxLength} characters`);
  if (f.validation.pattern) {
    s = s.regex(new RegExp(f.validation.pattern), f.validation.patternMessage ?? 'Invalid format');
  }
  return s;
};

registerFieldType({
  type: 'shortText',
  label: 'Short text',
  group: 'text',
  icon: 'ShortText',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: false,
  buildValidator: str,
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'longText',
  label: 'Paragraph',
  group: 'text',
  icon: 'Notes',
  defaultConfig: { rows: 4 },
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: str,
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'email',
  label: 'Email',
  group: 'text',
  icon: 'AlternateEmail',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: false,
  buildValidator: () => z.string().email('Enter a valid email address'),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'number',
  label: 'Number',
  group: 'number',
  icon: 'Numbers',
  defaultConfig: { step: 1 },
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: (f) => {
    let n = z.coerce.number({ invalid_type_error: 'Enter a number' });
    if (f.validation.min !== undefined) n = n.min(f.validation.min, `Minimum ${f.validation.min}`);
    if (f.validation.max !== undefined) n = n.max(f.validation.max, `Maximum ${f.validation.max}`);
    return n;
  },
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'dropdown',
  label: 'Dropdown',
  group: 'choice',
  icon: 'ArrowDropDownCircle',
  defaultConfig: { searchable: false },
  hasOptions: true,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: () => z.string().min(1, 'Select an option'),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'radio',
  label: 'Single choice',
  group: 'choice',
  icon: 'RadioButtonChecked',
  defaultConfig: { layout: 'vertical' },
  hasOptions: true,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: () => z.string().min(1, 'Select an option'),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'multiSelect',
  label: 'Multi select',
  group: 'choice',
  icon: 'Checklist',
  defaultConfig: {},
  hasOptions: true,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: (f) => {
    let a = z.array(z.string());
    if (f.validation.minSelections) a = a.min(f.validation.minSelections, `Select at least ${f.validation.minSelections}`);
    if (f.validation.maxSelections) a = a.max(f.validation.maxSelections, `Select at most ${f.validation.maxSelections}`);
    return a;
  },
  toExportValue: (v) => (Array.isArray(v) ? v.join('; ') : ''),
});

registerFieldType({
  type: 'checkbox',
  label: 'Checkbox',
  group: 'choice',
  icon: 'CheckBox',
  defaultConfig: { mustBeTrue: false },
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: (f) =>
    f.config.mustBeTrue
      ? z.literal(true, { errorMap: () => ({ message: 'This must be accepted' }) })
      : z.boolean(),
  toExportValue: (v) => (v ? 'Yes' : 'No'),
});

registerFieldType({
  type: 'date',
  label: 'Date',
  group: 'date',
  icon: 'CalendarMonth',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: () => z.string().min(1, 'Pick a date'),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'rating',
  label: 'Rating',
  group: 'number',
  icon: 'StarRate',
  defaultConfig: { scale: 5 },
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: () => z.coerce.number().min(1, 'Give a rating'),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'url',
  label: 'Website URL',
  group: 'link',
  icon: 'Link',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: () => z.string().url('Enter a valid URL, including https://'),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'githubRepo',
  label: 'GitHub repo',
  group: 'link',
  icon: 'GitHub',
  defaultConfig: { requirePublic: true },
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: false,
  buildValidator: () =>
    z
      .string()
      .url('Enter a valid URL')
      .refine((v) => /github\.com\/[\w.-]+\/[\w.-]+/.test(v), 'Must be a github.com repository URL'),
  toExportValue: (v) => String(v ?? ''),
});

const fileRefShape = z.object({
  fileId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
});

registerFieldType({
  type: 'file',
  label: 'File upload',
  group: 'media',
  icon: 'UploadFile',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: true,
  supportsBlindJudging: false,
  buildValidator: (f) =>
    fileRefShape.refine(
      (r) => !f.validation.maxFileSizeMB || r.sizeBytes <= f.validation.maxFileSizeMB * 1024 * 1024,
      `File must be under ${f.validation.maxFileSizeMB} MB`,
    ),
  toExportValue: (v) => (v as { name?: string } | null)?.name ?? '',
});

registerFieldType({
  type: 'files',
  label: 'Multiple files',
  group: 'media',
  icon: 'DriveFolderUpload',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: true,
  supportsBlindJudging: false,
  buildValidator: (f) => {
    let a = z.array(fileRefShape).min(1, 'Upload at least one file');
    if (f.validation.maxFiles) a = a.max(f.validation.maxFiles, `At most ${f.validation.maxFiles} files`);
    return a;
  },
  toExportValue: (v) => (Array.isArray(v) ? v.map((f) => (f as { name: string }).name).join('; ') : ''),
});

/* ================================================================== *
 * Phase 2 field types                                                 *
 *                                                                     *
 * Purely additive: each is one entry here and one in                  *
 * `modules/forms/fieldComponents.tsx`. Nothing else in the app        *
 * changes, because no code switches on `field.type` — which is the    *
 * whole point of the registry (ADR-012).                              *
 * ================================================================== */

registerFieldType({
  type: 'phone',
  label: 'Phone number',
  group: 'text',
  icon: 'Call',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: false,
  /**
   * Deliberately permissive: digits, spaces, and the punctuation real phone
   * numbers carry, 6–20 characters. Strict national formats reject valid
   * numbers from the next country over, and a competition that cannot accept a
   * foreign entrant's phone number has a bug, not a validation feature.
   */
  buildValidator: () =>
    z.string().regex(/^[+]?[\d\s()./-]{6,20}$/, 'Enter a phone number, including the country code if it is not local'),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'time',
  label: 'Time',
  group: 'date',
  icon: 'Schedule',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time'),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'datetime',
  label: 'Date and time',
  group: 'date',
  icon: 'Event',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  // `<input type="datetime-local">` emits `YYYY-MM-DDTHH:mm`.
  buildValidator: () =>
    z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Pick a date and time'),
  toExportValue: (v) => String(v ?? '').replace('T', ' '),
});

registerFieldType({
  type: 'currency',
  label: 'Amount',
  group: 'number',
  icon: 'Payments',
  defaultConfig: { currency: 'INR' },
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: (f) => {
    let n = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'An amount cannot be negative');
    if (f.validation.min !== undefined) n = n.min(f.validation.min, `Minimum ${f.validation.min}`);
    if (f.validation.max !== undefined) n = n.max(f.validation.max, `Maximum ${f.validation.max}`);
    return n;
  },
  toExportValue: (v) => (v === null || v === undefined || v === '' ? '' : String(v)),
});

registerFieldType({
  type: 'slider',
  label: 'Slider',
  group: 'number',
  icon: 'Tune',
  defaultConfig: { min: 0, max: 100, step: 1 },
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: (f) => {
    const min = f.validation.min ?? 0;
    const max = f.validation.max ?? 100;
    return z.coerce.number().min(min, `Minimum ${min}`).max(max, `Maximum ${max}`);
  },
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'linearScale',
  label: 'Linear scale',
  group: 'number',
  icon: 'LinearScale',
  // The labelled 1–5 scale, the thing people actually reach for when they say
  // "like Google Forms".
  defaultConfig: { min: 1, max: 5, minLabel: 'Strongly disagree', maxLabel: 'Strongly agree' },
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: (f) => {
    const min = (f.config.min as number) ?? 1;
    const max = (f.config.max as number) ?? 5;
    return z.coerce.number().min(min, `Pick between ${min} and ${max}`).max(max, `Pick between ${min} and ${max}`);
  },
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'ranking',
  label: 'Ranking',
  group: 'choice',
  icon: 'FormatListNumbered',
  defaultConfig: {},
  hasOptions: true,
  isFileBased: false,
  supportsBlindJudging: true,
  /**
   * Stored as an ordered array of option values. Validation requires *every*
   * option exactly once: a partial ranking is ambiguous — is an omitted item
   * last, or unranked? — and there is no honest way to score it.
   */
  buildValidator: (f) => {
    const values = (f.options ?? []).map((o) => o.value);
    return z.array(z.string())
      .refine((v) => v.length === values.length, 'Rank every option')
      .refine((v) => new Set(v).size === v.length, 'Each option can appear only once')
      .refine((v) => v.every((x) => values.includes(x)), 'Unknown option in the ranking');
  },
  toExportValue: (v) => (Array.isArray(v) ? v.map((x, i) => `${i + 1}. ${x}`).join('; ') : ''),
});

registerFieldType({
  type: 'driveLink',
  label: 'Google Drive link',
  group: 'media',
  icon: 'AddToDrive',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: true,
  supportsBlindJudging: false,
  /**
   * A first-class field type for the link-first Drive integration (ADR-017).
   *
   * The pattern is duplicated from `core/drive/links.ts` rather than imported
   * because `core/forms` is a pure engine that must not depend on another
   * feature module; the UI half uses the real parser. Kept deliberately loose
   * here — the component gives the precise diagnosis.
   */
  buildValidator: () =>
    z.string().refine(
      (v) => /(drive|docs)\.google\.com\/.*[A-Za-z0-9_-]{10,}/.test(v),
      'Paste a Google Drive share link (Share → Copy link)',
    ),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'videoUrl',
  label: 'Video link',
  group: 'link',
  icon: 'Movie',
  defaultConfig: {},
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: true,
  buildValidator: () =>
    z.string().url('Enter a valid URL').refine(
      (v) => /(youtube\.com|youtu\.be|vimeo\.com|drive\.google\.com|loom\.com)/.test(v),
      'Use a YouTube, Vimeo, Loom or Google Drive link',
    ),
  toExportValue: (v) => String(v ?? ''),
});

registerFieldType({
  type: 'address',
  label: 'Address',
  group: 'text',
  icon: 'Home',
  defaultConfig: { rows: 3 },
  hasOptions: false,
  isFileBased: false,
  supportsBlindJudging: false,
  buildValidator: (f) => {
    let s = z.string().min(5, 'Enter a full address');
    if (f.validation.maxLength) s = s.max(f.validation.maxLength, `Maximum ${f.validation.maxLength} characters`);
    return s;
  },
  // Newlines would break the CSV row shape; the escaper quotes it, but a
  // single-line address is far more usable in a spreadsheet.
  toExportValue: (v) => String(v ?? '').replace(/\s*\n\s*/g, ', '),
});

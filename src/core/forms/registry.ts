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

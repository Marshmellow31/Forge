/**
 * Compiles a FormSchema + current answers into a Zod validator.
 * PURE. One source of truth for validation — builder preview, participant
 * form, offline queue and (later) the Cloud Function all call this.
 *
 * See docs/SPEC_FORM_ENGINE.md §6
 */
import { z, type ZodTypeAny } from 'zod';
import { computeVisibility } from './conditions';
import { getFieldType } from './registry';
import type { Answers, FieldError, FormField, FormSchema } from './types';

export function allFields(schema: FormSchema): FormField[] {
  return schema.sections.flatMap((s) => s.fields);
}

export function compileSchema(schema: FormSchema, answers: Answers): z.ZodObject<Record<string, ZodTypeAny>> {
  const { visibleFieldIds } = computeVisibility(schema, answers);
  const shape: Record<string, ZodTypeAny> = {};

  for (const field of allFields(schema)) {
    // A hidden field is excluded from validation entirely — a hidden required
    // field must never block submission.
    if (!visibleFieldIds.has(field.id)) continue;

    const def = getFieldType(field.type);
    let validator = def.buildValidator(field);

    if (!field.required) {
      validator = validator.optional().or(z.literal('')).or(z.null()).or(z.undefined());
    }
    shape[field.key] = validator;
  }

  return z.object(shape);
}

export function validateAnswers(schema: FormSchema, answers: Answers): FieldError[] {
  const validator = compileSchema(schema, answers);
  const result = validator.safeParse(answers);
  if (result.success) return [];

  return result.error.issues.map((issue) => ({
    key: String(issue.path[0] ?? ''),
    message: issue.message,
  }));
}

export function completionPercent(schema: FormSchema, answers: Answers): number {
  const { visibleFieldIds } = computeVisibility(schema, answers);
  const visible = allFields(schema).filter((f) => visibleFieldIds.has(f.id));
  const required = visible.filter((f) => f.required);
  const pool = required.length > 0 ? required : visible;
  if (pool.length === 0) return 100;

  const filled = pool.filter((f) => {
    const v = answers[f.key];
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (v === false) return false;
    return true;
  });
  return Math.round((filled.length / pool.length) * 100);
}

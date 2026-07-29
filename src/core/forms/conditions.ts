/**
 * Condition DSL evaluator. PURE — no clock, no randomness, no I/O.
 * See docs/SPEC_FORM_ENGINE.md §5
 */
import type { Answers, Condition, FormSchema, FieldId } from './types';

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function evaluateCondition(c: Condition | null, answers: Answers): boolean {
  if (!c) return true;

  if ('all' in c) return c.all.every((sub) => evaluateCondition(sub, answers));
  if ('any' in c) return c.any.some((sub) => evaluateCondition(sub, answers));
  if ('not' in c) return !evaluateCondition(c.not, answers);

  const actual = answers[c.field];
  const expected = c.value;

  switch (c.op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never);
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(expected as never);
      return String(actual ?? '').includes(String(expected ?? ''));
    case 'isEmpty':
      return isEmpty(actual);
    case 'isNotEmpty':
      return !isEmpty(actual);
    default:
      return true;
  }
}

export interface Visibility {
  visibleFieldIds: Set<FieldId>;
  visibleSectionIds: Set<string>;
  visibleKeys: Set<string>;
}

export function computeVisibility(schema: FormSchema, answers: Answers): Visibility {
  const visibleFieldIds = new Set<FieldId>();
  const visibleSectionIds = new Set<string>();
  const visibleKeys = new Set<string>();

  for (const section of schema.sections) {
    if (!evaluateCondition(section.visibleWhen, answers)) continue;
    visibleSectionIds.add(section.id);

    for (const field of section.fields) {
      if (!evaluateCondition(field.visibleWhen, answers)) continue;
      visibleFieldIds.add(field.id);
      visibleKeys.add(field.key);
    }
  }

  return { visibleFieldIds, visibleSectionIds, visibleKeys };
}

/**
 * Hidden fields must not leak into stored data.
 * See docs/SPEC_FORM_ENGINE.md §5 — "no ghost data".
 */
export function stripHiddenAnswers(schema: FormSchema, answers: Answers): Answers {
  const { visibleKeys } = computeVisibility(schema, answers);
  const out: Answers = {};
  for (const [k, v] of Object.entries(answers)) {
    if (visibleKeys.has(k)) out[k] = v;
  }
  return out;
}

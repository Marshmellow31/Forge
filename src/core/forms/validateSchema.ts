/**
 * Schema-level integrity checks. PURE — no React, no Firebase, no I/O.
 *
 * `compiler.ts` answers "are these *answers* valid?". This module answers the
 * prior question: "is this *schema* coherent enough to publish?".
 *
 * The builder runs it on every edit (to warn) and the publish path runs it as a
 * gate (to refuse). SPEC_FORM_ENGINE §10 requires the cycle case specifically:
 * a condition graph that loops makes visibility undefined, and a form that
 * cannot decide what to show is worse than one that fails to save.
 */
import type { Condition, FormField, FormSchema } from './types';

export type SchemaProblemLevel = 'error' | 'warning';

export interface SchemaProblem {
  level: SchemaProblemLevel;
  /** Field or section id the problem belongs to, when it has one. */
  targetId: string | null;
  code:
    | 'duplicateKey'
    | 'emptyKey'
    | 'emptyLabel'
    | 'unknownConditionField'
    | 'conditionCycle'
    | 'selfReference'
    | 'optionsMissing'
    | 'duplicateOptionValue'
    | 'emptySection'
    | 'impossibleRange';
  message: string;
}

/** Every field key referenced by a condition tree. */
function referencedKeys(condition: Condition | null, into: Set<string> = new Set()): Set<string> {
  if (!condition) return into;
  if ('all' in condition) condition.all.forEach((c) => referencedKeys(c, into));
  else if ('any' in condition) condition.any.forEach((c) => referencedKeys(c, into));
  else if ('not' in condition) referencedKeys(condition.not, into);
  else into.add(condition.field);
  return into;
}

function allFieldsOf(schema: FormSchema): FormField[] {
  return schema.sections.flatMap((s) => s.fields);
}

/**
 * Detects a cycle in the "field A's visibility depends on field B" graph.
 *
 * Uses an explicit colour-marked DFS rather than a visited set, because only a
 * back-edge to a node still on the current stack is a cycle; a node merely seen
 * before on another branch is fine (a diamond is legal, a loop is not).
 *
 * Returns the keys involved in the first cycle found, or null.
 */
function findConditionCycle(schema: FormSchema): string[] | null {
  const fields = allFieldsOf(schema);
  const dependsOn = new Map<string, Set<string>>();
  for (const f of fields) dependsOn.set(f.key, referencedKeys(f.visibleWhen));

  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map<string, number>(fields.map((f) => [f.key, WHITE]));
  const stack: string[] = [];

  const visit = (key: string): string[] | null => {
    colour.set(key, GREY);
    stack.push(key);

    for (const next of dependsOn.get(key) ?? []) {
      // A condition may reference a key that does not exist; that is reported
      // separately as `unknownConditionField`, and is not a cycle.
      if (!colour.has(next)) continue;
      if (colour.get(next) === GREY) {
        return [...stack.slice(stack.indexOf(next)), next];
      }
      if (colour.get(next) === WHITE) {
        const found = visit(next);
        if (found) return found;
      }
    }

    stack.pop();
    colour.set(key, BLACK);
    return null;
  };

  for (const f of fields) {
    if (colour.get(f.key) === WHITE) {
      const cycle = visit(f.key);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Full integrity pass.
 *
 * `error` blocks publishing. `warning` is shown in the builder but never stops
 * an admin who knows what they are doing — an empty section while you are still
 * laying a form out is normal, a duplicate field key never is.
 */
export function validateSchema(schema: FormSchema): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  const fields = allFieldsOf(schema);
  const keys = new Set<string>();

  for (const field of fields) {
    if (!field.key.trim()) {
      problems.push({
        level: 'error', targetId: field.id, code: 'emptyKey',
        message: `"${field.label || 'Untitled field'}" has no key. Answers are stored under the key, so it cannot be blank.`,
      });
    } else if (keys.has(field.key)) {
      problems.push({
        level: 'error', targetId: field.id, code: 'duplicateKey',
        message: `Two fields share the key "${field.key}". The second would overwrite the first's answer.`,
      });
    }
    keys.add(field.key);

    if (!field.label.trim()) {
      problems.push({
        level: 'warning', targetId: field.id, code: 'emptyLabel',
        message: 'This field has no label, so participants will not know what to enter.',
      });
    }

    const def = field.options;
    const needsOptions = field.type === 'dropdown' || field.type === 'radio' || field.type === 'multiSelect';
    if (needsOptions && (!def || def.length === 0)) {
      problems.push({
        level: 'error', targetId: field.id, code: 'optionsMissing',
        message: `"${field.label || field.key}" is a choice field with no options to choose from.`,
      });
    }
    if (def && def.length > 0) {
      const seen = new Set<string>();
      for (const o of def) {
        if (seen.has(o.value)) {
          problems.push({
            level: 'error', targetId: field.id, code: 'duplicateOptionValue',
            message: `"${field.label || field.key}" has two options with the value "${o.value}".`,
          });
          break;
        }
        seen.add(o.value);
      }
    }

    const { min, max, minLength, maxLength } = field.validation;
    if (min !== undefined && max !== undefined && min > max) {
      problems.push({
        level: 'error', targetId: field.id, code: 'impossibleRange',
        message: `"${field.label || field.key}" requires a value of at least ${min} and at most ${max}, which nothing satisfies.`,
      });
    }
    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
      problems.push({
        level: 'error', targetId: field.id, code: 'impossibleRange',
        message: `"${field.label || field.key}" requires at least ${minLength} characters and at most ${maxLength}.`,
      });
    }

    // A field whose visibility depends on itself can never settle.
    if (referencedKeys(field.visibleWhen).has(field.key)) {
      problems.push({
        level: 'error', targetId: field.id, code: 'selfReference',
        message: `"${field.label || field.key}" is shown only when its own answer matches, so it can never appear.`,
      });
    }
  }

  // Conditions referencing a key that no field defines. Checked after the key
  // set is complete so forward references (B before A) are not false positives.
  for (const section of schema.sections) {
    if (section.fields.length === 0) {
      problems.push({
        level: 'warning', targetId: section.id, code: 'emptySection',
        message: `Section "${section.title || 'Untitled'}" has no fields.`,
      });
    }
    for (const key of referencedKeys(section.visibleWhen)) {
      if (!keys.has(key)) {
        problems.push({
          level: 'error', targetId: section.id, code: 'unknownConditionField',
          message: `Section "${section.title || 'Untitled'}" is shown based on "${key}", which no field defines.`,
        });
      }
    }
    for (const field of section.fields) {
      for (const key of referencedKeys(field.visibleWhen)) {
        if (!keys.has(key)) {
          problems.push({
            level: 'error', targetId: field.id, code: 'unknownConditionField',
            message: `"${field.label || field.key}" is shown based on "${key}", which no field defines.`,
          });
        }
      }
    }
  }

  const cycle = findConditionCycle(schema);
  if (cycle) {
    problems.push({
      level: 'error', targetId: null, code: 'conditionCycle',
      message: `These fields depend on each other in a loop, so none of them can decide whether to appear: ${cycle.join(' → ')}.`,
    });
  }

  return problems;
}

/** Publishing gate. A schema with any `error` must not reach Firestore. */
export function canPublish(schema: FormSchema): boolean {
  return !validateSchema(schema).some((p) => p.level === 'error');
}

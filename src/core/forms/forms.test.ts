import { describe, it, expect } from 'vitest';
import { compileSchema, validateAnswers, completionPercent, allFields } from './compiler';
import { evaluateCondition, computeVisibility, stripHiddenAnswers } from './conditions';
import { listFieldTypes, getFieldType } from './registry';
import { validateSchema, canPublish } from './validateSchema';
import type { Condition, FieldType, FormField, FormSchema } from './types';

/**
 * The seven cases required by SPEC_FORM_ENGINE §10, plus the condition DSL
 * itself.
 *
 * This engine decides validation for every challenge on the platform, so a
 * regression here is silent and product-wide — that is why STATUS.md lists the
 * absence of these tests as the single largest risk in the repo.
 */

let seq = 0;
function field(over: Partial<FormField> = {}): FormField {
  seq += 1;
  const key = over.key ?? `f${seq}`;
  return {
    id: over.id ?? `fld_${key}`,
    key,
    type: 'shortText',
    label: `Field ${key}`,
    help: null,
    placeholder: null,
    required: false,
    order: seq,
    defaultValue: null,
    options: null,
    validation: {},
    config: {},
    visibleWhen: null,
    width: 'full',
    piiLevel: 'none',
    ...over,
  };
}

function schemaOf(fields: FormField[], over: Partial<FormSchema> = {}): FormSchema {
  return {
    id: 'sch_test',
    orgId: 'org_test',
    version: 1,
    status: 'draft',
    title: 'Test form',
    description: null,
    sections: [{ id: 'sec_1', title: 'Section 1', description: null, order: 1, fields, visibleWhen: null }],
    settings: { allowDrafts: true, showProgressBar: true, confirmationMessage: null },
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* 1. Round trip: schema → compile → validate                          */
/* ------------------------------------------------------------------ */

describe('round trip: compile and validate', () => {
  const schema = schemaOf([
    field({ key: 'name', type: 'shortText', required: true, validation: { minLength: 2 } }),
    field({ key: 'email', type: 'email', required: true }),
    field({ key: 'age', type: 'number', required: true, validation: { min: 18, max: 120 } }),
  ]);

  it('accepts answers that satisfy every rule', () => {
    expect(validateAnswers(schema, { name: 'Ada', email: 'ada@example.com', age: 36 })).toEqual([]);
  });

  it('reports the offending key for each broken rule', () => {
    const errors = validateAnswers(schema, { name: 'A', email: 'not-an-email', age: 9 });
    expect(errors.map((e) => e.key).sort()).toEqual(['age', 'email', 'name']);
  });

  it('coerces a numeric string, because HTML inputs only ever produce strings', () => {
    expect(validateAnswers(schema, { name: 'Ada', email: 'ada@example.com', age: '36' })).toEqual([]);
  });

  it('treats a missing required answer as invalid, not as absent', () => {
    const errors = validateAnswers(schema, { name: 'Ada', email: 'ada@example.com' });
    expect(errors.map((e) => e.key)).toContain('age');
  });

  it('lets an optional field be blank', () => {
    const optional = schemaOf([field({ key: 'nickname', required: false })]);
    expect(validateAnswers(optional, {})).toEqual([]);
    expect(validateAnswers(optional, { nickname: '' })).toEqual([]);
  });

  it('compiles to a Zod object keyed by field key, not field id', () => {
    expect(Object.keys(compileSchema(schema, {}).shape).sort()).toEqual(['age', 'email', 'name']);
  });
});

/* ------------------------------------------------------------------ */
/* 2. A hidden required field must not block submit                    */
/* ------------------------------------------------------------------ */

describe('visibility does not trap the participant', () => {
  const conditional = schemaOf([
    field({ key: 'hasTeam', type: 'radio', required: true, options: [
      { id: 'o1', label: 'Yes', value: 'yes' },
      { id: 'o2', label: 'No', value: 'no' },
    ] }),
    field({
      key: 'teamName',
      required: true,
      visibleWhen: { field: 'hasTeam', op: 'eq', value: 'yes' },
    }),
  ]);

  it('does not require a required field that is hidden — the classic bug', () => {
    expect(validateAnswers(conditional, { hasTeam: 'no' })).toEqual([]);
  });

  it('does require it once the condition turns it on', () => {
    const errors = validateAnswers(conditional, { hasTeam: 'yes' });
    expect(errors.map((e) => e.key)).toContain('teamName');
  });

  it('excludes the hidden field from the compiled shape entirely', () => {
    expect(Object.keys(compileSchema(conditional, { hasTeam: 'no' }).shape)).toEqual(['hasTeam']);
  });

  it('ignores a hidden required field when computing completion', () => {
    expect(completionPercent(conditional, { hasTeam: 'no' })).toBe(100);
    expect(completionPercent(conditional, { hasTeam: 'yes' })).toBe(50);
  });

  it('hides every field in a hidden section, whatever their own conditions say', () => {
    const sectioned: FormSchema = {
      ...schemaOf([]),
      sections: [
        { id: 's1', title: 'Always', description: null, order: 1, visibleWhen: null,
          fields: [field({ key: 'mode', required: true })] },
        { id: 's2', title: 'Advanced', description: null, order: 2,
          visibleWhen: { field: 'mode', op: 'eq', value: 'advanced' },
          fields: [field({ key: 'tuning', required: true, visibleWhen: null })] },
      ],
    };
    expect(computeVisibility(sectioned, { mode: 'simple' }).visibleKeys.has('tuning')).toBe(false);
    expect(validateAnswers(sectioned, { mode: 'simple' })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 3. A hidden field's answer is dropped on submit                     */
/* ------------------------------------------------------------------ */

describe('no ghost data', () => {
  const schema = schemaOf([
    field({ key: 'hasTeam' }),
    field({ key: 'teamName', visibleWhen: { field: 'hasTeam', op: 'eq', value: 'yes' } }),
  ]);

  it('drops an answer the participant typed before hiding the field again', () => {
    const stored = stripHiddenAnswers(schema, { hasTeam: 'no', teamName: 'The Leftovers' });
    expect(stored).toEqual({ hasTeam: 'no' });
    expect('teamName' in stored).toBe(false);
  });

  it('keeps it while the field is visible', () => {
    expect(stripHiddenAnswers(schema, { hasTeam: 'yes', teamName: 'Ada & co' }))
      .toEqual({ hasTeam: 'yes', teamName: 'Ada & co' });
  });

  it('drops answers whose key no longer exists in the schema at all', () => {
    expect(stripHiddenAnswers(schema, { hasTeam: 'yes', removedField: 'stale' }))
      .toEqual({ hasTeam: 'yes' });
  });
});

/* ------------------------------------------------------------------ */
/* 4. Every registered type compiles to a working validator            */
/* ------------------------------------------------------------------ */

describe('registry integrity', () => {
  const types = listFieldTypes();

  it('registers every documented field type', () => {
    // 14 from Phase 1, 10 added in Phase 2. This number is deliberately
    // asserted: adding a type to the registry without a UI component would
    // otherwise only fail at runtime, on the one screen that renders it.
    expect(types).toHaveLength(24);
  });

  it('has no duplicate type keys', () => {
    expect(new Set(types.map((t) => t.type)).size).toBe(types.length);
  });

  it.each(types.map((t) => t.type))('%s builds a usable Zod validator', (type: FieldType) => {
    const def = getFieldType(type);
    const f = field({
      type,
      key: `k_${type}`,
      options: def.hasOptions ? [{ id: 'o', label: 'One', value: 'one' }] : null,
    });
    const validator = def.buildValidator(f);
    expect(typeof validator.safeParse).toBe('function');
    // A validator must reach a verdict rather than throw on hostile input.
    expect(() => validator.safeParse(undefined)).not.toThrow();
    expect(() => validator.safeParse({ unexpected: true })).not.toThrow();
  });

  it.each(types.map((t) => t.type))('%s exports a string for the CSV writer', (type: FieldType) => {
    expect(typeof getFieldType(type).toExportValue(null)).toBe('string');
  });

  it('throws a named error for an unregistered type rather than returning undefined', () => {
    expect(() => getFieldType('notAType' as FieldType)).toThrow(/Unregistered field type/);
  });

  it('accepts a valid answer for each simple type', () => {
    const cases: Array<[FieldType, unknown]> = [
      ['shortText', 'hello'],
      ['longText', 'a longer answer'],
      ['email', 'ada@example.com'],
      ['number', 42],
      ['dropdown', 'one'],
      ['radio', 'one'],
      ['multiSelect', ['one']],
      ['checkbox', true],
      ['date', '2026-07-29'],
      ['rating', 4],
      ['url', 'https://example.com'],
      ['githubRepo', 'https://github.com/anthropics/claude-code'],
      ['phone', '+91 99999 11111'],
      ['time', '14:30'],
      ['datetime', '2026-07-29T14:30'],
      ['currency', 2500],
      ['slider', 50],
      ['linearScale', 4],
      ['videoUrl', 'https://youtu.be/dQw4w9WgXcQ'],
      ['address', '12 Some Street, Vadodara 390001'],
      ['driveLink', 'https://drive.google.com/file/d/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv/view'],
    ];
    for (const [type, value] of cases) {
      const def = getFieldType(type);
      const result = def.buildValidator(field({ type, key: `k_${type}` })).safeParse(value);
      expect(result.success, `${type} rejected ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it('rejects a plausible-but-wrong answer for each simple type', () => {
    const cases: Array<[FieldType, unknown]> = [
      ['email', 'ada@'],
      ['url', 'example.com'],
      ['githubRepo', 'https://gitlab.com/a/b'],
      ['number', 'not a number'],
      ['multiSelect', 'one'],
      ['phone', 'call me'],
      ['time', '25:99'],
      ['datetime', '2026-07-29'],
      ['currency', -5],
      ['linearScale', 99],
      ['videoUrl', 'https://example.com/video.mp4'],
      ['driveLink', 'https://dropbox.com/s/abc'],
      ['address', 'x'],
    ];
    for (const [type, value] of cases) {
      const def = getFieldType(type);
      const result = def.buildValidator(field({ type, key: `k_${type}` })).safeParse(value);
      expect(result.success, `${type} accepted ${JSON.stringify(value)}`).toBe(false);
    }
  });

  describe('ranking', () => {
    const rankingField = field({
      type: 'ranking',
      key: 'rank',
      options: [
        { id: 'o1', label: 'One', value: 'one' },
        { id: 'o2', label: 'Two', value: 'two' },
        { id: 'o3', label: 'Three', value: 'three' },
      ],
    });
    const validator = getFieldType('ranking').buildValidator(rankingField);

    it('accepts a complete ranking', () => {
      expect(validator.safeParse(['two', 'one', 'three']).success).toBe(true);
    });

    // A partial ranking is ambiguous: is an omitted item last, or unranked?
    it('rejects a partial ranking', () => {
      expect(validator.safeParse(['one', 'two']).success).toBe(false);
    });

    it('rejects a duplicated option', () => {
      expect(validator.safeParse(['one', 'one', 'two']).success).toBe(false);
    });

    it('rejects an option that is not on the list', () => {
      expect(validator.safeParse(['one', 'two', 'four']).success).toBe(false);
    });

    it('exports as a numbered list', () => {
      expect(getFieldType('ranking').toExportValue(['two', 'one']))
        .toBe('1. two; 2. one');
    });
  });

  describe('phone is permissive across countries', () => {
    const validator = getFieldType('phone').buildValidator(field({ type: 'phone', key: 'p' }));

    it.each([
      '+91 99999 11111',
      '+1 (555) 010-9999',
      '020 7946 0958',
      '+44-20-7946-0958',
    ])('accepts %s', (value) => {
      // A competition that cannot accept a foreign entrant's number has a bug,
      // not a validation feature.
      expect(validator.safeParse(value).success).toBe(true);
    });
  });

  describe('address export', () => {
    it('flattens newlines so a spreadsheet row stays readable', () => {
      expect(getFieldType('address').toExportValue('12 Some Street\nVadodara\n390001'))
        .toBe('12 Some Street, Vadodara, 390001');
    });
  });
});

/* ------------------------------------------------------------------ */
/* 5. Version pin: old answers render against the version they used    */
/* ------------------------------------------------------------------ */

describe('schema versions are immutable once published', () => {
  const v1 = schemaOf([field({ key: 'title', required: true })], { id: 'sch_x_v1', version: 1, status: 'published' });

  // v2 adds a required field. CLAUDE.md hard rule 6: an entry made against v1
  // must keep validating against v1 forever.
  const v2: FormSchema = {
    ...v1,
    id: 'sch_x_v2',
    version: 2,
    sections: [{ ...v1.sections[0], fields: [...v1.sections[0].fields, field({ key: 'summary', required: true })] }],
  };

  const answersFromV1 = { title: 'My entry' };

  it('still validates a v1 entry against v1 after v2 exists', () => {
    expect(validateAnswers(v1, answersFromV1)).toEqual([]);
  });

  it('would wrongly reject that same entry if validated against v2', () => {
    // Not a bug — it is exactly why the version is pinned on the registration.
    expect(validateAnswers(v2, answersFromV1).map((e) => e.key)).toContain('summary');
  });

  it('keeps field ids stable across versions so answers stay addressable', () => {
    const v1Ids = allFields(v1).map((f) => f.id);
    expect(allFields(v2).map((f) => f.id)).toEqual(expect.arrayContaining(v1Ids));
  });
});

/* ------------------------------------------------------------------ */
/* 6. A condition cycle is rejected at save                            */
/* ------------------------------------------------------------------ */

describe('schema integrity gate', () => {
  it('rejects a two-field condition loop', () => {
    const looped = schemaOf([
      field({ key: 'a', visibleWhen: { field: 'b', op: 'isNotEmpty' } }),
      field({ key: 'b', visibleWhen: { field: 'a', op: 'isNotEmpty' } }),
    ]);
    const problems = validateSchema(looped);
    expect(problems.some((p) => p.code === 'conditionCycle')).toBe(true);
    expect(canPublish(looped)).toBe(false);
  });

  it('rejects a longer loop that no single field reveals', () => {
    const looped = schemaOf([
      field({ key: 'a', visibleWhen: { field: 'b', op: 'isNotEmpty' } }),
      field({ key: 'b', visibleWhen: { field: 'c', op: 'isNotEmpty' } }),
      field({ key: 'c', visibleWhen: { field: 'a', op: 'isNotEmpty' } }),
    ]);
    expect(validateSchema(looped).some((p) => p.code === 'conditionCycle')).toBe(true);
  });

  it('rejects a field whose visibility depends on its own answer', () => {
    const selfish = schemaOf([field({ key: 'a', visibleWhen: { field: 'a', op: 'isNotEmpty' } })]);
    expect(validateSchema(selfish).some((p) => p.code === 'selfReference')).toBe(true);
  });

  it('allows a diamond, which is not a cycle', () => {
    const diamond = schemaOf([
      field({ key: 'root' }),
      field({ key: 'left', visibleWhen: { field: 'root', op: 'isNotEmpty' } }),
      field({ key: 'right', visibleWhen: { field: 'root', op: 'isNotEmpty' } }),
      field({ key: 'join', visibleWhen: { all: [
        { field: 'left', op: 'isNotEmpty' },
        { field: 'right', op: 'isNotEmpty' },
      ] } }),
    ]);
    expect(validateSchema(diamond).filter((p) => p.level === 'error')).toEqual([]);
    expect(canPublish(diamond)).toBe(true);
  });

  it('rejects two fields sharing a key, because answers are keyed by it', () => {
    const clashing = schemaOf([field({ key: 'dup', id: 'fld_1' }), field({ key: 'dup', id: 'fld_2' })]);
    expect(validateSchema(clashing).some((p) => p.code === 'duplicateKey')).toBe(true);
  });

  it('rejects a condition pointing at a field that does not exist', () => {
    const dangling = schemaOf([field({ key: 'a', visibleWhen: { field: 'ghost', op: 'eq', value: 1 } })]);
    expect(validateSchema(dangling).some((p) => p.code === 'unknownConditionField')).toBe(true);
  });

  it('allows a forward reference to a field defined later in the form', () => {
    const forward = schemaOf([
      field({ key: 'first', visibleWhen: { field: 'second', op: 'isNotEmpty' } }),
      field({ key: 'second' }),
    ]);
    expect(validateSchema(forward).filter((p) => p.level === 'error')).toEqual([]);
  });

  it('rejects a choice field with no options', () => {
    const empty = schemaOf([field({ key: 'pick', type: 'dropdown', options: [] })]);
    expect(validateSchema(empty).some((p) => p.code === 'optionsMissing')).toBe(true);
  });

  it('rejects a range nothing can satisfy', () => {
    const impossible = schemaOf([field({ key: 'n', type: 'number', validation: { min: 10, max: 5 } })]);
    expect(validateSchema(impossible).some((p) => p.code === 'impossibleRange')).toBe(true);
  });

  it('treats a missing label as a warning, not a publish blocker', () => {
    const unlabelled = schemaOf([field({ key: 'a', label: '' })]);
    expect(validateSchema(unlabelled).some((p) => p.code === 'emptyLabel' && p.level === 'warning')).toBe(true);
    expect(canPublish(unlabelled)).toBe(true);
  });

  it('passes a well-formed schema with nothing to report', () => {
    expect(validateSchema(schemaOf([field({ key: 'a', label: 'A' })]))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 7. Performance budget: 100 fields compile in under 50 ms            */
/* ------------------------------------------------------------------ */

describe('performance budget', () => {
  const hundred = schemaOf(
    Array.from({ length: 100 }, (_, i) =>
      field({
        key: `field_${i}`,
        id: `fld_${i}`,
        required: i % 3 === 0,
        // Half the form is conditional, which is the expensive shape.
        visibleWhen: i > 0 && i % 2 === 0 ? { field: `field_${i - 1}`, op: 'isNotEmpty' } : null,
      }),
    ),
  );
  const answers = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field_${i}`, 'x']));

  it('compiles a 100-field schema in under 50 ms', () => {
    const start = performance.now();
    compileSchema(hundred, answers);
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('validates a 100-field schema in under 50 ms', () => {
    const start = performance.now();
    validateAnswers(hundred, answers);
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('checks integrity of a 100-field schema in under 50 ms', () => {
    const start = performance.now();
    validateSchema(hundred);
    expect(performance.now() - start).toBeLessThan(50);
  });
});

/* ------------------------------------------------------------------ */
/* The condition DSL itself                                            */
/* ------------------------------------------------------------------ */

describe('condition DSL', () => {
  const answers = { n: 5, s: 'hello world', list: ['a', 'b'], blank: '', missing: null };

  const cases: Array<[string, Condition, boolean]> = [
    ['eq true', { field: 'n', op: 'eq', value: 5 }, true],
    ['eq is strict about type', { field: 'n', op: 'eq', value: '5' }, false],
    ['neq', { field: 'n', op: 'neq', value: 4 }, true],
    ['gt', { field: 'n', op: 'gt', value: 4 }, true],
    ['gte at the boundary', { field: 'n', op: 'gte', value: 5 }, true],
    ['lt', { field: 'n', op: 'lt', value: 6 }, true],
    ['lte at the boundary', { field: 'n', op: 'lte', value: 5 }, true],
    ['in', { field: 'n', op: 'in', value: [1, 5, 9] }, true],
    ['in when absent', { field: 'n', op: 'in', value: [1, 9] }, false],
    ['contains on a string', { field: 's', op: 'contains', value: 'world' }, true],
    ['contains on an array', { field: 'list', op: 'contains', value: 'a' }, true],
    ['isEmpty on empty string', { field: 'blank', op: 'isEmpty' }, true],
    ['isEmpty on null', { field: 'missing', op: 'isEmpty' }, true],
    ['isEmpty on an absent key', { field: 'nope', op: 'isEmpty' }, true],
    ['isEmpty on an empty array', { field: 'empty', op: 'isEmpty' }, true],
    ['isNotEmpty', { field: 's', op: 'isNotEmpty' }, true],
    ['all', { all: [{ field: 'n', op: 'gt', value: 1 }, { field: 's', op: 'isNotEmpty' }] }, true],
    ['all short-circuits false', { all: [{ field: 'n', op: 'gt', value: 1 }, { field: 'blank', op: 'isNotEmpty' }] }, false],
    ['any', { any: [{ field: 'blank', op: 'isNotEmpty' }, { field: 'n', op: 'eq', value: 5 }] }, true],
    ['not', { not: { field: 'n', op: 'eq', value: 4 } }, true],
    ['nested', { all: [{ any: [{ field: 'n', op: 'eq', value: 5 }] }, { not: { field: 's', op: 'isEmpty' } }] }, true],
  ];

  it.each(cases)('%s', (_name, condition, expected) => {
    expect(evaluateCondition(condition, { ...answers, empty: [] })).toBe(expected);
  });

  it('treats a null condition as "always visible"', () => {
    expect(evaluateCondition(null, {})).toBe(true);
  });

  it('treats an empty `all` as true and an empty `any` as false', () => {
    expect(evaluateCondition({ all: [] }, {})).toBe(true);
    expect(evaluateCondition({ any: [] }, {})).toBe(false);
  });
});

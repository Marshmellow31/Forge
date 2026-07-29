import { describe, it, expect } from 'vitest';
import {
  escapeCell, toCsv, columnsFor, registrationsToCsv, submissionsToCsv,
  scoresToCsv, exportFilename, REDACTED,
  type RegistrationRow, type SubmissionRow,
} from './csv';
import type { FormField, FormSchema } from '@core/forms/types';

function field(over: Partial<FormField>): FormField {
  return {
    id: `fld_${over.key}`, key: over.key ?? 'k', type: 'shortText', label: 'L',
    help: null, placeholder: null, required: false, order: 1, defaultValue: null,
    options: null, validation: {}, config: {}, visibleWhen: null,
    width: 'full', piiLevel: 'none', ...over,
  };
}

const schema: FormSchema = {
  id: 'sch', orgId: 'org', version: 1, status: 'published',
  title: 'Entry', description: null,
  settings: { allowDrafts: true, showProgressBar: true, confirmationMessage: null },
  sections: [{
    id: 'sec', title: 'S', description: null, order: 1, visibleWhen: null,
    fields: [
      field({ key: 'title', label: 'Title', piiLevel: 'none' }),
      field({ key: 'phone', label: 'Phone', piiLevel: 'high' }),
      field({ key: 'city', label: 'City', piiLevel: 'low' }),
      field({ key: 'tags', label: 'Tags', type: 'multiSelect', piiLevel: 'none' }),
    ],
  }],
};

const registration = (over: Partial<RegistrationRow> = {}): RegistrationRow => ({
  id: 'r1', name: 'Ada Lovelace', email: 'ada@example.com', status: 'active',
  registeredAt: '2026-07-01', checkedIn: true,
  answers: { title: 'Monsoon', phone: '+91 99999 11111', city: 'Vadodara', tags: ['a', 'b'] },
  ...over,
});

/* ------------------------------------------------------------------ */
/* CSV injection — the security case                                   */
/* ------------------------------------------------------------------ */

describe('escapeCell — formula injection', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['=HYPERLINK("http://evil.test","click")', '"\'=HYPERLINK(""http://evil.test"",""click"")"'],
  ])('neutralises %s', (input, expected) => {
    expect(escapeCell(input)).toBe(expected);
  });

  it('neutralises a DDE payload', () => {
    // The classic Excel command-execution vector.
    expect(escapeCell('=cmd|\'/c calc\'!A0')).toMatch(/^'/);
  });

  it('neutralises a leading tab, which Excel also treats as a formula lead-in', () => {
    expect(escapeCell('\t=1+1')).toMatch(/^"?'/);
  });

  it('leaves ordinary text alone', () => {
    expect(escapeCell('Monsoon Photo')).toBe('Monsoon Photo');
    expect(escapeCell('a-b')).toBe('a-b'); // hyphen mid-string is not a formula
  });

  it('does not strip the value, only marks it as text', () => {
    expect(escapeCell('=1+1')).toContain('=1+1');
  });
});

describe('escapeCell — RFC 4180', () => {
  it('quotes a value containing a comma', () => {
    expect(escapeCell('Vadodara, Gujarat')).toBe('"Vadodara, Gujarat"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('quotes a value containing a newline', () => {
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('renders null and undefined as empty, not as the strings', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
    expect(escapeCell('')).toBe('');
  });

  it('stringifies numbers and booleans', () => {
    expect(escapeCell(42)).toBe('42');
    expect(escapeCell(0)).toBe('0');
    expect(escapeCell(false)).toBe('false');
  });
});

describe('toCsv', () => {
  it('joins with CRLF, which is what Excel expects', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });

  it('handles an empty set', () => {
    expect(toCsv([])).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* PII redaction                                                       */
/* ------------------------------------------------------------------ */

describe('registrationsToCsv — PII', () => {
  it('redacts by default, including the email column', () => {
    const csv = registrationsToCsv([registration()], schema);
    expect(csv).not.toContain('ada@example.com');
    expect(csv).not.toContain('+91 99999 11111');
    expect(csv).toContain(REDACTED);
  });

  it('redacts low as well as high — over-redacting is the safe direction', () => {
    const csv = registrationsToCsv([registration()], schema);
    expect(csv).not.toContain('Vadodara');
  });

  it('keeps non-PII answers', () => {
    expect(registrationsToCsv([registration()], schema)).toContain('Monsoon');
  });

  it('includes everything when PII is explicitly requested', () => {
    const csv = registrationsToCsv([registration()], schema, 'include');
    expect(csv).toContain('ada@example.com');
    expect(csv).toContain('+91 99999 11111');
    expect(csv).toContain('Vadodara');
    expect(csv).not.toContain(REDACTED);
  });

  it('marks redacted columns in the header, so the file is self-explaining', () => {
    const header = registrationsToCsv([registration()], schema).split('\r\n')[0];
    expect(header).toContain('Phone (redacted)');
    expect(header).toContain('Title');
    expect(header).not.toContain('Title (redacted)');
  });

  it('leaves a blank PII answer blank rather than writing [redacted]', () => {
    // Otherwise "[redacted]" implies data exists where none does.
    const csv = registrationsToCsv(
      [registration({ answers: { title: 'x', phone: '', city: '', tags: [] } })],
      schema,
    );
    const row = csv.split('\r\n')[1];
    expect(row.split(',').filter((cell) => cell === REDACTED)).toHaveLength(1); // email only
  });

  it('serializes arrays through the field registry', () => {
    expect(registrationsToCsv([registration()], schema, 'include')).toContain('a; b');
  });

  it('always neutralises injection, even with PII included', () => {
    const csv = registrationsToCsv(
      [registration({ name: '=cmd|calc', answers: { title: '=1+1' } })],
      schema,
      'include',
    );
    expect(csv).toContain("'=cmd|calc");
    expect(csv).toContain("'=1+1");
  });

  it('works with no schema at all', () => {
    const csv = registrationsToCsv([registration()], undefined);
    expect(csv.split('\r\n')).toHaveLength(2);
  });

  it('emits a header even with no rows', () => {
    expect(registrationsToCsv([], schema).split('\r\n')).toHaveLength(1);
  });
});

describe('columnsFor', () => {
  it('returns one column per field, in order, carrying piiLevel', () => {
    expect(columnsFor(schema).map((c) => c.key)).toEqual(['title', 'phone', 'city', 'tags']);
    expect(columnsFor(schema)[1].piiLevel).toBe('high');
  });
});

/* ------------------------------------------------------------------ */
/* Blind judging                                                       */
/* ------------------------------------------------------------------ */

const submission = (over: Partial<SubmissionRow> = {}): SubmissionRow => ({
  id: 's1', participant: 'Ada Lovelace', anonymizedLabel: 'Entry 4F2A',
  stageKey: 'submission', status: 'reviewed', submittedAt: '2026-07-10',
  isLate: false, fileCount: 2, reviewsDone: 3, reviewsTotal: 3,
  score: 87.5, isProvisional: false, ...over,
});

describe('submissionsToCsv', () => {
  it('names the participant when not blind', () => {
    const csv = submissionsToCsv([submission()]);
    expect(csv).toContain('Ada Lovelace');
    expect(csv.split('\r\n')[0]).toContain('Participant');
  });

  it('withholds the name in blind mode — exporting would defeat the mechanism', () => {
    const csv = submissionsToCsv([submission()], true);
    expect(csv).not.toContain('Ada Lovelace');
    expect(csv).toContain('Entry 4F2A');
    expect(csv.split('\r\n')[0]).toContain('Entry');
  });

  it('exports an unscored submission as empty, never 0', () => {
    const csv = submissionsToCsv([submission({ score: null, isProvisional: true })]);
    const cells = csv.split('\r\n')[1].split(',');
    expect(cells).not.toContain('0');
    expect(cells).toContain('');
  });

  it('exports a genuine zero as 0.0, which is a real score', () => {
    expect(submissionsToCsv([submission({ score: 0 })]).split('\r\n')[1]).toContain('0.0');
  });

  it('flags lateness readably', () => {
    expect(submissionsToCsv([submission({ isLate: true })])).toContain('yes');
  });
});

describe('scoresToCsv', () => {
  const row = { submissionId: 's1', participant: 'Ada', criterionName: 'Craft', score: 8, max: 10, weight: 50 };

  it('emits one row per criterion', () => {
    expect(scoresToCsv([row, { ...row, criterionName: 'Story' }]).split('\r\n')).toHaveLength(3);
  });

  it('withholds the name in blind mode', () => {
    expect(scoresToCsv([row], true)).not.toContain('Ada');
  });
});

describe('exportFilename', () => {
  it('is filesystem-safe and sorts chronologically', () => {
    expect(exportFilename('monsoon-photography', 'registrations', '2026-07-29'))
      .toBe('monsoon-photography-registrations-2026-07-29.csv');
  });

  it('strips characters a filesystem would reject', () => {
    expect(exportFilename('a/b\\c:d', 'x', '2026-01-01')).toBe('a-b-c-d-x-2026-01-01.csv');
  });
});

/**
 * CSV export. PURE — no DOM, no I/O, no clock.
 * ROADMAP Phase 2: "CSV export — registrations, submissions, scores,
 * PII-redacted by `piiLevel`".
 *
 * Two things here are load-bearing and easy to get wrong.
 *
 * **1. Injection.** A cell beginning `=`, `+`, `-` or `@` is executed as a
 * formula by Excel, Sheets and LibreOffice when the file is opened. An exported
 * registrant list is untrusted input — anyone who can type into a form field
 * can put `=HYPERLINK(...)` or a `cmd|'/c calc'!A0` DDE payload in it. This is
 * a real, routinely-exploited class of bug, so every cell is neutralised.
 *
 * **2. PII.** `FormField.piiLevel` already exists on every field. Honouring it
 * is the difference between "export" and "leak": a judge exporting scores has
 * no business receiving phone numbers, and the person clicking Export rarely
 * thinks about that in the moment. So redaction is the default and including
 * PII is the explicit choice.
 */
import type { FormField, FormSchema } from '@core/forms/types';
import { getFieldType } from '@core/forms/registry';

/** Characters a spreadsheet treats as the start of a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Escapes one value for CSV.
 *
 * Formula-triggering cells are prefixed with a single quote — the convention
 * every major spreadsheet understands as "this is text" — rather than stripped,
 * because silently altering someone's answer would be its own bug.
 */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text = typeof value === 'string' ? value : String(value);

  if (FORMULA_PREFIX.test(text)) text = `'${text}`;

  // RFC 4180: quote when the value contains a delimiter, quote or newline, and
  // double any embedded quotes.
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;

  return text;
}

export function toCsv(rows: unknown[][]): string {
  // CRLF per RFC 4180 — Excel on Windows is the overwhelmingly common consumer.
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

export type PiiMode = 'redact' | 'include';

/** Placeholder shown in place of a redacted value, so a blank means "no answer". */
export const REDACTED = '[redacted]';

export interface ExportColumn {
  key: string;
  label: string;
  piiLevel: FormField['piiLevel'];
}

/**
 * Columns for a schema's answers, in section then field order.
 *
 * File-based fields export their filename rather than the `FileRef` object —
 * `toExportValue` on the registry owns that, so a new field type gets sensible
 * export behaviour without touching this file.
 */
export function columnsFor(schema: FormSchema): ExportColumn[] {
  return schema.sections
    .flatMap((s) => s.fields)
    .map((f) => ({ key: f.key, label: f.label || f.key, piiLevel: f.piiLevel }));
}

function redact(value: unknown, level: FormField['piiLevel'], mode: PiiMode): unknown {
  if (mode === 'include' || level === 'none') return value;
  // Both 'low' and 'high' are withheld by default. A finer policy needs a real
  // reason; until then, over-redacting is the safe direction to be wrong in.
  return value === null || value === undefined || value === '' ? '' : REDACTED;
}

export interface RegistrationRow {
  id: string;
  name: string;
  email: string;
  status: string;
  registeredAt: string;
  checkedIn: boolean;
  answers: Record<string, unknown>;
}

/**
 * Registrations → CSV.
 *
 * `email` is PII by definition and is redacted unless PII is explicitly
 * included, even though it is not a form field — it is the single most
 * sensitive column in the file.
 */
export function registrationsToCsv(
  registrations: RegistrationRow[],
  schema: FormSchema | undefined,
  mode: PiiMode = 'redact',
): string {
  const columns = schema ? columnsFor(schema) : [];
  const fieldTypes = new Map(
    (schema?.sections.flatMap((s) => s.fields) ?? []).map((f) => [f.key, f.type]),
  );

  const header = [
    'Registration ID', 'Name', 'Email', 'Status', 'Registered', 'Checked in',
    ...columns.map((c) => (mode === 'redact' && c.piiLevel !== 'none' ? `${c.label} (redacted)` : c.label)),
  ];

  const rows = registrations.map((r) => [
    r.id,
    r.name,
    mode === 'include' ? r.email : REDACTED,
    r.status,
    r.registeredAt,
    r.checkedIn ? 'yes' : 'no',
    ...columns.map((col) => {
      const raw = r.answers[col.key];
      const type = fieldTypes.get(col.key);
      // Serialize through the registry so arrays and FileRefs export sensibly.
      const serialized = type ? getFieldType(type).toExportValue(raw) : raw;
      return redact(serialized, col.piiLevel, mode);
    }),
  ]);

  return toCsv([header, ...rows]);
}

export interface SubmissionRow {
  id: string;
  participant: string;
  anonymizedLabel: string;
  stageKey: string;
  status: string;
  submittedAt: string;
  isLate: boolean;
  fileCount: number;
  reviewsDone: number;
  reviewsTotal: number;
  score: number | null;
  isProvisional: boolean;
}

/**
 * Submissions → CSV.
 *
 * `blind` swaps the participant's name for their anonymized label. Exporting a
 * blind-judged challenge with names attached would defeat the whole mechanism
 * in one click, so the caller has to pass the challenge's blind setting rather
 * than this defaulting to the convenient thing.
 *
 * An unscored submission exports as empty, never `0` — the same rule the
 * scoring engine and every screen follow (SPEC_SCORING §8).
 */
export function submissionsToCsv(submissions: SubmissionRow[], blind = false): string {
  const header = [
    blind ? 'Entry' : 'Participant',
    'Stage', 'Status', 'Submitted', 'Late', 'Files',
    'Reviews done', 'Reviews expected', 'Score', 'Provisional',
  ];

  const rows = submissions.map((s) => [
    blind ? s.anonymizedLabel : s.participant,
    s.stageKey,
    s.status,
    s.submittedAt,
    s.isLate ? 'yes' : 'no',
    s.fileCount,
    s.reviewsDone,
    s.reviewsTotal,
    s.score === null ? '' : s.score.toFixed(1),
    s.isProvisional ? 'yes' : 'no',
  ]);

  return toCsv([header, ...rows]);
}

export interface ScoreRow {
  submissionId: string;
  participant: string;
  criterionName: string;
  score: number;
  max: number;
  weight: number;
}

/** Scores → CSV, one row per criterion per submission. */
export function scoresToCsv(scores: ScoreRow[], blind = false): string {
  const header = [blind ? 'Entry' : 'Participant', 'Criterion', 'Score', 'Out of', 'Weight %'];
  const rows = scores.map((s) => [
    blind ? s.submissionId : s.participant,
    s.criterionName,
    s.score,
    s.max,
    s.weight,
  ]);
  return toCsv([header, ...rows]);
}

/**
 * A filename that sorts chronologically and survives every filesystem.
 * `date` is passed in rather than read from the clock — this module is pure.
 */
export function exportFilename(challengeSlug: string, kind: string, date: string): string {
  const safe = challengeSlug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `${safe}-${kind}-${date}.csv`;
}

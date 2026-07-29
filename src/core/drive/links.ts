/**
 * Google Drive link handling. PURE — no network, no SDK, no React.
 *
 * ADR-017. We store references, not bytes (CLAUDE.md hard rule 5), and on the
 * Spark plan there is no Cloud Function to mint a resumable upload session. So
 * the integration is link-first: a person shares a Drive file and pastes the
 * link, and we derive a `FileRef` from it.
 *
 * That sounds lossy, but it is actually the *stronger* position for this
 * product:
 *
 *   • The file never leaves the owner's Drive, so we inherit their quota,
 *     their retention and their access control instead of underwriting it.
 *   • There is no upload to fail at a submission deadline — the slowest,
 *     most failure-prone moment in a challenge.
 *   • It costs nothing to run and needs no OAuth consent screen.
 *
 * What it cannot do is verify the file exists or that the link is shared; only
 * an authenticated Drive API call can. So `analyzeDriveLink` is explicit about
 * what it knows versus what it is guessing, and the UI shows the difference
 * rather than implying a check it never made.
 */
import type { FileRef } from '@core/forms/types';

export type DriveKind = 'file' | 'document' | 'spreadsheet' | 'presentation' | 'form' | 'folder';

export interface DriveTarget {
  fileId: string;
  kind: DriveKind;
}

/**
 * A Drive file id: base64url-ish, and in practice 25+ characters. The length
 * floor is what stops `.../d/edit` and similar path fragments being mistaken
 * for an id — a wrong id renders a broken image rather than an error, so a
 * false positive here is worse than a false negative.
 */
const FILE_ID = '[A-Za-z0-9_-]{10,}';

const PATTERNS: Array<{ re: RegExp; kind: DriveKind }> = [
  // https://docs.google.com/{document|spreadsheets|presentation|forms}/d/ID/edit
  { re: new RegExp(`docs\\.google\\.com/document/d/(${FILE_ID})`), kind: 'document' },
  { re: new RegExp(`docs\\.google\\.com/spreadsheets/d/(${FILE_ID})`), kind: 'spreadsheet' },
  { re: new RegExp(`docs\\.google\\.com/presentation/d/(${FILE_ID})`), kind: 'presentation' },
  { re: new RegExp(`docs\\.google\\.com/forms/d/(?:e/)?(${FILE_ID})`), kind: 'form' },
  // https://drive.google.com/drive/folders/ID
  { re: new RegExp(`drive\\.google\\.com/drive/(?:u/\\d+/)?folders/(${FILE_ID})`), kind: 'folder' },
  // https://drive.google.com/file/d/ID/view
  { re: new RegExp(`drive\\.google\\.com/file/d/(${FILE_ID})`), kind: 'file' },
  // https://drive.google.com/open?id=ID  ·  /uc?id=ID  ·  /thumbnail?id=ID
  { re: new RegExp(`drive\\.google\\.com/(?:open|uc|thumbnail)\\?(?:[^#]*&)?id=(${FILE_ID})`), kind: 'file' },
  // https://drive.google.com/d/ID  (short form some share sheets emit)
  { re: new RegExp(`drive\\.google\\.com/d/(${FILE_ID})`), kind: 'file' },
];

/**
 * Extracts the file id and kind from any Drive or Docs URL shape Google emits.
 * Returns null for anything that is not recognisably Drive — including a bare
 * id, which is deliberately not accepted: a 30-character string is not
 * self-evidently a Drive id, and guessing produces a broken embed.
 */
export function parseDriveLink(input: string): DriveTarget | null {
  const url = input.trim();
  if (!url) return null;
  for (const { re, kind } of PATTERNS) {
    const match = re.exec(url);
    if (match?.[1]) return { fileId: match[1], kind };
  }
  return null;
}

export const isDriveLink = (input: string): boolean => parseDriveLink(input) !== null;

/**
 * A direct image URL for a Drive file, served by Google's own CDN.
 *
 * `thumbnail` rather than `uc?export=view`: the `uc` endpoint returns an
 * interstitial HTML page for larger files and is aggressively rate-limited,
 * which shows up as images that load in development and fail under real
 * traffic. `thumbnail` serves a resized image directly and is what Drive's own
 * UI uses. `sz=w{n}` picks the width; Google renders up to about 1600px.
 *
 * Requires the file to be shared as "Anyone with the link". Nothing here can
 * check that — see `analyzeDriveLink`.
 */
export function driveImageUrl(fileId: string, width = 1600): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${Math.round(width)}`;
}

/** An embeddable preview for any Drive type, for an `<iframe>`. */
export function drivePreviewUrl(target: DriveTarget): string {
  const { fileId, kind } = target;
  if (kind === 'folder') return `https://drive.google.com/embeddedfolderview?id=${fileId}#grid`;
  if (kind === 'document') return `https://docs.google.com/document/d/${fileId}/preview`;
  if (kind === 'spreadsheet') return `https://docs.google.com/spreadsheets/d/${fileId}/preview`;
  if (kind === 'presentation') return `https://docs.google.com/presentation/d/${fileId}/preview`;
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/** The canonical human-facing link, for "open in Drive". */
export function driveOpenUrl(target: DriveTarget): string {
  const { fileId, kind } = target;
  switch (kind) {
    case 'folder': return `https://drive.google.com/drive/folders/${fileId}`;
    case 'document': return `https://docs.google.com/document/d/${fileId}/edit`;
    case 'spreadsheet': return `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
    case 'presentation': return `https://docs.google.com/presentation/d/${fileId}/edit`;
    case 'form': return `https://docs.google.com/forms/d/${fileId}/viewform`;
    default: return `https://drive.google.com/file/d/${fileId}/view`;
  }
}

const KIND_MIME: Record<DriveKind, string> = {
  file: 'application/octet-stream',
  document: 'application/vnd.google-apps.document',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  presentation: 'application/vnd.google-apps.presentation',
  form: 'application/vnd.google-apps.form',
  folder: 'application/vnd.google-apps.folder',
};

export const KIND_LABEL: Record<DriveKind, string> = {
  file: 'Drive file',
  document: 'Google Doc',
  spreadsheet: 'Google Sheet',
  presentation: 'Google Slides',
  form: 'Google Form',
  folder: 'Drive folder',
};

/** Material Symbols name per kind, so the UI never switches on kind itself. */
export const KIND_ICON: Record<DriveKind, string> = {
  file: 'draft',
  document: 'description',
  spreadsheet: 'table',
  presentation: 'slideshow',
  form: 'assignment',
  folder: 'folder',
};

export type DriveProblem =
  | 'notADriveLink'
  | 'isFolder'
  | 'isForm'
  | 'restrictedLinkShape'
  | 'notAnImage';

export interface DriveAnalysis {
  target: DriveTarget | null;
  /** Blocking problems: the link cannot be used for this purpose. */
  errors: DriveProblem[];
  /** Non-blocking: usable, but likely to disappoint. */
  warnings: DriveProblem[];
  ok: boolean;
}

/**
 * Judges a pasted link for a given purpose.
 *
 * `purpose: 'image'` is stricter than `'attachment'` — a folder or a Google Doc
 * has no thumbnail worth showing as an event cover, whereas either is a
 * perfectly reasonable thing to attach to a submission.
 *
 * The `restrictedLinkShape` warning is the one that matters in practice. A URL
 * containing `/u/0/` or `usp=drive_web` came from someone's own Drive session
 * and very often is not link-shared; the organiser sees their own cover image
 * fine and every participant sees a broken one. We cannot prove it, so it is a
 * warning with an explanation rather than a refusal.
 */
export function analyzeDriveLink(input: string, purpose: 'image' | 'attachment' = 'attachment'): DriveAnalysis {
  const target = parseDriveLink(input);
  const errors: DriveProblem[] = [];
  const warnings: DriveProblem[] = [];

  if (!target) {
    return { target: null, errors: ['notADriveLink'], warnings: [], ok: false };
  }

  if (purpose === 'image') {
    if (target.kind === 'folder') errors.push('isFolder');
    else if (target.kind === 'form') errors.push('isForm');
    else if (target.kind !== 'file') warnings.push('notAnImage');
  }

  if (/\/u\/\d+\/|usp=drive_web/.test(input)) warnings.push('restrictedLinkShape');

  return { target, errors, warnings, ok: errors.length === 0 };
}

export const DRIVE_PROBLEM_MESSAGE: Record<DriveProblem, string> = {
  notADriveLink:
    'That does not look like a Google Drive link. Open the file in Drive, choose Share → Copy link, and paste it here.',
  isFolder:
    'That is a folder, not an image. Open the folder, click the image you want, then copy that link.',
  isForm:
    'That is a Google Form, which has no image to show.',
  restrictedLinkShape:
    'This link came from your own Drive session, so it may only work for you. In Drive choose Share → General access → “Anyone with the link”, then copy the link again.',
  notAnImage:
    'Google Docs, Sheets and Slides do not render as a cover image. Use a photo or an image file instead.',
};

/**
 * Builds the `FileRef` we persist. Size is 0 and mime is a guess from the link
 * shape — both are unknowable without an authenticated Drive call, and a
 * confident wrong number would be worse than an honest zero.
 */
export function driveFileRef(
  target: DriveTarget,
  meta: { name: string; uploadedBy: string; uploadedAt?: string; mimeType?: string; sizeBytes?: number },
): FileRef {
  return {
    provider: 'googleDrive',
    fileId: target.fileId,
    url: driveOpenUrl(target),
    name: meta.name,
    mimeType: meta.mimeType ?? KIND_MIME[target.kind],
    sizeBytes: meta.sizeBytes ?? 0,
    uploadedAt: meta.uploadedAt ?? new Date().toISOString(),
    uploadedBy: meta.uploadedBy,
  };
}

/**
 * Resolves any cover value to something an `<img src>` can use.
 *
 * A challenge cover is deliberately permissive — a Drive link, a plain image
 * URL, or empty for the category gradient. One field, three behaviours, no
 * migration when an organiser changes their mind. Returns null when there is no
 * image and the caller should fall back to the category colour.
 */
export function resolveCoverUrl(cover: string | null | undefined, width = 1600): string | null {
  if (!cover) return null;
  const value = cover.trim();
  if (!value) return null;

  const target = parseDriveLink(value);
  if (target) return driveImageUrl(target.fileId, width);

  // A bare colour token or category name is not a URL; those render as the
  // gradient, which is what `null` signals.
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

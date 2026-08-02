import { z } from 'zod';

/**
 * The storage seam — AGENT.md hard rule 4.
 *
 * Application code sees `StorageProvider` and `FileRef` and nothing else. No
 * provider SDK, no `fetch` to a vendor, no bucket name may appear outside
 * `core/storage/providers/`. The rule existed before there was anything behind
 * it: ADR-017 chose link-first storage, so for two phases the "provider" was a
 * person pasting a URL. This is the first real one.
 *
 * ## Why uploads are three calls and not one
 *
 * `begin` → the browser PUTs the bytes → `complete`.
 *
 * The middle step deliberately does not pass through us. A photograph is
 * routinely 10–40 MB and a serverless request body is capped well below that
 * (Vercel Hobby: ~4.5 MB), so relaying bytes would fail on exactly the files
 * this feature exists for. Instead the server mints a **resumable upload
 * session** — a short-lived, single-use URL scoped to one file in one folder —
 * and the browser uploads straight to Google.
 *
 * That is also the safer shape: the credential that can write to the
 * organization's Drive never leaves the server, and what the client receives
 * cannot be replayed to write anywhere else.
 */

/**
 * What we persist about a stored file. Deliberately small: a reference, never
 * bytes (hard rule 5). Unchanged from the shape `core/forms` already validates,
 * so an upload and a pasted Drive link produce the same thing.
 */
export const fileRefSchema = z.object({
  fileId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export type StoredFileRef = z.infer<typeof fileRefSchema>;

/** What the caller must say about a file before a session is minted. */
export const uploadRequestSchema = z.object({
  orgId: z.string().min(1),
  challengeId: z.string().min(1),
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

/** The server's answer: where to PUT the bytes, and what it will be called. */
export const uploadSessionSchema = z.object({
  /** Google's resumable session URL. Short-lived, single-use, folder-scoped. */
  uploadUrl: z.string().url(),
  /** Echoed back so `complete` cannot be pointed at a different file. */
  name: z.string(),
});

export type UploadSession = z.infer<typeof uploadSessionSchema>;

/**
 * Everything a caller may know about an upload in flight.
 *
 * `progress` is a fraction, not a percentage, because a percentage invites
 * rounding decisions in three different components.
 */
export interface UploadProgress {
  loaded: number;
  total: number;
  /** 0–1. `total` is known up front for a file, so this is never a guess. */
  fraction: number;
}

export interface UploadOptions {
  orgId: string;
  challengeId: string;
  /** Firebase ID token. The server verifies it; the client never trusts itself. */
  idToken: string;
  onProgress?: (progress: UploadProgress) => void;
  /** Aborts the transfer. A resumable session simply expires unused. */
  signal?: AbortSignal;
}

/**
 * The one interface application code is allowed to see.
 *
 * `upload` resolves to the `FileRef` that gets stored in the answer. It rejects
 * with `UploadError` — never with a raw provider error, which would leak the
 * vendor into a `catch` somewhere and quietly break the rule this file exists
 * to keep.
 */
export interface StorageProvider {
  /** Stable id for logs and for choosing a provider from configuration. */
  readonly id: 'googleDrive';
  /** Shown in the UI: "goes to the organiser's Google Drive". */
  readonly label: string;
  upload(file: File, options: UploadOptions): Promise<StoredFileRef>;
}

/** Why an upload failed, in terms a screen can act on. */
export type UploadFailure =
  | 'notConfigured'
  | 'notSignedIn'
  | 'tooLarge'
  | 'unsupportedType'
  | 'network'
  | 'quotaExceeded'
  | 'rejected'
  | 'unknown';

export class UploadError extends Error {
  constructor(readonly failure: UploadFailure, message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * The message a person sees. Kept beside the code rather than in the component
 * so the same failure reads the same way wherever it surfaces.
 */
export const UPLOAD_FAILURE_MESSAGE: Record<UploadFailure, string> = {
  notConfigured:
    'Uploads are not set up for this organization yet. An organiser needs to connect a Google Drive folder first.',
  notSignedIn: 'Sign in before uploading — an upload is recorded against your account.',
  tooLarge: 'That file is too large for this challenge.',
  unsupportedType: 'That file type is not accepted here.',
  network: 'The upload was interrupted. Check your connection and try again.',
  quotaExceeded:
    'The organiser’s Google Drive is full, so the upload could not be stored. Nothing you did is wrong — tell them.',
  rejected: 'Google refused the upload. Try again, and tell an organiser if it keeps happening.',
  unknown: 'The upload failed. Try again.',
};

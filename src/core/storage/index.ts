import { googleDriveProvider } from './providers/googleDrive';
import type { StorageProvider } from './types';

/**
 * Storage, chosen by configuration rather than by an import.
 *
 * One provider exists today. The indirection is not speculation — hard rule 4
 * says application code sees the interface, and a component that imports
 * `googleDriveProvider` by name is a component that has to be edited when a
 * customer wants their own bucket. Adding a second provider is a file in
 * `providers/` and a branch here; nothing else in the app changes.
 */
export function storageProvider(): StorageProvider {
  return googleDriveProvider;
}

export {
  UploadError, UPLOAD_FAILURE_MESSAGE, fileRefSchema,
  type StorageProvider, type StoredFileRef, type UploadOptions,
  type UploadProgress, type UploadFailure,
} from './types';

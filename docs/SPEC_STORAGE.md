# SPEC_STORAGE.md — Pluggable Storage

**The cost invariant:** files live in the *customer's* storage quota. We persist
metadata. Our marginal storage cost per organization stays near zero.

Lives in `src/core/storage`. **Provider SDKs may be imported nowhere else.**

---

## 1. The interface

```ts
type StorageProviderId = 'googleDrive' | 'firebase' | 's3' | 'r2';

interface StorageProvider {
  readonly id: StorageProviderId;
  readonly displayName: string;
  readonly capabilities: {
    resumableUpload: boolean;
    signedUrls: boolean;
    directBrowserUpload: boolean;
    serverSideCopy: boolean;
    maxFileSizeBytes: number;
  };

  /** Ensure the folder/prefix exists. Idempotent. */
  ensureContainer(input: ContainerRequest): Promise<ContainerRef>;

  /** Server-side. Returns a short-lived URL the browser PUTs bytes to. */
  initUpload(input: UploadRequest): Promise<UploadTicket>;

  /** Finalize: verify size/type, apply sharing, return the durable reference. */
  completeUpload(ticket: UploadTicket, observed: ObservedUpload): Promise<FileRef>;

  getDownloadUrl(ref: FileRef, opts?: { expiresInSeconds?: number; disposition?: 'inline'|'attachment' }): Promise<string>;
  getMetadata(ref: FileRef): Promise<FileMetadata>;
  delete(ref: FileRef): Promise<void>;
  setAccess(ref: FileRef, access: AccessLevel): Promise<void>;
}

type AccessLevel = 'private' | 'orgReadable' | 'linkReadable' | 'public';

interface FileRef {
  provider: StorageProviderId;
  fileId: string;                  // provider-native id
  url: string;                     // canonical view/download url
  thumbnailUrl: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;         // md5/sha — used for duplicate detection later
  containerId: string | null;      // folder id / prefix
  uploadedAt: Timestamp;
  uploadedBy: string;              // userId
}
```

Application code sees `StorageProvider` and `FileRef`. Nothing else.
A component that knows the word "Drive" is a bug.

## 2. Registry

```ts
// core/storage/registry.ts
export function registerProvider(p: StorageProvider): void;
export function getProvider(id: StorageProviderId): StorageProvider;
export function getProviderForOrg(orgId: string): Promise<StorageProvider>;  // reads StorageSettings
```

Adding S3 later = one file in `core/storage/providers/s3/` + one registration.
Zero changes to forms, submissions, or UI.

## 3. Google Drive (MVP) — the upload flow

**Constraint:** a Drive OAuth token must never reach the browser. It would grant
the holder access to the org owner's entire Drive.

```
Browser                        Cloud Function                    Google Drive
   │                                 │                                │
   │ 1. initUpload(fileMeta) ───────▶│                                │
   │                                 │ 2. verify: member? perm?       │
   │                                 │    stage open? size/type ok?   │
   │                                 │ 3. load org refresh token      │
   │                                 │    (Secret Manager, by orgId)  │
   │                                 │ 4. POST /upload?uploadType=    │
   │                                 │    resumable ─────────────────▶│
   │                                 │◀──── 5. session URI ───────────│
   │◀── 6. { sessionUri, ticketId } ─│                                │
   │                                 │                                │
   │ 7. PUT bytes (chunked, resumable) ─────────────────────────────▶ │
   │◀────────────────────────── 8. { fileId, size, md5 } ─────────────│
   │                                 │                                │
   │ 9. completeUpload(ticket,       │                                │
   │    observed) ──────────────────▶│ 10. verify size/md5 match      │
   │                                 │     ticket claim; set sharing  │
   │◀────── 11. FileRef ─────────────│                                │
```

**Why this shape:**
* Bytes go browser → Drive directly. Never through our Functions (no egress cost,
  no 32 MB Function payload limit, no timeout on large videos).
* The session URI is short-lived and scoped to one file. Leaking it exposes one
  upload slot, not an account.
* Step 10 is the security-critical step: the client reports what it uploaded, and
  the Function verifies the actual Drive metadata matches the ticket's declared
  limits. **Never trust `observed` without re-reading Drive metadata.** A client
  that lies about size or type gets its file deleted and the upload rejected.

### Folder layout in the customer's Drive

```
ChallengeOS/
└── {Organization Name}/
    └── {Challenge Title} [{challengeId-short}]/
        ├── registrations/
        └── {stageKey}/
            └── {registrationId}/
                └── {fieldKey}__{originalName}
```

`ensureContainer` walks and creates this lazily, memoizing folder ids in
`challenge.storage.containerIds` to avoid repeated Drive list calls.

### Sharing model

| Who | Access |
|---|---|
| Org's connected Drive account | Owner |
| Judges (during judging) | `linkReadable` via the app's proxy URL |
| Participant | Reader on their own files |
| Public | Only if the challenge explicitly publishes the artifact |

Blind judging: the app never renders the Drive `name` field to judges; it renders
`submission.anonymizedLabel`. Filenames leak identity — this is a real leak
vector, and the reason `Display` components receive the field, not the raw ref.

### Quota and rate limits

| Limit | Value | Mitigation |
|---|---|---|
| Drive API queries | 12 000 / min / project | Batch metadata reads; memoize container ids |
| Per-user rate | 1 000 / 100 s | Exponential backoff + jitter, client-side queue |
| Upload size | 5 TB | Practical cap set per field via `maxFileSizeMB` |
| Storage | The org's own quota | Surface remaining quota in org settings |

Deadline peaks are the failure mode: 400 people uploading in the last ten
minutes. The client queue serializes uploads per user with backoff, and the UI
shows queued state rather than failing.

## 4. Token custody

* Org owner connects Drive via OAuth consent (`storage.connect` permission).
* The **refresh token** is written to Secret Manager under `orgs/{orgId}/drive`
  by the callback Function. It never enters Firestore, never enters the client,
  never appears in logs.
* `StorageSettings` records only `connected`, `connectedAccountEmail`,
  `rootFolderId`.
* Disconnect revokes the token upstream and deletes the secret. Existing
  `FileRef`s survive as dead links — the UI must render a "storage disconnected"
  state rather than a broken image.

## 5. Lifecycle and cleanup

| Event | Behaviour |
|---|---|
| Draft submission abandoned > 30 days | Orphan sweep deletes uploaded files |
| Submission deleted | Files deleted (soft: Drive trash, 30-day recovery) |
| Challenge archived | Files retained; access downgraded to `private` |
| Organization deleted | Files retained in the customer's Drive — **we never delete customer data on tenant deletion.** We only drop references. |

Orphan sweep is a weekly scheduled Function that diffs `FileRef`s reachable from
live documents against files under the container tree.

## 6. Failure handling

| Failure | Client behaviour |
|---|---|
| `initUpload` denied (permission/window) | Inline field error, no retry |
| Session URI expired mid-upload | Re-init and resume from byte offset |
| Network drop | Resumable PUT resumes automatically (Workbox background sync) |
| `completeUpload` mismatch | File deleted from Drive, field error shown |
| Provider outage | Submission saved as draft with `files: pending[]`; queued |

## 7. Other providers (later, no core changes)

| Provider | `initUpload` returns | Notes |
|---|---|---|
| Firebase Storage | Signed resumable URL | Simplest; our quota — for the paid tier |
| AWS S3 | Presigned POST / multipart | Enterprise BYO-bucket |
| Cloudflare R2 | Presigned PUT | Zero egress — best for public artifact-heavy orgs |

## 8. Testing requirements

* `StorageProvider` contract test suite runs against **every** registered
  provider, including an in-memory fake used by all other tests.
* `completeUpload` rejects a size/mime mismatch (the security test).
* Container creation is idempotent under concurrent calls.
* No file in `src/` outside `core/storage/providers/` imports `googleapis`,
  `@aws-sdk/*`, or `firebase/storage` — enforced by an ESLint `no-restricted-imports`
  rule, not by convention.

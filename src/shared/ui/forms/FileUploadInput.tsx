import { useRef, useState } from 'react';
import { Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { c as t, radius, ease } from '@shared/design/tokens';
import { storageProvider, UploadError, UPLOAD_FAILURE_MESSAGE } from '@core/storage';
import type { FileRef } from '@core/forms/types';
import { useUploadContext } from './UploadContext';

/**
 * Choose a file, watch it upload, see it listed. The real one.
 *
 * What it replaces fabricated a `FileRef` on click — a placeholder from the
 * phase when ADR-017 had chosen link-first storage and no upload path existed.
 * It looked like it worked, which made it the most dangerous kind of stub: a
 * form could report an entry received while storing a photograph that was never
 * anywhere.
 *
 * ## The three states worth designing
 *
 * **Uploading** shows real byte progress, because a 30 MB photograph over a
 * phone connection takes long enough that a spinner is indistinguishable from a
 * hang. **Failed** keeps the file selected and offers Retry — the common causes
 * (a dropped connection, a full Drive) are transient or someone else's to fix,
 * and making the entrant find the file again punishes them for neither.
 * **Done** shows a thumbnail, because on a photography competition the whole
 * question is "is that the right picture".
 */

const MB = 1024 * 1024;
const humanSize = (bytes: number) =>
  bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

interface Props {
  /** Current value: one ref, or the list for a multi-file field. */
  files: FileRef[];
  onChange: (files: FileRef[]) => void;
  /** `undefined` means no ceiling beyond what the server enforces. */
  maxFiles?: number;
  accept?: string;
  disabled?: boolean;
  error?: boolean;
}

export function FileUploadInput({
  files, onChange, maxFiles, accept = 'image/*', disabled = false, error = false,
}: Props) {
  const upload = useUploadContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ name: string; fraction: number } | null>(null);
  const [failure, setFailure] = useState<{ message: string; file: File } | null>(null);

  const full = maxFiles !== undefined && files.length >= maxFiles;

  /**
   * The form builder previews schemas with these same components. Uploading
   * from a preview would put junk in the organiser's Drive, so the control says
   * what it is instead of pretending.
   */
  if (!upload) {
    return (
      <Box sx={{ p: 2.5, borderRadius: `${radius.tile}px`, background: t.surfaceField, textAlign: 'center' }}>
        <Icon name="cloud_upload" size={26} color={t.inkFaint} />
        <Typography sx={{ fontSize: 13, color: t.inkFaint, mt: 0.75 }}>
          File upload — active on the live entry form, inert in this preview.
        </Typography>
      </Box>
    );
  }

  const send = async (file: File) => {
    setFailure(null);
    setBusy({ name: file.name, fraction: 0 });
    try {
      const idToken = await upload.getIdToken();
      if (!idToken) throw new UploadError('notSignedIn', UPLOAD_FAILURE_MESSAGE.notSignedIn);

      const stored = await storageProvider().upload(file, {
        orgId: upload.orgId,
        challengeId: upload.challengeId,
        idToken,
        onProgress: ({ fraction }) => setBusy({ name: file.name, fraction }),
      });

      // `FileRef` in `core/forms` carries provenance the storage layer does not
      // know about — who uploaded it and when. Filled in here, at the only
      // place that has both halves.
      onChange([...files, {
        provider: 'googleDrive',
        fileId: stored.fileId,
        url: `https://drive.google.com/file/d/${stored.fileId}/view`,
        name: stored.name,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'self',
      }]);
    } catch (err) {
      setFailure({
        message: err instanceof UploadError
          ? (err.message || UPLOAD_FAILURE_MESSAGE[err.failure])
          : UPLOAD_FAILURE_MESSAGE.unknown,
        file,
      });
    } finally {
      setBusy(null);
      // Clearing the input is what makes re-choosing the *same* file fire a
      // change event again — without it, a retry after a failure silently does
      // nothing.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void send(file);
        }}
      />

      <Stack spacing={1}>
        {files.map((file, index) => (
          <UploadedRow
            key={file.fileId}
            file={file}
            disabled={disabled}
            onRemove={() => onChange(files.filter((_, i) => i !== index))}
          />
        ))}

        {busy && (
          <Box sx={{ p: 2, borderRadius: `${radius.tile}px`, background: t.surfaceField }}>
            <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 1 }}>
              <Icon name="cloud_upload" size={20} color={t.primaryIcon} />
              <Typography noWrap sx={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{busy.name}</Typography>
              <Typography sx={{ fontSize: 12, color: t.inkFaint }}>
                {Math.round(busy.fraction * 100)}%
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={busy.fraction * 100} sx={{ borderRadius: 2 }} />
          </Box>
        )}

        {failure && (
          <Stack
            direction="row"
            alignItems="center"
            gap={1.5}
            sx={{ p: 2, borderRadius: `${radius.tile}px`, background: t.errorContainer }}
          >
            <Icon name="error" size={20} color={t.errorInk} />
            <Typography sx={{ flex: 1, fontSize: 12.5, color: t.errorBody, lineHeight: 1.55 }}>
              {failure.message}
            </Typography>
            {/* The file is still in hand, so retry does not make them find it
                again for a failure that was probably not theirs. */}
            <Button size="small" onClick={() => void send(failure.file)} disabled={disabled}>
              Retry
            </Button>
          </Stack>
        )}

        {!full && !busy && (
          <Box
            onClick={() => !disabled && inputRef.current?.click()}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            sx={{
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.55 : 1,
              border: `2px dashed ${error ? t.errorInk : t.outlineStrong}`,
              borderRadius: `${radius.tile}px`,
              p: 3.5,
              textAlign: 'center',
              background: t.surfaceField,
              transition: `background 180ms ${ease}, border-color 180ms ${ease}`,
              '&:hover': disabled ? {} : { background: t.surfaceFieldHover },
            }}
          >
            <Icon name="cloud_upload" size={32} color={t.primaryIcon} />
            <Typography sx={{ fontSize: 15, fontWeight: 600, mt: 1.25, mb: 0.5 }}>
              {files.length > 0 ? 'Add another photo' : 'Choose a photo'}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: t.inkMuted }}>
              {maxFiles !== undefined
                ? `${files.length} of ${maxFiles} · goes to the organiser’s Google Drive`
                : 'Goes to the organiser’s Google Drive'}
            </Typography>
          </Box>
        )}

        {full && (
          <Typography sx={{ fontSize: 12, color: t.inkFaint, textAlign: 'center', pt: 0.5 }}>
            That is the limit of {maxFiles}. Remove one to add a different photo.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

/** One stored file: thumbnail, name, size, and a way to take it back. */
function UploadedRow({
  file, onRemove, disabled,
}: {
  file: FileRef;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const isImage = file.mimeType.startsWith('image/');
  const thumb = `https://drive.google.com/thumbnail?id=${file.fileId}&sz=w200`;

  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.5}
      sx={{ p: 1.5, borderRadius: `${radius.tile}px`, background: t.surfaceField }}
    >
      {isImage && !broken ? (
        <Box
          component="img"
          src={thumb}
          alt=""
          onError={() => setBroken(true)}
          sx={{ width: 48, height: 48, flex: 'none', objectFit: 'cover', borderRadius: `${radius.chip}px`, background: t.surfaceContainer }}
        />
      ) : (
        <Box sx={{ width: 48, height: 48, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: `${radius.chip}px`, background: t.surfaceContainer }}>
          <Icon name={isImage ? 'broken_image' : 'draft'} size={22} color={t.primaryIcon} />
        </Box>
      )}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{file.name}</Typography>
        <Typography sx={{ fontSize: 12, color: t.inkFaint }}>
          {humanSize(file.sizeBytes)} · uploaded
        </Typography>
      </Box>

      <Button
        size="small"
        variant="text"
        component="a"
        href={file.url}
        target="_blank"
        rel="noreferrer"
        sx={{ flex: 'none' }}
      >
        View
      </Button>
      <Button
        size="small"
        variant="text"
        color="error"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${file.name}`}
        sx={{ flex: 'none', minWidth: 0 }}
      >
        <Icon name="close" size={18} />
      </Button>
    </Stack>
  );
}

import { useMemo, useState } from 'react';
import { Box, Button, Stack, TextField, Typography, Link as MuiLink } from '@mui/material';
import { Icon } from './Icon';
import {
  analyzeDriveLink, driveImageUrl, driveOpenUrl, DRIVE_PROBLEM_MESSAGE,
  KIND_ICON, KIND_LABEL, type DriveAnalysis,
} from '@core/drive/links';
import { c, radius, ease } from '@shared/design/tokens';

/**
 * The one control for "point at something in Google Drive".
 *
 * Used for a challenge cover image and for participant file answers, which are
 * the same interaction with different strictness — so `purpose` switches the
 * rules rather than there being two components that drift apart.
 *
 * The design goal is that a person pasting the wrong thing finds out *here*,
 * with a sentence telling them what to do, rather than discovering it when
 * participants report a broken image. That is why the preview renders the real
 * Google URL rather than a mock: if it cannot load here it will not load for
 * anyone, and the failure is visible while the organiser can still fix it.
 */

function Advice({ analysis, value }: { analysis: DriveAnalysis; value: string }) {
  if (!value.trim()) return null;

  const notes = [
    ...analysis.errors.map((p) => ({ level: 'error' as const, text: DRIVE_PROBLEM_MESSAGE[p] })),
    ...analysis.warnings.map((p) => ({ level: 'warning' as const, text: DRIVE_PROBLEM_MESSAGE[p] })),
  ];

  // A plain https:// image URL is a legitimate answer for a cover, so it is not
  // an error — it simply is not Drive.
  if (notes.length === 0) return null;

  return (
    <Stack gap={1} sx={{ mt: 1.5 }}>
      {notes.map((note, i) => (
        <Stack
          key={i}
          direction="row"
          gap={1.25}
          alignItems="flex-start"
          sx={{
            p: 1.5,
            borderRadius: `${radius.field}px`,
            background: note.level === 'error' ? c.errorContainer : c.primaryContainer,
          }}
        >
          <Icon
            name={note.level === 'error' ? 'error' : 'info'}
            size={18}
            color={note.level === 'error' ? c.errorInk : c.primaryIcon}
          />
          <Typography sx={{ fontSize: 13, lineHeight: 1.5, color: note.level === 'error' ? c.errorBody : c.onPrimaryContainer }}>
            {note.text}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function DriveLinkInput({
  value,
  onChange,
  purpose = 'attachment',
  label,
  placeholder = 'Paste a Google Drive share link',
  helperText,
  allowPlainUrl = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  purpose?: 'image' | 'attachment';
  label?: string;
  placeholder?: string;
  helperText?: string;
  /** Cover images also accept any https image URL; file answers do not. */
  allowPlainUrl?: boolean;
  autoFocus?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const trimmed = value.trim();

  const isPlainUrl = allowPlainUrl && /^https?:\/\//i.test(trimmed);
  const analysis = useMemo(() => analyzeDriveLink(trimmed, purpose), [trimmed, purpose]);

  // With `allowPlainUrl`, a non-Drive https URL is valid and must not be
  // reported as "not a Drive link".
  const effective: DriveAnalysis = isPlainUrl && !analysis.target
    ? { target: null, errors: [], warnings: [], ok: true }
    : analysis;

  const previewUrl = effective.target
    ? driveImageUrl(effective.target.fileId, 900)
    : isPlainUrl
      ? trimmed
      : null;

  return (
    <Box>
      <TextField
        fullWidth
        label={label}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        error={touched && trimmed.length > 0 && !effective.ok}
        helperText={helperText}
        InputProps={{
          startAdornment: (
            <Box sx={{ display: 'flex', mr: 1, color: c.inkFaint }}>
              <Icon name={effective.target ? KIND_ICON[effective.target.kind] : 'link'} size={20} />
            </Box>
          ),
          endAdornment: trimmed ? (
            <Button
              size="small"
              onClick={() => onChange('')}
              sx={{ minWidth: 0, px: 1, color: c.inkFaint }}
              aria-label="Clear link"
            >
              <Icon name="close" size={18} />
            </Button>
          ) : undefined,
        }}
      />

      <Advice analysis={effective} value={value} />

      {effective.target && effective.ok && (
        <Stack
          direction="row"
          alignItems="center"
          gap={1.5}
          sx={{ mt: 1.5, p: 1.5, borderRadius: `${radius.field}px`, background: c.surfaceContainer }}
        >
          <Icon name={KIND_ICON[effective.target.kind]} size={20} color={c.primaryIcon} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
            {KIND_LABEL[effective.target.kind]} linked
          </Typography>
          <MuiLink
            href={driveOpenUrl(effective.target)}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
          >
            Open in Drive
            <Icon name="open_in_new" size={16} />
          </MuiLink>
        </Stack>
      )}

      {purpose === 'image' && previewUrl && effective.ok && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: c.inkFaint, mb: 1 }}>
            Preview
          </Typography>
          {/* Rendered from the same URL participants will get, so a sharing
              problem surfaces here rather than in front of an audience. */}
          <PreviewImage src={previewUrl} isDrive={Boolean(effective.target)} />
        </Box>
      )}
    </Box>
  );
}

function PreviewImage({ src, isDrive }: { src: string; isDrive: boolean }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  return (
    <Box
      sx={{
        position: 'relative',
        height: 200,
        borderRadius: `${radius.tile}px`,
        overflow: 'hidden',
        background: c.surfaceField,
        border: `1px solid ${c.outline}`,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <Box
        component="img"
        src={src}
        alt=""
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: state === 'ok' ? 1 : 0,
          transition: `opacity 300ms ${ease}`,
        }}
      />
      {state === 'error' && (
        <Stack alignItems="center" gap={1} sx={{ position: 'relative', px: 3, textAlign: 'center' }}>
          <Icon name="broken_image" size={28} color={c.errorInk} />
          <Typography sx={{ fontSize: 13, color: c.errorBody, maxWidth: '40ch' }}>
            {isDrive
              ? 'This image did not load. It is almost always sharing: in Drive choose Share → General access → “Anyone with the link”, then paste the link again.'
              : 'This image did not load. Check the address points directly at an image file — some sites block being embedded elsewhere.'}
          </Typography>
        </Stack>
      )}
      {state === 'loading' && (
        <Typography sx={{ position: 'relative', fontSize: 13, color: c.inkFaint }}>Loading preview…</Typography>
      )}
    </Box>
  );
}

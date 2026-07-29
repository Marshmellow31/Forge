/**
 * Field type registry — REACT half.
 *
 * One entry per field type. Adding a type means adding a row here and a row in
 * core/forms/registry.ts. Nothing else in the app changes — the renderer never
 * switches on field.type.
 */
import {
  TextField, MenuItem, Checkbox, Rating,
  Stack, Box, Typography, Chip, Button, IconButton, Select, OutlinedInput,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { c as t, radius, ease } from '@shared/design/tokens';
import type { FieldType, FormField, FileRef } from '@core/forms/types';

/** Label + help/error pair shared by the non-text field types. */
const FieldLabel = ({ field }: { field: FormField }) => (
  <Typography sx={{ fontSize: 13, fontWeight: 600, color: t.inkMuted, mb: 1.25 }}>
    {field.label}
    {field.required && <Box component="span" sx={{ color: t.errorInk }}> *</Box>}
  </Typography>
);

const FieldFoot = ({ error, help }: { error?: string; help?: string | null }) =>
  error ? (
    <Stack direction="row" alignItems="center" gap={0.75} sx={{ fontSize: 12, color: t.errorInk, px: 2, pt: 0.75 }}>
      <Icon name="error" size={15} />
      {error}
    </Stack>
  ) : help ? (
    <Typography sx={{ fontSize: 12, color: t.inkFaint, px: 2, pt: 0.75 }}>{help}</Typography>
  ) : null;

export interface FieldInputProps {
  field: FormField;
  value: unknown;
  error: string | undefined;
  onChange: (v: unknown) => void;
}

type InputComponent = (p: FieldInputProps) => React.ReactElement;

const uiRegistry = new Map<FieldType, InputComponent>();
const register = (t: FieldType, c: InputComponent) => uiRegistry.set(t, c);

export function getFieldInput(type: FieldType): InputComponent {
  const c = uiRegistry.get(type);
  if (!c) throw new Error(`No input component registered for field type: ${type}`);
  return c;
}

/* ------------------------------------------------------------------ */

const common = (p: FieldInputProps) => ({
  fullWidth: true,
  label: p.field.label,
  required: p.field.required,
  error: Boolean(p.error),
  helperText: p.error ?? p.field.help ?? ' ',
  placeholder: p.field.placeholder ?? undefined,
});

register('shortText', (p) => (
  <TextField {...common(p)} value={(p.value as string) ?? ''} onChange={(e) => p.onChange(e.target.value)} />
));

register('longText', (p) => (
  <TextField
    {...common(p)}
    multiline
    rows={(p.field.config.rows as number) ?? 4}
    value={(p.value as string) ?? ''}
    onChange={(e) => p.onChange(e.target.value)}
  />
));

register('email', (p) => (
  <TextField {...common(p)} type="email" value={(p.value as string) ?? ''} onChange={(e) => p.onChange(e.target.value)} />
));

register('number', (p) => (
  <TextField
    {...common(p)}
    type="number"
    value={(p.value as number | string) ?? ''}
    onChange={(e) => p.onChange(e.target.value === '' ? '' : Number(e.target.value))}
  />
));

register('date', (p) => (
  <TextField
    {...common(p)}
    type="date"
    InputLabelProps={{ shrink: true }}
    value={(p.value as string) ?? ''}
    onChange={(e) => p.onChange(e.target.value)}
  />
));

register('url', (p) => (
  <TextField
    {...common(p)}
    value={(p.value as string) ?? ''}
    onChange={(e) => p.onChange(e.target.value)}
    InputProps={{ startAdornment: <Box sx={{ mr: 1, color: t.primaryIcon }}><Icon name="link" size={18} /></Box> }}
  />
));

register('githubRepo', (p) => (
  <TextField
    {...common(p)}
    value={(p.value as string) ?? ''}
    onChange={(e) => p.onChange(e.target.value)}
    InputProps={{ startAdornment: <Box sx={{ mr: 1, color: t.primaryIcon }}><Icon name="code" size={18} /></Box> }}
  />
));

register('dropdown', (p) => (
  <TextField {...common(p)} select value={(p.value as string) ?? ''} onChange={(e) => p.onChange(e.target.value)}>
    {(p.field.options ?? []).map((o) => (
      <MenuItem key={o.id} value={o.value}>{o.label}</MenuItem>
    ))}
  </TextField>
));

/** The design renders single choice as a row of selectable chips, not radios. */
register('radio', (p) => {
  const selected = (p.value as string) ?? '';
  return (
    <Box>
      <FieldLabel field={p.field} />
      <Stack direction="row" flexWrap="wrap" gap={1}>
        {(p.field.options ?? []).map((o) => {
          const active = selected === o.value;
          return (
            <Box
              key={o.id}
              component="button"
              type="button"
              onClick={() => p.onChange(o.value)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                height: 44,
                px: 2.25,
                borderRadius: `${radius.chip}px`,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                background: active ? t.primaryContainer : 'transparent',
                color: active ? t.onPrimaryContainer : t.inkMuted,
                border: `1px solid ${active ? 'transparent' : t.outline}`,
                transition: `background 180ms ${ease}`,
                '&:hover': { background: active ? t.primaryContainer : t.surfaceField },
              }}
            >
              {active && <Icon name="check" size={18} />}
              {o.label}
            </Box>
          );
        })}
      </Stack>
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

register('multiSelect', (p) => {
  const selected = (p.value as string[]) ?? [];
  return (
    <Box>
      <FieldLabel field={p.field} />
      <Select
        multiple
        fullWidth
        size="small"
        value={selected}
        onChange={(e) => p.onChange(typeof e.target.value === 'string' ? [e.target.value] : e.target.value)}
        input={<OutlinedInput error={Boolean(p.error)} />}
        renderValue={(vals) => (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {(vals as string[]).map((v) => (
              <Chip key={v} size="small" label={p.field.options?.find((o) => o.value === v)?.label ?? v} />
            ))}
          </Stack>
        )}
      >
        {(p.field.options ?? []).map((o) => (
          <MenuItem key={o.id} value={o.value}>
            <Checkbox size="small" checked={selected.includes(o.value)} />
            {o.label}
          </MenuItem>
        ))}
      </Select>
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

/** A tappable row, per the design — the checkbox itself is the icon. */
register('checkbox', (p) => {
  const on = Boolean(p.value);
  return (
    <Box>
      <Stack
        direction="row"
        gap={1.75}
        alignItems="flex-start"
        onClick={() => p.onChange(!on)}
        sx={{
          cursor: 'pointer',
          p: 2,
          borderRadius: `${radius.field}px`,
          transition: `background 180ms ${ease}`,
          '&:hover': { background: t.surfaceContainer },
        }}
      >
        <Icon
          name={on ? 'check_box' : 'check_box_outline_blank'}
          size={24}
          fill={on}
          color={on ? t.primaryIcon : t.outlineField}
          style={{ marginTop: 1 }}
        />
        <Typography sx={{ fontSize: 15, lineHeight: 1.5, color: t.inkBody }}>
          {p.field.label}
          {p.field.required && <Box component="span" sx={{ color: t.errorInk }}> *</Box>}
        </Typography>
      </Stack>
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

register('rating', (p) => (
  <Box>
    <FieldLabel field={p.field} />
    <Rating
      max={(p.field.config.scale as number) ?? 5}
      value={Number(p.value) || 0}
      onChange={(_, v) => p.onChange(v ?? 0)}
    />
    <FieldFoot error={p.error} help={p.field.help} />
  </Box>
));

/** Simulated upload — the real one mints a Drive session server-side. See SPEC_STORAGE §3. */
function fakeFile(name: string, mb: number): FileRef {
  return {
    provider: 'googleDrive',
    fileId: `drv_${Math.random().toString(36).slice(2, 10)}`,
    url: '#',
    name,
    mimeType: name.endsWith('.png') ? 'image/png' : 'image/jpeg',
    sizeBytes: Math.round(mb * 1024 * 1024),
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'u_self',
  };
}

function FileChipRow({ file, onRemove }: { file: FileRef; onRemove: () => void }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.5}
      sx={{ px: 2, py: 1.5, borderRadius: `${radius.field}px`, background: t.surfaceCard, border: `1px solid ${t.outline}` }}
    >
      <Icon name="draft" size={20} color={t.primaryIcon} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{file.name}</Typography>
        <Typography sx={{ fontSize: 12, color: t.inkFaint }}>
          {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB · Google Drive · {file.fileId}
        </Typography>
      </Box>
      <Chip size="small" label="Uploaded" sx={{ background: t.success, color: t.onSuccess, height: 24 }} />
      <IconButton size="small" onClick={onRemove} aria-label={`Remove ${file.name}`}>
        <Icon name="close" size={18} />
      </IconButton>
    </Stack>
  );
}

register('file', (p) => {
  const file = p.value as FileRef | null;
  return (
    <Box>
      <FieldLabel field={p.field} />
      {file ? (
        <FileChipRow file={file} onRemove={() => p.onChange(null)} />
      ) : (
        <Box
          onClick={() => p.onChange(fakeFile('monsoon-first-light.jpg', 4.2))}
          sx={{
            cursor: 'pointer',
            border: `2px dashed ${p.error ? t.errorInk : t.outlineStrong}`,
            borderRadius: `${radius.tile}px`,
            p: 4,
            textAlign: 'center',
            background: t.surfaceField,
            transition: `background 180ms ${ease}, border-color 180ms ${ease}`,
            '&:hover': { background: t.surfaceFieldHover },
          }}
        >
          <Icon name="cloud_upload" size={36} color={t.primaryIcon} />
          <Typography sx={{ fontSize: 15, fontWeight: 600, mt: 1.5, mb: 0.5 }}>Click to upload</Typography>
          <Typography sx={{ fontSize: 13, color: t.inkMuted }}>
            {p.field.validation.maxFileSizeMB ? `Max ${p.field.validation.maxFileSizeMB} MB` : 'Any file'} · goes to the org’s Drive
          </Typography>
        </Box>
      )}
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

register('files', (p) => {
  const files = (p.value as FileRef[]) ?? [];
  return (
    <Box>
      <FieldLabel field={p.field} />
      <Stack spacing={1}>
        {files.map((f, i) => (
          <FileChipRow key={f.fileId} file={f} onRemove={() => p.onChange(files.filter((_, j) => j !== i))} />
        ))}
        <Button
          variant="outlined"
          startIcon={<Icon name="cloud_upload" size={20} />}
          onClick={() => p.onChange([...files, fakeFile(`asset-${files.length + 1}.png`, 1.8)])}
        >
          Add file
        </Button>
      </Stack>
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

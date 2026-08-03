/**
 * Field type registry — REACT half.
 *
 * One entry per field type. Adding a type means adding a row here and a row in
 * core/forms/registry.ts. Nothing else in the app changes — the renderer never
 * switches on field.type.
 */
import {
  TextField, MenuItem, Checkbox, Rating,
  Stack, Box, Typography, Chip, IconButton, Select, OutlinedInput,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { DriveLinkInput } from '@shared/ui/DriveLinkInput';
import { c as t, radius, ease } from '@shared/design/tokens';
import { FileUploadInput } from './FileUploadInput';
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

/**
 * The `accept` attribute for a file field, from its own validation.
 *
 * Derived rather than hardcoded (hard rule 1): a challenge that wants PDFs says
 * so in its schema. The browser filter is convenience only — the real limits
 * are enforced by the upload endpoint, which is the half a determined caller
 * cannot skip.
 */
function acceptFor(field: FormField): string {
  const types = field.validation.acceptedMimeTypes;
  return types && types.length > 0 ? types.join(',') : 'image/*';
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

register('file', (p) => {
  const file = p.value as FileRef | null;
  return (
    <Box>
      <FieldLabel field={p.field} />
      <FileUploadInput
        files={file ? [file] : []}
        onChange={(files) => p.onChange(files[0] ?? null)}
        maxFiles={1}
        accept={acceptFor(p.field)}
        error={Boolean(p.error)}
      />
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

register('files', (p) => {
  const files = (p.value as FileRef[]) ?? [];
  return (
    <Box>
      <FieldLabel field={p.field} />
      <FileUploadInput
        files={files}
        onChange={p.onChange}
        maxFiles={p.field.validation.maxFiles}
        accept={acceptFor(p.field)}
        error={Boolean(p.error)}
      />
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

/* ================================================================== *
 * Phase 2 field types                                                 *
 *                                                                     *
 * One entry each, matching the pure half in core/forms/registry.ts.   *
 * Nothing else in the app changes: the renderer never switches on     *
 * `field.type` — that is the whole point of the registry (ADR-012).   *
 * ================================================================== */

register('phone', (p) => (
  <TextField
    {...common(p)}
    type="tel"
    value={(p.value as string) ?? ''}
    onChange={(e) => p.onChange(e.target.value)}
    InputProps={{ startAdornment: <Box sx={{ mr: 1, color: t.primaryIcon }}><Icon name="call" size={18} /></Box> }}
  />
));

register('time', (p) => (
  <TextField
    {...common(p)}
    type="time"
    InputLabelProps={{ shrink: true }}
    value={(p.value as string) ?? ''}
    onChange={(e) => p.onChange(e.target.value)}
  />
));

register('datetime', (p) => (
  <TextField
    {...common(p)}
    type="datetime-local"
    InputLabelProps={{ shrink: true }}
    value={(p.value as string) ?? ''}
    onChange={(e) => p.onChange(e.target.value)}
  />
));

register('currency', (p) => (
  <TextField
    {...common(p)}
    type="number"
    value={(p.value as number | string) ?? ''}
    onChange={(e) => p.onChange(e.target.value === '' ? '' : Number(e.target.value))}
    InputProps={{
      startAdornment: (
        <Box sx={{ mr: 1, color: t.inkMuted, fontSize: 14, fontWeight: 600 }}>
          {(p.field.config.currency as string) ?? 'INR'}
        </Box>
      ),
    }}
  />
));

register('address', (p) => (
  <TextField
    {...common(p)}
    multiline
    rows={(p.field.config.rows as number) ?? 3}
    value={(p.value as string) ?? ''}
    onChange={(e) => p.onChange(e.target.value)}
  />
));

register('videoUrl', (p) => (
  <TextField
    {...common(p)}
    value={(p.value as string) ?? ''}
    onChange={(e) => p.onChange(e.target.value)}
    InputProps={{ startAdornment: <Box sx={{ mr: 1, color: t.primaryIcon }}><Icon name="movie" size={18} /></Box> }}
  />
));

register('slider', (p) => {
  const min = p.field.validation.min ?? (p.field.config.min as number) ?? 0;
  const max = p.field.validation.max ?? (p.field.config.max as number) ?? 100;
  const step = (p.field.config.step as number) ?? 1;
  const value = typeof p.value === 'number' ? p.value : min;
  return (
    <Box>
      <FieldLabel field={p.field} />
      <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 1 }}>
        <Box component="span" sx={{ fontSize: 12, color: t.inkFaint }}>{min}</Box>
        <Box
          component="input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={p.field.label}
          onChange={(e) => p.onChange(Number((e.target as HTMLInputElement).value))}
          sx={{ flex: 1 }}
        />
        <Box component="span" sx={{ fontSize: 12, color: t.inkFaint }}>{max}</Box>
        <Box sx={{ minWidth: 44, textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{value}</Box>
      </Stack>
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

register('linearScale', (p) => {
  const min = (p.field.config.min as number) ?? 1;
  const max = (p.field.config.max as number) ?? 5;
  const points = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  return (
    <Box>
      <FieldLabel field={p.field} />
      <Stack direction="row" alignItems="flex-end" spacing={1} sx={{ mt: 0.5 }}>
        <Box sx={{ fontSize: 12, color: t.inkMuted, maxWidth: 96, lineHeight: 1.35, pb: 1 }}>
          {(p.field.config.minLabel as string) ?? ''}
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ flex: 1, justifyContent: 'center' }}>
          {points.map((n) => {
            const selected = p.value === n;
            return (
              <Box
                key={n}
                component="button"
                type="button"
                aria-label={String(n)}
                aria-pressed={selected}
                onClick={() => p.onChange(n)}
                sx={{
                  width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', font: 'inherit',
                  fontSize: 15, fontWeight: 700,
                  border: `1px solid ${selected ? 'transparent' : t.outline}`,
                  background: selected ? t.primary : t.surfaceCard,
                  color: selected ? t.onPrimary : t.inkMuted,
                  transition: `background 160ms ${ease}`,
                  '&:hover': { background: selected ? t.primary : t.surfaceRowHover },
                }}
              >
                {n}
              </Box>
            );
          })}
        </Stack>
        <Box sx={{ fontSize: 12, color: t.inkMuted, maxWidth: 96, textAlign: 'right', lineHeight: 1.35, pb: 1 }}>
          {(p.field.config.maxLabel as string) ?? ''}
        </Box>
      </Stack>
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

register('ranking', (p) => {
  const options = p.field.options ?? [];
  // Unranked options are appended rather than hidden, so the control always
  // shows every option and the participant reorders instead of hunting for
  // which ones they have not placed yet.
  const current = (p.value as string[]) ?? [];
  const ordered = [
    ...current.filter((v) => options.some((o) => o.value === v)),
    ...options.map((o) => o.value).filter((v) => !current.includes(v)),
  ];

  const move = (index: number, delta: number) => {
    const next = [...ordered];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    p.onChange(next);
  };

  return (
    <Box>
      <FieldLabel field={p.field} />
      <Stack spacing={1}>
        {ordered.map((value, i) => {
          const option = options.find((o) => o.value === value);
          return (
            <Stack
              key={value}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{ p: 1.25, borderRadius: `${radius.field}px`, background: t.surfaceField }}
            >
              <Box
                sx={{
                  width: 26, height: 26, flex: 'none', borderRadius: '50%',
                  background: t.inverse, color: t.primary,
                  display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                }}
              >
                {i + 1}
              </Box>
              <Box sx={{ flex: 1, fontSize: 14 }}>{option?.label ?? value}</Box>
              <IconButton
                size="small"
                aria-label={`Move ${option?.label ?? value} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <Icon name="arrow_upward" size={16} />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Move ${option?.label ?? value} down`}
                disabled={i === ordered.length - 1}
                onClick={() => move(i, 1)}
              >
                <Icon name="arrow_downward" size={16} />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>
      <FieldFoot error={p.error} help={p.field.help} />
    </Box>
  );
});

register('driveLink', (p) => (
  <Box>
    <FieldLabel field={p.field} />
    {/* The real parser, so a participant gets the same precise diagnosis an
        organiser gets when setting a cover image (ADR-017). */}
    {/* `config.purpose` is honoured so a photo slot rejects a folder or a Doc
        in the input as well as in the validator — the two halves of the
        registry have to agree, or the field explains one rule and enforces
        another. */}
    <DriveLinkInput
      value={(p.value as string) ?? ''}
      onChange={p.onChange}
      purpose={p.field.config.purpose === 'image' ? 'image' : 'attachment'}
      placeholder={p.field.placeholder ?? 'Paste a Google Drive share link'}
    />
    <FieldFoot error={p.error} help={p.field.help} />
  </Box>
));

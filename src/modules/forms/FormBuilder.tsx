import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, Stack, Tab, Tabs, TextField,
  Tooltip, Typography,
} from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import type { FormField, FormSchema, FieldType } from '@core/forms/types';
import { listFieldTypes, getFieldType } from '@core/forms/registry';
import { useChallenge, useFormSchemas } from '@core/firebase/hooks';
import { FormRenderer, useFormEngine } from './FormRenderer';
import { EmptyState, Tag, Eyebrow, ListSkeleton } from '@shared/ui/primitives';
import { c, radius, ease, mono } from '@app/tokens';

const EMPTY_SCHEMA: FormSchema = {
  id: '', orgId: '', version: 0, status: 'draft', title: '', description: null,
  sections: [], settings: { allowDrafts: false, showProgressBar: false, confirmationMessage: null },
};

let seq = 1000;
const newId = () => `f_${seq++}`;

/** Palette icons, keyed by the registry's group — not by field type. */
const GROUP_ICON: Record<string, string> = {
  text: 'short_text',
  number: 'tag',
  choice: 'list',
  date: 'calendar_month',
  file: 'attach_file',
  boolean: 'check_box',
  rating: 'star',
  link: 'link',
};

function blankField(type: FieldType, order: number): FormField {
  const def = getFieldType(type);
  return {
    id: newId(),
    key: `${type}_${seq}`,
    type,
    label: def.label,
    help: null,
    placeholder: null,
    required: false,
    order,
    defaultValue: type === 'multiSelect' ? [] : type === 'checkbox' ? false : '',
    options: def.hasOptions
      ? [
          { id: `o${seq}a`, label: 'Option one', value: 'one' },
          { id: `o${seq}b`, label: 'Option two', value: 'two' },
        ]
      : null,
    validation: {},
    config: { ...def.defaultConfig },
    visibleWhen: null,
    width: 'full',
    piiLevel: 'none',
  };
}

/** S-30 — Form builder. Palette / canvas / field settings, per the design. */
export default function FormBuilder() {
  const { cid } = useParams();
  const { data: challenge, isLoading } = useChallenge(cid);
  const { data: schemas = {} } = useFormSchemas();
  const remote = challenge ? schemas[challenge.formSchemaId] : undefined;

  // The builder edits a local draft. Publishing it back to Firestore needs the
  // versioning write path (hard rule 6) — see STATUS.md.
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (remote && !schema) {
      const draft = structuredClone(remote);
      setSchema(draft);
      setSelectedId(draft.sections[0]?.fields[0]?.id ?? null);
    }
  }, [remote, schema]);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [cfgTab, setCfgTab] = useState(0);

  const previewEngine = useFormEngine(schema ?? EMPTY_SCHEMA);
  const types = useMemo(() => listFieldTypes(), []);

  if (isLoading) return <ListSkeleton rows={3} height={120} />;
  if (!challenge) return <EmptyState icon="search_off" title="Challenge not found" />;
  if (!schema) return <EmptyState icon="description" title="No form schema for this challenge" />;

  const selected = schema.sections.flatMap((s) => s.fields).find((f) => f.id === selectedId) ?? null;
  const totalFields = schema.sections.reduce((n, s) => n + s.fields.length, 0);

  const mutateField = (id: string, patch: Partial<FormField>) =>
    setSchema((prev) => (prev ? {
      ...prev,
      sections: prev.sections.map((s) => ({
        ...s,
        fields: s.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      })),
    } : prev));

  const addField = (type: FieldType) => {
    const sectionId = schema?.sections[0]?.id;
    if (!sectionId) return;
    const f = blankField(type, 999);
    setSchema((prev) => (prev ? {
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId ? { ...s, fields: [...s.fields, { ...f, order: s.fields.length }] } : s,
      ),
    } : prev));
    setSelectedId(f.id);
  };

  const removeField = (id: string) =>
    setSchema((prev) => (prev ? {
      ...prev,
      sections: prev.sections.map((s) => ({ ...s, fields: s.fields.filter((f) => f.id !== id) })),
    } : prev));

  const moveField = (sectionId: string, idx: number, dir: -1 | 1) =>
    setSchema((prev) => (prev ? {
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const fields = [...s.fields];
        const j = idx + dir;
        if (j < 0 || j >= fields.length) return s;
        [fields[idx], fields[j]] = [fields[j]!, fields[idx]!];
        return { ...s, fields: fields.map((f, i) => ({ ...f, order: i })) };
      }),
    } : prev));

  return (
    <>
      <Stack direction="row" alignItems="center" flexWrap="wrap" gap={2} sx={{ mb: 3 }}>
        <Box
          component={Link}
          to={`/org/challenges/${challenge.id}`}
          aria-label="Back to challenge"
          sx={{ width: 48, height: 48, flex: 'none', borderRadius: '50%', background: c.surfaceField, display: 'grid', placeItems: 'center', color: c.ink, '&:hover': { background: c.surfaceFieldHover } }}
        >
          <Icon name="arrow_back" size={22} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography sx={{ fontSize: 12, color: c.inkFaint }}>
            {challenge.title} · schema v{schema.version} · {schema.status} · {totalFields} fields
          </Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.025em', mt: 0.5 }}>
            {schema.title}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
          startIcon={<Icon name={mode === 'edit' ? 'visibility' : 'edit'} size={20} />}
        >
          {mode === 'edit' ? 'Preview' : 'Edit'}
        </Button>
        <Button variant="contained">Publish v{schema.version + 1}</Button>
      </Stack>

      {mode === 'preview' ? (
        <Box sx={{ maxWidth: 680, mx: 'auto' }}>
          <Stack direction="row" gap={1.75} sx={{ p: 2.25, borderRadius: `${radius.tile}px`, background: c.surfaceContainer, mb: 3 }}>
            <Icon name="visibility" size={22} color={c.primaryIcon} />
            <Typography sx={{ fontSize: 13, lineHeight: 1.55, color: c.inkMuted }}>
              This is the participant view, rendered from the schema you are editing — the same renderer, the
              same compiled validation.
            </Typography>
          </Stack>
          <FormRenderer schema={schema} engine={previewEngine} />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            // Palette + canvas from md; the settings panel joins as a third
            // column only when there is room for it beside the shell sidebar.
            gridTemplateColumns: { xs: '1fr', md: '200px minmax(0,1fr)', lg: '200px minmax(0,1fr) 290px' },
            gap: 2.5,
            alignItems: 'start',
          }}
        >
          {/* Palette */}
          <Box sx={{ borderRadius: `${radius.card}px`, background: c.surfaceContainer, p: 2 }}>
            <Eyebrow>Field types</Eyebrow>
            <Typography sx={{ fontSize: 12, color: c.inkFaint, px: 1, pb: 1.5 }}>
              Registered, not hardcoded
            </Typography>
            <Stack spacing={0.5}>
              {types.map((ft) => (
                <Box
                  key={ft.type}
                  component="button"
                  onClick={() => addField(ft.type)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: '12px 14px',
                    border: 'none',
                    borderRadius: '14px',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 14,
                    transition: `background 160ms ${ease}`,
                    '&:hover': { background: c.surfaceFieldHover },
                  }}
                >
                  <Icon name={GROUP_ICON[ft.group] ?? 'short_text'} size={20} color={c.inkMuted} />
                  {ft.label}
                </Box>
              ))}
            </Stack>
          </Box>

          {/* Canvas */}
          <Box sx={{ borderRadius: `${radius.card}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: 2.5 }}>
            {schema.sections.map((section) => (
              <Box key={section.id} sx={{ mb: 3, '&:last-of-type': { mb: 0 } }}>
                <Typography variant="overline" sx={{ display: 'block', color: c.primaryInk, mb: 1.25 }}>
                  {section.title}
                </Typography>
                <Stack spacing={1.25}>
                  {section.fields.map((f, idx) => {
                    const def = getFieldType(f.type);
                    const isSel = f.id === selectedId;
                    return (
                      <Stack
                        key={f.id}
                        direction="row"
                        gap={1.75}
                        alignItems="center"
                        onClick={() => setSelectedId(f.id)}
                        sx={{
                          cursor: 'pointer',
                          p: 2,
                          borderRadius: `${radius.row}px`,
                          background: isSel ? c.primaryContainer : c.surfaceContainer,
                          border: `1px solid ${isSel ? c.accent : 'transparent'}`,
                          transition: `background 160ms ${ease}`,
                        }}
                      >
                        <Icon name="drag_indicator" size={20} color={c.primaryIcon} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>{f.label}</Typography>
                          <Box sx={{ fontSize: 12, color: c.inkFaint, fontFamily: mono }}>
                            {f.key} · {def.label}
                          </Box>
                        </Box>
                        {f.visibleWhen && <Tag bg={c.success} fg={c.onSuccess}>conditional</Tag>}
                        {f.required && <Tag>required</Tag>}
                        {f.piiLevel === 'high' && <Tag bg={c.errorContainer} fg={c.errorInk}>PII</Tag>}
                        <Stack direction="row">
                          <IconButton size="small" aria-label="Move up" onClick={(e) => { e.stopPropagation(); moveField(section.id, idx, -1); }}>
                            <Icon name="arrow_upward" size={18} />
                          </IconButton>
                          <IconButton size="small" aria-label="Move down" onClick={(e) => { e.stopPropagation(); moveField(section.id, idx, 1); }}>
                            <Icon name="arrow_downward" size={18} />
                          </IconButton>
                          <IconButton size="small" aria-label="Delete field" onClick={(e) => { e.stopPropagation(); removeField(f.id); }}>
                            <Icon name="delete" size={18} />
                          </IconButton>
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </Box>

          {/* Field settings */}
          <Box
            sx={{
              borderRadius: `${radius.card}px`,
              background: c.surfaceContainer,
              p: 2.5,
              gridColumn: { md: '1 / -1', lg: 'auto' },
            }}
          >
            <Eyebrow>Field settings</Eyebrow>
            {!selected ? (
              <Typography sx={{ fontSize: 14, color: c.inkMuted, mt: 2 }}>
                Pick a field on the canvas to configure it.
              </Typography>
            ) : (
              <>
                <Typography sx={{ fontSize: 16, fontWeight: 700, mt: 0.5, mb: 2 }}>{selected.label}</Typography>
                <Tabs value={cfgTab} onChange={(_, v: number) => setCfgTab(v)} variant="fullWidth" sx={{ mb: 2.5 }}>
                  <Tab label="Field" /><Tab label="Rules" /><Tab label="Logic" />
                </Tabs>

                {cfgTab === 0 && (
                  <Stack spacing={2}>
                    <TextField label="Label" fullWidth value={selected.label}
                      onChange={(e) => mutateField(selected.id, { label: e.target.value })} />
                    <TextField
                      label="Field ID" fullWidth value={selected.id} disabled
                      helperText="Immutable — answers are keyed by it"
                      InputProps={{
                        endAdornment: (
                          <Tooltip title="Field ids are never renamed or reused">
                            <Box component="span" sx={{ color: c.inkFaint, display: 'flex' }}>
                              <Icon name="lock" size={18} />
                            </Box>
                          </Tooltip>
                        ),
                      }}
                    />
                    <TextField label="Answer key" fullWidth value={selected.key}
                      onChange={(e) => mutateField(selected.id, { key: e.target.value })} />
                    <TextField label="Help text" fullWidth value={selected.help ?? ''}
                      onChange={(e) => mutateField(selected.id, { help: e.target.value || null })} />
                    <TextField label="Placeholder" fullWidth value={selected.placeholder ?? ''}
                      onChange={(e) => mutateField(selected.id, { placeholder: e.target.value || null })} />
                    <TextField select label="Width" fullWidth value={selected.width}
                      onChange={(e) => mutateField(selected.id, { width: e.target.value as 'full' | 'half' })}>
                      <MenuItem value="full">Full width</MenuItem>
                      <MenuItem value="half">Half width</MenuItem>
                    </TextField>
                    <TextField select label="PII level" fullWidth value={selected.piiLevel}
                      onChange={(e) => mutateField(selected.id, { piiLevel: e.target.value as FormField['piiLevel'] })}>
                      <MenuItem value="none">None</MenuItem>
                      <MenuItem value="low">Low</MenuItem>
                      <MenuItem value="high">High — redact on export</MenuItem>
                    </TextField>
                    <FormControlLabel
                      control={<Checkbox checked={selected.required}
                        onChange={(e) => mutateField(selected.id, { required: e.target.checked })} />}
                      label="Required"
                    />
                  </Stack>
                )}

                {cfgTab === 1 && (
                  <Stack spacing={2}>
                    <Typography sx={{ fontSize: 12, color: c.inkFaint, lineHeight: 1.5 }}>
                      These compile straight into the Zod validator used by the builder preview, the
                      participant form and the server.
                    </Typography>
                    <TextField label="Min length" type="number" fullWidth
                      value={selected.validation.minLength ?? ''}
                      onChange={(e) => mutateField(selected.id, { validation: { ...selected.validation, minLength: e.target.value ? Number(e.target.value) : undefined } })} />
                    <TextField label="Max length" type="number" fullWidth
                      value={selected.validation.maxLength ?? ''}
                      onChange={(e) => mutateField(selected.id, { validation: { ...selected.validation, maxLength: e.target.value ? Number(e.target.value) : undefined } })} />
                    <TextField label="Min value" type="number" fullWidth
                      value={selected.validation.min ?? ''}
                      onChange={(e) => mutateField(selected.id, { validation: { ...selected.validation, min: e.target.value ? Number(e.target.value) : undefined } })} />
                    <TextField label="Max value" type="number" fullWidth
                      value={selected.validation.max ?? ''}
                      onChange={(e) => mutateField(selected.id, { validation: { ...selected.validation, max: e.target.value ? Number(e.target.value) : undefined } })} />
                    <TextField label="Max file size (MB)" type="number" fullWidth
                      value={selected.validation.maxFileSizeMB ?? ''}
                      onChange={(e) => mutateField(selected.id, { validation: { ...selected.validation, maxFileSizeMB: e.target.value ? Number(e.target.value) : undefined } })} />
                  </Stack>
                )}

                {cfgTab === 2 && (
                  <Stack spacing={2}>
                    <Typography sx={{ fontSize: 12, color: c.inkFaint, lineHeight: 1.5 }}>
                      Show this field only when a condition holds. Hidden fields are excluded from validation
                      and dropped before storage.
                    </Typography>
                    <Box
                      component="pre"
                      sx={{ fontFamily: mono, fontSize: 12, m: 0, p: 2, overflow: 'auto', borderRadius: `${radius.chip}px`, background: c.surfaceCard, border: `1px solid ${c.outline}` }}
                    >
                      {JSON.stringify(selected.visibleWhen, null, 2) ?? 'null'}
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => mutateField(selected.id, {
                        visibleWhen: selected.visibleWhen ? null : { field: 'department', op: 'eq', value: 'external' },
                      })}
                    >
                      {selected.visibleWhen ? 'Remove condition' : 'Add sample condition'}
                    </Button>
                  </Stack>
                )}
              </>
            )}
          </Box>
        </Box>
      )}
    </>
  );
}

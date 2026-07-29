/**
 * Generates the entire participant form from stored JSON.
 * There is no hardcoded form anywhere in this app.
 */
import { useMemo, useState } from 'react';
import { Box, Stack, Typography, Collapse } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { c, radius } from '@app/tokens';
import type { Answers, FormSchema } from '@core/forms/types';
import { computeVisibility } from '@core/forms/conditions';
import { validateAnswers, completionPercent } from '@core/forms/compiler';
import { getFieldInput } from './fieldComponents';
import { ProgressBar } from '@shared/ui/primitives';

export function useFormEngine(schema: FormSchema, initial: Answers = {}) {
  const [answers, setAnswers] = useState<Answers>(() => {
    const seeded: Answers = { ...initial };
    for (const s of schema.sections) {
      for (const f of s.fields) {
        if (!(f.key in seeded) && f.defaultValue !== undefined) seeded[f.key] = f.defaultValue;
      }
    }
    return seeded;
  });
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => validateAnswers(schema, answers), [schema, answers]);
  const errorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of errors) if (!m.has(e.key)) m.set(e.key, e.message);
    return m;
  }, [errors]);
  const percent = useMemo(() => completionPercent(schema, answers), [schema, answers]);

  return {
    answers,
    setAnswer: (k: string, v: unknown) => setAnswers((prev) => ({ ...prev, [k]: v })),
    errors,
    errorMap,
    percent,
    showErrors,
    setShowErrors,
    isValid: errors.length === 0,
  };
}

export function FormRenderer({
  schema,
  engine,
}: {
  schema: FormSchema;
  engine: ReturnType<typeof useFormEngine>;
}) {
  const { answers, setAnswer, errorMap, showErrors, percent, errors } = engine;
  const visibility = useMemo(() => computeVisibility(schema, answers), [schema, answers]);

  return (
    <Stack spacing={3}>
      {schema.settings.showProgressBar && <ProgressBar value={percent} label="Completion" />}

      {showErrors && errors.length > 0 && (
        <Stack
          direction="row"
          gap={1.75}
          alignItems="flex-start"
          sx={{ borderRadius: `${radius.tile}px`, background: c.errorContainer, p: '18px 20px', animation: 'fadeUp 240ms cubic-bezier(.2,0,0,1) both' }}
        >
          <Icon name="error" size={22} color={c.errorInk} />
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: c.onErrorContainer, mb: 0.25 }}>
              {errors.length} field{errors.length > 1 ? 's need' : ' needs'} attention
            </Typography>
            <Typography sx={{ fontSize: 13, color: c.errorBody, lineHeight: 1.5 }}>
              Fix the highlighted answers below, then submit again.
            </Typography>
          </Box>
        </Stack>
      )}

      {schema.sections
        .filter((s) => visibility.visibleSectionIds.has(s.id))
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <Box key={section.id}>
            <Typography variant="overline" sx={{ display: 'block', color: c.primaryInk }}>
              {section.title}
            </Typography>
            {section.description && (
              <Typography sx={{ fontSize: 13, color: c.inkMuted, mt: 0.5 }}>
                {section.description}
              </Typography>
            )}
            <Box sx={{ height: 1, background: c.outline, my: 2 }} />

            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              {section.fields
                .sort((a, b) => a.order - b.order)
                .map((field) => {
                  const visible = visibility.visibleFieldIds.has(field.id);
                  const Input = getFieldInput(field.type);
                  return (
                    <Box
                      key={field.id}
                      className={field.width === 'half' ? 'sm:col-span-1' : 'sm:col-span-2'}
                    >
                      <Collapse in={visible} unmountOnExit>
                        <Box className="pb-1">
                          <Input
                            field={field}
                            value={answers[field.key]}
                            error={showErrors ? errorMap.get(field.key) : undefined}
                            onChange={(v) => setAnswer(field.key, v)}
                          />
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}
            </Box>
          </Box>
        ))}
    </Stack>
  );
}

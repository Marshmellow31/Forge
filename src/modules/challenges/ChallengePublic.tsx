import { Link, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { useChallengeBySlug, useOrg, useWorkspaces, useFormSchemas, useRubric } from '@core/firebase/hooks';
import { EmptyState, Blobs, Tag, ListSkeleton } from '@shared/ui/primitives';
import { allFields } from '@core/forms/compiler';
import { c, radius, coverFor, mono, shadow } from '@app/tokens';

const STAGE_LOOK = {
  done: { bg: c.success, fg: c.successInk, border: 'transparent', icon: 'check', fill: true },
  active: { bg: c.primary, fg: c.onPrimary, border: 'transparent', icon: 'play_arrow', fill: true },
  locked: { bg: 'transparent', fg: c.inkFaint, border: c.outline, icon: 'lock', fill: false },
} as const;

/** S-04 — Public challenge detail. */
export default function ChallengePublic() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data: ch, isLoading } = useChallengeBySlug(slug);
  const { data: org } = useOrg();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: schemas = {} } = useFormSchemas();
  const { data: rubric = [] } = useRubric(ch?.id);

  if (isLoading) return <ListSkeleton rows={3} height={160} />;
  if (!ch) return <EmptyState icon="emoji_events" title="Challenge not found" />;

  const ws = workspaces.find((w) => w.id === ch.workspaceId);
  const schema = schemas[ch.formSchemaId];
  const fieldCount = schema ? allFields(schema).length : 0;
  const closed = ch.status === 'completed';

  const facts = [
    { icon: 'group', label: 'Registered', value: `${ch.counters.registrations} entrants` },
    { icon: 'upload_file', label: 'Submitted', value: `${ch.counters.submissions} entries` },
    { icon: 'dynamic_form', label: 'Entry form', value: schema ? `v${schema.version} · ${fieldCount} fields` : '—' },
    { icon: 'emoji_events', label: 'Reward', value: ch.prize },
    { icon: 'visibility', label: 'Visibility', value: ch.visibility },
  ];

  const timeline = [
    { name: 'Registration closes', detail: 'After this, no new entrants.', date: ch.timeline.registrationClosesAt },
    { name: 'Submissions close', detail: 'Late entries are flagged, not rejected.', date: ch.timeline.submissionClosesAt },
    { name: 'Results', detail: 'Scores and certificates published.', date: ch.timeline.resultsAt },
  ];

  return (
    <>
      <Button
        onClick={() => navigate(-1)}
        variant="text"
        sx={{ mb: 2, color: c.inkMuted, pl: 1 }}
        startIcon={<Icon name="arrow_back" size={20} />}
      >
        Back
      </Button>

      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: `${radius.hero}px`,
          background: coverFor(ch.category),
          p: { xs: '32px 24px', md: '48px 44px' },
          mb: 3,
        }}
      >
        <Blobs variant="detail" />
        <Box sx={{ position: 'relative' }}>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
            {[ch.category, ch.status].map((label) => (
              <Box
                key={label}
                component="span"
                sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', px: 1.5, py: 0.75, borderRadius: '8px', background: 'rgba(255,253,246,.86)', color: c.onPrimaryContainer }}
              >
                {label}
              </Box>
            ))}
          </Stack>
          <Typography variant="h1" sx={{ fontSize: 'clamp(32px, 4.6vw, 52px)', color: c.onPrimaryContainer, mb: 1.5, maxWidth: '22ch', textWrap: 'balance' }}>
            {ch.title}
          </Typography>
          <Typography sx={{ fontSize: 15, color: c.onPrimary, fontWeight: 600 }}>
            {org?.name ?? ''}
            {ws && ` · ${ws.name}`}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 340px' }, gap: 3, alignItems: 'start' }}>
        <Box>
          <Typography sx={{ fontSize: 17, lineHeight: 1.6, color: c.inkBody, mb: 3.5 }}>
            {ch.description}
          </Typography>

          <Typography variant="h6" sx={{ mb: 1.75 }}>How it runs</Typography>
          <Box sx={{ borderRadius: `${radius.card}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: 1, mb: 3.5 }}>
            {ch.stages.map((s) => {
              const look = STAGE_LOOK[s.state];
              return (
                <Stack
                  key={s.key}
                  direction="row"
                  gap={2}
                  sx={{ p: 2, borderRadius: `${radius.row}px`, transition: 'background 180ms', '&:hover': { background: c.surfaceRowHover } }}
                >
                  <Box sx={{ width: 32, height: 32, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', background: look.bg, color: look.fg, border: `1px solid ${look.border}` }}>
                    <Icon name={look.icon} size={18} fill={look.fill} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 0.4 }}>{s.name}</Typography>
                    <Typography sx={{ fontSize: 13, color: c.inkMuted }}>{s.type}</Typography>
                  </Box>
                  <Box sx={{ fontSize: 13, color: c.inkMuted, fontFamily: mono, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                    {s.state}
                  </Box>
                </Stack>
              );
            })}
          </Box>

          <Typography variant="h6" sx={{ mb: 1.75 }}>How you are judged</Typography>
          <Stack spacing={1.5} sx={{ mb: 3.5 }}>
            {rubric.map((r) => (
              <Box key={r.id} sx={{ borderRadius: `${radius.tile}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: '18px 20px' }}>
                <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1.5} sx={{ mb: 0.75 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{r.name}</Typography>
                  <Tag>{`${Math.round(r.weight * 100)}%`}</Tag>
                </Stack>
                <Typography sx={{ fontSize: 13, color: c.inkMuted, lineHeight: 1.5 }}>{r.description}</Typography>
              </Box>
            ))}
          </Stack>

          <Box sx={{ borderRadius: `${radius.tile}px`, background: c.surfaceContainer, p: 2.5, mb: 2 }}>
            <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>Timeline</Typography>
            {timeline.map((t) => (
              <Stack key={t.name} direction="row" gap={2} sx={{ py: 1.5, borderBottom: `1px solid ${c.outline}`, '&:last-of-type': { borderBottom: 'none' } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{t.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: c.inkMuted }}>{t.detail}</Typography>
                </Box>
                <Box sx={{ fontFamily: mono, fontSize: 13, color: c.inkMuted, whiteSpace: 'nowrap' }}>{t.date}</Box>
              </Stack>
            ))}
          </Box>
        </Box>

        <Stack component="aside" spacing={2} sx={{ position: { md: 'sticky' }, top: 96 }}>
          <Box sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceContainer, p: 3 }}>
            <Typography variant="overline" sx={{ display: 'block', mb: 1.25 }}>Closes</Typography>
            <Typography sx={{ fontSize: 40, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, mb: 0.5 }}>
              {ch.timeline.submissionClosesAt.split(' ')[0]}
            </Typography>
            <Typography sx={{ fontSize: 13, color: c.inkMuted, mb: 2.5 }}>
              Submissions close {ch.timeline.submissionClosesAt}
            </Typography>
            {closed ? (
              <Box sx={{ borderRadius: `${radius.field}px`, background: c.surfaceCard, p: 2, fontSize: 14, color: c.inkMuted, textAlign: 'center' }}>
                This challenge has finished.
              </Box>
            ) : (
              <Button
                fullWidth
                variant="contained"
                component={Link}
                to={`/c/${ch.slug}/register`}
                sx={{ height: 56, fontSize: 16, boxShadow: shadow.raised }}
              >
                Enter this challenge
              </Button>
            )}
            <Button
              fullWidth
              variant="outlined"
              component={Link}
              to={`/c/${ch.slug}/leaderboard`}
              sx={{ mt: 1.25 }}
              startIcon={<Icon name="leaderboard" size={20} />}
            >
              View leaderboard
            </Button>
          </Box>

          <Stack spacing={2.25} sx={{ borderRadius: `${radius.panel}px`, background: c.surfaceCard, border: `1px solid ${c.outline}`, p: 3 }}>
            {facts.map((f) => (
              <Stack key={f.label} direction="row" gap={1.75} alignItems="flex-start">
                <Icon name={f.icon} size={20} color={c.primaryIcon} />
                <Box>
                  <Typography sx={{ fontSize: 12, color: c.inkFaint, mb: 0.25 }}>{f.label}</Typography>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, textTransform: f.label === 'Visibility' ? 'capitalize' : 'none' }}>
                    {f.value}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Box>
    </>
  );
}

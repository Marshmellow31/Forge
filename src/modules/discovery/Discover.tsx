import { useMemo, useState } from 'react';
import { Box, Button, Stack, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Icon } from '@shared/ui/Icon';
import { useChallenges } from '@core/firebase/hooks';
import { QueryBoundary } from '@shared/ui/QueryBoundary';
import { ChallengeCard } from '@modules/challenges/components';
import { PageTitle, EmptyState } from '@shared/ui/primitives';
import { c, radius, ease } from '@shared/design/tokens';

/** S-03 — Discover. Filter chips are the design's primary control. */
export default function Discover() {
  const { data: challenges = [], isLoading, error } = useChallenges();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const theme = useTheme();
  const isMobile = !useMediaQuery(theme.breakpoints.up('md'));

  const CATEGORIES = useMemo(
    () => ['All', ...new Set(challenges.map((ch) => ch.category))],
    [challenges],
  );

  const results = useMemo(
    () =>
      challenges.filter((ch) => {
        if (ch.status === 'draft') return false;
        if (cat !== 'All' && ch.category !== cat) return false;
        if (q && !`${ch.title} ${ch.description} ${ch.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
          return false;
        return true;
      }),
    [q, cat, challenges],
  );

  const clear = () => {
    setQ('');
    setCat('All');
  };

  return (
    <>
      <PageTitle sub={`${results.length} challenge${results.length === 1 ? '' : 's'} open across every organization on the platform.`}>
        Discover
      </PageTitle>

      {isMobile && (
        <Stack
          direction="row"
          alignItems="center"
          gap={1.5}
          sx={{ height: 52, px: 2.5, borderRadius: '26px', background: c.surfaceField, mb: 2.5 }}
        >
          <Icon name="search" size={22} color={c.inkMuted} />
          <Box
            component="input"
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            placeholder="Search challenges"
            aria-label="Search challenges"
            sx={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, minWidth: 0 }}
          />
        </Stack>
      )}

      <Stack direction="row" gap={1} sx={{ overflowX: 'auto', pb: 1, mb: 3 }}>
        {CATEGORIES.map((name) => {
          const active = cat === name;
          return (
            <Box
              key={name}
              component="button"
              onClick={() => setCat(name)}
              sx={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                height: 40,
                px: active ? 2 : 2.25,
                borderRadius: `${radius.chip}px`,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                transition: `background 180ms ${ease}, border-color 180ms ${ease}`,
                background: active ? c.primaryContainer : 'transparent',
                color: active ? c.onPrimaryContainer : c.inkMuted,
                border: `1px solid ${active ? 'transparent' : c.outline}`,
                '&:hover': { background: active ? c.primaryContainer : c.surfaceField },
              }}
            >
              {active && <Icon name="check" size={18} />}
              {name}
            </Box>
          );
        })}
      </Stack>

      <QueryBoundary isLoading={isLoading} error={error} skeletonHeight={260} skeletonRows={2}>
      {results.length === 0 ? (
        <EmptyState
          icon="travel_explore"
          title={q ? `Nothing matches “${q}”` : 'Nothing matches those filters'}
          body="Try a broader term, or clear the filters to see everything open right now."
          action={<Button variant="contained" onClick={clear}>Clear filters</Button>}
        />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))', gap: 2 }}>
          {results.map((ch) => (
            <ChallengeCard key={ch.id} challenge={ch} to={`/c/${ch.slug}`} />
          ))}
        </Box>
      )}
      </QueryBoundary>
    </>
  );
}

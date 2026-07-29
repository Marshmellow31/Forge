import { Link } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { Hero, Tag, Num, liftSx } from '@shared/ui/primitives';
import { c, radius } from '@app/tokens';
import { badges, certificates } from '@mock/data';

/** S-62 — Achievements. */

const BADGE_ICONS: Record<string, string> = {
  b1: 'rocket_launch',
  b2: 'bolt',
  b3: 'emoji_events',
  b4: 'favorite',
  b5: 'wb_twilight',
  b6: 'directions_run',
  b7: 'stars',
  b8: 'workspace_premium',
  b9: 'military_tech',
};

export default function Awards() {
  const earned = badges.filter((b) => b.earned);

  return (
    <>
      <Hero bg={c.success} blobs={false}>
        <Box sx={{ position: 'absolute', width: 300, height: 280, right: -90, bottom: -120, background: c.primaryContainer, opacity: 0.9, borderRadius: '52% 48% 60% 40%/45% 55% 45% 55%', animation: 'floaty 16s ease-in-out infinite' }} />
        <Box sx={{ position: 'relative' }}>
          <Typography variant="h1" sx={{ fontSize: 'clamp(32px, 4.6vw, 52px)', color: c.onSuccess, mb: 1.25 }}>
            {earned.length} badges.
            <br />
            {certificates.length} certificates.
          </Typography>
          <Typography sx={{ fontSize: 16, color: '#26402C', maxWidth: '40ch' }}>
            Every certificate carries a verification id that anyone can check, forever.
          </Typography>
        </Box>
      </Hero>

      <Typography variant="h6" sx={{ mb: 2 }}>Badges</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 1.5, mb: 4.5 }}>
        {badges.map((b) => (
          <Box
            key={b.id}
            sx={{
              borderRadius: `${radius.tile}px`,
              p: '20px 16px',
              textAlign: 'center',
              background: b.earned ? c.surfaceCard : c.surfaceContainer,
              border: `1px solid ${b.earned ? c.outline : 'transparent'}`,
              opacity: b.earned ? 1 : 0.55,
              transition: 'transform 200ms',
              '&:hover': { transform: 'translateY(-2px)' },
            }}
          >
            <Icon
              name={b.earned ? (BADGE_ICONS[b.id] ?? 'workspace_premium') : 'lock'}
              size={30}
              fill={b.earned}
              color={b.earned ? c.primaryIcon : c.inkFaint}
            />
            <Typography sx={{ fontSize: 13, fontWeight: 600, mt: 1.25, lineHeight: 1.35 }}>{b.name}</Typography>
            <Typography sx={{ fontSize: 11, color: c.inkFaint, mt: 0.5 }}>
              {b.earned ? 'Earned' : 'Locked'}
            </Typography>
          </Box>
        ))}
      </Box>

      <Typography variant="h6" sx={{ mb: 2 }}>Certificates</Typography>
      <Stack spacing={1.5}>
        {certificates.map((cert) => (
          <Stack
            key={cert.id}
            direction="row"
            alignItems="center"
            flexWrap="wrap"
            gap={2.25}
            sx={{
              ...liftSx,
              cursor: 'default',
              borderRadius: `${radius.card}px`,
              background: c.surfaceCard,
              border: `1px solid ${c.outline}`,
              p: 2.5,
              '&:hover': { transform: 'none', boxShadow: 'none' },
            }}
          >
            <Icon name="workspace_premium" size={30} fill color={c.primaryIcon} />
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em', mb: 0.4 }}>
                {cert.challenge}
              </Typography>
              <Typography sx={{ fontSize: 13, color: c.inkMuted }}>
                {cert.org} · {cert.issuedAt}
              </Typography>
            </Box>
            <Tag>{cert.award}</Tag>
            <Box sx={{ color: c.inkFaint }}><Num size={12}>{cert.id}</Num></Box>
            <Button size="small" variant="outlined" component={Link} to={`/verify/${cert.id}`}>
              Verify
            </Button>
          </Stack>
        ))}
      </Stack>
    </>
  );
}

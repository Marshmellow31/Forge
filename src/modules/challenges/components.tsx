import { Link } from 'react-router-dom';
import { Box, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { c as t, radius, coverFor } from '@app/tokens';
import { liftSx as lift } from '@shared/ui/primitives';
import type { Challenge, Stage } from '@shared/types/domain';

const STAGE_LOOK: Record<Stage['state'], { bg: string; fg: string; border: string; icon: string; fill: boolean; labelFg: string }> = {
  done: { bg: t.success, fg: t.successInk, border: 'transparent', icon: 'check', fill: true, labelFg: t.inkMuted },
  active: { bg: t.primary, fg: t.onPrimary, border: 'transparent', icon: 'radio_button_unchecked', fill: false, labelFg: t.ink },
  locked: { bg: 'transparent', fg: t.inkFaint, border: t.outline, icon: 'lock', fill: false, labelFg: t.inkFaint },
};

/** Horizontal stage progression — the design's dot-and-label row. */
export function StageStepper({ stages }: { stages: Stage[]; compact?: boolean }) {
  return (
    <Stack direction="row" sx={{ overflowX: 'auto', pb: 0.5 }}>
      {stages.map((s) => {
        const look = STAGE_LOOK[s.state];
        return (
          <Stack key={s.key} alignItems="center" spacing={1} sx={{ width: 76, flex: 'none' }}>
            <Box
              sx={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: look.bg,
                color: look.fg,
                border: `1px solid ${look.border}`,
              }}
            >
              <Icon name={look.icon} size={15} fill={look.fill} />
            </Box>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: look.labelFg, textAlign: 'center', lineHeight: 1.3 }}>
              {s.name}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

/** Challenge card with the design's tinted cover, blob and footer meta row. */
export function ChallengeCard({ challenge, to }: { challenge: Challenge; to: string }) {
  const ch = challenge;
  return (
    <Box
      component={Link}
      to={to}
      sx={{
        ...lift,
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        borderRadius: `${radius.card}px`,
        overflow: 'hidden',
        background: t.surfaceCard,
        border: `1px solid ${t.outline}`,
        height: '100%',
      }}
    >
      <Box sx={{ height: 112, position: 'relative', overflow: 'hidden', background: coverFor(ch.category) }}>
        <Box
          sx={{
            position: 'absolute',
            width: 160,
            height: 150,
            right: -46,
            top: -56,
            background: 'rgba(255,255,255,.32)',
            borderRadius: '52% 48% 60% 40%/45% 55% 45% 55%',
          }}
        />
        <Box
          component="span"
          sx={{
            position: 'absolute',
            left: 16,
            bottom: 14,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: t.onPrimaryContainer,
            background: 'rgba(255,253,246,.82)',
            px: 1.25,
            py: 0.6,
            borderRadius: '8px',
          }}
        >
          {ch.category}
        </Box>
      </Box>
      <Box sx={{ p: '18px 20px 20px' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em', mb: 1, lineHeight: 1.3 }}>
          {ch.title}
        </Typography>
        <Typography
          sx={{
            fontSize: 13,
            color: t.inkMuted,
            lineHeight: 1.5,
            mb: 2,
            minHeight: 39,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {ch.description}
        </Typography>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ fontSize: 12, color: t.inkMuted }}>
          <Stack direction="row" alignItems="center" gap={0.75}>
            <Icon name="group" size={16} />
            {ch.counters.registrations} entrants
          </Stack>
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ fontWeight: 600, color: t.primaryInk }}>
            <Icon name="schedule" size={16} />
            {ch.timeline.submissionClosesAt}
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}

export function OrgAvatar({ initials, size = 32 }: { color?: string; initials: string; size?: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: `${Math.round(size * 0.34)}px`,
        background: t.inverse,
        color: t.primary,
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.4,
        fontWeight: 800,
      }}
    >
      {initials}
    </Box>
  );
}

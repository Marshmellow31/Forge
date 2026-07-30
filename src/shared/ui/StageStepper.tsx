import { Box, Stack, Typography } from '@mui/material';
import { Icon } from '@shared/ui/Icon';
import { c as t } from '@shared/design/tokens';
import type { Stage } from '@shared/types/domain';

/**
 * `ChallengeCard` used to live here. It moved to `@shared/ui/ChallengeCard`
 * because three separate modules render it, and a module importing another
 * module is the design smell CLAUDE.md names. What is left is genuinely
 * challenge-specific.
 */

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

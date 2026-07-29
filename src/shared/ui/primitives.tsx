import type { ReactNode, CSSProperties } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { Icon } from './Icon';
import { c, radius, shadow, ease, mono, pillFor } from '@shared/design/tokens';

/* ------------------------------------------------------------------ *
 * Shared visual language, imported from the Forge design system.
 * Every component here mirrors a block in the design source; the
 * comment above each one names it.
 * ------------------------------------------------------------------ */

/** Organic background shapes. The design calls these "blobs". Purely decorative. */
export function Blobs({ variant = 'hero' }: { variant?: 'hero' | 'empty' | 'detail' }) {
  const sets: Record<string, CSSProperties[]> = {
    hero: [
      { width: 340, height: 320, right: -90, top: -120, background: c.primary, opacity: 0.85, borderRadius: '52% 48% 60% 40%/45% 55% 45% 55%', animation: 'floaty 14s ease-in-out infinite' },
      { width: 220, height: 210, right: 120, bottom: -110, background: c.success, opacity: 0.75, borderRadius: '60% 40% 45% 55%/50% 60% 40% 50%', animation: 'floaty 18s ease-in-out infinite reverse' },
      { width: 130, height: 130, left: -50, bottom: -60, background: c.surfaceCard, opacity: 0.6, borderRadius: '50% 50% 45% 55%/55% 45% 55% 45%' },
    ],
    empty: [
      { width: 260, height: 240, left: -80, top: -90, background: c.primaryContainer, opacity: 0.8, borderRadius: '52% 48% 60% 40%/45% 55% 45% 55%' },
      { width: 180, height: 170, right: -60, bottom: -70, background: c.success, opacity: 0.7, borderRadius: '60% 40% 45% 55%/50% 60% 40% 50%' },
    ],
    detail: [
      { width: 320, height: 300, right: -90, top: -110, background: 'rgba(255,255,255,.32)', borderRadius: '52% 48% 60% 40%/45% 55% 45% 55%' },
    ],
  };
  return (
    <>
      {sets[variant]!.map((s, i) => (
        <Box key={i} sx={{ position: 'absolute', pointerEvents: 'none', ...s }} />
      ))}
    </>
  );
}

/** The large rounded banner at the top of Home, Awards and challenge detail. */
export function Hero({
  bg = c.primaryContainer,
  blobs = 'hero',
  children,
}: {
  bg?: string;
  blobs?: 'hero' | 'detail' | false;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: `${radius.hero}px`,
        background: bg,
        p: { xs: '32px 24px', md: '48px 44px' },
        mb: 3.5,
      }}
    >
      {blobs && <Blobs variant={blobs} />}
      <Box sx={{ position: 'relative' }}>{children}</Box>
    </Box>
  );
}

/** Page heading — the design's h1 with its display sizing. */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <Box sx={{ mb: sub ? 3 : 2 }}>
      <Typography variant="h2" sx={{ fontSize: 'clamp(30px, 3.8vw, 44px)' }}>
        {children}
      </Typography>
      {sub && (
        <Typography sx={{ mt: 1, fontSize: 16, color: c.inkMuted }}>{sub}</Typography>
      )}
    </Box>
  );
}

/** Section heading with an optional trailing text action. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 2 }}>
      <Typography variant="h5">{children}</Typography>
      {action}
    </Stack>
  );
}

/** All-caps eyebrow label used above stats and panel titles. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <Typography variant="overline" sx={{ display: 'block' }}>{children}</Typography>;
}

/** Big-number stat card. `tone` picks one of the design's three card fills. */
export function StatTile({
  label,
  value,
  icon,
  delta,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  icon?: string;
  delta?: number;
  tone?: 'default' | 'primary' | 'success' | 'container';
}) {
  const FILLS = {
    default: { bg: c.surfaceCard, border: c.outline },
    primary: { bg: c.primaryContainer, border: 'transparent' },
    success: { bg: c.success, border: 'transparent' },
    container: { bg: c.surfaceContainer, border: 'transparent' },
  };
  // Fall back rather than throw: a stat tile is never worth crashing a page over.
  const fills = FILLS[tone] ?? FILLS.default;

  return (
    <Box
      sx={{
        borderRadius: `${radius.tile}px`,
        p: 2.5,
        background: fills.bg,
        border: `1px solid ${fills.border}`,
        transition: `transform 200ms ${ease}`,
        '&:hover': { transform: 'translateY(-2px)' },
      }}
    >
      {icon ? (
        <Icon name={icon} size={22} color={c.inkMuted} />
      ) : (
        <Eyebrow>{label}</Eyebrow>
      )}
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: icon ? 1.25 : 1.5 }}>
        <Typography sx={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1 }}>
          {value}
        </Typography>
        {delta !== undefined && (
          <Stack
            direction="row"
            alignItems="center"
            sx={{ fontSize: 12, fontWeight: 700, color: delta >= 0 ? c.successInk : c.errorInk }}
          >
            <Icon name={delta >= 0 ? 'trending_up' : 'trending_down'} size={15} />
            {delta > 0 ? `+${delta}` : delta}
          </Stack>
        )}
      </Stack>
      {icon && (
        <Typography sx={{ fontSize: 13, color: c.inkMuted, mt: 0.75 }}>{label}</Typography>
      )}
    </Box>
  );
}

/** Uppercase status badge. Colours come from tokens.statusPill. */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const { bg, fg } = pillFor(status);
  return (
    <Box
      component="span"
      sx={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        px: 1.25,
        py: 0.5,
        borderRadius: '8px',
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
      }}
    >
      {label ?? status}
    </Box>
  );
}

/** Small emphasis badge (weights, awards, "required", "conditional"). */
export function Tag({
  children,
  bg = c.primaryContainer,
  fg = c.onPrimaryContainer,
}: {
  children: ReactNode;
  bg?: string;
  fg?: string;
}) {
  return (
    <Box
      component="span"
      sx={{ fontSize: 11, fontWeight: 700, px: 1.1, py: 0.5, borderRadius: '8px', background: bg, color: fg, whiteSpace: 'nowrap' }}
    >
      {children}
    </Box>
  );
}

/** Labelled progress track. */
export function ProgressBar({
  value,
  label,
  right,
  color = c.accent,
  track = c.track,
}: {
  value: number;
  label?: string;
  right?: ReactNode;
  color?: string;
  track?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <Box>
      {(label || right) && (
        <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 12, color: c.inkMuted, mb: 1 }}>
          <span>{label}</span>
          <Box component="span" sx={{ fontWeight: 700, color: c.ink }}>{right ?? `${pct}%`}</Box>
        </Stack>
      )}
      <Box sx={{ height: 8, borderRadius: '4px', background: track, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', borderRadius: '4px', background: color, width: `${pct}%`, transition: `width 400ms ${ease}` }} />
      </Box>
    </Box>
  );
}

/** Full-bleed empty state on a container surface, with decorative blobs. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: `${radius.panel}px`,
        background: c.surfaceContainer,
        p: { xs: '56px 24px', md: '72px 32px' },
        textAlign: 'center',
      }}
    >
      <Blobs variant="empty" />
      <Box sx={{ position: 'relative' }}>
        <Icon name={icon} size={56} color={c.primaryIcon} />
        <Typography sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em', mt: 2, mb: 1 }}>
          {title}
        </Typography>
        {body && (
          <Typography sx={{ fontSize: 15, color: c.inkMuted, maxWidth: '38ch', mx: 'auto', mb: 3 }}>
            {body}
          </Typography>
        )}
        {action}
      </Box>
    </Box>
  );
}

/** Card surface used for panels that are not MUI <Card>s. */
export const panelSx = {
  borderRadius: `${radius.panel}px`,
  background: c.surfaceCard,
  border: `1px solid ${c.outline}`,
  p: 3,
} as const;

/** Tinted container panel (the design's #F5EDDA blocks). */
export const containerSx = {
  borderRadius: `${radius.panel}px`,
  background: c.surfaceContainer,
  p: 3,
} as const;

/** Hover treatment shared by every clickable card. */
export const liftSx = {
  cursor: 'pointer',
  transition: `box-shadow 220ms ${ease}, transform 220ms ${ease}`,
  '&:hover': { boxShadow: shadow.card, transform: 'translateY(-3px)' },
} as const;

/** Header row for the design's list tables. */
export function TableHead({ cols }: { cols: { label: string; width?: number; align?: 'right' }[] }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        px: 3,
        py: 2,
        background: c.surfaceContainer,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: c.inkFaint,
      }}
    >
      {cols.map((col) => (
        <Box
          key={col.label}
          component="span"
          sx={
            col.width
              ? { width: col.width, textAlign: col.align, flex: 'none' }
              : { flex: 1, minWidth: 0 }
          }
        >
          {col.label}
        </Box>
      ))}
    </Stack>
  );
}

/** A single body row of a list table. */
export const tableRowSx = {
  display: 'flex',
  gap: 2,
  alignItems: 'center',
  px: 3,
  py: 2,
  borderTop: `1px solid ${c.outlineSoft}`,
  transition: 'background 160ms',
  '&:hover': { background: c.surfaceRowHover },
} as const;

/** Monospaced numeric cell — the design uses IBM Plex Mono for all figures. */
export function Num({ children, size = 14 }: { children: ReactNode; size?: number }) {
  return <Box component="span" sx={{ fontFamily: mono, fontSize: size }}>{children}</Box>;
}

export function PersonCell({ name, sub }: { name: string; color?: string; sub?: string }) {
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2);
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
      <Box
        sx={{
          width: 32,
          height: 32,
          flex: 'none',
          borderRadius: '50%',
          background: c.inverse,
          color: c.primary,
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {initials}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>{name}</Typography>
        {sub && (
          <Typography variant="caption" sx={{ color: c.inkFaint, display: 'block' }} noWrap>
            {sub}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

/**
 * A missing review must never read as a zero score.
 * See docs/SPEC_SCORING.md §8.
 */
export function ScoreCell({
  score, provisional, done, total,
}: { score: number | null; provisional: boolean; done: number; total: number }) {
  if (score === null) {
    return <Typography variant="caption" sx={{ color: c.inkFaint }}>Not scored</Typography>;
  }
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end">
      <Num size={15}>{score.toFixed(1)}</Num>
      {provisional && (
        <Tooltip title={`Only ${done} of ${total} reviews in — this is provisional, not a final score`}>
          <Box component="span" sx={{ display: 'flex' }}>
            <Tag bg={c.primary} fg={c.onPrimary}>{`${done}/${total}`}</Tag>
          </Box>
        </Tooltip>
      )}
    </Stack>
  );
}

/** Loading skeleton block, matching the design's shimmer. */
export function ListSkeleton({ rows = 5, height = 96 }: { rows?: number; height?: number }) {
  return (
    <Stack spacing={1.5}>
      {Array.from({ length: rows }, (_, i) => (
        <Box key={i} className="shimmer" sx={{ height, borderRadius: `${radius.card}px` }} />
      ))}
    </Stack>
  );
}

export const statusColor: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'info' | 'error'> = {
  draft: 'default',
  published: 'info',
  running: 'primary',
  judging: 'warning',
  completed: 'success',
  active: 'primary',
  pending: 'warning',
  eliminated: 'default',
  winner: 'success',
  submitted: 'info',
  underReview: 'warning',
  reviewed: 'success',
};

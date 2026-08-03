/**
 * Design tokens — Forge, Material Design 3 (expressive) warm amber scheme.
 *
 * Imported from the Agent Design project "Material Design 3 SaaS UI"
 * (`Forge.dc.html`). These are the single source of truth for colour, radius,
 * elevation and motion. Do not hardcode a hex anywhere else; add a token here.
 */

export const c = {
  /* surfaces */
  surface: '#FDF8EC',
  surfaceCard: '#FFFDF6',
  surfaceContainer: '#F5EDDA',
  surfaceField: '#F0E7D2',
  surfaceFieldHover: '#EAE1CA',
  surfaceRowHover: '#FAF3E2',
  surfaceNavHover: '#EDE4CC',

  /* lines */
  outline: '#E7DFC8',
  outlineSoft: '#EFE7D4',
  outlineStrong: '#A79A6A',
  outlineField: '#7D7767',

  /* text */
  ink: '#1D1B13',
  inkBody: '#332F22',
  inkMuted: '#4B4739',
  inkFaint: '#6D6650',

  /* primary — amber */
  primary: '#F3DC85',
  primaryHover: '#E9D174',
  onPrimary: '#3B2F00',
  primaryContainer: '#FFF1B9',
  onPrimaryContainer: '#241A00',
  primaryInk: '#5B4A00',
  primaryIcon: '#8A7523',
  accent: '#E5CB63',

  /* inverse — the near-black used for high-emphasis buttons */
  inverse: '#241A00',
  onInverse: '#FFF1B9',
  inverseSurface: '#332F22',
  onInverseSurface: '#F7F0DE',

  /* status */
  success: '#CDE3CB',
  onSuccess: '#0E2814',
  successInk: '#0E5B2E',
  error: '#B3261E',
  errorContainer: '#F9DEDC',
  onErrorContainer: '#410E0B',
  errorInk: '#8C1D18',
  errorBody: '#5F1512',

  /* misc */
  track: '#EAE1CA',
  trackAlt: '#E3D9BF',
  scrim: 'rgba(29,27,19,.4)',
} as const;

/** Category cover colours, used for challenge card headers and list swatches. */
export const covers: Record<string, string> = {
  Photography: '#CDE3CB',
  Hackathon: '#F3DC85',
  Wellness: '#E7D8B2',
  Design: '#F0D8BE',
  Data: '#C7DEE8',
  Community: '#EFD3CE',
  Pitch: '#DCD3EF',
};

export const coverFor = (category: string) => covers[category] ?? '#E7D8B2';

export const radius = {
  hero: 32,
  panel: 28,
  card: 24,
  tile: 20,
  row: 18,
  field: 16,
  chip: 12,
  pill: 999,
} as const;

export const shadow = {
  raised: '0 1px 2px rgba(60,50,10,.16),0 1px 3px rgba(60,50,10,.10)',
  hover: '0 4px 14px rgba(60,50,10,.10)',
  card: '0 6px 18px rgba(60,50,10,.10)',
  fab: '0 3px 8px rgba(60,50,10,.20),0 1px 3px rgba(60,50,10,.14)',
  fabHover: '0 6px 16px rgba(60,50,10,.24)',
  dialog: '0 8px 28px rgba(29,27,19,.24)',
  snack: '0 4px 14px rgba(29,27,19,.28)',
} as const;

/** M3 standard easing. Every transition in the design uses it. */
export const ease = 'cubic-bezier(.2,0,0,1)';
export const mono = "'IBM Plex Mono',monospace";

/** Status pill colours, keyed by the app's ChallengeStatus values. */
export const statusPill: Record<string, { bg: string; fg: string }> = {
  draft: { bg: c.surfaceField, fg: c.inkMuted },
  published: { bg: c.success, fg: c.onSuccess },
  running: { bg: c.primaryContainer, fg: c.onPrimaryContainer },
  judging: { bg: c.primary, fg: c.onPrimary },
  completed: { bg: c.surfaceField, fg: c.inkMuted },
  /* submission states */
  submitted: { bg: c.primaryContainer, fg: c.onPrimaryContainer },
  underReview: { bg: c.primary, fg: c.onPrimary },
  reviewed: { bg: c.success, fg: c.onSuccess },
  draftEntry: { bg: c.surfaceField, fg: c.inkMuted },
  /* registration states — the admin roster (ADR-025). `disqualified` is the
     only one in the error palette: it is the only one that is a *decision made
     about* the participant rather than a place they reached. */
  pending: { bg: c.surfaceField, fg: c.inkMuted },
  active: { bg: c.primaryContainer, fg: c.onPrimaryContainer },
  winner: { bg: c.success, fg: c.onSuccess },
  eliminated: { bg: c.surfaceField, fg: c.inkMuted },
  withdrawn: { bg: c.surfaceField, fg: c.inkMuted },
  disqualified: { bg: c.errorContainer, fg: c.errorInk },
  suspended: { bg: c.errorContainer, fg: c.errorInk },
};

export const pillFor = (status: string) =>
  statusPill[status] ?? { bg: c.surfaceField, fg: c.inkMuted };

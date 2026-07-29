import { createTheme } from '@mui/material/styles';
import { c, radius, shadow, ease } from '@shared/design/tokens';

/**
 * MUI theme derived from the Forge design tokens (Material Design 3 expressive,
 * warm amber scheme). Every value here comes from `tokens.ts` — see the note at
 * the top of that file before adding a colour.
 *
 * Org branding is applied at runtime via CSS custom properties, so a tenant
 * can recolour the whole app without a rebuild. See CONVENTIONS.md §7.
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: c.primary, dark: c.primaryHover, light: c.primaryContainer, contrastText: c.onPrimary },
    secondary: { main: c.inverse, contrastText: c.onInverse },
    success: { main: c.successInk, light: c.success, contrastText: c.onSuccess },
    warning: { main: c.primaryIcon, light: c.primaryContainer, contrastText: c.onPrimaryContainer },
    error: { main: c.error, light: c.errorContainer, contrastText: c.onErrorContainer },
    info: { main: c.primaryInk },
    background: { default: c.surface, paper: c.surfaceCard },
    text: { primary: c.ink, secondary: c.inkMuted, disabled: c.inkFaint },
    divider: c.outline,
  },
  shape: { borderRadius: radius.field },
  typography: {
    fontFamily: 'Figtree, system-ui, sans-serif',
    // The design's display sizes: tight tracking, heavy weight, balanced wrap.
    h1: { fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.06 },
    h2: { fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.08 },
    h3: { fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 },
    h4: { fontWeight: 700, letterSpacing: '-0.025em' },
    h5: { fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 700, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 600 },
    body1: { fontSize: 15, lineHeight: 1.55 },
    body2: { fontSize: 13, lineHeight: 1.5 },
    caption: { fontSize: 12 },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: {
      fontWeight: 700,
      letterSpacing: '0.09em',
      fontSize: 11,
      lineHeight: 1.4,
      color: c.inkFaint,
    },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: radius.card,
          border: `1px solid ${c.outline}`,
          background: c.surfaceCard,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        // M3 buttons are pills, and taller than MUI's default.
        root: { borderRadius: radius.pill, height: 48, paddingInline: 24, fontSize: 15 },
        sizeSmall: { height: 40, paddingInline: 18, fontSize: 13 },
        sizeLarge: { height: 56, paddingInline: 28, fontSize: 16 },
        contained: {
          boxShadow: shadow.raised,
          transition: `background 180ms ${ease}, box-shadow 180ms ${ease}`,
          '&:hover': { boxShadow: '0 3px 10px rgba(60,50,10,.18)' },
        },
        outlined: {
          borderColor: c.outlineStrong,
          color: c.onPrimary,
          '&:hover': { borderColor: c.outlineStrong, background: 'rgba(36,26,0,.05)' },
        },
        text: { color: c.primaryInk, '&:hover': { background: c.surfaceField } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: c.inkMuted,
          transition: `background 180ms ${ease}`,
          '&:hover': { background: c.surfaceField },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: radius.chip },
        outlined: { borderColor: c.outline },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 0, borderBottom: `1px solid ${c.outline}` },
        indicator: { height: 3, borderRadius: '3px 3px 0 0', background: c.accent },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: 14,
          minHeight: 54,
          padding: '16px 20px',
          color: c.inkMuted,
          '&.Mui-selected': { color: c.ink },
        },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: {
        tooltip: { background: c.inverseSurface, color: c.onInverseSurface, fontSize: 12 },
        arrow: { color: c.inverseSurface },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: c.outline } } },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 8, borderRadius: 4, background: c.track },
        bar: { borderRadius: 4, background: c.accent },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: c.accent, height: 6 },
        rail: { background: c.trackAlt, opacity: 1 },
        thumb: {
          width: 18,
          height: 18,
          background: c.accent,
          border: `2px solid ${c.surfaceCard}`,
          '&:hover, &.Mui-focusVisible': { boxShadow: '0 0 0 8px rgba(229,203,99,.24)' },
        },
        valueLabel: { background: c.inverse, color: c.onInverse, fontWeight: 600 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: radius.panel,
          background: c.surface,
          boxShadow: shadow.dialog,
          padding: 4,
        },
      },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          borderRadius: radius.chip,
          background: c.inverseSurface,
          color: c.onInverseSurface,
          boxShadow: shadow.snack,
        },
      },
    },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: radius.row } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: radius.tile },
        standardError: { background: c.errorContainer, color: c.onErrorContainer },
        standardSuccess: { background: c.success, color: c.onSuccess },
        standardWarning: { background: c.primaryContainer, color: c.onPrimaryContainer },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: radius.chip, background: c.surfaceCard } },
    },
    /* M3 filled text field: rounded top, flat bottom, 2px active underline. */
    MuiTextField: { defaultProps: { variant: 'filled' } },
    MuiFilledInput: {
      defaultProps: { disableUnderline: false },
      styleOverrides: {
        root: {
          borderRadius: `${radius.field}px ${radius.field}px 4px 4px`,
          background: c.surfaceField,
          transition: `background 180ms ${ease}`,
          '&:hover': { background: '#EFE6D0' },
          '&.Mui-focused': { background: c.surfaceFieldHover },
          '&:before': { borderBottom: `2px solid ${c.outlineField}` },
          '&:hover:not(.Mui-disabled, .Mui-error):before': { borderBottom: `2px solid ${c.outlineField}` },
          '&:after': { borderBottom: `2px solid ${c.accent}` },
        },
        input: { fontSize: 16 },
      },
    },
    MuiInputLabel: {
      styleOverrides: { filled: { fontWeight: 500, color: c.inkMuted, '&.Mui-focused': { color: c.primaryInk } } },
    },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 16, fontSize: 12 } } },
    MuiCheckbox: { styleOverrides: { root: { color: c.outlineField, '&.Mui-checked': { color: c.primaryIcon } } } },
    MuiRadio: { styleOverrides: { root: { color: c.outlineField, '&.Mui-checked': { color: c.primaryIcon } } } },
    MuiRating: { styleOverrides: { iconFilled: { color: c.accent } } },
    MuiAccordion: { styleOverrides: { root: { background: 'transparent' } } },
    MuiAvatar: { styleOverrides: { root: { fontWeight: 700, fontSize: 14 } } },
  },
});

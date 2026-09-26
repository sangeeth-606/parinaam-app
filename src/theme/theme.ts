/**
 * Parinaam Design System — centralized semantic theme tokens.
 *
 * The application has one theme model with two resolved palettes:
 *   - light: the existing high-contrast evidentiary review surface
 *   - dark:  the institutional deep-navy field instrument surface
 *
 * Components consume the semantic roles exposed by this module. Raw color
 * ramps live in palette.ts; no screen should introduce a second theme.
 */

import {
  slate,
  navy,
  gold,
  sky,
  emerald,
  amber,
  red,
  colorimeterNeutral,
  statutoryAmber,
} from './palette.ts';
import {
  space,
  radius,
  lineWidth,
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
  fontFamily,
  duration,
  easing,
  press,
  target,
  z,
  tabbarHeight,
  headerHeight,
} from './tokens.ts';

export type ThemeMode = 'light' | 'dark';
/** The two appearance choices the officer can pick in Settings. */
export type ThemePreference = ThemeMode;

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'reaction'
  | 'noReaction'
  | 'attention'
  | 'ok'
  | 'fail'
  | 'positive'
  | 'negative'
  | 'inconclusive'
  | 'warning'
  | 'danger';

export interface ThemeColors {
  // Structural surfaces
  canvas: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  card: string;
  cardSubtle: string;
  borderSubtle: string;
  border: string;
  borderStrong: string;
  scrim: string;
  overlay: string;

  // Typography
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  textInverse: string;
  textFaint: string;
  onAccent: string;
  onBrandSolid: string;

  // Brand and action states
  brand: string;
  brandStrong: string;
  brandSolid: string;
  brandSolidPressed: string;
  brandDim: string;
  accent: string;
  accentSurface: string;

  // Semantic record/gate states
  reaction: string;
  reactionDim: string;
  noReaction: string;
  noReactionDim: string;
  attention: string;
  attentionDim: string;
  ok: string;
  okStrong: string;
  okDim: string;
  fail: string;
  failStrong: string;
  failDim: string;
  positive: string;
  positiveStrong: string;
  positiveDim: string;
  negative: string;
  negativeDim: string;
  warning: string;
  warningStrong: string;
  warningDim: string;
  danger: string;
  dangerStrong: string;
  dangerDim: string;
  successSurface: string;
  successBorder: string;
  successText: string;
  successIcon: string;
  marginalSurface: string;
  marginalBorder: string;
  marginalText: string;
  marginalIcon: string;
  dangerSurface: string;
  dangerBorder: string;
  dangerText: string;
  dangerIcon: string;
  neutralSurface: string;
  neutralText: string;

  // Fixed presentation surfaces
  terminalPanel: string;
  terminalText: string;
  /** Muted metadata inside the fixed terminal panel (never inverted by mode). */
  terminalMuted: string;
  colorimeter: string;
  colorimeterHairline: string;
  statutoryBackground: string;
  statutoryAccent: string;
  statutoryForeground: string;

  // Camera/HUD
  /** Letterbox behind the viewfinder — black in both modes, like a real camera. */
  cameraBackdrop: string;
  hudScrim: string;
  hudGlass: string;
  hudReticle: string;
}

export type BadgeToneTokens = Record<BadgeTone, { bg: string; fg: string; border: string }>;

/** Typography roles → ready-to-spread TextStyle presets. */
export const type = {
  display: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.tight,
  },
  title: {
    fontSize: fontSize.title,
    lineHeight: lineHeight.title,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.snug,
  },
  headline: {
    fontSize: fontSize.headline,
    lineHeight: lineHeight.headline,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.snug,
  },
  subhead: {
    fontSize: fontSize.subhead,
    lineHeight: lineHeight.subhead,
    fontWeight: fontWeight.semibold,
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.regular,
  },
  bodyStrong: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.semibold,
  },
  caption: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.regular,
  },
  captionStrong: {
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.semibold,
  },
  micro: {
    fontSize: fontSize.micro,
    lineHeight: lineHeight.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.overline,
    textTransform: 'uppercase' as const,
  },
  metric: {
    fontSize: fontSize.metric,
    lineHeight: lineHeight.metric,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
  },
  metricSm: {
    fontSize: fontSize.body,
    lineHeight: lineHeight.body,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums' as const],
  },
  mono: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.medium,
  },
  monoSm: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.micro,
    lineHeight: lineHeight.caption,
    fontWeight: fontWeight.medium,
  },
} as const;

const lightColors: ThemeColors = {
  canvas: slate[50],
  surface: '#FFFFFF',
  surfaceRaised: slate[100],
  surfaceSunken: slate[100],
  card: '#FFFFFF',
  cardSubtle: slate[100],
  borderSubtle: slate[200],
  border: slate[300],
  borderStrong: slate[400],
  scrim: 'rgba(15, 23, 42, 0.55)',
  overlay: 'rgba(15, 23, 42, 0.12)',

  textPrimary: slate[900],
  textSecondary: slate[700],
  textTertiary: slate[500],
  textMuted: slate[600],
  textInverse: slate[50],
  textFaint: slate[400],
  onAccent: '#FFFFFF',
  onBrandSolid: '#FFFFFF',

  brand: sky[400],
  brandStrong: sky[500],
  brandSolid: '#1E3A8A',
  brandSolidPressed: '#172B68',
  brandDim: 'rgba(56, 189, 248, 0.14)',
  accent: '#1E3A8A',
  accentSurface: '#EFF6FF',

  reaction: sky[600],
  reactionDim: 'rgba(2, 132, 199, 0.10)',
  noReaction: slate[600],
  noReactionDim: 'rgba(100, 116, 139, 0.12)',
  attention: amber[600],
  attentionDim: 'rgba(217, 119, 6, 0.12)',
  ok: emerald[600],
  okStrong: emerald[900],
  okDim: 'rgba(5, 150, 105, 0.12)',
  fail: red[600],
  failStrong: red[900],
  failDim: 'rgba(220, 38, 38, 0.10)',
  positive: emerald[600],
  positiveStrong: emerald[900],
  positiveDim: 'rgba(5, 150, 105, 0.12)',
  negative: slate[600],
  negativeDim: 'rgba(100, 116, 139, 0.12)',
  warning: amber[600],
  warningStrong: amber[800],
  warningDim: 'rgba(217, 119, 6, 0.12)',
  danger: red[600],
  dangerStrong: red[900],
  dangerDim: 'rgba(220, 38, 38, 0.10)',
  successSurface: '#F0FDF4',
  successBorder: emerald[600],
  successText: emerald[900],
  successIcon: '#15803D',
  marginalSurface: '#FFFBEB',
  marginalBorder: amber[600],
  marginalText: amber[900],
  marginalIcon: '#B45309',
  dangerSurface: '#FEF2F2',
  dangerBorder: red[600],
  dangerText: red[900],
  dangerIcon: '#B91C1C',
  neutralSurface: slate[200],
  neutralText: slate[900],

  terminalPanel: slate[900],
  terminalText: slate[50],
  terminalMuted: slate[400],
  colorimeter: colorimeterNeutral.panel,
  colorimeterHairline: colorimeterNeutral.hairline,
  statutoryBackground: statutoryAmber.background,
  statutoryAccent: statutoryAmber.accentBorder,
  statutoryForeground: statutoryAmber.foreground,

  cameraBackdrop: '#000000',
  hudScrim: 'rgba(6, 11, 22, 0.78)',
  hudGlass: 'rgba(17, 26, 43, 0.86)',
  hudReticle: 'rgba(56, 189, 248, 0.85)',
};

const darkColors: ThemeColors = {
  canvas: navy[900],
  surface: navy[800],
  surfaceRaised: navy[750],
  surfaceSunken: navy[950],
  card: navy[800],
  cardSubtle: navy[850],
  borderSubtle: 'rgba(168, 190, 207, 0.12)',
  border: 'rgba(168, 190, 207, 0.20)',
  borderStrong: 'rgba(168, 190, 207, 0.34)',
  scrim: 'rgba(1, 8, 17, 0.78)',
  overlay: 'rgba(1, 8, 17, 0.28)',

  textPrimary: navy[100],
  textSecondary: navy[200],
  textTertiary: navy[300],
  textMuted: navy[300],
  textInverse: navy[900],
  textFaint: navy[400],
  onAccent: navy[900],
  onBrandSolid: navy[900],

  brand: gold[400],
  brandStrong: gold[300],
  brandSolid: gold[400],
  brandSolidPressed: gold[500],
  brandDim: 'rgba(245, 184, 61, 0.16)',
  accent: gold[400],
  accentSurface: 'rgba(245, 184, 61, 0.14)',

  reaction: sky[400],
  reactionDim: 'rgba(56, 189, 248, 0.15)',
  noReaction: navy[300],
  noReactionDim: 'rgba(168, 190, 207, 0.12)',
  attention: gold[400],
  attentionDim: 'rgba(245, 184, 61, 0.15)',
  ok: '#5EE0AE',
  okStrong: '#86EFAC',
  okDim: 'rgba(94, 224, 174, 0.14)',
  fail: '#FF8B9B',
  failStrong: '#FDA4AF',
  failDim: 'rgba(255, 139, 155, 0.14)',
  positive: '#5EE0AE',
  positiveStrong: '#86EFAC',
  positiveDim: 'rgba(94, 224, 174, 0.14)',
  negative: navy[300],
  negativeDim: 'rgba(168, 190, 207, 0.12)',
  warning: gold[400],
  warningStrong: gold[300],
  warningDim: 'rgba(245, 184, 61, 0.15)',
  danger: '#FF8B9B',
  dangerStrong: '#FDA4AF',
  dangerDim: 'rgba(255, 139, 155, 0.14)',
  successSurface: 'rgba(20, 83, 77, 0.42)',
  successBorder: '#3DD6A0',
  successText: '#A7F3D0',
  successIcon: '#6EE7B7',
  marginalSurface: 'rgba(111, 75, 16, 0.42)',
  marginalBorder: gold[400],
  marginalText: gold[300],
  marginalIcon: gold[300],
  dangerSurface: 'rgba(111, 36, 51, 0.46)',
  dangerBorder: '#F28B9A',
  dangerText: '#FFC1C8',
  dangerIcon: '#FDA4AF',
  neutralSurface: navy[700],
  neutralText: navy[100],

  terminalPanel: '#071421',
  terminalText: navy[100],
  terminalMuted: slate[400],
  colorimeter: colorimeterNeutral.panel,
  colorimeterHairline: colorimeterNeutral.hairline,
  statutoryBackground: statutoryAmber.background,
  statutoryAccent: statutoryAmber.accentBorder,
  statutoryForeground: statutoryAmber.foreground,

  cameraBackdrop: '#000000',
  hudScrim: 'rgba(1, 8, 17, 0.78)',
  hudGlass: 'rgba(6, 27, 46, 0.90)',
  hudReticle: 'rgba(245, 184, 61, 0.88)',
};

function createBadgeTones(colors: ThemeColors): BadgeToneTokens {
  return {
    neutral: { bg: colors.neutralSurface, fg: colors.neutralText, border: colors.border },
    brand: { bg: colors.brandDim, fg: colors.brand, border: colors.brand },
    reaction: { bg: colors.reactionDim, fg: colors.reaction, border: colors.reaction },
    noReaction: { bg: colors.noReactionDim, fg: colors.noReaction, border: colors.border },
    attention: { bg: colors.attentionDim, fg: colors.attention, border: colors.attention },
    ok: { bg: colors.okDim, fg: colors.ok, border: colors.ok },
    fail: { bg: colors.failDim, fg: colors.fail, border: colors.fail },
    positive: { bg: colors.positiveDim, fg: colors.positive, border: colors.positive },
    negative: { bg: colors.negativeDim, fg: colors.negative, border: colors.border },
    inconclusive: { bg: colors.warningDim, fg: colors.warning, border: colors.warning },
    warning: { bg: colors.warningDim, fg: colors.warning, border: colors.warning },
    danger: { bg: colors.dangerDim, fg: colors.danger, border: colors.danger },
  };
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  badgeTones: BadgeToneTokens;
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
  lineWidth: typeof lineWidth;
  fontSize: typeof fontSize;
  lineHeight: typeof lineHeight;
  fontWeight: typeof fontWeight;
  fontFamily: typeof fontFamily;
  letterSpacing: typeof letterSpacing;
  duration: typeof duration;
  easing: typeof easing;
  press: typeof press;
  target: typeof target;
  z: typeof z;
  layout: {
    gutter: number;
    cardPad: number;
    sectionGap: number;
    cardGap: number;
    tabbarHeight: number;
    headerHeight: number;
  };
}

function createTheme(mode: ThemeMode, colors: ThemeColors): Theme {
  return {
    mode,
    colors,
    badgeTones: createBadgeTones(colors),
    type,
    space,
    radius,
    lineWidth,
    fontSize,
    lineHeight,
    fontWeight,
    fontFamily,
    letterSpacing,
    duration,
    easing,
    press,
    target,
    z,
    layout: {
      gutter: space.lg,
      cardPad: space.lg,
      sectionGap: space['2xl'],
      cardGap: space.md,
      tabbarHeight,
      headerHeight,
    },
  };
}

export const lightTheme = createTheme('light', lightColors);
export const darkTheme = createTheme('dark', darkColors);

/** Legacy exports remain available while all runtime components use the context. */
export const theme = lightTheme;
export const colors = lightTheme.colors;
export const badgeTones = lightTheme.badgeTones;
export type FontRole = keyof typeof type;
export type { TextStyle } from 'react-native';

/** Legacy static hook; runtime code should use useAppTheme from theme-context. */
export function useTheme(): Theme {
  return lightTheme;
}

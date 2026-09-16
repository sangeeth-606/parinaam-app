/**
 * Parinaam Design System — Semantic theme.
 *
 * Single dark "Field Instrument" theme (docs/redesign/03-design-system.md).
 * All UI must consume `theme.colors`, `theme.type`, `theme.space`, etc.
 */

import {
  slate,
  sky,
  emerald,
  amber,
  red,
  colorimeterNeutral,
  statutoryAmber,
} from './palette';
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
} from './tokens';

export const colors = {
  // Structure
  canvas: slate[900],
  surface: slate[850],
  surfaceRaised: slate[800],
  surfaceSunken: slate[950],
  /** Dark-theme borders: semi-transparent white hairlines (open-design craft/color.md —
   *  never muddy solid-dark borders on dark surfaces). */
  borderSubtle: 'rgba(255, 255, 255, 0.05)',
  border: 'rgba(255, 255, 255, 0.09)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  scrim: 'rgba(4, 8, 16, 0.85)',

  // Text
  textPrimary: slate[100],
  textSecondary: slate[300],
  textTertiary: slate[400],
  textInverse: slate[900],
  textFaint: slate[500],

  // Brand
  brand: sky[400],
  brandStrong: sky[500],
  brandSolid: sky[600],
  brandSolidPressed: sky[700],
  brandDim: 'rgba(56, 189, 248, 0.14)',
  onBrandSolid: '#FFFFFF',

  // Semantic — EVIDENTIARY COLOR LAW (docs/redesign/03-design-system.md §1):
  // Outcome tones are RECORDS, not verdicts (never good/bad framing — hard constraint 7):
  //   reaction    = brand cyan  (a colour response occurred — operational signal)
  //   noReaction  = neutral slate (absence of response)
  //   attention   = amber (inconclusive / degraded / administrative guidance)
  // Integrity & gate states are the ONLY green/red users:
  //   ok / fail   = emerald / red (chain verified · gate passed · tamper · refusal)
  reaction: sky[400],
  reactionDim: 'rgba(56, 189, 248, 0.14)',
  noReaction: slate[300],
  noReactionDim: 'rgba(166, 180, 200, 0.10)',
  attention: amber[400],
  attentionDim: 'rgba(251, 191, 36, 0.12)',
  ok: emerald[400],
  okStrong: emerald[600],
  okDim: 'rgba(52, 211, 153, 0.13)',
  /** RED = integrity failure only. */
  fail: red[400],
  failStrong: red[600],
  failDim: 'rgba(248, 113, 113, 0.12)',
  // Legacy aliases (gates/HUD keep semantic pass/warn/danger)
  positive: emerald[400],
  positiveStrong: emerald[600],
  positiveDim: 'rgba(52, 211, 153, 0.13)',
  negative: slate[300],
  negativeDim: 'rgba(166, 180, 200, 0.12)',
  warning: amber[400],
  warningStrong: amber[500],
  warningDim: 'rgba(251, 191, 36, 0.12)',
  danger: red[400],
  dangerStrong: red[600],
  dangerDim: 'rgba(248, 113, 113, 0.12)',

  // Fixed-surround panel for colorimetry swatches (never themed)
  colorimeter: colorimeterNeutral.panel,
  colorimeterHairline: colorimeterNeutral.hairline,

  // Statutory, spec-locked (forbidden-claims.md §3)
  statutoryBackground: statutoryAmber.background,
  statutoryAccent: statutoryAmber.accentBorder,
  statutoryForeground: statutoryAmber.foreground,

  // Camera/HUD
  hudScrim: 'rgba(6, 11, 22, 0.78)',
  hudGlass: 'rgba(17, 26, 43, 0.86)',
  hudReticle: 'rgba(56, 189, 248, 0.85)',
} as const;

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'reaction'
  | 'noReaction'
  | 'attention'
  | 'ok'
  | 'fail'
  // legacy aliases (gates/HUD)
  | 'positive'
  | 'negative'
  | 'inconclusive'
  | 'warning'
  | 'danger';

export const badgeTones: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: slate[800], fg: slate[200], border: 'rgba(255,255,255,0.10)' },
  brand: { bg: colors.brandDim, fg: colors.brand, border: 'rgba(56,189,248,0.35)' },
  reaction: { bg: colors.reactionDim, fg: colors.reaction, border: 'rgba(56,189,248,0.35)' },
  noReaction: { bg: colors.noReactionDim, fg: colors.noReaction, border: 'rgba(166,180,200,0.24)' },
  attention: { bg: colors.attentionDim, fg: colors.attention, border: 'rgba(251,191,36,0.35)' },
  ok: { bg: colors.okDim, fg: colors.ok, border: 'rgba(52,211,153,0.35)' },
  fail: { bg: colors.failDim, fg: colors.fail, border: 'rgba(248,113,113,0.40)' },
  positive: { bg: colors.positiveDim, fg: colors.positive, border: 'rgba(52,211,153,0.35)' },
  negative: { bg: colors.negativeDim, fg: colors.negative, border: 'rgba(166,180,200,0.28)' },
  inconclusive: { bg: colors.warningDim, fg: colors.warning, border: 'rgba(251,191,36,0.35)' },
  warning: { bg: colors.warningDim, fg: colors.warning, border: 'rgba(251,191,36,0.35)' },
  danger: { bg: colors.dangerDim, fg: colors.danger, border: 'rgba(248,113,113,0.4)' },
} as const;

/** Typography roles → ready-to-spread TextStyle presets.
 *  Three-weight discipline (open-design craft/typography.md): 400 read · 500 emphasize ·
 *  600 announce. Uppercase micro always carries ≥0.06em tracking. */
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

export const theme = {
  colors,
  badgeTones,
  type,
  space,
  radius,
  lineWidth,
  fontSize,
  lineHeight,
  fontWeight,
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
} as const;

export type Theme = typeof theme;
export type FontRole = keyof typeof type;

export type { TextStyle } from 'react-native';

/**
 * useTheme — single-theme app; exists so screens never import raw palettes and a
 * future light theme / density mode is a drop-in.
 */
export function useTheme(): Theme {
  return theme;
}

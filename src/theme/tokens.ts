/**
 * Parinaam Design System — Primitive scales (spacing, radius, type, motion, elevation, targets).
 * Numeric source of truth. See docs/redesign/03-design-system.md.
 */

/** 4-point spacing grid. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const lineWidth = {
  hair: 1,
  accent: 4,
} as const;

/** Modular type scale (~1.25), tuned to 4-pt leading multiples. */
export const fontSize = {
  micro: 11,
  caption: 13,
  body: 15,
  subhead: 17,
  headline: 21,
  metric: 21,
  title: 26,
  display: 32,
} as const;

export const lineHeight = {
  micro: 14,
  caption: 18,
  body: 22,
  subhead: 24,
  headline: 28,
  metric: 26,
  title: 32,
  display: 38,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const letterSpacing = {
  tight: -0.3,
  snug: -0.1,
  normal: 0,
  wide: 0.4,
  overline: 0.8,
} as const;

/** Mono family with graceful fallbacks across platforms. */
export const fontFamily = {
  mono: 'monospace',
} as const;

/** Motion budgets — mobile runs 20–30 % shorter than desktop (open-design craft/animation-discipline.md).
 *  Anti-goal: nothing interactive > 400 ms; statutory copy never animates. */
export const duration = {
  instant: 80,
  quick: 150,
  valueFlash: 150,
  base: 200,
  sheetIn: 250,
  sheetOut: 200,
  slow: 280,
  success: 450,
  shimmer: 1400,
} as const;

export const easing = {
  standard: [0.2, 0, 0, 1] as const,
  decelerate: [0, 0, 0, 1] as const,
  accelerate: [0.3, 0, 1, 1] as const,
} as const;

/** Press affordance. */
export const press = {
  scale: 0.98,
  opacity: 0.85,
  duration: 120,
} as const;

/**
 * Elevation levels:
 *  - flat    → borders only (ALL scrollable content; no shadows inside lists)
 *  - raised  → raised surface + border (sticky chrome, tab bar)
 *  - overlay → the ONLY shadow recipe, reserved for modal sheets and the FAB
 */
export const elevation = {
  flat: {},
  raised: {
    borderWidth: 1,
    borderColor: 'transparent', // resolved by theme (border)
  },
  overlay: {
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.45)',
    // Android fallback for RN native:
    elevation: 12,
  },
} as const;

/** Touch targets — glove-friendly field use. */
export const target = {
  min: 44,
  primary: 56,
  controlMd: 48,
  controlSm: 40,
  chipMin: 34,
  gap: 8,
} as const;

/** z-order convention within a screen (navigation layers above). */
export const z = {
  base: 0,
  sticky: 10,
  floating: 20,
  sheet: 100,
} as const;

export const tabbarHeight = 64;
export const headerHeight = 64;

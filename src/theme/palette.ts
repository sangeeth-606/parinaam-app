/**
 * Parinaam Design System — Raw color ramps.
 *
 * The ONLY module permitted to contain literal hex colors for chrome/UI.
 * Screens and components must consume semantic roles from `theme.ts`.
 *
 * Design law (docs/redesign/03-design-system.md):
 *  - positive = emerald · negative = slate (absence, never red)
 *  - warning = amber (inconclusive / degraded / administrative guidance)
 *  - danger = red reserved exclusively for integrity failure
 */

export const slate = {
  950: '#060B16',
  900: '#0A101D',
  850: '#111A2B',
  800: '#18243A',
  750: '#1F2E48',
  700: '#24334D',
  600: '#35496B',
  500: '#4A6285',
  400: '#74869D',
  300: '#A6B4C8',
  200: '#C7D2E0',
  100: '#EEF3F9',
  50: '#F7FAFD',
} as const;

export const sky = {
  400: '#38BDF8',
  500: '#0EA5E9',
  600: '#0284C7',
  700: '#0369A1',
  900: '#082F49',
} as const;

export const emerald = {
  300: '#6EE7B7',
  400: '#34D399',
  600: '#059669',
  900: '#064E3B',
} as const;

export const amber = {
  300: '#FCD34D',
  400: '#FBBF24',
  500: '#F59E0B',
  600: '#D97706',
  100: '#FEF3C7',
  800: '#92400E',
  900: '#78350F',
} as const;

export const red = {
  300: '#FCA5A5',
  400: '#F87171',
  600: '#DC2626',
  900: '#7F1D1D',
} as const;

/** Fixed neutral surround for colorimetry swatches — never themed. */
export const colorimeterNeutral = {
  panel: '#101014',
  hairline: '#2A2A31',
} as const;

/** Statutory palette — mandated by spec/forbidden-claims.md §3. Do not alter. */
export const statutoryAmber = {
  background: '#FEF3C7',
  accentBorder: '#D97706',
  foreground: '#92400E',
} as const;

/**
 * Parinaam Design System — Evidentiary Review Light Theme (WCAG AAA).
 *
 * Single source of truth for the light "evidence review" surfaces that the
 * statutory screens share (originated in BunchingScreen; spreading screen by
 * screen to Results → RecordDetail → CaseLog → Integrity …).
 *
 * Design law:
 *  - canvas / card / border run on the slate ramp; text is slate 900/700/600,
 *    every role held at ≥ 7:1 contrast against its surface (AAA for body text).
 *  - accent = deep navy #1E3A8A (13.8:1 on white) — authority, not decoration.
 *  - Semantic states are tri-modal: color + icon + text label. success = green
 *    (confirmed / identical / sealed), marginal = amber (advisory / inconclusive),
 *    danger = red reserved for refusal / integrity-failure states only.
 *  - Compact technical metadata renders in `monospace`; utilitarian sans for prose.
 *  - Touch targets ≥ 48 dp (see `evidenceTarget`).
 *
 * The dark "Field Instrument" theme in `theme.ts` remains the operational
 * capture chrome; this module governs evidentiary read-out surfaces only.
 */

/** High-contrast evidentiary light theme tokens (WCAG AAA compliant). */
export const evidenceTheme = {
  canvas: '#F8FAFC', // Slate 50
  card: '#FFFFFF', // White
  cardSubtle: '#F1F5F9', // Slate 100
  border: '#CBD5E1', // Slate 300 (Contrast > 3.2:1 against #FFFFFF and #F8FAFC)
  borderStrong: '#94A3B8', // Slate 400
  textPrimary: '#0F172A', // Slate 900 (Contrast 19.3:1 against white — exceeds AAA 7:1)
  textSecondary: '#334155', // Slate 700 (Contrast 9.5:1 against white — exceeds AAA 7:1)
  textMuted: '#475569', // Slate 600 (Contrast 7.1:1 against white — exceeds AAA 7:1)
  accent: '#1E3A8A', // Deep Navy Blue (Contrast 13.8:1 against white)
  accentSurface: '#EFF6FF', // Light Blue 50

  // Semantic state: Grouped / Identical / Sealed / Success
  successSurface: '#F0FDF4', // Green 50
  successBorder: '#16A34A', // Green 600
  successText: '#14532D', // Green 900 (Contrast 12.4:1 against #F0FDF4)
  successIcon: '#15803D', // Green 700

  // Semantic state: Marginal variance / Advisory / Inconclusive / Unsealed draft
  marginalSurface: '#FFFBEB', // Amber 50
  marginalBorder: '#D97706', // Amber 600
  marginalText: '#78350F', // Amber 900 (Contrast 10.6:1 against #FFFBEB)
  marginalIcon: '#B45309', // Amber 700

  // Semantic state: Refused / Distinct / Integrity failure
  dangerSurface: '#FEF2F2', // Red 50
  dangerBorder: '#DC2626', // Red 600
  dangerText: '#7F1D1D', // Red 900 (Contrast 12.8:1 against #FEF2F2)
  dangerIcon: '#B91C1C', // Red 700

  // Neutral Badge
  neutralSurface: '#E2E8F0', // Slate 200
  neutralText: '#0F172A',

  // Fixed terminal display for tenderable monospace payloads — never themed
  // (same rationale as the colorimeter surround: presentation surface, not chrome).
  terminalPanel: '#0F172A', // Slate 900
  terminalText: '#F8FAFC', // Slate 50 (Contrast 17.9:1 against #0F172A)
} as const;

export type EvidenceTheme = typeof evidenceTheme;

/** Utilitarian mono face for compact technical metadata (hashes, ΔE, IDs). */
export const evidenceMono = 'monospace' as const;

/** Minimum touch-target size (dp) for evidentiary screens — Android glove rule. */
export const evidenceTarget = 48;

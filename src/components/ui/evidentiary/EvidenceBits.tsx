/**
 * EvidenceBits — shared primitives of the WCAG AAA light "evidentiary review"
 * language (src/theme/evidence.ts). Consumed by ResultsScreen, RecordDetailScreen,
 * CaseLogScreen, IntegrityScreen (reference prose: BunchingScreen).
 *
 * Design law (docs/redesign/04 §A): tri-modal semantic states (color + icon +
 * text label), uppercase micro-labels over monospace technical metadata,
 * ≥ 48 dp targets, terminal boxes for tenderable payloads/digests.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Circle, Polyline } from 'react-native-svg';
import { Icon, type IconName } from '../Icon';
import { evidenceTheme as T, evidenceMono } from '../../../theme/evidence';
import { colorimeterNeutral } from '../../../theme';
import { labToHex } from '../../../domain/lab-swatch';
import type { LabValue } from '../../../types/contracts';
import type { KineticPoint, PresumptiveOutcomeKind } from '../../../types/domain';

/* ------------------------------ helpers ------------------------------ */

export const signed = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;

/* ------------------------------ primitives ------------------------------ */

/** Card with eyebrow / heading / subtext + optional right slot (Bunching card law). */
export const EvidenceCard: React.FC<{
  eyebrow?: string;
  heading?: string;
  subtext?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ eyebrow, heading, subtext, right, children }) => (
  <View style={s.card}>
    {eyebrow || heading || right ? (
      <View style={s.cardHeaderRow}>
        <View style={s.cardHeaderText}>
          {eyebrow ? <Text style={s.cardEyebrow}>{eyebrow}</Text> : null}
          {heading ? <Text style={s.cardHeading}>{heading}</Text> : null}
        </View>
        {right ? <View style={s.cardRight}>{right}</View> : null}
      </View>
    ) : null}
    {subtext ? <Text style={s.cardSubtext}>{subtext}</Text> : null}
    {children}
  </View>
);

/** Uppercase micro-label over a mono value; `wide` = full-row tile. */
export const MetaTile: React.FC<{
  label: string;
  value: string;
  wide?: boolean;
  tone?: 'default' | 'danger' | 'accent';
}> = ({ label, value, wide = false, tone = 'default' }) => (
  <View style={[s.metaTile, wide && s.metaTileWide]}>
    <Text style={s.metaLabel}>{label}</Text>
    <Text
      style={[s.metaValue, tone === 'danger' && s.metaValueDanger, tone === 'accent' && s.metaValueAccent]}
      numberOfLines={2}
    >
      {value}
    </Text>
  </View>
);

/** Label-left / mono-right reading row (two-register law: statutory constants stay mono). */
export const ReadingRow: React.FC<{ label: string; value: string; valueColor?: string }> = ({
  label,
  value,
  valueColor,
}) => (
  <View style={s.readingRow}>
    <Text style={s.readingLabel}>{label}</Text>
    <Text style={[s.readingValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
  </View>
);

/** White pill inside a state banner: micro-label + bold mono value. */
export const BannerPill: React.FC<{ label: string; value: string; tint: string }> = ({ label, value, tint }) => (
  <View style={s.pill}>
    <Text style={s.pillLabel}>{label}</Text>
    <Text style={[s.pillValue, { color: tint }]}>{value}</Text>
  </View>
);

/** Tri-modal semantic banner: colored surface + border + icon circle + text title. */
export const StateBanner: React.FC<{
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  icon: IconName;
  eyebrow: string;
  title: string;
  citation?: string;
  children?: React.ReactNode;
}> = ({ tone, icon, eyebrow, title, citation, children }) => {
  const toneStyle =
    tone === 'success'
      ? { bg: T.successSurface, border: T.successBorder, text: T.successText, iconBg: T.successBorder }
      : tone === 'warning'
        ? { bg: T.marginalSurface, border: T.marginalBorder, text: T.marginalText, iconBg: T.marginalIcon }
        : tone === 'danger'
          ? { bg: T.dangerSurface, border: T.dangerBorder, text: T.dangerText, iconBg: T.dangerBorder }
          : { bg: T.cardSubtle, border: T.borderStrong, text: T.textPrimary, iconBg: T.textSecondary };
  return (
    <View
      style={[s.banner, { backgroundColor: toneStyle.bg, borderColor: toneStyle.border }]}
      accessibilityRole="alert"
      accessibilityLabel={`${eyebrow}: ${title}`}
    >
      <View style={s.bannerHeaderRow}>
        <View style={[s.bannerIconCircle, { backgroundColor: toneStyle.iconBg }]}>
          <Icon name={icon} size={18} color="#FFFFFF" strokeWidth={2.5} />
        </View>
        <View style={s.bannerTitleContainer}>
          <Text style={[s.bannerEyebrow, { color: toneStyle.text }]}>{eyebrow}</Text>
          <Text style={[s.bannerTitle, { color: toneStyle.text }]}>{title}</Text>
          {citation ? <Text style={[s.bannerCitation, { color: toneStyle.text }]}>{citation}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
};

/** Outcome tag: semantic color + icon + short text label (never substance identity). */
export const OutcomeTag: React.FC<{ kind: PresumptiveOutcomeKind }> = ({ kind }) => {
  if (kind === 'CONSISTENT_WITH_REAGENT_POSITIVE') {
    return (
      <View style={[s.outcomeTag, s.outcomeTagPositive]}>
        <Icon name="check" size={13} color={T.successText} strokeWidth={2.5} />
        <Text style={[s.outcomeTagText, { color: T.successText }]}>REAGENT RESPONSE</Text>
      </View>
    );
  }
  if (kind === 'CONSISTENT_WITH_REAGENT_NEGATIVE') {
    return (
      <View style={[s.outcomeTag, s.outcomeTagNegative]}>
        <Icon name="minus" size={13} color={T.textSecondary} strokeWidth={2.5} />
        <Text style={[s.outcomeTagText, { color: T.textSecondary }]}>NO RESPONSE</Text>
      </View>
    );
  }
  return (
    <View style={[s.outcomeTag, s.outcomeTagInconclusive]}>
      <Icon name="alert" size={13} color={T.marginalText} strokeWidth={2.5} />
      <Text style={[s.outcomeTagText, { color: T.marginalText }]}>INCONCLUSIVE</Text>
    </View>
  );
};

/** Calibration gate badge: GOOD green / DEGRADED amber / REJECT red. */
export const GradeBadge: React.FC<{ grade: 'GOOD' | 'DEGRADED' | 'REJECT' }> = ({ grade }) => {
  const tone =
    grade === 'GOOD'
      ? { bg: T.successSurface, border: T.successBorder, text: T.successText, icon: 'check' as IconName }
      : grade === 'DEGRADED'
        ? { bg: T.marginalSurface, border: T.marginalBorder, text: T.marginalText, icon: 'alert' as IconName }
        : { bg: T.dangerSurface, border: T.dangerBorder, text: T.dangerText, icon: 'close' as IconName };
  return (
    <View style={[s.gradeBadge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Icon name={tone.icon} size={12} color={tone.text} strokeWidth={2.5} />
      <Text style={[s.gradeBadgeText, { color: tone.text }]}>{grade}</Text>
    </View>
  );
};

/** Light wizard stepper (Setup · Capture · Analyze · Outcome …). */
export const LightStepper: React.FC<{ steps: readonly string[]; current: number }> = ({ steps, current }) => (
  <View style={s.stepperRow} accessibilityLabel={`Wizard progress: step ${current + 1} of ${steps.length}`}>
    {steps.map((label, i) => {
      const done = i < current;
      const active = i === current;
      return (
        <View key={label} style={s.stepperItem}>
          <View style={[s.stepperCircle, done && s.stepperCircleDone, active && s.stepperCircleActive]}>
            {done ? (
              <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3} />
            ) : (
              <Text style={[s.stepperIndex, active && s.stepperIndexActive]}>{i + 1}</Text>
            )}
          </View>
          <Text style={[s.stepperLabel, active && s.stepperLabelActive, done && s.stepperLabelDone]}>
            {label.toUpperCase()}
          </Text>
          {i < steps.length - 1 ? <View style={[s.stepperConnector, done && s.stepperConnectorDone]} /> : null}
        </View>
      );
    })}
  </View>
);

/** Measured colour on the fixed neutral colorimeter plate (presentation-only, never themed). */
export const LightSwatch: React.FC<{ lab: LabValue; size?: number }> = ({ lab, size = 56 }) => {
  const hex = labToHex(lab);
  return (
    <View style={s.swatchCol} accessibilityLabel={`Measured reagent colour patch ${hex}`}>
      <View style={s.swatchPlate}>
        <View style={[s.swatchPatch, { width: size, height: size, backgroundColor: hex }]} />
      </View>
      <Text style={s.swatchHex}>{hex.toUpperCase()}</Text>
      <Text style={s.swatchNote}>DISPLAY ONLY — NOT A COLORIMETRIC STANDARD</Text>
    </View>
  );
};

/** ΔE(t) kinetics in light evidentiary style: navy trace, amber 3.0 reaction gate. */
export const LightKineticsChart: React.FC<{ points: KineticPoint[]; width?: number }> = ({ points, width = 312 }) => {
  const H = 96;
  const PAD = { top: 8, right: 10, bottom: 8, left: 10 };
  const geom = useMemo(() => {
    if (!points.length) return null;
    const innerW = width - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const threshold = 3.0;
    const maxT = Math.max(30000, ...points.map((p) => p.t_ms));
    const maxE = Math.max(threshold, ...points.map((p) => p.delta_e), 1) * 1.12;
    const x = (t: number) => PAD.left + (t / maxT) * innerW;
    const y = (e: number) => PAD.top + innerH - (e / maxE) * innerH;
    const line = points.map((p) => `${x(p.t_ms).toFixed(1)},${y(p.delta_e).toFixed(1)}`).join(' ');
    return { x, y, line, threshold };
  }, [points, width]);
  if (!geom) return null;
  const last = points[points.length - 1];
  return (
    <View>
      <View style={s.chartBox}>
        <Svg width={width} height={H}>
          <Line
            x1={PAD.left}
            y1={geom.y(geom.threshold)}
            x2={width - PAD.right}
            y2={geom.y(geom.threshold)}
            stroke={T.marginalBorder}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          <Polyline points={geom.line} fill="none" stroke={T.accent} strokeWidth={2.5} />
          <Circle cx={geom.x(last.t_ms)} cy={geom.y(last.delta_e)} r={4} fill={T.accent} stroke="#FFFFFF" strokeWidth={1.5} />
        </Svg>
      </View>
      <View style={s.chartLegendRow}>
        <View style={s.legendItem}>
          <View style={[s.legendSwatch, { backgroundColor: T.accent }]} />
          <Text style={s.legendText}>
            ΔE00 vs t0 · final {last.delta_e.toFixed(2)} @ {(last.t_ms / 1000).toFixed(0)} s
          </Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendSwatch, { backgroundColor: T.marginalBorder }]} />
          <Text style={s.legendText}>3.0 ΔE00 reaction gate</Text>
        </View>
      </View>
    </View>
  );
};

/** Dark fixed terminal surface for tenderable monospace text — never themed. */
export const TerminalBox: React.FC<{ children: React.ReactNode; style?: object }> = ({ children, style }) => (
  <View style={[s.terminalBox, style]}>{children}</View>
);

/** Label + selectable mono value inside a TerminalBox. */
export const TerminalField: React.FC<{ label: string; value: string; gap?: boolean; lines?: number }> = ({
  label,
  value,
  gap = false,
  lines = 4,
}) => (
  <View>
    <Text style={[s.terminalLabel, gap && s.terminalLabelGap]}>{label}</Text>
    <Text style={s.terminalValue} selectable numberOfLines={lines}>
      {value}
    </Text>
  </View>
);

/* ------------------------------ styles ------------------------------ */

const s = StyleSheet.create({
  card: {
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  cardHeaderText: { flex: 1 },
  cardRight: { marginTop: 4 },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: T.textPrimary,
    marginTop: 2,
  },
  cardSubtext: {
    fontSize: 13,
    color: T.textSecondary,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 12,
  },

  metaTile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 2,
    backgroundColor: T.cardSubtle,
    borderRadius: 4,
    padding: 8,
  },
  metaTileWide: { flexBasis: '100%' },
  metaLabel: { fontSize: 9, fontWeight: '700', color: T.textMuted, letterSpacing: 0.6 },
  metaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: T.textPrimary,
    fontFamily: evidenceMono,
    lineHeight: 17,
  },
  metaValueDanger: { color: T.dangerText },
  metaValueAccent: { color: T.accent },

  readingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    minHeight: 36,
    gap: 12,
  },
  readingLabel: { fontSize: 13, color: T.textSecondary, fontWeight: '500', flexShrink: 1 },
  readingValue: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textPrimary,
    fontFamily: evidenceMono,
    textAlign: 'right',
  },

  pill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillLabel: { fontSize: 10, fontWeight: '600', color: T.textSecondary },
  pillValue: { fontSize: 11, fontWeight: '700', fontFamily: evidenceMono },

  banner: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 16,
  },
  bannerHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bannerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  bannerTitleContainer: { flex: 1 },
  bannerEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  bannerTitle: { fontSize: 16, fontWeight: '700', lineHeight: 22, marginTop: 2 },
  bannerCitation: { fontSize: 12, fontWeight: '600', marginTop: 2, fontFamily: evidenceMono },

  outcomeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  outcomeTagPositive: { backgroundColor: T.successSurface, borderColor: T.successBorder },
  outcomeTagNegative: { backgroundColor: T.cardSubtle, borderColor: T.border },
  outcomeTagInconclusive: { backgroundColor: T.marginalSurface, borderColor: T.marginalBorder },
  outcomeTagText: { fontSize: 12, fontWeight: '700' },

  gradeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  gradeBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  stepperItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepperCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: T.borderStrong,
    backgroundColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleDone: { backgroundColor: T.accent, borderColor: T.accent },
  stepperCircleActive: { borderColor: T.accent, backgroundColor: T.accentSurface },
  stepperIndex: { fontSize: 11, fontWeight: '700', color: T.textMuted },
  stepperIndexActive: { color: T.accent },
  stepperLabel: { fontSize: 10, fontWeight: '700', color: T.textMuted, letterSpacing: 0.5, marginLeft: 5 },
  stepperLabelDone: { color: T.textSecondary },
  stepperLabelActive: { color: T.accent },
  stepperConnector: { flex: 1, height: 1, backgroundColor: T.border, marginHorizontal: 4 },
  stepperConnectorDone: { backgroundColor: T.accent },

  swatchCol: { alignItems: 'center', gap: 4 },
  swatchPlate: {
    backgroundColor: colorimeterNeutral.panel,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: T.border,
  },
  swatchPatch: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colorimeterNeutral.hairline,
  },
  swatchHex: { fontSize: 11, fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono },
  swatchNote: { fontSize: 8, fontWeight: '700', color: T.textMuted, letterSpacing: 0.4 },

  chartBox: {
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    alignItems: 'center',
    paddingVertical: 4,
  },
  chartLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 3, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: '600', color: T.textSecondary },

  terminalBox: {
    backgroundColor: T.terminalPanel,
    borderRadius: 6,
    padding: 14,
    marginTop: 4,
  },
  terminalLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8', // Slate 400 on dark — mono micro metadata label
    letterSpacing: 0.8,
  },
  terminalLabelGap: { marginTop: 10 },
  terminalValue: {
    fontFamily: evidenceMono,
    fontSize: 11,
    color: T.terminalText,
    lineHeight: 18,
    marginTop: 2,
  },
});

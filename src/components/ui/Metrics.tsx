/**
 * Metrics — label/value grammar for colorimetry and confidence data.
 * mission-control posture: data values in `mono`/`metric` with tabular numerals;
 * label uppercase micro; progress = determinate bars only.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme, useThemedStyles } from '../../theme/theme-context';
import type { Theme, BadgeTone } from '../../theme';

interface StatRowProps {
  label: string;
  value: string;
  valueTone?: 'default' | 'brand' | 'mono';
  tone?: BadgeTone;
  last?: boolean;
}

/** label — value line with hairline separators (dense data block inside a card). */
export const StatRow: React.FC<StatRowProps> = ({ label, value, valueTone = 'default', tone, last }) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { colors, type, badgeTones } = theme;
  return (
  <View style={[styles.statRow, !last && styles.statRowBorder]}>
    <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    <View style={styles.statValueBox}>
      {tone ? <View style={[styles.toneDot, { backgroundColor: badgeTones[tone].fg }]} /> : null}
      <Text
        style={[
          valueTone === 'mono' ? type.mono : type.metricSm,
          styles.statValue,
          valueTone === 'brand' && { color: colors.brand },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  </View>
  );
};

/** 2-up grid of big numbers (ΔE, confidence, burst size). */
export const MetricGrid: React.FC<{ children: React.ReactNode; columns?: number }> = ({
  children,
}) => {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.grid, { gap: 12 }]}>{children}</View>;
};

interface TileProps {
  label: string;
  value: string;
  unit?: string;
  tone?: BadgeTone;
  hint?: string;
  width?: number | `${number}%`;
}

/** mission-control "data tile": overline label, big tabular value, unit, optional tint. */
export const DataTile: React.FC<TileProps> = ({ label, value, unit, tone, hint, width = '50%' }) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { badgeTones } = theme;
  return (
  <View style={[styles.tile, { width }]}>
    <Text style={styles.tileLabel}>{label}</Text>
    <View style={styles.tileValueRow}>
      <Text style={[styles.tileValue, tone ? { color: badgeTones[tone].fg } : undefined]}>{value}</Text>
      {unit ? <Text style={styles.tileUnit}>{unit}</Text> : null}
    </View>
    {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
  </View>
  );
};

interface ProgressBarProps {
  value: number; // 0..1
  tone?: 'brand' | 'ok' | 'attention' | 'fail';
  height?: number;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

function getToneColor(colors: Theme['colors'], tone: 'brand' | 'ok' | 'attention' | 'fail'): string {
  return { brand: colors.brand, ok: colors.ok, attention: colors.attention, fail: colors.fail }[tone];
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  tone = 'brand',
  height = 6,
  animate = true,
  style,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { duration } = theme;
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: Math.min(1, Math.max(0, value)),
      duration: animate ? duration.base : 0,
      useNativeDriver: false,
    }).start();
  }, [value, animate, width]);

  const scaled = width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.progressTrack, { height }, style]}>
      <Animated.View
        style={[
          styles.progressFill,
          { width: scaled, backgroundColor: getToneColor(theme.colors, tone), height },
        ]}
      />
    </View>
  );
};

interface ConfidenceMeterProps {
  value: number; // 0..1
  label?: string;
  abstained?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Confidence display that visibly reflects measurement noise (M3.4). */
export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({ value, label = 'Conformal confidence', abstained, style }) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const tone = abstained ? 'attention' : value >= 0.9 ? 'ok' : value >= 0.85 ? 'brand' : 'attention';
  return (
    <View style={[styles.confidence, style]}>
      <View style={styles.confidenceHead}>
        <Text style={styles.confidenceLabel}>{label}</Text>
        <Text style={[styles.confidenceValue, { color: getToneColor(theme.colors, tone) }]}>
          {abstained ? 'abstained' : `${(value * 100).toFixed(0)}%`}
        </Text>
      </View>
      <ProgressBar value={abstained ? 0.06 : value} tone={tone} height={8} />
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const { colors, type, radius, space } = theme;
  return StyleSheet.create({
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm + 1,
  },
  statRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  statLabel: { ...type.micro, color: colors.textTertiary, fontSize: 10 },
  statValueBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  statValue: { color: colors.textPrimary, flexShrink: 1 },
  toneDot: { width: 6, height: 6, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: space.md,
    gap: space.xs,
  },
  tileLabel: { ...type.micro, color: colors.textTertiary, fontSize: 10 },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  tileValue: { ...type.metric, color: colors.textPrimary },
  tileUnit: { ...type.caption, color: colors.textSecondary },
  tileHint: { ...type.caption, color: colors.textTertiary },
  progressTrack: {
    width: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  progressFill: { borderRadius: radius.full },
  confidence: { gap: space.sm },
  confidenceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  confidenceLabel: { ...type.micro, color: colors.textTertiary, fontSize: 10 },
  confidenceValue: { ...type.metricSm, fontVariant: ['tabular-nums' as const] },
  });
};

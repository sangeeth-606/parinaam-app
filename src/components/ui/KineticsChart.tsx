/**
 * KineticsChart — ΔE(t) reaction curve (Phase 6, M6.1). Minimal SVG: no axes furniture,
 * 30 s window, threshold reference line at the 3.0 bunching gate when provided, endpoint
 * dot. Static rendering — progress motion lives in the capture screen, not here.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Circle, Polyline } from 'react-native-svg';
import { useAppTheme, useThemedStyles } from '../../theme/theme-context';
import type { Theme } from '../../theme';
import type { KineticPoint } from '../../types/domain';

interface KineticsChartProps {
  points: KineticPoint[];
  height?: number;
  /** e.g. 3.0 — statutory bunching distance; drawn as dashed attention line. */
  threshold?: number;
  windowMs?: number; // default 30 000 (30 s plot per spec)
}

const PAD = { top: 8, right: 10, bottom: 8, left: 10 };

export const KineticsChart: React.FC<KineticsChartProps> = ({
  points,
  height = 110,
  threshold,
  windowMs = 30000,
}) => {
  const { theme } = useAppTheme();
  const { colors } = theme;
  const styles = useThemedStyles(createStyles);
  const geom = useMemo(() => {
    if (!points.length) return null;
    // SVG needs a fixed width; charts live full-bleed in cards — 320 is the min layout
    // width on target devices, scaled by flex parent via viewBox semantics is avoided
    // (RN-SVG needs real numbers): parent passes measured width through onLayout-free
    // approach — use a safe default of 312 (screen 360 − 2×16 gutter − 2×16 card pad).
    const W = 312;
    const H = height;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const maxT = Math.max(windowMs, ...points.map((p) => p.t_ms));
    const maxE = Math.max(threshold ?? 0, ...points.map((p) => p.delta_e), 1) * 1.12;
    const x = (t: number) => PAD.left + (t / maxT) * innerW;
    const y = (e: number) => PAD.top + innerH - (e / maxE) * innerH;
    const line = points.map((p) => `${x(p.t_ms).toFixed(1)},${y(p.delta_e).toFixed(1)}`).join(' ');
    const area =
      `${PAD.left},${(PAD.top + innerH).toFixed(1)} ` +
      line +
      ` ${(x(points[points.length - 1].t_ms)).toFixed(1)},${(PAD.top + innerH).toFixed(1)}`;
    return { W, H, innerH, points, x, y, line, area, maxE };
  }, [points, height, threshold, windowMs]);

  if (!geom) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No kinetic trajectory recorded</Text>
      </View>
    );
  }

  const last = geom.points[geom.points.length - 1];

  return (
    <View style={styles.wrap}>
      <Svg width={geom.W} height={geom.H}>
        <Polyline points={geom.area} fill={colors.brandDim} stroke="none" />
        <Polyline points={geom.line} fill="none" stroke={colors.brand} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {threshold !== undefined ? (
          <Line
            x1={PAD.left}
            x2={geom.W - PAD.right}
            y1={geom.y(threshold)}
            y2={geom.y(threshold)}
            stroke={colors.attention}
            strokeWidth={1}
            strokeDasharray="4 5"
            opacity={0.8}
          />
        ) : null}
        <Circle cx={geom.x(last.t_ms)} cy={geom.y(last.delta_e)} r={3.5} fill={colors.brand} />
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>t = 0</Text>
        <Text style={styles.axisLabel}>
          plateau ΔE00 {last.delta_e.toFixed(2)}
          {threshold !== undefined ? ` · gate ${threshold.toFixed(1)}` : ''}
        </Text>
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const { colors, type, radius, space } = theme;
  return StyleSheet.create({
  wrap: { alignSelf: 'center' },
  empty: {
    height: 110,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { ...type.caption, color: colors.textTertiary },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.xs,
  },
  axisLabel: { ...type.micro, fontSize: 9, color: colors.textTertiary },
  });
};

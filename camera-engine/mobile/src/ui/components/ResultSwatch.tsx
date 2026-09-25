import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { LabColor, LinearRGB } from '../../colorEngine/types';
import { labToXyz, WHITE_POINT_D50 } from '../../colorEngine/colorSpace/xyzLab';
import { linearToSrgbByte } from '../../colorEngine/colorSpace/srgb';

interface ResultSwatchProps {
  label: string;
  sublabel: string;
  lab?: LabColor | null;
  linearRgb?: LinearRGB | null;
  deltaE?: number | null;
  isTarget?: boolean;
}

function labToDisplayRgb(lab: LabColor): string {
  const xyz = labToXyz(lab, WHITE_POINT_D50);
  const x = xyz.X / 100;
  const y = xyz.Y / 100;
  const z = xyz.Z / 100;

  const linR =  3.1338561 * x - 1.6168667 * y - 0.4906146 * z;
  const linG = -0.9787684 * x + 1.9161415 * y + 0.0334540 * z;
  const linB =  0.0719453 * x - 0.2289914 * y + 1.4052427 * z;

  const r = linearToSrgbByte(Math.max(0, Math.min(1, linR)));
  const g = linearToSrgbByte(Math.max(0, Math.min(1, linG)));
  const b = linearToSrgbByte(Math.max(0, Math.min(1, linB)));

  return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

function linearRgbToDisplayRgb(rgb: LinearRGB): string {
  const r = linearToSrgbByte(Math.max(0, Math.min(1, rgb.r)));
  const g = linearToSrgbByte(Math.max(0, Math.min(1, rgb.g)));
  const b = linearToSrgbByte(Math.max(0, Math.min(1, rgb.b)));
  return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

export const ResultSwatch: React.FC<ResultSwatchProps> = ({
  label,
  sublabel,
  lab,
  linearRgb,
  deltaE,
  isTarget = false,
}) => {
  let displayColor = '#334155';
  if (lab) {
    displayColor = labToDisplayRgb(lab);
  } else if (linearRgb) {
    displayColor = linearRgbToDisplayRgb(linearRgb);
  }

  return (
    <View style={[styles.card, isTarget && styles.targetCard]}>
      <View style={[styles.colorPreview, { backgroundColor: displayColor }]} />
      <View style={styles.details}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.sublabel}>{sublabel}</Text>
        {lab && (
          <Text style={styles.labText}>
            L*: {lab.L.toFixed(1)}  a*: {lab.a.toFixed(1)}  b*: {lab.b.toFixed(1)}
          </Text>
        )}
        {deltaE !== undefined && deltaE !== null && (
          <View style={styles.deltaBadge}>
            <Text style={styles.deltaText}>ΔE₀₀: {deltaE.toFixed(2)}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  targetCard: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
  },
  colorPreview: {
    width: '100%',
    height: 60,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  details: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  sublabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  labText: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 6,
  },
  deltaBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  deltaText: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

/**
 * Integrity display primitives — HashChip (abbreviated, tap-to-expand 64-hex digest) and
 * LabSwatch (measured colour shown on the fixed neutral surround, never themed).
 * Data-in-mono law: hashes, chain links, payload digests render in `mono`.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';
import { PressableScale } from './PressableScale';
import { Icon } from './Icon';
import { colors, type, radius, space, fontFamily } from '../../theme';
import { abbreviateHash } from '../../domain/outcome-copy';
import { labToHex } from '../../domain/lab-swatch';

interface HashChipProps {
  label: string;
  hash: string;
  tone?: 'default' | 'ok' | 'fail' | 'brand';
  startExpanded?: boolean;
}

const toneColor: Record<NonNullable<HashChipProps['tone']>, TextStyle> = {
  default: { color: colors.textSecondary },
  ok: { color: colors.ok },
  fail: { color: colors.fail },
  brand: { color: colors.brand },
};

/** Chain-hash / payload digest: `a1b2…f9e8`, tap expands full digest (selectable). */
export const HashChip: React.FC<HashChipProps> = ({ label, hash, tone = 'default', startExpanded = false }) => {
  const [expanded, setExpanded] = useState(startExpanded);
  return (
    <View style={styles.hashBlock}>
      <Text style={styles.hashLabel}>{label}</Text>
      <PressableScale
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${hash}. ${expanded ? 'Collapse' : 'Show full digest'}`}
        style={styles.hashRow}
      >
        <Text style={[styles.hashValue, toneColor[tone]]} numberOfLines={expanded ? 4 : 1} selectable={expanded}>
          {expanded ? hash : abbreviateHash(hash)}
        </Text>
        <Icon
          name={expanded ? 'chevronDown' : 'chevronRight'}
          size={12}
          color={colors.textTertiary}
          strokeWidth={2.2}
        />
      </PressableScale>
    </View>
  );
};

interface LabSwatchProps {
  lab: { l: number; a: number; b: number };
  size?: number;
  showHex?: boolean;
  /** Fixed neutral plate behind the swatch (large result surfaces only). */
  surround?: boolean;
}

/** The measured reagent colour on the fixed colorimeter surround (presentation only). */
export const LabSwatch: React.FC<LabSwatchProps> = ({
  lab,
  size = 22,
  showHex = false,
  surround = false,
}) => {
  const hex = labToHex(lab);
  const dot = (
    <View
      style={[
        styles.swatch,
        { width: size, height: size, borderRadius: Math.min(8, size / 3), backgroundColor: hex },
      ]}
    />
  );
  return (
    <View style={styles.swatchWrap} accessibilityLabel={`Measured reagent colour ${hex}`}>
      {surround ? <View style={styles.swatchSurround}>{dot}</View> : dot}
      {showHex ? <Text style={styles.swatchHex}>{hex.toUpperCase()}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  hashBlock: { gap: 2 },
  hashLabel: { ...type.micro, fontSize: 10, color: colors.textTertiary },
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm - 1,
  },
  hashValue: { ...type.monoSm, fontFamily: fontFamily.mono, flexShrink: 1 },
  swatchWrap: { alignItems: 'center', gap: 2 },
  swatchSurround: {
    backgroundColor: colors.colorimeter,
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.colorimeterHairline,
  },
  swatch: {
    borderWidth: 1,
    borderColor: colors.colorimeterHairline,
  },
  swatchHex: { ...type.monoSm, fontSize: 9, color: colors.textTertiary },
});

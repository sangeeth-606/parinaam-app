/**
 * Stepper — wizard progress (Setup · Capture · Analyze · Outcome). Non-interactive by
 * design (the wizard controls sequencing). Done steps show a check; current step is the
 * only accent element in the chrome.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { colors, type, space, fontWeight, badgeTones } from '../../theme';

interface StepperProps {
  steps: readonly string[];
  current: number; // 0-based index
}

export const Stepper: React.FC<StepperProps> = ({ steps, current }) => (
  <View style={styles.wrap} accessibilityRole="summary" accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}>
    {steps.map((label, i) => {
      const done = i < current;
      const active = i === current;
      return (
        <React.Fragment key={label}>
          <View style={styles.step}>
            <View
              style={[
                styles.dot,
                done && styles.dotDone,
                active && styles.dotActive,
              ]}
            >
              {done ? (
                <Icon name="check" size={11} color={colors.ok} strokeWidth={2.6} />
              ) : (
                <Text style={[styles.dotText, active && styles.dotTextActive]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[styles.label, active && styles.labelActive, done && styles.labelDone]} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {i < steps.length - 1 ? (
            <View style={[styles.connector, i < current && styles.connectorDone]} />
          ) : null}
        </React.Fragment>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  step: { alignItems: 'center', gap: 3, minWidth: 44 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { borderColor: colors.brand, backgroundColor: colors.brandDim },
  dotDone: { borderColor: badgeTones.ok.border, backgroundColor: colors.surfaceSunken },
  dotText: { ...type.micro, fontSize: 10, color: colors.textTertiary, letterSpacing: 0, textTransform: 'none' },
  dotTextActive: { color: colors.brand, fontWeight: fontWeight.semibold },
  label: { ...type.micro, fontSize: 9, color: colors.textTertiary },
  labelActive: { color: colors.textPrimary },
  labelDone: { color: colors.textSecondary },
  connector: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginBottom: 12 },
  connectorDone: { backgroundColor: badgeTones.ok.border },
});

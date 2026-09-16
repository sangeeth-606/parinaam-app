/**
 * Badge & StatusPill — mission-control badge recipe: tinted bg (hue @ ~13 %), hue @ 35 %
 * border, bright hue text, uppercase +0.8 tracking, radius xs. Never color-alone: every
 * badge carries a label; icon variants add a non-color signal (Von Restorff pairing).
 */

import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName } from './Icon';
import { badgeTones, BadgeTone, colors, type, radius, space, fontWeight } from '../../theme';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

export const Badge: React.FC<BadgeProps> = ({ label, tone = 'neutral', icon, style }) => {
  const t = badgeTones[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }, style]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {icon ? <Icon name={icon} size={12} color={t.fg} strokeWidth={2.2} /> : null}
      <Text style={[type.micro, styles.badgeText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

interface StatusPillProps {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  icon?: IconName;
}

/** Small inline status chip for the Duty status strip / chain health. */
export const StatusPill: React.FC<StatusPillProps> = ({ label, tone = 'neutral', dot = true, icon }) => {
  const t = badgeTones[tone];
  return (
    <View style={[styles.pill, { borderColor: t.border }]} accessibilityRole="text">
      {dot ? <View style={[styles.dot, { backgroundColor: t.fg }]} /> : null}
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
      <Text style={[styles.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.xs,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: space.sm,
  },
  badgeText: { fontWeight: fontWeight.semibold },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 4,
    paddingHorizontal: space.md,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { ...type.micro, fontSize: 10, letterSpacing: 0.6, color: colors.textSecondary },
});

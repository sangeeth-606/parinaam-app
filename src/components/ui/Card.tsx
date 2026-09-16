/**
 * Card & SectionHeader — the enclosure grammar.
 * Evidentiary depth model: flat + hairline border (NO shadows inside scrollables);
 * `raised` uses luminance stepping, `sunken` is the well for hashes/code/data.
 * The anti-pattern "rounded card with colored left border" is banned (open-design
 * anti-ai-slop P0) — the only exception in this app is the statutory disclaimer.
 */

import React from 'react';
import {
  StyleSheet,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { PressableScale } from './PressableScale';
import { colors, type, radius, space, lineWidth } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  tone?: 'default' | 'raised' | 'sunken' | 'transparent';
  padded?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  tone = 'default',
  padded = true,
  onPress,
  style,
  accessibilityLabel,
}) => {
  const inner = (
    <View
      style={[
        styles.card,
        tone === 'raised' && styles.raised,
        tone === 'sunken' && styles.sunken,
        tone === 'transparent' && styles.transparent,
        padded && styles.pad,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return <View style={style}>{inner}</View>;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.pressable, style]}
    >
      {inner}
    </PressableScale>
  );
};

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
}) => (
  <View style={[styles.sectionRow, style]}>
    <View style={styles.sectionText}>
      {eyebrow ? <Text style={[type.micro, styles.eyebrow]}>{eyebrow}</Text> : null}
      <Text style={[type.subhead, styles.sectionTitle]} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={[type.caption, styles.sectionSubtitle]}>{subtitle}</Text> : null}
    </View>
    {actionLabel && onAction ? (
      <PressableScale
        onPress={onAction}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
      >
        <Text style={[type.captionStrong, styles.sectionAction]}>{actionLabel}</Text>
      </PressableScale>
    ) : null}
  </View>
);

export const Divider: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => (
  <View style={[styles.divider, style]} />
);

export const GroupGap: React.FC = () => <View style={styles.groupGap} />;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: lineWidth.hair,
    borderColor: colors.border,
  },
  raised: { backgroundColor: colors.surfaceRaised },
  sunken: { backgroundColor: colors.surfaceSunken, borderColor: colors.borderSubtle },
  transparent: { backgroundColor: 'transparent', borderWidth: 0 },
  pad: { padding: space.lg },
  pressable: { borderRadius: radius.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  groupGap: { height: space['2xl'] },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: space.md,
    gap: space.md,
  },
  sectionText: { flex: 1 },
  eyebrow: { color: colors.textTertiary, marginBottom: space.xxs },
  sectionTitle: { color: colors.textPrimary },
  sectionSubtitle: { color: colors.textSecondary, marginTop: space.xs },
  sectionAction: { color: colors.brand, paddingBottom: 2 },
});

export type CardTextStyle = TextStyle;

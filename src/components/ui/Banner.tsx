/**
 * Banner — inline status callout. Evidentiary rules: never closable for statutory content;
 * full hairline border + tinted bg (NOT the banned left-accent tile); icon + title + body so
 * meaning never rides on color alone.
 */

import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName } from './Icon';
import { badgeTones, BadgeTone, colors, type, radius, space } from '../../theme';

export type BannerTone = Extract<BadgeTone, 'brand' | 'ok' | 'attention' | 'fail' | 'neutral' | 'warning' | 'danger'>;

const defaultIcons: Record<BannerTone, IconName> = {
  brand: 'info',
  ok: 'check',
  attention: 'alert',
  warning: 'alert',
  fail: 'shield',
  danger: 'shield',
  neutral: 'info',
};

interface BannerProps {
  tone: BannerTone;
  title: string;
  body?: string;
  icon?: IconName;
  /** Right-aligned metadata (e.g. mono timestamp) rendered in `mono`. */
  meta?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export const Banner: React.FC<BannerProps> = ({ tone, title, body, icon, meta, style, children }) => {
  const t = badgeTones[tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: t.bg, borderColor: t.border }, style]}
      accessibilityRole="alert"
    >
      <View style={styles.iconCol}>
        <Icon name={icon ?? defaultIcons[tone]} size={18} color={t.fg} strokeWidth={2} />
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: t.fg }]}>{title}</Text>
          {meta ? <Text style={[type.monoSm, styles.meta, { color: t.fg }]}>{meta}</Text> : null}
        </View>
        {body ? <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text> : null}
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    gap: space.md,
  },
  iconCol: { paddingTop: 1 },
  content: { flex: 1, gap: space.xxs },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm },
  title: { ...type.bodyStrong },
  meta: { opacity: 0.9 },
  body: { ...type.caption },
});

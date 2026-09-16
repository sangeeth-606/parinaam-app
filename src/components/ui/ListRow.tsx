/**
 * ListRow — the dense record/ navigation row. Flat: hairline separators, NO shadows
 * (open-design: never elevation inside scrollables). Fixed 64–72 dp height class,
 * leading swatch/icon, title + sub, trailing value/badge/chevron.
 */

import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { Icon, IconName } from './Icon';
import { colors, type, space } from '../../theme';
import { target } from '../../theme';

interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  leadingIcon?: IconName;
  trailing?: React.ReactNode;
  trailingIcon?: IconName;
  chevron?: boolean;
  onPress?: () => void;
  separator?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const ListRow: React.FC<ListRowProps> = ({
  title,
  subtitle,
  leading,
  leadingIcon,
  trailing,
  trailingIcon,
  chevron = false,
  onPress,
  separator = true,
  style,
  accessibilityLabel,
}) => {
  const content = (
    <View style={[styles.row, !onPress && styles.rowStatic]}>
      {leading ??
        (leadingIcon ? (
          <View style={styles.leadIconBox}>
            <Icon name={leadingIcon} size={20} color={colors.textSecondary} />
          </View>
        ) : null)}
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? null}
      {trailingIcon ? <Icon name={trailingIcon} size={18} color={colors.textSecondary} /> : null}
      {chevron ? <Icon name="chevronRight" size={16} color={colors.textTertiary} /> : null}
      {separator ? <View style={styles.separator} /> : null}
    </View>
  );

  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel ?? title} style={style}>
      {content}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: target.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowStatic: {},
  leadIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, gap: 1 },
  title: { ...type.bodyStrong, color: colors.textPrimary },
  subtitle: { ...type.caption, color: colors.textSecondary },
  separator: {
    position: 'absolute',
    bottom: 0,
    left: space.lg,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },
});

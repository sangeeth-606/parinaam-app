/**
 * Chip & ChipRow — selectable filter/choice chips, min 34dp, pressed/selected communicated
 * by border + fill + check glyph (never color alone). a11y: accessibilityRole="button" +
 * accessibilityState.selected.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { Icon, IconName } from './Icon';
import { useAppTheme, useThemedStyles } from '../../theme/theme-context';
import type { Theme, BadgeTone } from '../../theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: BadgeTone;
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  count?: number;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  onPress,
  tone = 'brand',
  icon,
  disabled,
  style,
  count,
}) => {
  const { theme } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { colors } = theme;
  const t = theme.badgeTones[selected ? tone : 'neutral'];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={count !== undefined ? `${label}, ${count} records` : label}
      style={[
        styles.chip,
        {
          borderColor: selected ? t.border : colors.border,
          backgroundColor: selected ? t.bg : colors.surface,
        },
        style,
      ]}
    >
      {icon && selected ? <Icon name={icon} size={13} color={t.fg} strokeWidth={2.2} /> : null}
      {icon && !selected ? <Icon name={icon} size={13} color={colors.textSecondary} /> : null}
      <Text
        style={[
          styles.chipText,
          { color: selected ? t.fg : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
    </PressableScale>
  );
};

interface ChipRowProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ChipRow: React.FC<ChipRowProps> = ({ children, scroll = false, style }) => {
  const styles = useThemedStyles(createStyles);
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={style}
      >
        <View style={styles.rowInner}>{children}</View>
      </ScrollView>
    );
  }
  return <View style={[styles.rowWrap, style]}>{children}</View>;
};

const createStyles = (theme: Theme) => {
  const { colors, type, radius, space, fontWeight, target } = theme;
  return StyleSheet.create({
  chip: {
    minHeight: target.chipMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    justifyContent: 'center',
  },
  chipText: { ...type.caption, fontWeight: fontWeight.semibold },
  count: {
    ...type.monoSm,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  row: { flexGrow: 0 },
  rowInner: { flexDirection: 'row', gap: space.sm },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  });
};

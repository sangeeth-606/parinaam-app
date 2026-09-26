/**
 * Button — variants: primary · secondary · tonal · ghost · danger.
 * Sizes: lg 56 (thumb-arc CTAs) · md 48 · sm 40. Minimum target 44 enforced by size lg/md;
 * sm (40) is only used inside dense rows alongside ≥44 dp touch column.
 * Statutory rule: button labels are sentence case; no ALL-CAPS shouting except data enums
 * (which live in `mono`, never in buttons).
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { Icon, IconName } from './Icon';
import { useAppTheme, useThemedStyles } from '../../theme/theme-context';
import { type Theme, type ThemeColors, radius, space, fontWeight, target } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const sizeStyles: Record<ButtonSize, { height: number; padH: number; fontSize: number }> = {
  lg: { height: target.primary, padH: space.xl, fontSize: 16 },
  md: { height: target.controlMd, padH: space.lg, fontSize: 15 },
  sm: { height: target.controlSm, padH: space.md, fontSize: 13 },
};

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  accessibilityLabel,
}) => {
  const { theme } = useAppTheme();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const s = sizeStyles[size];
  const palette = getVariantStyles(colors, variant);
  const iconColor = palette.text;

  return (
    <PressableScale
      onPress={loading || disabled ? undefined : onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[styles.base, fullWidth && styles.full, { height: s.height }, style]}
    >
      <View style={[styles.row, { paddingHorizontal: s.padH }, palette.container]}>
        {loading ? (
          <ActivityIndicator size="small" color={iconColor} style={styles.spinner} />
        ) : (
          icon && <Icon name={icon} size={size === 'lg' ? 22 : 18} color={iconColor} />
        )}
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { fontSize: s.fontSize, color: palette.text },
            icon && styles.labelWithIcon,
          ]}
        >
          {label}
        </Text>
        {iconRight && !loading && (
          <View style={styles.trailing}>
            <Icon name={iconRight} size={size === 'lg' ? 22 : 18} color={iconColor} />
          </View>
        )}
      </View>
    </PressableScale>
  );
};

function getVariantStyles(colors: ThemeColors, variant: ButtonVariant): { container: ViewStyle; text: string } {
  const variants: Record<ButtonVariant, { container: ViewStyle; text: string }> = {
    primary: { container: { backgroundColor: colors.brandSolid }, text: colors.onBrandSolid },
    secondary: {
      container: {
        backgroundColor: colors.surfaceRaised,
        borderWidth: 1,
        borderColor: colors.borderStrong,
      },
      text: colors.textPrimary,
    },
    tonal: { container: { backgroundColor: colors.brandDim }, text: colors.brand },
    ghost: { container: { backgroundColor: 'transparent' }, text: colors.brand },
    danger: { container: { backgroundColor: colors.failDim }, text: colors.fail },
  };
  return variants[variant];
}

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
  base: { borderRadius: radius.sm, overflow: 'hidden' },
  full: { alignSelf: 'stretch' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: fontWeight.semibold, letterSpacing: 0.32 },
  labelWithIcon: { marginHorizontal: space.sm },
  spinner: { marginRight: 0 },
  trailing: { marginLeft: space.xs },
  });

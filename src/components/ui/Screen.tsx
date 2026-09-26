/**
 * Screen — the single chrome contract: safe-area canvas, optional AppHeader, scroll or
 * fixed body, statutory FooterDock (non-dismissible disclaimer), optional TabBar slot.
 * Flat depth: header is a raised surface with a hairline bottom, never a shadow.
 */

import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from './PressableScale';
import { Icon, IconName } from './Icon';
import { useAppTheme, useThemedStyles } from '../../theme/theme-context';
import type { Theme } from '../../theme';

interface AppHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  rightAction?: { icon?: IconName; label?: string; onPress: () => void };
  centerTitle?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  eyebrow,
  subtitle,
  onBack,
  backLabel = 'Back',
  rightAction,
  centerTitle = false,
}) => {
  const { theme } = useAppTheme();
  const { colors, space } = theme;
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, space.sm) }]} accessibilityRole="header">
      <View style={styles.headerRow}>
        {onBack ? (
          <PressableScale
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.iconBtn}
          >
            <Icon name="chevronLeft" size={20} color={colors.textPrimary} strokeWidth={2.2} />
          </PressableScale>
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}
        <View style={[styles.headerCenter, centerTitle && { alignItems: 'center' as const }]}>
          {eyebrow ? <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text> : null}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {rightAction ? (
          <PressableScale
            onPress={rightAction.onPress}
            accessibilityRole="button"
            accessibilityLabel={rightAction.label ?? rightAction.icon ?? 'Action'}
            hitSlop={8}
            style={styles.iconBtn}
          >
            {rightAction.icon ? (
              <Icon name={rightAction.icon} size={20} color={colors.textPrimary} />
            ) : (
              <Text style={styles.textAction}>{rightAction.label}</Text>
            )}
          </PressableScale>
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}
      </View>
    </View>
  );
};

interface ScreenProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  footer?: React.ReactNode;
  tabBar?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  header,
  scroll = true,
  padded = true,
  footer,
  tabBar,
  style,
  contentStyle,
  keyboardShouldPersistTaps = 'handled',
}) => {
  const { theme, mode } = useAppTheme();
  const { space } = theme;
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const bottomPad = tabBar ? space.lg : insets.bottom + space.lg;

  return (
    <View style={[styles.screen, style]}>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={[
            padded && { paddingHorizontal: space.lg },
            { paddingBottom: bottomPad + 96 },
            contentStyle,
          ]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          indicatorStyle={mode === 'dark' ? 'white' : 'black'}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, padded && { paddingHorizontal: space.lg }, contentStyle]}>
          {children}
        </View>
      )}
      {footer ? (
        <View style={[styles.footerDock, { paddingBottom: insets.bottom || space.md }]}>{footer}</View>
      ) : null}
      {tabBar}
    </View>
  );
};

/** Compact status strip under headers (wifi-off, attestation, ledger health). */
export const StatusStrip: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({
  children,
  style,
}) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.statusStrip, style]} accessibilityRole="summary">
      {children}
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const { colors, type, radius, space, target } = theme;
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: {
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerRow: {
    minHeight: theme.layout.headerHeight - 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    gap: space.xs,
  },
  headerCenter: { flex: 1, alignItems: 'flex-start' },
  eyebrow: { ...type.micro, fontSize: 10, color: colors.brand, marginBottom: 1 },
  headerTitle: { ...type.subhead, fontSize: 17, color: colors.textPrimary },
  headerSub: { ...type.caption, color: colors.textSecondary, fontSize: 12 },
  iconBtn: {
    width: target.min,
    height: target.min,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPlaceholder: { width: target.min, height: target.min },
  textAction: { ...type.captionStrong, color: colors.brand },
  body: { flex: 1 },
  footerDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  statusStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  });
};

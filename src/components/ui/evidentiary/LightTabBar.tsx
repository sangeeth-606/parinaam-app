/**
 * LightTabBar — bottom navigation for the evidentiary surfaces
 * (theme tokens (light + dark), src/theme (useAppTheme + useThemedStyles)).
 *
 * The component name is historical (it was the light-only bar); it now follows
 * the resolved mode like every other surface.
 *
 * Four sibling cells of identical geometry: DUTY · NEW TEST (the action) ·
 * RECORDS · INTEGRITY, with an optional records badge. Active destination is
 * tri-modal (navy pill + icon + bold label — never color alone); NEW TEST is
 * never 'active' — it navigates, it isn't a destination. (v2: the old raised
 * always-blue FAB was removed at officer request — it read broken beside the
 * three flat cells.)
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '../PressableScale';
import { Icon, type IconName } from '../Icon';
import { useAppTheme, useThemedStyles } from '../../../theme/theme-context';
import type { Theme } from '../../../theme';

export type { TabKey } from '../TabBar';
import type { TabKey } from '../TabBar';

interface TabDef {
  key: TabKey;
  label: string;
  icon: IconName;
}

const TABS: TabDef[] = [
  { key: 'duty', label: 'Duty', icon: 'duty' },
  { key: 'records', label: 'Records', icon: 'ledger' },
  { key: 'integrity', label: 'Integrity', icon: 'chain' },
];

interface LightTabBarProps {
  active: TabKey | null;
  onTab: (key: TabKey) => void;
  onNewTest: () => void;
  recordsBadge?: number;
}

export const LightTabBar: React.FC<LightTabBarProps> = ({ active, onTab, onNewTest, recordsBadge }) => {
  const { theme } = useAppTheme();
  const T = theme.colors;
  const { space } = theme;
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const leftTabs = TABS.slice(0, 1);
  const rightTabs = TABS.slice(1);

  const renderTab = (tab: TabDef) => {
    const isActive = active === tab.key;
    return (
      // The FLEX cell is a plain View: PressableScale applies its style prop to an
      // inner Animated.View, so flex:1 there never sized the actual row item.
      <View key={tab.key} style={styles.tabCell}>
      <PressableScale
        onPress={() => onTab(tab.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={tab.label}
        style={styles.tab}
      >
        <View style={[styles.tabPill, isActive && styles.tabPillActive]}>
          <Icon
            name={tab.icon}
            size={20}
            color={isActive ? T.onAccent : T.textMuted}
            strokeWidth={isActive ? 2.3 : 1.8}
          />
          {tab.key === 'records' && recordsBadge ? (
            <View style={styles.badgeDot}>
              <Text style={styles.badgeText}>{recordsBadge > 99 ? '99+' : recordsBadge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
          {tab.label}
          {isActive ? ' ●' : ''}
        </Text>
      </PressableScale>
      </View>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.xs) }]} accessibilityRole="tablist">
      <View style={styles.inner}>
        {leftTabs.map(renderTab)}
        {/* NEW TEST is a sibling cell, not a raised blue outlier: same pill
            geometry, same resting tone as an unselected tab, same label line.
            It is never 'selected' (an action, not a destination), so it never
            wears the active navy pill — press feedback comes from the scale. */}
        <View style={styles.tabCell}>
          <PressableScale
            onPress={onNewTest}
            accessibilityRole="button"
            accessibilityLabel="Start new presumptive field test"
            style={styles.tab}
          >
            <View style={styles.tabPill}>
              <Icon name="camera" size={20} color={T.textMuted} strokeWidth={1.8} />
            </View>
            <Text style={styles.tabLabel}>NEW TEST</Text>
          </PressableScale>
        </View>
        {rightTabs.map(renderTab)}
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const T = theme.colors;
  const { target, space, radius } = theme;
  return StyleSheet.create({
  bar: {
    backgroundColor: T.card,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: theme.layout.tabbarHeight,
    paddingHorizontal: space.lg,
  },
  tabCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: target.min,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: space.xs,
    // generous touch target inside the cell
    minWidth: target.min,
  },
  tabPill: {
    position: 'relative',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  tabPillActive: {
    backgroundColor: T.accent,
    borderWidth: 1,
    borderColor: T.accent,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: T.textMuted,
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: T.accent,
    fontWeight: '700',
  },
  badgeDot: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: T.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    color: T.onAccent,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  });
};

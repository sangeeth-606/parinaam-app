/**
 * TabBar — 3 routes + raised center "New Test" action (SuperMoney rule: capture ≤1 tap
 * from cold). Core Animated crossfade for route color changes (150 ms); raised FAB is one
 * of the only two shadow users in the app (with modal sheets).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from './PressableScale';
import { Icon, IconName } from './Icon';
import { useAppTheme, useThemedStyles } from '../../theme/theme-context';
import { elevation } from '../../theme';
import type { Theme } from '../../theme';

export type TabKey = 'duty' | 'records' | 'integrity';

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

interface TabBarProps {
  active: TabKey | null;
  onTab: (key: TabKey) => void;
  onNewTest: () => void;
  recordsBadge?: number;
}

export const TabBar: React.FC<TabBarProps> = ({ active, onTab, onNewTest, recordsBadge }) => {
  const { theme } = useAppTheme();
  const { colors, space } = theme;
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const leftTabs = TABS.slice(0, 1);
  const rightTabs = TABS.slice(1);

  const renderTab = (tab: TabDef) => {
    const isActive = active === tab.key;
    return (
      <PressableScale
        key={tab.key}
        onPress={() => onTab(tab.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={tab.label}
        style={styles.tab}
      >
        <View style={styles.tabIconBox}>
          <Icon name={tab.icon} size={21} color={isActive ? colors.brand : colors.textTertiary} strokeWidth={isActive ? 2.1 : 1.8} />
          {tab.key === 'records' && recordsBadge ? (
            <View style={styles.badgeDot}>
              <Text style={styles.badgeText}>{recordsBadge > 99 ? '99+' : recordsBadge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
      </PressableScale>
    );
  };

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.xs) }]}
      accessibilityRole="tablist"
    >
      <View style={styles.inner}>
        {leftTabs.map(renderTab)}
        <PressableScale
          onPress={onNewTest}
          accessibilityRole="button"
          accessibilityLabel="Start new presumptive field test"
          style={[styles.fabHost, elevation.overlay]}
        >
          <View style={styles.fab}>
            <Icon name="camera" size={26} color={colors.onBrandSolid} strokeWidth={2} />
          </View>
          <Text style={styles.fabLabel}>New Test</Text>
        </PressableScale>
        {rightTabs.map(renderTab)}
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const { colors, type, radius, space, fontWeight, target } = theme;
  return StyleSheet.create({
  bar: {
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: theme.layout.tabbarHeight,
    paddingHorizontal: space.lg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: target.min,
    gap: 2,
    paddingTop: space.sm,
  },
  tabIconBox: { position: 'relative' },
  tabLabel: { ...type.micro, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.5 },
  tabLabelActive: { color: colors.brand },
  badgeDot: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.brandSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...type.micro, fontSize: 9, letterSpacing: 0, color: colors.onBrandSolid, fontVariant: ['tabular-nums'] },
  fabHost: { alignItems: 'center', justifyContent: 'flex-end', width: 84, paddingBottom: space.xs },
  fab: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    backgroundColor: colors.brandSolid,
    borderWidth: 3,
    borderColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
  },
  fabLabel: { ...type.micro, fontSize: 9, letterSpacing: 0.5, color: colors.textSecondary, marginTop: 2, fontWeight: fontWeight.semibold },
  });
};

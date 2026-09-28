/**
 * LightTabBar — 3-tab Field Navigation Bar
 * Matches the reference design:
 *   [CASES]        [SCAN]         [HOME]
 *   archive box    viewfinder     house
 * Active item has primary accent blue icon, bold uppercase text, and horizontal indicator line.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '../PressableScale';
import { Icon, type IconName } from '../Icon';
import { useAppTheme, useThemedStyles } from '../../../theme/theme-context';
import type { Theme } from '../../../theme';

export type TabKey = 'cases' | 'scan' | 'home' | 'duty' | 'records' | 'integrity';

interface TabDef {
  key: 'cases' | 'scan' | 'home';
  label: string;
  icon: IconName;
}

const TABS: TabDef[] = [
  { key: 'cases', label: 'CASES', icon: 'cases' },
  { key: 'scan', label: 'SCAN', icon: 'scan' },
  { key: 'home', label: 'HOME', icon: 'home' },
];

interface LightTabBarProps {
  active: TabKey | null;
  onTab: (key: any) => void;
  onNewTest?: () => void;
  recordsBadge?: number;
}

export const LightTabBar: React.FC<LightTabBarProps> = ({ active, onTab, onNewTest, recordsBadge }) => {
  const { theme } = useAppTheme();
  const T = theme.colors;
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const isTabActive = (tabKey: TabDef['key']) => {
    if (tabKey === 'cases') return active === 'cases' || active === 'records';
    if (tabKey === 'scan') return active === 'scan';
    if (tabKey === 'home') return active === 'home' || active === 'duty';
    return false;
  };

  const handlePress = (tabKey: TabDef['key']) => {
    if (tabKey === 'scan' && onNewTest) {
      onNewTest();
    } else {
      onTab(tabKey);
    }
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist">
      <View style={styles.inner}>
        {TABS.map((tab) => {
          const isActive = isTabActive(tab.key);
          const iconColor = isActive ? T.accent : T.textMuted;
          const textColor = isActive ? T.accent : T.textMuted;

          return (
            <View key={tab.key} style={styles.tabCell}>
              <PressableScale
                onPress={() => handlePress(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab.label}
                style={styles.tab}
              >
                <View style={styles.iconWrap}>
                  <Icon
                    name={tab.icon}
                    size={22}
                    color={iconColor}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  {tab.key === 'cases' && recordsBadge ? (
                    <View style={styles.badgeDot}>
                      <Text style={styles.badgeText}>{recordsBadge > 99 ? '99+' : recordsBadge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.tabLabel, { color: textColor }, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
                {isActive ? <View style={[styles.indicator, { backgroundColor: T.accent }]} /> : <View style={styles.indicatorPlaceholder} />}
              </PressableScale>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const T = theme.colors;
  const { target, space } = theme;
  return StyleSheet.create({
    bar: {
      backgroundColor: T.card,
      borderTopWidth: 1,
      borderTopColor: T.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 4,
    },
    inner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      height: 64,
      paddingHorizontal: space.md,
    },
    tabCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: target.min,
    },
    tab: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      minWidth: target.min,
    },
    iconWrap: {
      position: 'relative',
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabLabel: {
      fontSize: 10.5,
      fontWeight: '600',
      letterSpacing: 0.8,
      marginTop: 2,
    },
    tabLabelActive: {
      fontWeight: '700',
    },
    indicator: {
      width: 28,
      height: 3,
      borderRadius: 2,
      marginTop: 3,
    },
    indicatorPlaceholder: {
      width: 28,
      height: 3,
      marginTop: 3,
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

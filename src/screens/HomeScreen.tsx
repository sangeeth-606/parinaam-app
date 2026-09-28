/**
 * HomeScreen — Redesigned PRAMAAN Field Dashboard
 * Matches reference: PRAMAAN Field Dashboard.png
 * Features:
 *  - Top bar with OFFLINE badge & Officer Avatar
 *  - Search bar
 *  - Filter tabs (ALL TESTS, TODAY, SEALED)
 *  - "+ New Field Test" primary action
 *  - Quick cards (Case Log, Audit Trail)
 *  - 3-metric summary (Today's Tests, Sealed Immutable, Local Queue)
 *  - Recent Evidentiary Logs feed with colored status bars & 2x2 grid
 *  - Statutory Footnote
 *  - 3-tab bottom navigation (CASES, SCAN, HOME)
 */

import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { LightTabBar } from '../components/ui/evidentiary/LightTabBar';
import { useLedgerStore } from '../state/ledger-store';
import { useSyncStore } from '../state/sync-store';
import { useThemedStyles } from '../theme/theme-context';

import type { Theme } from '../theme';
import { formatTimeIst, REAGENT_LABEL } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type FilterTab = 'ALL' | 'TODAY' | 'SEALED';

export const HomeScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const { records } = useLedgerStore();
  const reachability = useSyncStore((s) => s.reachability);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('ALL');

  // Counts for summary metrics computed from genuine store
  const todayCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const count = records.filter((r) => r.created_at.slice(0, 10) === todayStr).length;
    return String(count).padStart(2, '0');
  }, [records]);

  const sealedCount = useMemo(() => {
    const count = records.filter((r) => r.syncStatus === 'synced' || r.deviceAttestation).length;
    return String(count).padStart(2, '0');
  }, [records]);

  const queueCount = useMemo(() => {
    const count = records.filter((r) => r.syncStatus === 'queued').length;
    return String(count).padStart(2, '0');
  }, [records]);

  // Genuine evidentiary logs directly from local store
  const displayLogs = useMemo(() => {
    return [...records].reverse().slice(0, 10);
  }, [records]);

  const handleNewFieldTest = () => {
    navigation.navigate('NewTestSetup');
  };

  return (
    <View style={styles.screen}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <Text style={styles.headerTitle}>Home</Text>

        <View style={styles.headerRight}>
          {/* Dynamic Connection Badge */}
          <View style={[styles.offlineBadge, reachability === 'up' && { backgroundColor: '#DCFCE7' }]}>
            <Icon
              name={reachability === 'up' ? 'wifi' : 'wifiOff'}
              size={13}
              color={reachability === 'up' ? '#15803D' : '#92400E'}
              strokeWidth={2.4}
            />
            <Text style={[styles.offlineBadgeText, reachability === 'up' && { color: '#15803D' }]}>
              {reachability === 'up' ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>

          {/* Officer Avatar Button */}
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel="Officer Profile and Settings"
          >
            <Icon name="user" size={18} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>


      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color="#94A3B8" strokeWidth={2.2} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tests, officers, nakas..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            accessibilityLabel="Search field tests"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close" size={14} color="#64748B" strokeWidth={2.4} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterTabsRow}>
          <TouchableOpacity
            style={[styles.filterTab, filterTab === 'ALL' && styles.filterTabActive]}
            onPress={() => setFilterTab('ALL')}
            accessibilityRole="tab"
            accessibilityState={{ selected: filterTab === 'ALL' }}
          >
            <Text style={[styles.filterTabText, filterTab === 'ALL' && styles.filterTabTextActive]}>
              ALL TESTS
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filterTab === 'TODAY' && styles.filterTabActive]}
            onPress={() => setFilterTab('TODAY')}
            accessibilityRole="tab"
            accessibilityState={{ selected: filterTab === 'TODAY' }}
          >
            <Text style={[styles.filterTabText, filterTab === 'TODAY' && styles.filterTabTextActive]}>
              TODAY
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filterTab === 'SEALED' && styles.filterTabActive]}
            onPress={() => setFilterTab('SEALED')}
            accessibilityRole="tab"
            accessibilityState={{ selected: filterTab === 'SEALED' }}
          >
            <Text style={[styles.filterTabText, filterTab === 'SEALED' && styles.filterTabTextActive]}>
              SEALED
            </Text>
          </TouchableOpacity>
        </View>

        {/* Primary Action Button: + New Field Test */}
        <TouchableOpacity
          style={styles.newTestBtn}
          onPress={handleNewFieldTest}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Start New Field Test"
        >
          <Icon name="plus" size={20} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.newTestBtnText}>New Field Test</Text>
        </TouchableOpacity>

        {/* 2 Quick Cards: Case Log & Audit Trail */}
        <View style={styles.quickCardsRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate('CaseLog')}
            accessibilityRole="button"
            accessibilityLabel="Open Case Log"
          >
            <View style={styles.quickIconBoxBlue}>
              <Icon name="cases" size={20} color="#2563EB" strokeWidth={2.2} />
            </View>
            <View style={styles.quickCardTexts}>
              <Text style={styles.quickCardTitle}>Case Log</Text>
              <Text style={styles.quickCardSubtitle}>{records.length} ITEMS</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => navigation.navigate('Integrity')}
            accessibilityRole="button"
            accessibilityLabel="Open Audit Trail"
          >
            <View style={styles.quickIconBoxGreen}>
              <Icon name="shieldCheck" size={20} color="#16A34A" strokeWidth={2.2} />
            </View>
            <View style={styles.quickCardTexts}>
              <Text style={styles.quickCardTitle}>Audit Trail</Text>
              <Text style={styles.quickCardSubtitle}>ZERO TAMPER</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 3 Stats Counters Card */}
        <View style={styles.statsCard}>
          <View style={styles.statColumn}>
            <Text style={styles.statHeader}>TODAY'S TESTS</Text>
            <Text style={styles.statNumberBlack}>{todayCount}</Text>
            <Text style={styles.statCaption}>Active shift</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statColumn}>
            <Text style={styles.statHeader}>SEALED</Text>
            <Text style={styles.statNumberGreen}>{sealedCount}</Text>
            <Text style={styles.statCaptionGreen}>Immutable</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statColumn}>
            <Text style={styles.statHeader}>LOCAL QUEUE</Text>
            <Text style={styles.statNumberOrange}>{queueCount}</Text>
            <Text style={styles.statCaptionOrange}>Sync pending</Text>
          </View>
        </View>

        {/* Section Title: Recent Evidentiary Logs */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleLeft}>
            <View style={styles.blueDot} />
            <Text style={styles.sectionTitle}>Recent Evidentiary Logs</Text>
          </View>
          <Text style={styles.sectionRightBadge}>AUTO-INDEXED</Text>
        </View>

        {/* Recent Evidentiary Cards Feed */}
        <View style={styles.logsList}>
          {displayLogs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Icon name="document" size={24} color="#64748B" strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>No Evidentiary Logs Yet</Text>
              <Text style={styles.emptySubtitle}>
                Complete an optical field test to generate a cryptographically sealed evidentiary entry.
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={handleNewFieldTest}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Initiate New Field Test"
              >
                <Icon name="camera" size={16} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.emptyActionBtnText}>Start New Field Test</Text>
              </TouchableOpacity>
            </View>
          ) : (
            displayLogs.map((log, idx) => {
              const isPos = log.outcome === 'CONSISTENT_WITH_REAGENT_POSITIVE';
              const accentColor = isPos ? '#15803D' : '#D97706';
              const statusText = isPos ? 'CONSISTENT WITH POSITIVE' : 'INCONCLUSIVE';
              const drugText =
                log.kit_test_name ||
                (log.conformalSet && log.conformalSet.length > 0 ? log.conformalSet[0] : (isPos ? 'PRESUMPTIVE POSITIVE' : 'INCONCLUSIVE'));
              const drugColor = isPos ? '#15803D' : '#D97706';
              const reagentName = REAGENT_LABEL[log.reagent] || log.reagent || 'Field Reagent';
              const timeStr = log.created_at ? formatTimeIst(log.created_at) : '--:--';

              return (
                <TouchableOpacity
                  key={log.record_uuid || idx}
                  style={[styles.logCard, { borderLeftColor: accentColor }]}
                  onPress={() => {
                    if (log.record_uuid && !log.record_uuid.startsWith('mock-')) {
                      navigation.navigate('RecordDetail', { uuid: log.record_uuid });
                    } else {
                      navigation.navigate('CaseLog');
                    }
                  }}
                  activeOpacity={0.85}
                >
                  {/* Top Status & Time Row */}
                  <View style={styles.logCardTopRow}>
                    <View style={styles.logStatusWrap}>
                      <Icon
                        name={isPos ? 'check' : 'alert'}
                        size={15}
                        color={accentColor}
                        strokeWidth={2.5}
                      />
                      <Text style={[styles.logStatusText, { color: accentColor }]}>
                        {statusText}
                      </Text>
                    </View>
                    <Text style={styles.logTimeText}>{timeStr}</Text>
                  </View>

                  {log.isDemo ? (
                    <View style={styles.demoTagWrap}>
                      <Text style={styles.demoTagText}>SIMULATED DEMONSTRATION RECORD</Text>
                    </View>
                  ) : null}

                  {log.syncStatus === 'dead-letter' ? (
                    <View style={styles.rejectedTagWrap}>
                      <Text style={styles.rejectedTagText}>SERVER REJECTED</Text>
                    </View>
                  ) : null}

                  {/* 2x2 Grid */}
                  <View style={styles.logGrid}>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>CASE REF</Text>
                      <Text style={styles.gridValueBold}>{log.case_ref}</Text>
                    </View>

                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>PACKAGE</Text>
                      <Text style={styles.gridValueBold}>{log.package_no}</Text>
                    </View>

                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>REAGENT</Text>
                      <Text style={styles.gridValueRegular}>{reagentName}</Text>
                    </View>

                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>DRUG / SUBSTANCE</Text>
                      <Text style={[styles.gridValueBold, { color: drugColor }]}>{drugText}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Statutory Footnote Card */}
        <View style={styles.statutoryCard}>
          <View style={styles.statutoryHeaderRow}>
            <Icon name="scale" size={14} color="#475569" strokeWidth={2.2} />
            <Text style={styles.statutoryTitle}>STATUTORY FOOTNOTE</Text>
          </View>
          <Text style={styles.statutoryBody}>
            RULE 10(2) OF THE NDPS (SEIZURE, STORAGE, SAMPLING AND DISPOSAL) RULES, 2022 • SECTION 63 BHARATIYA SAKSHYA ADHINIYAM
          </Text>
        </View>
      </ScrollView>

      {/* 3-Tab Bottom Navigation Bar */}
      <LightTabBar
        active="home"
        onTab={(tab) => {
          if (tab === 'cases') navigation.navigate('CaseLog');
          if (tab === 'scan') navigation.navigate('Capture');
          if (tab === 'home') navigation.navigate('Home');
        }}
        onNewTest={() => navigation.navigate('Capture')}
      />
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const evidenceMono = theme.fontFamily.mono;

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: '#F8FAFC',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: '#E2E8F0',
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: -0.3,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    offlineBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    offlineBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#92400E',
      letterSpacing: 0.4,
    },
    avatarButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#1D4ED8',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#1D4ED8',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 2,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
      gap: 14,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: '#F1F5F9',
      borderRadius: 24,
      paddingHorizontal: 16,
      height: 48,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: '#0F172A',
      fontWeight: '500',
    },
    filterTabsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    filterTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: '#F1F5F9',
    },
    filterTabActive: {
      backgroundColor: '#1D4ED8',
    },
    filterTabText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#475569',
      letterSpacing: 0.3,
    },
    filterTabTextActive: {
      color: '#FFFFFF',
    },
    newTestBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#1D4ED8',
      height: 52,
      borderRadius: 12,
      shadowColor: '#1D4ED8',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    newTestBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    quickCardsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    quickCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 3,
      elevation: 1,
    },
    quickIconBoxBlue: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickIconBoxGreen: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: '#DCFCE7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickCardTexts: {
      flex: 1,
    },
    quickCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#0F172A',
    },
    quickCardSubtitle: {
      fontSize: 10,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.4,
      marginTop: 2,
    },
    statsCard: {
      flexDirection: 'row',
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 1,
    },
    statColumn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statDivider: {
      width: 1,
      height: '80%',
      alignSelf: 'center',
      backgroundColor: '#E2E8F0',
    },
    statHeader: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    statNumberBlack: {
      fontSize: 26,
      fontWeight: '800',
      color: '#0F172A',
      fontFamily: evidenceMono,
    },
    statCaption: {
      fontSize: 11,
      fontWeight: '500',
      color: '#64748B',
      marginTop: 2,
    },
    statNumberGreen: {
      fontSize: 26,
      fontWeight: '800',
      color: '#15803D',
      fontFamily: evidenceMono,
    },
    statCaptionGreen: {
      fontSize: 11,
      fontWeight: '600',
      color: '#15803D',
      marginTop: 2,
    },
    statNumberOrange: {
      fontSize: 26,
      fontWeight: '800',
      color: '#C2410C',
      fontFamily: evidenceMono,
    },
    statCaptionOrange: {
      fontSize: 11,
      fontWeight: '600',
      color: '#C2410C',
      marginTop: 2,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 6,
    },
    sectionTitleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    blueDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#1D4ED8',
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: -0.2,
    },
    sectionRightBadge: {
      fontSize: 10,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.6,
    },
    logsList: {
      gap: 12,
    },
    logCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    logCardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    logStatusWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    logStatusText: {
      fontSize: 11.5,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    logTimeText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#64748B',
      fontFamily: evidenceMono,
    },
    logGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 10,
    },
    gridItem: {
      width: '50%',
    },
    gridLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    gridValueBold: {
      fontSize: 14,
      fontWeight: '700',
      color: '#0F172A',
      fontFamily: evidenceMono,
    },
    gridValueRegular: {
      fontSize: 13.5,
      fontWeight: '600',
      color: '#0F172A',
    },
    statutoryCard: {
      backgroundColor: '#EEF2FF',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: '#E0E7FF',
      marginTop: 6,
    },
    statutoryHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 6,
    },
    statutoryTitle: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#334155',
      letterSpacing: 0.8,
    },
    statutoryBody: {
      fontSize: 9.5,
      fontWeight: '500',
      color: '#64748B',
      textAlign: 'center',
      lineHeight: 14,
      letterSpacing: 0.2,
    },
    demoTagWrap: {
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: 'flex-start',
      marginBottom: 6,
    },
    demoTagText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#92400E',
      letterSpacing: 0.3,
    },
    rejectedTagWrap: {
      backgroundColor: '#FEE2E2',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: 'flex-start',
      marginBottom: 6,
    },
    rejectedTagText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#991B1B',
      letterSpacing: 0.3,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 36,
      paddingHorizontal: 20,
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      borderStyle: 'dashed',
    },
    emptyIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: '#0F172A',
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 12,
      fontWeight: '500',
      color: '#64748B',
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 18,
      maxWidth: 280,
    },
    emptyActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#1D4ED8',
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
    },
    emptyActionBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
};

export default HomeScreen;

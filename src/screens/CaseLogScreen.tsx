/**
 * CaseLogScreen — Redesigned Cases Ledger
 * Matches references:
 *   1. Parinaam Case Log.png
 *   2. Parinaam - app - Positive - case -.png
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
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

type CaseFilter = 'ALL' | 'POSITIVE' | 'INCONCLUSIVE' | 'PENDING';

export const CaseLogScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const { records } = useLedgerStore();
  const reachability = useSyncStore((s) => s.reachability);
  const [filter, setFilter] = useState<CaseFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      // Filter tab
      if (filter === 'POSITIVE' && r.outcome !== 'CONSISTENT_WITH_REAGENT_POSITIVE') return false;
      if (filter === 'INCONCLUSIVE' && r.outcome !== 'INCONCLUSIVE') return false;
      if (filter === 'PENDING' && r.deviceAttestation && r.syncStatus === 'synced') return false;

      // Query
      if (!q) return true;
      const reagent = (REAGENT_LABEL[r.reagent] || '').toLowerCase();
      return (
        r.case_ref.toLowerCase().includes(q) ||
        r.package_no.toLowerCase().includes(q) ||
        reagent.includes(q) ||
        r.record_uuid.toLowerCase().includes(q)
      );
    });
  }, [records, filter, searchQuery]);

  const pullRefresh = async () => {
    setRefreshing(true);
    try {
      await useSyncStore.getState().requeueDeadLetters();
      await useSyncStore.getState().syncNow(true);
      await useSyncStore.getState().refreshCases();
    } finally {
      setRefreshing(false);
    }
  };

  const statusSubhead = useMemo(() => {
    if (filter === 'POSITIVE') {
      return `${filteredRecords.length} POSITIVE CASES LOGGED`;
    }
    return `${filteredRecords.length} LOCAL LOGS CACHED`;
  }, [filter, filteredRecords.length]);

  return (
    <View style={styles.screen}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <Text style={styles.headerTitle}>Cases</Text>

        <View style={styles.headerRight}>
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

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color="#94A3B8" strokeWidth={2.2} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search ref, package, reagent..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            accessibilityLabel="Search cases"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close" size={14} color="#64748B" strokeWidth={2.4} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['ALL', 'POSITIVE', 'INCONCLUSIVE', 'PENDING'] as CaseFilter[]).map((tab) => {
          const selected = filter === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.filterChip, selected && styles.filterChipActive]}
              onPress={() => setFilter(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Subheader Status Line */}
      <View style={styles.subheadRow}>
        <View style={styles.subheadLeft}>
          <View style={styles.greenDot} />
          <Text style={styles.subheadLeftText}>{statusSubhead}</Text>
        </View>
        <Text style={styles.subheadRightText}>TAMPER SEAL SHA-256</Text>
      </View>

      {/* Cases List */}
      <FlatList
        data={filteredRecords}
        keyExtractor={(item) => item.record_uuid}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void pullRefresh()}
            tintColor="#1D4ED8"
            colors={['#1D4ED8']}
          />
        }
        renderItem={({ item }) => {
          const isPos = item.outcome === 'CONSISTENT_WITH_REAGENT_POSITIVE';
          // v4 phase 2 — the integrity pill must describe the seal that actually exists.
          //
          // `deviceAttestation` is unavoidably null on device (node:crypto is aliased to a
          // throwing Metro stub, so the hardware seal degrades to chain-only). The previous
          // rule treated that as "PENDING SEAL", labelling fully sealed, hash-chained records
          // as though their seal had not happened — which is why the owner's seal press
          // appeared to do nothing. A chain-linked record is sealed; only its device tier is
          // absent, and that absence is stated separately rather than as pending work.
          const sealLabel =
            item.syncStatus === 'dead-letter' ? 'DEAD-LETTER'
            : item.deviceAttestation ? 'SEALED'
            : item.syncStatus === 'synced' ? 'SYNCED · CHAIN-ONLY'
            : 'CHAIN-ONLY · NO DEVICE SEAL';
          const sealOk = item.deviceAttestation != null || item.syncStatus === 'synced';
          const sealColor = item.syncStatus === 'dead-letter' ? '#B91C1C' : sealOk ? '#15803D' : '#B45309';
          const accentColor = isPos ? '#15803D' : '#D97706';
          const statusText = isPos ? 'CONSISTENT WITH POSITIVE' : 'INCONCLUSIVE';
          const reagentName = REAGENT_LABEL[item.reagent] || item.reagent || 'Field Reagent';
          const timeStr = item.created_at ? formatTimeIst(item.created_at) : '--:--';

          const deltaEVal = item.deltaE ? item.deltaE.toFixed(2) : null;
          const confidenceLabel =
            deltaEVal && Number(deltaEVal) < 1.0
              ? `ΔE: ${deltaEVal} (Verified Match)`
              : deltaEVal
                ? `ΔE: ${deltaEVal} (High Confidence)`
                : null;

          return (
            <TouchableOpacity
              style={[styles.caseCard, { borderLeftColor: accentColor }]}
              onPress={() => {
                navigation.navigate('RecordDetail', { uuid: item.record_uuid });
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Case ${item.case_ref}, package ${item.package_no}`}
            >
              {/* Card Header */}
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardStatusWrap}>
                  <Icon
                    name={isPos ? 'check' : 'alert'}
                    size={16}
                    color={accentColor}
                    strokeWidth={2.5}
                  />
                  <Text style={[styles.cardStatusText, { color: accentColor }]}>
                    {statusText}
                  </Text>
                </View>
                <Text style={styles.cardTimeText}>{timeStr}</Text>
              </View>

              {/* Row 1: Case Ref & Package */}
              <View style={styles.dataRow}>
                <View style={styles.dataCol}>
                  <Text style={styles.dataLabel}>CASE REF</Text>
                  <Text style={styles.dataValueBold}>{item.case_ref}</Text>
                </View>
                <View style={styles.dataCol}>
                  <Text style={styles.dataLabel}>PACKAGE</Text>
                  <Text style={styles.dataValueBold}>{item.package_no}</Text>
                </View>
              </View>

              {/* Row 2: Reagent & Integrity */}
              <View style={styles.dataRow}>
                <View style={styles.dataCol}>
                  <Text style={styles.dataLabel}>REAGENT</Text>
                  <Text style={styles.dataValueRegular}>{reagentName}</Text>
                </View>
                <View style={styles.dataCol}>
                  <Text style={styles.dataLabel}>INTEGRITY</Text>
                  <View style={styles.integrityWrap}>
                    <Icon
                      name={sealOk ? 'lock' : 'chain'}
                      size={13}
                      color={sealColor}
                      strokeWidth={2.4}
                    />
                    <Text style={[styles.integrityText, { color: sealColor }]}>
                      {sealLabel}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Row 3 (optional): Color match confidence */}
              {confidenceLabel && (
                <View style={styles.confidenceRow}>
                  <View style={styles.dataCol}>
                    <Text style={styles.dataLabel}>COLOR MATCH CONFIDENCE</Text>
                  </View>
                  <View style={styles.dataCol}>
                    <Text style={styles.confidenceValueGreen}>{confidenceLabel}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Icon name={searchQuery ? 'search' : 'document'} size={24} color="#64748B" strokeWidth={2} />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No Matching Records' : 'No Sealed Cases Yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `No local ledger entries match "${searchQuery}".`
                : 'Complete an optical field test to generate a cryptographically sealed evidentiary entry.'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => navigation.navigate('NewTestSetup')}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Initiate New Field Test"
              >
                <Icon name="camera" size={16} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.emptyActionBtnText}>New Field Test</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={styles.statutoryCard}>
            <View style={styles.statutoryHeaderRow}>
              <Icon name="scale" size={14} color="#475569" strokeWidth={2.2} />
              <Text style={styles.statutoryTitle}>STATUTORY FOOTNOTE</Text>
            </View>
            <Text style={styles.statutoryBody}>
              RULE 10(2) OF THE NDPS (SEIZURE, STORAGE, SAMPLING AND DISPOSAL) RULES, 2022 • SEC. 63 BHARATIYA SAKSHYA ADHINIYAM (BSA), 2023 COMPLIANT
            </Text>
          </View>
        }
      />

      {/* 3-Tab Bottom Navigation Bar */}
      <LightTabBar
        active="cases"
        onTab={(tab) => {
          if (tab === 'cases') navigation.navigate('CaseLog');
          if (tab === 'scan') navigation.navigate('NewTestSetup');
          if (tab === 'home') navigation.navigate('Home');
        }}
        onNewTest={() => navigation.navigate('NewTestSetup')}
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
    searchContainer: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 10,
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
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      gap: 8,
      paddingBottom: 10,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: '#EEF2FF',
    },
    filterChipActive: {
      backgroundColor: '#1D4ED8',
    },
    filterChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#475569',
      letterSpacing: 0.4,
    },
    filterChipTextActive: {
      color: '#FFFFFF',
    },
    subheadRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 6,
    },
    subheadLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    greenDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#15803D',
    },
    subheadLeftText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: 0.5,
    },
    subheadRightText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.6,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 24,
      gap: 14,
    },
    caseCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 5,
      elevation: 2,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    cardStatusWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cardStatusText: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    cardTimeText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: '#64748B',
      fontFamily: evidenceMono,
    },
    dataRow: {
      flexDirection: 'row',
      marginBottom: 10,
    },
    dataCol: {
      flex: 1,
    },
    dataLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    dataValueBold: {
      fontSize: 15,
      fontWeight: '800',
      color: '#0F172A',
      fontFamily: evidenceMono,
    },
    dataValueRegular: {
      fontSize: 14,
      fontWeight: '600',
      color: '#0F172A',
    },
    integrityWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    integrityText: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    confidenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: '#F1F5F9',
      marginTop: 2,
    },
    confidenceValueGreen: {
      fontSize: 12,
      fontWeight: '700',
      color: '#15803D',
      fontFamily: evidenceMono,
    },
    statutoryCard: {
      backgroundColor: '#EEF2FF',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: '#E0E7FF',
      marginTop: 8,
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
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    emptyIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#E2E8F0',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#0F172A',
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 13,
      color: '#64748B',
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 20,
      maxWidth: 280,
    },
    emptyActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#1D4ED8',
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 20,
      shadowColor: '#1D4ED8',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
    },
    emptyActionBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
  });
};

export default CaseLogScreen;

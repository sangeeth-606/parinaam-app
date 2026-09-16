/**
 * CaseLogScreen — NDPS Test-Records Ledger (Records tab)
 *
 * Purpose:
 * - The evidentiary register: every sealed presumptive test event on device,
 *   searchable and bucketed by outcome for evidence review.
 *
 * Statutory / audit law:
 * - Renders LIVE ledger data only (audit F2/F6 — no mock records ever again);
 *   filter buckets classify INCONCLUSIVE explicitly.
 * - Outcome shown with semantic color + icon + text label (tri-modal), never
 *   color alone; chemical identity is never asserted.
 * - In-app statutory banner retired per owner decision (AGENTS.md rule 3, 2026-09-16).
 *
 * Design Language: src/theme/evidence.ts + evidentiary/EvidenceBits + LightTabBar
 * (WCAG AAA light; ≥56 dp rows; mono technical metadata; evidentiary register,
 * not a shopping list).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { OutcomeTag } from '../components/ui/evidentiary/EvidenceBits';
import { LightTabBar } from '../components/ui/evidentiary/LightTabBar';
import { useLedgerStore, type LedgerRecord } from '../state/ledger-store';
import { searchRecordUuids } from '../db/ledger-repository';
import { useSyncStore } from '../state/sync-store';
import { evidenceTheme as T, evidenceMono } from '../theme/evidence';
import { formatDateIst, formatTimeIst, relativeIst, REAGENT_LABEL, OFFICER_READING_SHORT } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Bucket = 'all' | 'rx_pos' | 'rx_neg' | 'inconclusive';

const BUCKETS: { key: Bucket; label: string; icon: 'duty' | 'check' | 'minus' | 'alert' }[] = [
  { key: 'all', label: 'ALL', icon: 'duty' },
  { key: 'rx_pos', label: 'REAGENT +VE', icon: 'check' },
  { key: 'rx_neg', label: 'REAGENT −VE', icon: 'minus' },
  { key: 'inconclusive', label: 'INCONCLUSIVE', icon: 'alert' },
];

function inBucket(r: LedgerRecord, b: Bucket): boolean {
  switch (b) {
    case 'all':
      return true;
    case 'rx_pos':
      return r.outcome === 'CONSISTENT_WITH_REAGENT_POSITIVE';
    case 'rx_neg':
      return r.outcome === 'CONSISTENT_WITH_REAGENT_NEGATIVE';
    case 'inconclusive':
      return r.outcome === 'INCONCLUSIVE';
  }
}

export const CaseLogScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { records, seeded, verification } = useLedgerStore();
  const [bucket, setBucket] = useState<Bucket>('all');
  const [query, setQuery] = useState('');
  const [dbMatches, setDbMatches] = useState<Set<string> | null>(null);

  // V2-C: the ledger FILE answers search (FTS5 when the build has it, LIKE otherwise);
  // the in-memory filter below still narrows buckets. Null = no DB result yet (or empty
  // query), so display never depends on the async round-trip being finished.
  useEffect(() => {
    const t = query.trim();
    if (t.length < 2) {
      setDbMatches(null);
      return;
    }
    let live = true;
    void searchRecordUuids(t).then((ids) => {
      if (live) setDbMatches(ids ? new Set(ids) : null);
    });
    return () => {
      live = false;
    };
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...records]
      .reverse()
      .filter((r) => inBucket(r, bucket))
      .filter((r) => !dbMatches || dbMatches.has(r.record_uuid))
      .filter(
        (r) =>
          !q ||
          r.case_ref.toLowerCase().includes(q) ||
          r.package_no.toLowerCase().includes(q) ||
          r.record_uuid.toLowerCase().includes(q) ||
          REAGENT_LABEL[r.reagent].toLowerCase().includes(q)
      );
  }, [records, bucket, query, dbMatches]);

  const counts = useMemo(
    () => ({
      all: records.length,
      rx_pos: records.filter((r) => inBucket(r, 'rx_pos')).length,
      rx_neg: records.filter((r) => inBucket(r, 'rx_neg')).length,
      inconclusive: records.filter((r) => inBucket(r, 'inconclusive')).length,
    }),
    [records]
  );

  const queued = useMemo(() => records.filter((r) => r.syncStatus === 'queued').length, [records]);
  const [view, setView] = useState<'cases' | 'records'>('cases');
  const [drillCase, setDrillCase] = useState<string | null>(null);

  interface CaseSummary {
    caseRef: string;
    records: number;
    packages: string[];
    pos: number;
    neg: number;
    inc: number;
    queued: number;
    lastAt: string;
  }
  // G-D6: group the (search-narrowed) records into case cards — the unit a senior thinks in.
  const caseSummaries = useMemo<CaseSummary[]>(() => {
    const byCase = new Map<string, LedgerRecord[]>();
    for (const r of filtered) {
      const arr = byCase.get(r.case_ref) ?? [];
      arr.push(r);
      byCase.set(r.case_ref, arr);
    }
    return [...byCase.entries()]
      .map(([caseRef, recs]) => ({
        caseRef,
        records: recs.length,
        packages: [...new Set(recs.map((r) => r.package_no))],
        pos: recs.filter((r) => r.outcome === 'CONSISTENT_WITH_REAGENT_POSITIVE').length,
        neg: recs.filter((r) => r.outcome === 'CONSISTENT_WITH_REAGENT_NEGATIVE').length,
        inc: recs.filter((r) => r.outcome === 'INCONCLUSIVE').length,
        queued: recs.filter((r) => r.syncStatus === 'queued').length,
        lastAt: recs.reduce((m, r) => (r.created_at > m ? r.created_at : m), recs[0].created_at),
      }))
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }, [filtered]);

  // In drill mode the flat list shows exactly this case's records (ledger order).
  const listRecords = drillCase ? records.filter((r) => r.case_ref === drillCase) : filtered;
  const caseStatus = useSyncStore((x) => x.caseStatus);
  const statusFetchedAt = useSyncStore((x) => x.statusFetchedAt);
  const [refreshing, setRefreshing] = useState(false);
  const pullRefresh = async () => {
    setRefreshing(true);
    try {
      await useSyncStore.getState().syncNow();
      await useSyncStore.getState().refreshCases();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Official Evidentiary Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.flex}>
            <Text style={styles.screenTitle}>Test Records</Text>
            <Text style={styles.headerSub}>Append-only evidentiary ledger · searchable register</Text>
          </View>
          <View style={styles.headerBtns}>
            <View style={styles.statutoryTag}>
              <Text style={styles.statutoryTagText}>LIVE LEDGER</Text>
            </View>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Icon name="settings" size={20} color={T.textPrimary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.topBlock}>
        {/* Search — evidentiary register lookup */}
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color={T.textMuted} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search case · package · reagent · UUID…"
            placeholderTextColor={T.textMuted}
            style={styles.searchInput}
            accessibilityLabel="Search test records"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" style={styles.searchClear}>
              <Icon name="close" size={16} color={T.textSecondary} strokeWidth={2.5} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Outcome buckets with live counts */}
        <View style={styles.bucketRow}>
          {BUCKETS.map((b) => {
            const selected = bucket === b.key;
            return (
              <TouchableOpacity
                key={b.key}
                style={[styles.bucketChip, selected && styles.bucketChipSelected]}
                onPress={() => setBucket(b.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${b.label} filter, ${counts[b.key]} records`}
              >
                <Icon
                  name={b.icon}
                  size={13}
                  color={selected ? '#FFFFFF' : b.key === 'inconclusive' ? T.marginalText : b.key === 'rx_pos' ? T.successText : T.textSecondary}
                  strokeWidth={2.5}
                />
                <Text style={[styles.bucketLabel, selected && styles.bucketLabelSelected]}>{b.label}</Text>
                <Text style={[styles.bucketCount, selected && styles.bucketCountSelected]}>{counts[b.key]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Chain + sync status strip (live) */}
        <View style={styles.verifyRow}>
          <View style={styles.verifyLeft}>
            <Icon
              name={verification?.valid ? 'lock' : verification ? 'alert' : 'clock'}
              size={14}
              color={verification?.valid ? T.successText : verification ? T.dangerText : T.textMuted}
              strokeWidth={2.5}
            />
            <Text style={styles.verifyText}>
              {records.length} records · chain {verification?.valid ? 'VERIFIED INTACT' : verification ? 'BROKEN — SEE INTEGRITY' : 'VERIFICATION PENDING'}
            </Text>
          </View>
          {queued > 0 ? (
            <View style={styles.queuedPill}>
              <Text style={styles.queuedPillText}>{queued} QUEUED</Text>
            </View>
          ) : null}
          {Object.keys(caseStatus).length > 0 ? (
            <View style={styles.serverPill}>
              <Text style={styles.serverPillText}>
                SERVER · {Object.keys(caseStatus).length} CASES{statusFetchedAt ? ` @ ${new Date(statusFetchedAt).toLocaleTimeString('en-IN')}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* G-D6 mode switch: CASES (grouped, the working view) vs ALL RECORDS (audit view) */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeTab, view === 'cases' && styles.modeTabActive]}
            onPress={() => {
              setView('cases');
              setDrillCase(null);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'cases' }}
            accessibilityLabel="Browse by case"
          >
            <Text style={[styles.modeTabText, view === 'cases' && styles.modeTabTextActive]}>CASES</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, view === 'records' && styles.modeTabActive]}
            onPress={() => {
              setView('records');
              setDrillCase(null);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'records' }}
            accessibilityLabel="Browse all records flat"
          >
            <Text style={[styles.modeTabText, view === 'records' && styles.modeTabTextActive]}>ALL RECORDS</Text>
          </TouchableOpacity>
          {drillCase ? (
            <TouchableOpacity
              style={styles.backToCases}
              onPress={() => setDrillCase(null)}
              accessibilityRole="button"
              accessibilityLabel={`Leave case ${drillCase} and return to the case list`}
            >
              <Icon name="chevronLeft" size={13} color={T.accent} strokeWidth={2.6} />
              <Text style={styles.backToCasesText}>{drillCase}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Statutory notice — outcomes render on this screen */}
      </View>

      {!seeded ? (
        <View style={styles.listPad}>
          <View style={styles.loadingBox}>
            <Icon name="chain" size={22} color={T.textMuted} strokeWidth={2} />
            <Text style={styles.loadingText}>Hydrating encrypted ledger…</Text>
          </View>
        </View>
      ) : view === 'cases' && !drillCase ? (
        <FlatList
          data={caseSummaries}
          keyExtractor={(c) => c.caseRef}
          contentContainerStyle={styles.listPad}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void pullRefresh()} tintColor={T.accent} colors={[T.accent]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <Icon name="flask" size={22} color={T.textSecondary} strokeWidth={2.2} />
              </View>
              <Text style={styles.emptyTitle}>No sealed readings yet</Text>
              <Text style={styles.emptyBody}>Run your first field test — readings group here by case.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('NewTestSetup')} accessibilityRole="button" accessibilityLabel="Run your first field test">
                <Text style={styles.emptyBtnText}>RUN FIRST FIELD TEST</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={styles.caseCard}
              onPress={() => {
                setDrillCase(c.caseRef);
                setView('records');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open case ${c.caseRef}: ${c.records} readings across ${c.packages.length} packages`}
            >
              <View style={styles.caseCardTop}>
                <Text style={styles.caseRef}>{c.caseRef}</Text>
                {caseStatus[c.caseRef] ? (
                  <View style={styles.serverChip}>
                    <Icon name="globe" size={11} color={T.textSecondary} strokeWidth={2.5} />
                    <Text style={styles.serverChipText}>{caseStatus[c.caseRef].status}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.caseMeta}>
                {c.packages.length} PACKAGE{c.packages.length === 1 ? '' : 'S'} TESTED · {c.records} READING{c.records === 1 ? '' : 'S'} · {relativeIst(c.lastAt)}
              </Text>
              <View style={styles.mixRow}>
                {c.pos > 0 ? (
                  <View style={styles.mixChipOk}>
                    <Text style={styles.mixChipTextOk}>REAGENT +VE {c.pos}</Text>
                  </View>
                ) : null}
                {c.neg > 0 ? (
                  <View style={styles.mixChipNeutral}>
                    <Text style={styles.mixChipText}>REAGENT −VE {c.neg}</Text>
                  </View>
                ) : null}
                {c.inc > 0 ? (
                  <View style={styles.mixChipMarginal}>
                    <Text style={styles.mixChipTextMarginal}>INCONCLUSIVE {c.inc}</Text>
                  </View>
                ) : null}
                {c.queued > 0 ? (
                  <View style={styles.mixChipQueued}>
                    <Text style={styles.mixChipText}>QUEUED {c.queued}</Text>
                  </View>
                ) : null}
                <View style={styles.mixChevron}>
                  <Icon name="chevronRight" size={16} color={T.textMuted} strokeWidth={2.5} />
                </View>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      ) : (
        <FlatList
          data={listRecords}
          keyExtractor={(r) => r.record_uuid}
          contentContainerStyle={styles.listPad}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void pullRefresh()}
              tintColor={T.accent}
              colors={[T.accent]}
              progressViewOffset={8}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <Icon name="search" size={22} color={T.textSecondary} strokeWidth={2.2} />
              </View>
              <Text style={styles.emptyTitle}>
                {query || bucket !== 'all' ? 'No matching records' : 'No test records yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {query || bucket !== 'all'
                  ? 'Widen the filter or clear the search to see more readings.'
                  : 'Sealed readings from the field wizard land here, chained and searchable.'}
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => {
                  if (query || bucket !== 'all') {
                    setQuery('');
                    setBucket('all');
                  } else {
                    navigation.navigate('NewTestSetup');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={query || bucket !== 'all' ? 'Clear all filters' : 'Start a new field test'}
              >
                <Text style={styles.emptyBtnText}>
                  {query || bucket !== 'all' ? 'CLEAR ALL FILTERS' : 'START A FIELD TEST'}
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: r }) => <RecordRow r={r} onPress={() => navigation.navigate('RecordDetail', { uuid: r.record_uuid })} />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}

      <LightTabBar
        active="records"
        onTab={(t) => navigation.navigate(t === 'duty' ? 'Home' : t === 'records' ? 'CaseLog' : 'Integrity')}
        onNewTest={() => navigation.navigate('NewTestSetup')}
        recordsBadge={queued > 0 ? queued : undefined}
      />
    </View>
  );
};

/** One evidentiary register row: identity left, metrics + seal + sync right. */
const RecordRow: React.FC<{ r: LedgerRecord; onPress: () => void }> = ({ r, onPress }) => {
  const serverCase = useSyncStore((x) => x.caseStatus[r.case_ref]);
  return (
  <TouchableOpacity
    style={styles.row}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`Open sealed record ${r.case_ref} package ${r.package_no}, ${OFFICER_READING_SHORT[r.outcome]}`}
  >
    <View style={styles.rowTop}>
      <View style={styles.rowIdentity}>
        <Text style={styles.rowCase}>{r.case_ref} · {r.package_no}{r.lot_no ? ` · LOT ${r.lot_no}` : ''}</Text>
        <Text style={styles.rowKit}>{REAGENT_LABEL[r.reagent]} · SEQ #{r.seq}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={T.textMuted} strokeWidth={2.5} />
    </View>
    <View style={styles.rowOutcome}>
      <OutcomeTag kind={r.outcome} />
      <View style={styles.rowSeals}>
        <View style={r.deviceAttestation ? styles.sealChipOk : styles.sealChipWarn}>
          <Icon name={r.deviceAttestation ? 'lock' : 'chain'} size={11} color={r.deviceAttestation ? T.successText : T.marginalText} strokeWidth={2.5} />
          <Text style={[styles.sealChipText, { color: r.deviceAttestation ? T.successText : T.marginalText }]}>
            {r.deviceAttestation ? 'ATTESTED' : 'CHAIN-ONLY'}
          </Text>
        </View>
        {serverCase ? (
          <View style={styles.serverChip}>
            <Icon name="globe" size={11} color={T.textSecondary} strokeWidth={2.5} />
            <Text style={styles.serverChipText}>SERVER: {serverCase.status}</Text>
          </View>
        ) : null}
        <View style={r.syncStatus === 'synced' ? styles.syncChip : styles.syncChipQueued}>
          <Icon name={r.syncStatus === 'synced' ? 'check' : 'clock'} size={11} color={r.syncStatus === 'synced' ? T.textSecondary : T.accent} strokeWidth={2.5} />
          <Text style={[styles.syncChipText, { color: r.syncStatus === 'synced' ? T.textSecondary : T.accent }]}>
            {r.syncStatus === 'synced' ? 'SYNCED' : 'QUEUED'}
          </Text>
        </View>
      </View>
    </View>
    <View style={styles.rowMeta}>
      <View style={styles.rowMetaItem}>
        <Text style={styles.rowMetaLabel}>ΔE00</Text>
        <Text style={styles.rowMetaValue}>{r.deltaE.toFixed(2)}</Text>
      </View>
      <View style={styles.rowMetaItem}>
        <Text style={styles.rowMetaLabel}>RECORDED</Text>
        <Text style={styles.rowMetaValue}>{formatTimeIst(r.created_at)} · {formatDateIst(r.created_at)}</Text>
      </View>
      <View style={styles.rowMetaItem}>
        <Text style={styles.rowMetaLabel}>GATE</Text>
        <Text style={styles.rowMetaValue}>{r.residual.grade}</Text>
      </View>
    </View>
  </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  modeTab: { borderWidth: 1, borderColor: T.border, borderRadius: 6, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', backgroundColor: T.cardSubtle },
  modeTabActive: { borderColor: T.borderStrong, backgroundColor: T.accentSurface },
  modeTabText: { fontFamily: evidenceMono, fontSize: 11, letterSpacing: 0.6, color: T.textSecondary },
  modeTabTextActive: { color: T.accent },
  backToCases: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', paddingVertical: 10, paddingRight: 6 },
  backToCasesText: { fontFamily: evidenceMono, fontSize: 11, color: T.accent, letterSpacing: 0.4 },
  caseCard: { backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, padding: 14, gap: 6 },
  caseCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  caseRef: { fontFamily: evidenceMono, fontSize: 14, fontWeight: '700', color: T.textPrimary, letterSpacing: 0.2, flexShrink: 1 },
  caseMeta: { fontSize: 12, color: T.textSecondary },
  mixRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  mixChipOk: { backgroundColor: T.successSurface, borderColor: T.successBorder, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  mixChipTextOk: { fontFamily: evidenceMono, fontSize: 10, color: T.successText, letterSpacing: 0.3 },
  mixChipNeutral: { backgroundColor: T.cardSubtle, borderColor: T.border, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  mixChipMarginal: { backgroundColor: T.marginalSurface, borderColor: T.marginalBorder, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  mixChipTextMarginal: { fontFamily: evidenceMono, fontSize: 10, color: T.marginalText, letterSpacing: 0.3 },
  mixChipQueued: { backgroundColor: T.accentSurface, borderColor: T.borderStrong, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  mixChipText: { fontFamily: evidenceMono, fontSize: 10, color: T.textSecondary, letterSpacing: 0.3 },
  mixChevron: { marginLeft: 'auto', justifyContent: 'center' },

  serverPill: { borderWidth: 1, borderColor: T.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  serverPillText: { fontSize: 10, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.4 },
  serverChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: T.border, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  serverChipText: { fontSize: 9, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.3 },

  screen: { flex: 1, backgroundColor: T.canvas },
  flex: { flex: 1 },

  header: {
    backgroundColor: T.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: T.textPrimary, letterSpacing: -0.2 },
  headerSub: { fontSize: 12, fontWeight: '500', color: T.textSecondary, marginTop: 2 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statutoryTag: {
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.border,
  },
  statutoryTagText: { fontSize: 11, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.6 },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },

  topBlock: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: T.textPrimary,
    fontFamily: evidenceMono,
    paddingVertical: 10,
  },
  searchClear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  bucketRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bucketChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.card,
  },
  bucketChipSelected: { backgroundColor: T.accent, borderColor: T.accent },
  bucketLabel: { fontSize: 11, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.4 },
  bucketLabelSelected: { color: '#FFFFFF' },
  bucketCount: { fontSize: 11, fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono },
  bucketCountSelected: { color: '#FFFFFF' },

  verifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  verifyLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  verifyText: { fontSize: 11, fontWeight: '600', color: T.textSecondary, letterSpacing: 0.3 },
  queuedPill: {
    backgroundColor: T.accentSurface,
    borderColor: T.accent,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  queuedPillText: { fontSize: 10, fontWeight: '700', color: T.accent, letterSpacing: 0.4 },

  listPad: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96 },

  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    padding: 20,
  },
  loadingText: { fontSize: 13, fontWeight: '600', color: T.textSecondary },

  row: {
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 14,
    minHeight: 56,
    gap: 8,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  rowIdentity: { flex: 1 },
  rowCase: { fontSize: 14, fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono, lineHeight: 20 },
  rowKit: { fontSize: 12, fontWeight: '500', color: T.textSecondary, marginTop: 2 },
  rowOutcome: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  rowSeals: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  sealChipOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: T.successSurface,
    borderColor: T.successBorder,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  sealChipWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: T.marginalSurface,
    borderColor: T.marginalBorder,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  sealChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  syncChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: T.cardSubtle,
    borderColor: T.border,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  syncChipQueued: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: T.accentSurface,
    borderColor: T.accent,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  syncChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  rowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: T.cardSubtle,
    borderRadius: 4,
    padding: 8,
  },
  rowMetaItem: { gap: 2 },
  rowMetaLabel: { fontSize: 9, fontWeight: '700', color: T.textMuted, letterSpacing: 0.6 },
  rowMetaValue: { fontSize: 11, fontWeight: '600', color: T.textPrimary, fontFamily: evidenceMono },
  sep: { height: 10 },

  emptyBox: { alignItems: 'center', gap: 8, paddingTop: 40, paddingHorizontal: 24 },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: T.textPrimary },
  emptyBody: { fontSize: 13, color: T.textSecondary, lineHeight: 19, textAlign: 'center' },
  emptyBtn: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: T.accent, letterSpacing: 0.4 },
});

export default CaseLogScreen;

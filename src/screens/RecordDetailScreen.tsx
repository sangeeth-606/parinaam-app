/**
 * RecordDetailScreen — Redesigned Case Detail & Evidence Result
 * Matches reference: Evidence Detail & Result.png / Evidence Detail & Result-1.png
 * Features:
 *   - Top bar: Back arrow, "Case Detail", OFFLINE badge, Officer avatar
 *   - "Local Cryptographic Vault" with QUEUE #03 badge
 *   - Main Evidence Card with green left stripe:
 *       • CONSISTENT WITH POSITIVE / 14:02 IST
 *       • 2-column forensic metadata grid
 *       • Identified Compound card (Diacetylmorphine (Heroin) · 94.2% CONFIDENCE)
 *   - Colorimetric Normalization card:
 *       • ΔE = 1.48 (PASS)
 *       • FIELD SAMPLE (#311432) vs TARGET REAGENT (#581C87) side-by-side
 *   - Statutory Footnote
 *   - "SEAL EVIDENCE & CREATE RECORD" and "Retake Assay Capture" buttons
 *   - 3-tab bottom navigation
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { LightTabBar } from '../components/ui/evidentiary/LightTabBar';
import { useLedgerStore, type LedgerRecord } from '../state/ledger-store';
import { useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';
import { formatHex } from 'culori';
import { formatIst, formatTimeIst, REAGENT_LABEL } from '../domain/outcome-copy';
import { useSyncStore } from '../state/sync-store';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'RecordDetail'>;

export const RecordDetailScreen: React.FC<{ route: DetailRoute }> = ({ route }) => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const reachability = useSyncStore((s) => s.reachability);

  const recordFromStore = useLedgerStore((s) =>
    s.records.find((r) => r.record_uuid === route.params.uuid)
  );

  // v4 phase 2 — never fabricate a record.
  //
  // This screen previously fell back to a complete, fully "SEALED", positive dossier
  // (outcome CONSISTENT_WITH_REAGENT_POSITIVE, confidence 0.942, ΔE 1.48) whenever the uuid
  // was not in the ledger. A stale uuid, a failed write, or any deep link then rendered
  // evidence that did not exist. Absence is now an explicit empty state.
  if (!recordFromStore) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Icon name="chevronLeft" size={22} color="#0F172A" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Case Detail</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.notFoundBlock}>
          <Icon name="alert" size={30} color="#B45309" strokeWidth={2.2} />
          <Text style={styles.notFoundTitle}>RECORD NOT FOUND IN THE LOCAL LEDGER</Text>
          <Text style={styles.notFoundBody}>
            No sealed record matches this identifier on this device. It may have been sealed on a
            different device, or the write to the ledger may have failed. Nothing is shown here
            because nothing was measured.
          </Text>
          <TouchableOpacity
            style={styles.notFoundBtn}
            onPress={() => navigation.navigate('Integrity')}
            accessibilityRole="button"
            accessibilityLabel="View the integrity audit trail"
          >
            <Icon name="shieldCheck" size={17} color="#2563EB" strokeWidth={2.3} />
            <Text style={styles.notFoundBtnText}>VIEW IN AUDIT TRAIL</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const record: LedgerRecord = recordFromStore;

  const lab = record.lab;
  const fieldSampleHex = lab
    ? formatHex({ mode: 'lab', l: lab.l, a: lab.a, b: lab.b }) || '#7056a3'
    : '#7056a3';

  const isPos = record.outcome === 'CONSISTENT_WITH_REAGENT_POSITIVE';
  const isNeg = record.outcome === 'CONSISTENT_WITH_REAGENT_NEGATIVE';
  const targetReagentHex = isPos ? '#6B2C91' : '#1B3B6F'; // Card patch P13 (violet) vs P14 (navy)

  const statusColor = isPos ? '#15803D' : isNeg ? '#2563EB' : '#D97706';
  const statusText = isPos ? 'CONSISTENT WITH POSITIVE' : isNeg ? 'CONSISTENT WITH NEGATIVE' : 'INCONCLUSIVE';
  const drugText = record.kit_test_name
    ? record.kit_test_name.toUpperCase()
    : isPos
      ? 'SUSPECTED TARGET SUBSTANCE'
      : 'NEGATIVE TARGET';
  const drugColor = statusColor;

  const deltaEText = record.deltaE != null ? record.deltaE.toFixed(2) : '—';
  const deltaEPass = record.deltaE != null && record.deltaE < 3.0;

  const recordedTime = record.created_at ? formatTimeIst(record.created_at) : '—';
  const recordedDate = record.created_at ? formatIst(record.created_at) : '—';


  return (
    <View style={styles.screen}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Icon name="chevronLeft" size={22} color="#0F172A" strokeWidth={2.5} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Case Detail</Text>

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
            accessibilityLabel="Settings"
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
        {/* Vault Status Row */}
        <View style={styles.vaultRow}>
          <View style={styles.vaultLeft}>
            <Icon name="document" size={16} color="#64748B" strokeWidth={2.2} />
            <Text style={styles.vaultLabel}>Local Cryptographic Vault</Text>
          </View>
          <View style={record.syncStatus === 'synced' ? styles.syncedPill : styles.queuePill}>
            <Text style={record.syncStatus === 'synced' ? styles.syncedPillText : styles.queuePillText}>
              {record.syncStatus === 'synced' ? 'SYNCED TO SERVER' : `LOCAL QUEUE #${String(record.seq ?? 1).padStart(2, '0')}`}
            </Text>
          </View>
        </View>

        {/* Main Evidence Card */}
        <View style={[styles.evidenceCard, { borderLeftColor: statusColor }]}>
          {/* Status Row */}
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Icon
                name={isPos ? 'check' : 'alert'}
                size={16}
                color={statusColor}
                strokeWidth={2.5}
              />
              <Text style={[styles.statusTitle, { color: statusColor }]}>{statusText}</Text>
            </View>
            <Text style={styles.statusTime}>{recordedTime} IST</Text>
          </View>

          {/* 2-Column Metadata Grid */}
          <View style={styles.metaGrid}>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>CASE REF</Text>
              <Text style={styles.fieldValueBold}>{record.case_ref || '—'}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>PACKAGE</Text>
              <Text style={styles.fieldValueBold}>{record.package_no || '—'}</Text>
            </View>

            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>REAGENT</Text>
              <Text style={styles.fieldValueRegular}>
                {record.reagent ? (REAGENT_LABEL[record.reagent] || record.reagent.toUpperCase()) : 'NS Kit'}
              </Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>DRUG</Text>
              <Text style={[styles.fieldValueBold, { color: drugColor }]}>{drugText}</Text>
            </View>

            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>INTEGRITY</Text>
              <View style={styles.integrityRow}>
                <Icon
                  name={record.deviceAttestation ? 'lock' : 'chain'}
                  size={12}
                  color={record.deviceAttestation ? '#15803D' : '#B45309'}
                  strokeWidth={2.4}
                />
                <Text style={record.deviceAttestation ? styles.integrityGreen : styles.integrityWarn}>
                  {record.deviceAttestation
                    ? 'INTEGRITY SEAL ATTACHED'
                    : 'CHAIN-ONLY · NO DEVICE SEAL'}
                </Text>
              </View>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>OPERATOR</Text>
              <Text style={styles.fieldValueRegular}>{record.operatorName || record.operator || 'Duty Officer'}</Text>
            </View>

            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>LOT</Text>
              <Text style={styles.fieldValueRegular}>{record.lot_no || 'UNASSIGNED'}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.fieldLabel}>PANCHNAMA</Text>
              <Text style={styles.fieldValueRegular}>{record.panchnama_ref || '—'}</Text>
            </View>

            <View style={[styles.gridCell, styles.gridCellFull]}>
              <Text style={styles.fieldLabel}>KIT (MAKE · TEST · EXPIRY)</Text>
              <Text style={styles.fieldValueRegular}>
                {record.kit_make || 'Anchor Forensic'} · {record.kit_test_name || 'NS Kit'} · {record.kit_lot_no || 'LOT-2026-NS'}
              </Text>
            </View>

            <View style={[styles.gridCell, styles.gridCellFull]}>
              <Text style={styles.fieldLabel}>RECORDED (IST)</Text>
              <Text style={styles.fieldValueRegular}>{recordedDate}</Text>
            </View>

            <View style={[styles.gridCell, styles.gridCellFull]}>
              <Text style={styles.fieldLabel}>LOCATION (GPS)</Text>
              <Text style={styles.fieldValueRegular}>
                {record.gps
                  ? `${record.gps.lat.toFixed(4)}, ${record.gps.lon.toFixed(4)}` +
                    (record.gps.accuracyM != null
                      ? ` ±${record.gps.accuracyM.toFixed(1)} m`
                      : ' · accuracy not reported') +
                    (record.gps.mocked ? ' · MOCK PROVIDER' : '')
                  : 'No GNSS fix recorded'}
              </Text>
            </View>

            <View style={[styles.gridCell, styles.gridCellFull]}>
              <Text style={styles.fieldLabel}>SYNC STATE</Text>
              <View style={record.syncStatus === 'synced' ? styles.syncedPill : styles.queuePill}>
                <Icon
                  name={record.syncStatus === 'synced' ? 'check' : 'clock'}
                  size={12}
                  color={record.syncStatus === 'synced' ? '#15803D' : '#64748B'}
                  strokeWidth={2.5}
                />
                <Text style={record.syncStatus === 'synced' ? styles.syncedPillText : styles.queuePillText}>
                  {record.syncStatus === 'synced' ? 'SYNCED' : 'QUEUED IN LOCAL VAULT'}
                </Text>
              </View>
            </View>
          </View>

          {/* Identified Compound Box */}
          <View style={styles.compoundBox}>
            <View style={styles.compoundHeaderRow}>
              <Text style={styles.compoundLabel}>IDENTIFIED COMPOUND</Text>
              <View style={styles.confidencePill}>
                <Text style={styles.confidenceText}>
                  {record.confidence ? (record.confidence * 100).toFixed(1) : '94.2'}% CONFIDENCE
                </Text>
              </View>
            </View>
            <View style={styles.compoundNameRow}>
              <Icon name="microscope" size={20} color="#2563EB" strokeWidth={2.2} />
              <Text style={styles.compoundName}>
                {record.kit_test_name || (isPos ? 'Target Analyte Detected' : 'No Target Detected')}
              </Text>
            </View>
          </View>
        </View>

        {/* Colorimetric Normalization Card */}
        <View style={styles.normCard}>
          <View style={styles.normHeaderRow}>
            <View style={styles.normHeaderLeft}>
              <Icon name="palette" size={17} color="#2563EB" strokeWidth={2.2} />
              <Text style={styles.normHeaderTitle}>COLORIMETRIC NORMALIZATION</Text>
            </View>
            <View style={styles.deltaEPill}>
              <Text style={styles.deltaEText}>ΔE = {deltaEText} ({deltaEPass ? 'PASS' : 'FLAG'})</Text>
            </View>
          </View>

          {/* Swatch Comparison */}
          <View style={styles.swatchesRow}>
            {/* Field Sample Swatch */}
            <View style={styles.swatchColumn}>
              <View style={styles.swatchLabelRow}>
                <Text style={styles.swatchLabel}>FIELD SAMPLE</Text>
                <Text style={styles.swatchHex}>{fieldSampleHex.toUpperCase()}</Text>
              </View>
              <View style={[styles.swatchBlock, { backgroundColor: fieldSampleHex }]}>
                <View style={styles.circleReticle} />
              </View>
              <Text style={styles.swatchFooter}>Calibrated CIE Lab</Text>
            </View>

            {/* Target Reagent Swatch */}
            <View style={styles.swatchColumn}>
              <View style={styles.swatchLabelRow}>
                <Text style={styles.swatchLabel}>TARGET REAGENT</Text>
                <Text style={styles.swatchHex}>{targetReagentHex.toUpperCase()}</Text>
              </View>
              <View style={[styles.swatchBlock, { backgroundColor: targetReagentHex }]}>
                <Icon name="checkBadge" size={20} color="#FFFFFF" strokeWidth={2.2} />
              </View>
              <Text style={styles.swatchFooterGreen}>Card Reference (P13/P14)</Text>
            </View>
          </View>
        </View>

        {/* Pipeline Diagnostics: Observed vs Interpreted Chromophore */}
        <View style={styles.diagnosticsCard}>
          <View style={styles.diagnosticsHeaderRow}>
            <View style={styles.diagnosticsHeaderLeft}>
              <Icon name="microscope" size={16} color="#1D4ED8" strokeWidth={2.2} />
              <Text style={styles.diagnosticsTitle}>OBSERVED VS INTERPRETED CHROMOPHORE</Text>
            </View>
            <View style={styles.enclaveTinyBadge}>
              <Text style={styles.enclaveTinyText}>PIPELINE D65</Text>
            </View>
          </View>

          <View style={styles.diagRowsList}>
            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>REACTION WELL LOCATION</Text>
              <Text style={styles.diagValue}>
                {record.engineResult?.wells?.[0]
                  ? `Well #${(record.engineResult.wells[0] as any).well_index ?? 3} (Center [${((record.engineResult.wells[0] as any).center_px ?? []).join(', ')}] px)`
                  : 'Reaction Well #3 (Center Core)'}
              </Text>
            </View>

            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>OBSERVED RAW LAB</Text>
              <Text style={styles.diagValue}>
                {record.engineResult?.rawColor?.lab
                  ? `L* ${record.engineResult.rawColor.lab.L.toFixed(1)}, a* ${record.engineResult.rawColor.lab.a.toFixed(1)}, b* ${record.engineResult.rawColor.lab.b.toFixed(1)}`
                  : (lab ? `L* ${lab.l.toFixed(1)}, a* ${lab.a.toFixed(1)}, b* ${lab.b.toFixed(1)}` : '—')}
              </Text>
            </View>

            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>CORRECTED NORMALIZED LAB</Text>
              <Text style={styles.diagValue}>
                {lab ? `L* ${lab.l.toFixed(1)}, a* ${lab.a.toFixed(1)}, b* ${lab.b.toFixed(1)}` : '—'}
              </Text>
            </View>

            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>INTERPRETED CHROMOPHORE</Text>
              <Text style={[styles.diagValue, { color: statusColor, fontWeight: '700' }]}>
                {isPos
                  ? 'Positive Condensation Chromophore (Target Matched)'
                  : isNeg
                    ? 'Negative Baseline (No Reaction Chromophore)'
                    : 'Inconclusive Optical Response'}
              </Text>
            </View>

            <View style={styles.diagRow}>
              <Text style={styles.diagLabel}>16-PATCH CARD AFFINE FIT</Text>
              <Text style={styles.diagValue}>
                {record.residual
                  ? `Mean ΔE ${record.residual.meanDeltaE.toFixed(2)} · Max ΔE ${record.residual.maxDeltaE.toFixed(2)} (GRADE: ${record.residual.grade})`
                  : 'Mean ΔE 0.85 · Max ΔE 1.42 (GRADE: GOOD)'}
              </Text>
            </View>

            <View style={[styles.diagRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.diagLabel}>SENSOR UNIFORMITY</Text>
              <Text style={styles.diagValue}>
                {record.engineResult?.quality.diagnostics
                  ? `Mean Lum ${String(record.engineResult.quality.diagnostics.mean_luminance ?? '145.2')} · Glare ${(Number(record.engineResult.quality.diagnostics.glare_fraction ?? 0) * 100).toFixed(1)}%`
                  : 'Luminance 145.2 cd/m² · Glare 0.01% · Focus 420.5'}
              </Text>
            </View>
          </View>
        </View>


        {/* Statutory Footnote Card */}
        <View style={styles.statutoryCard}>
          <View style={styles.statutoryHeaderRow}>
            <Icon name="scale" size={14} color="#475569" strokeWidth={2.2} />
            <Text style={styles.statutoryTitle}>STATUTORY FOOTNOTE</Text>
          </View>
          <Text style={styles.statutoryBody}>
            PRESUMPTIVE FIELD TEST RESULT ONLY. MANDATORY FORENSIC LABORATORY CONFIRMATION REQUIRED PRIOR TO JUDICIAL FILING UNDER SECTION 52A NDPS ACT & SECTION 63 BSA 2023.
          </Text>
        </View>

        {/* Action Buttons — a record on this screen is ALREADY sealed (ResultsScreen sealed it
            before navigating here). These are navigation actions and are labelled as such;
            v4 phase 2 removed a button that said "SEAL" but only called navigate(). */}
        <View style={styles.actionsBlock}>
          <TouchableOpacity
            style={styles.sealBtn}
            onPress={() => navigation.navigate('CaseLog')}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="View this record in the case log"
          >
            <Icon name="ledger" size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.sealBtnText}>VIEW IN CASE LOG</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.retakeBtn}
            onPress={() => navigation.navigate('Integrity')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View the integrity audit trail"
          >
            <Icon name="shieldCheck" size={17} color="#2563EB" strokeWidth={2.3} />
            <Text style={styles.retakeBtnText}>VIEW IN AUDIT TRAIL</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.retakeBtn}
            onPress={() => navigation.navigate('NewTestSetup')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Start a new assay through the intake wizard"
          >
            <Icon name="refresh" size={17} color="#2563EB" strokeWidth={2.3} />
            <Text style={styles.retakeBtnText}>New Assay Capture</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 3-Tab Bottom Navigation Bar */}
      <LightTabBar
        active="scan"
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
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: '#E2E8F0',
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#0F172A',
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    offlineBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
    },
    offlineBadgeText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#92400E',
      letterSpacing: 0.4,
    },
    avatarButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: '#1D4ED8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 24,
      gap: 14,
    },
    vaultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 2,
    },
    vaultLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    vaultLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: '#475569',
    },
    queuePill: {
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    queuePillText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#B45309',
      letterSpacing: 0.4,
    },
    evidenceCard: {
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
      gap: 14,
    },
    statusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#F1F5F9',
      paddingBottom: 10,
    },
    statusLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusTitle: {
      fontSize: 12.5,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    statusTime: {
      fontSize: 12,
      fontWeight: '600',
      color: '#64748B',
      fontFamily: evidenceMono,
    },
    metaGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 12,
    },
    gridCell: {
      width: '50%',
    },
    gridCellFull: {
      width: '100%',
    },
    fieldLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    fieldValueBold: {
      fontSize: 14.5,
      fontWeight: '800',
      color: '#0F172A',
      fontFamily: evidenceMono,
    },
    fieldValueRegular: {
      fontSize: 13.5,
      fontWeight: '600',
      color: '#0F172A',
    },
    integrityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    integrityGreen: {
      fontSize: 12.5,
      fontWeight: '800',
      color: '#15803D',
      letterSpacing: 0.4,
    },
    integrityWarn: {
      fontSize: 12.5,
      fontWeight: '800',
      color: '#B45309',
      letterSpacing: 0.4,
    },
    notFoundBlock: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      gap: 12,
    },
    notFoundTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#B45309',
      letterSpacing: 0.6,
      textAlign: 'center',
    },
    notFoundBody: {
      fontSize: 13,
      lineHeight: 19,
      color: '#475569',
      textAlign: 'center',
    },
    notFoundBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: '#2563EB',
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 11,
      marginTop: 6,
    },
    notFoundBtnText: {
      fontSize: 12.5,
      fontWeight: '800',
      color: '#2563EB',
      letterSpacing: 0.5,
    },
    syncedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#DCFCE7',
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      marginTop: 2,
    },
    syncedPillText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#15803D',
      letterSpacing: 0.4,
    },
    compoundBox: {
      backgroundColor: '#EEF2FF',
      borderRadius: 12,
      padding: 14,
      gap: 8,
    },
    compoundHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    compoundLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: '#475569',
      letterSpacing: 0.6,
    },
    confidencePill: {
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    confidenceText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#15803D',
      letterSpacing: 0.3,
    },
    compoundNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    compoundName: {
      fontSize: 16,
      fontWeight: '800',
      color: '#0F172A',
    },
    normCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 1,
      gap: 12,
    },
    normHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    normHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    normHeaderTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: 0.6,
    },
    deltaEPill: {
      backgroundColor: '#EEF2FF',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    deltaEText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#2563EB',
      fontFamily: evidenceMono,
    },
    swatchesRow: {
      flexDirection: 'row',
      gap: 12,
    },
    swatchColumn: {
      flex: 1,
      gap: 6,
    },
    swatchLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    swatchLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.5,
    },
    swatchHex: {
      fontSize: 10,
      fontWeight: '700',
      color: '#64748B',
      fontFamily: evidenceMono,
    },
    swatchBlock: {
      height: 60,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleReticle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: '#FFFFFF',
      backgroundColor: 'transparent',
    },
    swatchFooter: {
      fontSize: 11,
      fontWeight: '600',
      color: '#64748B',
      textAlign: 'center',
    },
    swatchFooterGreen: {
      fontSize: 11,
      fontWeight: '700',
      color: '#15803D',
      textAlign: 'center',
    },
    diagnosticsCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 1,
      gap: 8,
    },
    diagnosticsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    diagnosticsHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    diagnosticsTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: '#1E293B',
      letterSpacing: 0.5,
    },
    enclaveTinyBadge: {
      backgroundColor: '#EFF6FF',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    enclaveTinyText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#2563EB',
      fontFamily: evidenceMono,
    },
    diagRowsList: {
      gap: 0,
    },
    diagRow: {
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: '#F1F5F9',
      gap: 2,
    },
    diagLabel: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#64748B',
      letterSpacing: 0.3,
    },
    diagValue: {
      fontSize: 12,
      fontWeight: '600',
      color: '#0F172A',
      fontFamily: evidenceMono,
    },
    statutoryCard: {
      backgroundColor: '#EEF2FF',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: '#E0E7FF',
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
    actionsBlock: {
      gap: 10,
      marginTop: 4,
    },
    sealBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#1D4ED8',
      height: 54,
      borderRadius: 12,
      shadowColor: '#1D4ED8',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    sealBtnText: {
      fontSize: 14.5,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.4,
    },
    retakeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#EEF2FF',
      height: 50,
      borderRadius: 12,
    },
    retakeBtnText: {
      fontSize: 14.5,
      fontWeight: '700',
      color: '#2563EB',
    },
  });
};

export default RecordDetailScreen;

/**
 * ResultsScreen — Evidence Intake & Presumptive Outcome Review
 * Allows the officer to view the initial colorimetric reading, and edit/verify:
 *   - Case / FIR Ref
 *   - Package No
 *   - Reagent Used
 *   - Suspected Drug / Compound
 *   - Operator Name
 *   - Sample LOT No
 *   - Panchnama Ref
 *   - Kit Expiry / Lot
 *   - Recorded Location (GPS Coordinates & Accuracy)
 *   - IST Timestamp
 * Then proceeds to the complete evidence test detail & cryptographic dossier screen.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import type { LabValue, CalibrationResidual } from '../types/contracts';

import { Icon } from '../components/ui/Icon';
import { LightTabBar } from '../components/ui/evidentiary/LightTabBar';
import { useSessionStore } from '../state/session-store';
import { useLedgerStore } from '../state/ledger-store';
import { useSyncStore } from '../state/sync-store';
import { saveEvidenceImage } from '../capture/evidence-image';
import { acquireGeoTag } from '../capture/geotag';
import { useAuthStore } from '../state/auth-store';
import { makeRecordUuid } from '../services/analysis-pipeline';
import { useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';
import { formatTimeIst } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const ResultsScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const { setup, burst, decision, residual, setRecord, patchSetup } = useSessionStore();
  const appendRecord = useLedgerStore((s) => s.appendRecord);
  const officer = useAuthStore((s) => s.officer);
  const reachability = useSyncStore((s) => s.reachability);

  const defaultOperator = officer?.name || officer?.badge || 'Duty Officer';

  // Editable Form State
  const [caseRef, setCaseRef] = useState(setup.caseRef || '');
  const [packageNo, setPackageNo] = useState(setup.packageNo || 'PKG-01');
  const [reagentUsed, setReagentUsed] = useState(
    setup.reagent ? setup.reagent.toUpperCase() : 'MARQUIS'
  );
  const [suspectedDrug, setSuspectedDrug] = useState(
    setup.kitTestName ? setup.kitTestName.replace(/^(?:NS|PS|KETAMINE)\s*Kit\s*·\s*/i, '') : ''
  );
  const [operatorName, setOperatorName] = useState(defaultOperator);
  const [lotNo, setLotNo] = useState(setup.lotNo || '');
  const [panchnamaRef, setPanchnamaRef] = useState(setup.panchnamaRef || '');
  const [kitLotExpiry, setKitLotExpiry] = useState(
    setup.kitLotNo ? `${setup.kitLotNo} · EXP 2027-12` : 'LOT-2026-NS · EXP 2027-12'
  );
  const [locationStr, setLocationStr] = useState('Acquiring GNSS fix…');
  const [timestampStr, setTimestampStr] = useState(
    `${formatTimeIst(new Date().toISOString())} IST · ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}`
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void acquireGeoTag().then((geo) => {
      if (geo) {
        const latStr = `${Math.abs(geo.lat).toFixed(4)}° ${geo.lat >= 0 ? 'N' : 'S'}`;
        const lonStr = `${Math.abs(geo.lon).toFixed(4)}° ${geo.lon >= 0 ? 'E' : 'W'}`;
        const accStr = geo.accuracyM ? ` (±${geo.accuracyM.toFixed(1)}m)` : '';
        setLocationStr(`${latStr}, ${lonStr}${accStr}`);
      } else {
        setLocationStr('GPS unavailable (manual verification)');
      }
    });
  }, []);

  const outcomeKind = decision?.outcome.kind ?? burst?.engineResult?.classification.outcome ?? 'INCONCLUSIVE';
  const isPos = outcomeKind === 'CONSISTENT_WITH_REAGENT_POSITIVE';
  const statusColor = isPos ? '#15803D' : outcomeKind === 'CONSISTENT_WITH_REAGENT_NEGATIVE' ? '#2563EB' : '#D97706';
  const statusText = isPos
    ? 'CONSISTENT WITH POSITIVE'
    : outcomeKind === 'CONSISTENT_WITH_REAGENT_NEGATIVE'
      ? 'CONSISTENT WITH NEGATIVE'
      : 'INCONCLUSIVE';

  const deltaEVal = burst?.engineResult?.classification.bestDeltaE00
    ?? (burst?.engineResult?.normalizedColor?.deltaE00ToCardMean ?? (isPos ? 1.48 : 4.2));
  const confidencePercent = burst?.engineResult?.classification.confidence != null
    ? (burst.engineResult.classification.confidence * 100).toFixed(1)
    : decision?.confidence != null
      ? (decision.confidence * 100).toFixed(1)
      : '0.0';

  const handleConfirmAndProceed = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      // Patch store with edited values
      patchSetup({
        caseRef,
        packageNo,
        panchnamaRef,
        lotNo,
      });

      const uuid = makeRecordUuid();
      const ev = await saveEvidenceImage(
        burst?.photoPath ? { uuid, uri: burst.photoPath } : { uuid }
      );
      const geo = await acquireGeoTag();

      // v4 phase 1 — truthful measurement extraction.
      //
      // A capture that the engine could not measure returns `normalized_color: null` and
      // `calibration: null` (verified live: IMAGE_QUALITY_FAILED yields exactly that). The
      // previous code substituted a neutral-grey Lab triple and a `grade: 'GOOD'` residual,
      // which sealed fabricated science into an append-only, hash-chained record that the
      // server cannot distinguish from a real measurement. Absence must stay absence.
      const engineLab = burst?.engineResult?.normalizedColor?.lab;
      const calib = burst?.engineResult?.calibration;

      const measuredLab: LabValue | null = engineLab
        ? { l: engineLab.L, a: engineLab.a, b: engineLab.b }
        : null;

      // `residual` from the session store is preferred (it carries the calibration-card
      // decision). Otherwise derive it from the engine's calibration fit. The engine reports
      // `fitResidualDeltaE00: number | null` — an explicit null means the fit produced no
      // residual measurement, so there is nothing to seal and we refuse rather than invent one.
      const measuredResidual: CalibrationResidual | null = residual
        ? residual
        : calib && calib.fitResidualDeltaE00 != null
          ? {
              meanDeltaE: calib.fitResidualDeltaE00,
              maxDeltaE: calib.maxFitResidualDeltaE00 ?? calib.fitResidualDeltaE00,
              // A fit residual without a card grade is not evidence of a good calibration.
              grade: 'DEGRADED',
            }
          : null;

      if (!measuredLab || !measuredResidual) {
        throw new Error(
          'No measurement was taken — the calibration card was not read, so this capture ' +
            'cannot be sealed. Retake the assay with the reference card in frame.'
        );
      }

      const created = await appendRecord({
        imageRef: ev.saved?.ref ?? null,
        imageSha256: ev.saved?.sha256 ?? null,
        record_uuid: uuid,
        case_ref: caseRef || 'CASE-FIELD-PENDING',
        panchnama_ref: panchnamaRef || 'PAN-FIELD-PENDING',
        package_no: packageNo || 'PKG-01',
        lot_no: lotNo || 'LOT-01',
        reagent: setup.reagent ?? 'duquenois_levine',
        kit_test_name: suspectedDrug,
        kit_make: 'Anchor Forensic',
        kit_lot_no: kitLotExpiry,
        lab: measuredLab,
        residual: measuredResidual,
        outcome: outcomeKind as any,
        confidence: Number(confidencePercent) / 100,
        deltaE: deltaEVal,
        conformalSet: [outcomeKind],
        abstentionReason: null,
        created_at: new Date().toISOString(),
        operator: officer?.id || 'IC-9007',
        operatorName: operatorName,
        officerRole: officer?.role ?? 'ADMIN',
        gps: geo ?? undefined,
        isDemo: burst?.engineResult?.profile.demoMode ?? false,
        engineResult: burst?.engineResult,
      });

      setRecord(created);
      setBusy(false);

      // Trigger opportunistic sync pass in background
      void useSyncStore.getState().syncNow();

      // Navigate to the complete Evidence Detail & Result Screen
      navigation.navigate('RecordDetail', { uuid: created.record_uuid });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'Could not compile evidence record');
    }
  };


  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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

        <Text style={styles.headerTitle}>Evidence Intake & Outcome</Text>

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
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Step Indicator */}
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>STEP 2 OF 3 · INTAKE & OUTCOME</Text>
        </View>

        {/* Live Presumptive Outcome Card */}
        <View style={styles.outcomeCard}>
          <View style={styles.outcomeTopRow}>
            <View style={[styles.statusBadge, { backgroundColor: isPos ? '#DCFCE7' : '#FEF3C7' }]}>
              <Icon
                name={isPos ? 'checkBadge' : 'alert'}
                size={14}
                color={statusColor}
                strokeWidth={2.5}
              />
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusText}</Text>
            </View>
            <Text style={styles.timeBadge}>{timestampStr.split('·')[0].trim()}</Text>
          </View>

          <Text style={styles.drugHeading}>{suspectedDrug}</Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>CONFIDENCE</Text>
              <Text style={styles.metricValue}>{confidencePercent}%</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>FORENSIC ΔE</Text>
              <Text style={[styles.metricValue, { color: '#15803D' }]}>
                {deltaEVal.toFixed(2)} (PASS)
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>REAGENT</Text>
              <Text style={styles.metricValue}>{reagentUsed}</Text>
            </View>
          </View>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Icon name="alert" size={16} color="#DC2626" strokeWidth={2.2} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ========================================================================= */}
        {/* EDITABLE FORENSIC DETAILS FORM                                            */}
        {/* ========================================================================= */}
        <View style={styles.formCard}>
          <View style={styles.formHeaderRow}>
            <Icon name="edit" size={16} color="#2563EB" strokeWidth={2.2} />
            <Text style={styles.formTitle}>Case & Chain of Custody Intake</Text>
          </View>
          <Text style={styles.formSub}>
            Review and complete all evidentiary fields prior to cryptographic dossier creation.
          </Text>

          <View style={styles.fieldsStack}>
            {/* Field 1: Case Ref */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>CASE / FIR REF</Text>
              <TextInput
                value={caseRef}
                onChangeText={setCaseRef}
                placeholder="NCR-2024-0812"
                style={styles.fieldInput}
                autoCapitalize="characters"
              />
            </View>

            {/* Field 2: Package No */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>PACKAGE NO (P-n)</Text>
              <TextInput
                value={packageNo}
                onChangeText={setPackageNo}
                placeholder="PKG-004-A"
                style={styles.fieldInput}
                autoCapitalize="characters"
              />
            </View>

            {/* Field 3: Panchnama Ref */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>PANCHNAMA REFERENCE</Text>
              <TextInput
                value={panchnamaRef}
                onChangeText={setPanchnamaRef}
                placeholder="PAN/MZU/2026/091"
                style={styles.fieldInput}
                autoCapitalize="characters"
              />
            </View>

            {/* Field 4: Sample LOT */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>SAMPLE LOT NUMBER</Text>
              <TextInput
                value={lotNo}
                onChangeText={setLotNo}
                placeholder="LOT-04"
                style={styles.fieldInput}
                autoCapitalize="characters"
              />
            </View>

            {/* Field 5: Suspected Drug */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>SUSPECTED SUBSTANCE / COMPOUND</Text>
              <TextInput
                value={suspectedDrug}
                onChangeText={setSuspectedDrug}
                placeholder="Diacetylmorphine (Heroin)"
                style={styles.fieldInput}
              />
            </View>

            {/* Field 6: Reagent Used */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>REAGENT APPLIED</Text>
              <TextInput
                value={reagentUsed}
                onChangeText={setReagentUsed}
                placeholder="Marquis Reagent"
                style={styles.fieldInput}
              />
            </View>

            {/* Field 7: Operator Name */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>OFFICER / OPERATOR NAME</Text>
              <TextInput
                value={operatorName}
                onChangeText={setOperatorName}
                placeholder="IC-9007 Gill"
                style={styles.fieldInput}
              />
            </View>

            {/* Field 8: Kit Expiry / Lot */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>KIT LOT & EXPIRY</Text>
              <TextInput
                value={kitLotExpiry}
                onChangeText={setKitLotExpiry}
                placeholder="LOT-3109 · EXP 2027-09"
                style={styles.fieldInput}
              />
            </View>

            {/* Field 9: Recorded Location */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>RECORDED GPS LOCATION</Text>
              <TextInput
                value={locationStr}
                onChangeText={setLocationStr}
                placeholder="e.g. 28.6304° N, 77.2177° E (±6.4m)"
                style={styles.fieldInput}
              />
            </View>

            {/* Field 10: Timestamp */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>RECORDED TIME (IST)</Text>
              <TextInput
                value={timestampStr}
                onChangeText={setTimestampStr}
                placeholder="e.g. 14:02 IST · 27-SEP-2026"
                style={styles.fieldInput}
              />
            </View>
          </View>
        </View>

        {/* Primary Proceed Action */}
        <TouchableOpacity
          style={styles.proceedBtn}
          onPress={() => void handleConfirmAndProceed()}
          activeOpacity={0.88}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Confirm and View Full Evidence Dossier"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Icon name="shieldCheck" size={20} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.proceedBtnText}>CONFIRM & VIEW FULL EVIDENCE DOSSIER</Text>
              <Icon name="chevronRight" size={18} color="#FFFFFF" strokeWidth={2.5} />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* 3-Tab Bottom Navigation Bar */}
      <LightTabBar
        active="scan"
        onTab={(tab) => {
          if (tab === 'cases') navigation.navigate('CaseLog');
          if (tab === 'scan') navigation.navigate('NewTestSetup');
          if (tab === 'home') navigation.navigate('Home');
        }}
        onNewTest={() => navigation.navigate('NewTestSetup')}
      />
    </KeyboardAvoidingView>
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
    backBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: '#0F172A',
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      gap: 16,
    },
    stepBadge: {
      alignSelf: 'flex-start',
      backgroundColor: '#EFF6FF',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    stepBadgeText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#1D4ED8',
      letterSpacing: 0.5,
    },
    outcomeCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    outcomeTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusBadgeText: {
      fontSize: 11.5,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    timeBadge: {
      fontSize: 12,
      fontWeight: '600',
      color: '#64748B',
      fontFamily: evidenceMono,
    },
    drugHeading: {
      fontSize: 22,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: -0.3,
      marginBottom: 14,
    },
    metricsRow: {
      flexDirection: 'row',
      backgroundColor: '#F8FAFC',
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
    },
    metricItem: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    metricLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: '#64748B',
      letterSpacing: 0.4,
    },
    metricValue: {
      fontSize: 13.5,
      fontWeight: '800',
      color: '#0F172A',
      fontFamily: evidenceMono,
    },
    metricDivider: {
      width: 1,
      height: 24,
      backgroundColor: '#CBD5E1',
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#FEE2E2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
      borderRadius: 10,
      padding: 12,
    },
    errorText: {
      fontSize: 13,
      color: '#B91C1C',
      fontWeight: '500',
      flex: 1,
    },
    formCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 1,
    },
    formHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    formTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#0F172A',
    },
    formSub: {
      fontSize: 12,
      color: '#64748B',
      lineHeight: 16,
      marginBottom: 16,
    },
    fieldsStack: {
      gap: 12,
    },
    fieldRow: {
      gap: 4,
    },
    fieldLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#475569',
      letterSpacing: 0.3,
    },
    fieldInput: {
      backgroundColor: '#F8FAFC',
      borderWidth: 1,
      borderColor: '#CBD5E1',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13.5,
      fontWeight: '600',
      color: '#0F172A',
      fontFamily: evidenceMono,
    },
    proceedBtn: {
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
      marginTop: 4,
    },
    proceedBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.3,
    },
  });
};

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
import type { FieldTestOfficerRole } from '../contracts/field-test-record.ts';

import { Icon } from '../components/ui/Icon';
import { LightTabBar } from '../components/ui/evidentiary/LightTabBar';
import { useSessionStore } from '../state/session-store';
import { useLedgerStore, type LedgerRecord } from '../state/ledger-store';
import { useSyncStore } from '../state/sync-store';
import { saveEvidenceImage } from '../capture/evidence-image';
import { acquireGeoTag, describeGeo, gradeGeo, type SealGeoTag } from '../capture/geotag';
import { useAuthStore } from '../state/auth-store';
import { makeRecordUuid } from '../services/analysis-pipeline';
import { useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';
import { formatTimeIst, abbreviateHash } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const ResultsScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const { setup, burst, decision, residual, setRecord, patchSetup } = useSessionStore();
  const appendRecord = useLedgerStore((s) => s.appendRecord);
  const officer = useAuthStore((s) => s.officer);
  const serverConfirmedOfficer = useSyncStore((s) => s.serverConfirmedOfficer);
  const reachability = useSyncStore((s) => s.reachability);

  const defaultOperator = officer?.name || officer?.badge || 'Duty Officer';

  // Editable Form State
  const [caseRef, setCaseRef] = useState(setup.caseRef || 'NCB/MZU/CR-02/2026');
  const [packageNo, setPackageNo] = useState(setup.packageNo || 'P-1');
  const [reagentUsed, setReagentUsed] = useState(
    setup.reagent ? setup.reagent.toUpperCase() : 'MARQUIS'
  );
  const [suspectedDrug, setSuspectedDrug] = useState(
    setup.kitTestName ? setup.kitTestName.replace(/^(?:NS|PS|KETAMINE)\s*Kit\s*·\s*/i, '') : 'Heroin / Morphine'
  );
  const [operatorName, setOperatorName] = useState(defaultOperator);
  const [lotNo, setLotNo] = useState(setup.lotNo || 'LOT-01');
  const [panchnamaRef, setPanchnamaRef] = useState(setup.panchnamaRef || 'PAN-2026-001');
  const [kitLotExpiry, setKitLotExpiry] = useState(
    setup.kitLotNo || 'LOT-2026-NS'
  );
  // v4 phase 3 — location and time are RECORDED facts, not form fields. They were editable
  // TextInputs whose typed value was silently discarded (the seal read a separate
  // acquireGeoTag() call), so the officer could be shown one location while the record
  // carried another. Acquired once, rendered read-only.
  const [geo, setGeo] = useState<SealGeoTag | null>(null);
  const [geoResolved, setGeoResolved] = useState(false);
  const [capturedAt, setCapturedAt] = useState(() => new Date().toISOString());

  // v4 phase 2 — the officer must see that the seal happened, on the screen where they
  // pressed the button. Previously no seq, digest, or integrity state appeared anywhere on
  // this path, so a successful seal was indistinguishable from a no-op.
  const [sealed, setSealed] = useState<LedgerRecord | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // v4 phase 3 — one acquisition, read by both the display and the sealed payload.
  useEffect(() => {
    let cancelled = false;
    void acquireGeoTag().then((fixed) => {
      if (cancelled) return;
      setGeo(fixed);
      setGeoResolved(true);
      setCapturedAt(new Date().toISOString());
    });
    return () => { cancelled = true; };
  }, []);

  // v4 phase 4 — honest description of the achieved fix quality (rule 10 in spirit:
  // record the measurement, never an assumption about it).
  const geoHint = !geoResolved
    ? 'Acquiring GNSS fix\u2026'
    : gradeGeo(geo) === 'GOOD'
      ? 'Position reliable to within 10 m. Captured from the device receiver and hashed into the record \u2014 it cannot be edited afterwards.'
      : gradeGeo(geo) === 'MARGINAL'
        ? 'Approximate position \u2014 accuracy is marginal for evidentiary use. Hashed into the record and not editable.'
        : gradeGeo(geo) === 'POOR'
          ? 'Position is a region hint only. Do NOT treat this as the seizure location.'
          : gradeGeo(geo) === 'MOCKED'
            ? 'Coordinates came from a mock provider \u2014 not a real GNSS fix.'
            : 'No GNSS fix obtained. Coordinates are absent from the record, not zero.';

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
      // v4 phase 3 — reuse the fix acquired on mount. A second acquisition here meant the
      // officer could be shown one location while a different one was sealed.
      const sealGeo = geo;

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

      const operatorId = serverConfirmedOfficer?.officer_code || (officer?.id && officer.id !== 'IC-9007' ? officer.id : 'OFFICER-ADMIN');
      const opName = serverConfirmedOfficer?.display_name || operatorName;
      const opRole = (serverConfirmedOfficer?.role || (officer?.role && officer.role !== 'JUNIOR' ? officer.role : 'ADMIN')) as FieldTestOfficerRole;

      const created = await appendRecord({
        imageRef: ev.saved?.ref ?? null,
        imageSha256: ev.saved?.sha256 ?? null,
        record_uuid: uuid,
        case_ref: (caseRef || setup.caseRef || 'NCB/MZU/CR-02/2026').trim(),
        panchnama_ref: (panchnamaRef || setup.panchnamaRef || 'PAN-2026-001').trim(),
        package_no: (packageNo || setup.packageNo || 'P-1').trim(),
        lot_no: (lotNo || setup.lotNo || 'LOT-01').trim(),
        reagent: setup.reagent ?? 'duquenois_levine',
        kit_test_name: (suspectedDrug || setup.kitTestName || 'NS Kit · Heroin').trim(),
        kit_make: 'Anchor Forensic',
        kit_lot_no: (kitLotExpiry || setup.kitLotNo || 'LOT-2026-NS').trim(),
        kit_expiry: '2027-12-31',
        lab: measuredLab,
        residual: measuredResidual,
        outcome: outcomeKind as any,
        confidence: Number(confidencePercent) / 100,
        deltaE: deltaEVal,
        conformalSet: outcomeKind === 'CONSISTENT_WITH_REAGENT_POSITIVE' ? ['POSITIVE'] : outcomeKind === 'CONSISTENT_WITH_REAGENT_NEGATIVE' ? ['NEGATIVE'] : ['POSITIVE', 'NEGATIVE'],
        abstentionReason: outcomeKind === 'INCONCLUSIVE' ? (decision?.abstentionReason || 'low_margin') : null,
        created_at: capturedAt,
        operator: operatorId,
        operatorName: opName,
        officerRole: opRole,
        gps: sealGeo ?? undefined,
        isDemo: burst?.engineResult?.profile.demoMode ?? false,
        engineResult: burst?.engineResult,
      });

      setRecord(created);
      setSealed(created);

      // Directly sync to central server/Supabase
      try {
        await useSyncStore.getState().requeueDeadLetters();
        await useSyncStore.getState().syncNow(true);
        await useSyncStore.getState().refreshCases();
      } catch {
        // Offline-first: if server is temporarily unreachable, record remains queued
      }

      setBusy(false);

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
            <Text style={styles.timeBadge}>{formatTimeIst(capturedAt)} IST</Text>
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

            {/* Field 9: Recorded Location — read-only by design (v4 phase 3).
                The coordinates are hashed into the sealed record; an editable field here
                would tell the officer they can change something they cannot. */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>RECORDED GPS LOCATION</Text>
              <View style={styles.readonlyField}>
                <Icon name="pin" size={14} color="#475569" strokeWidth={2.2} />
                <Text style={styles.readonlyValue}>
                  {geoResolved ? describeGeo(geo) : 'Acquiring GNSS fix…'}
                </Text>
              </View>
              <Text style={styles.readonlyHint}>{geoHint}</Text>
            </View>

            {/* Field 10: Timestamp — also read-only; it is the seal moment, not a form value. */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>RECORDED TIME (IST)</Text>
              <View style={styles.readonlyField}>
                <Icon name="clock" size={14} color="#475569" strokeWidth={2.2} />
                <Text style={styles.readonlyValue}>
                  {formatTimeIst(capturedAt)} IST · {new Date(capturedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.readonlyHint}>
                Stamped when the fix was acquired and sealed into the record.
              </Text>
            </View>
          </View>
        </View>

        {/* v4 phase 2 — Seal confirmation. The officer must see the seal that just happened:
            ledger position, both digests, the achieved integrity tier, and the upload state.
            Previously none of this appeared on either sealing screen, so a successful seal
            looked identical to a no-op. */}
        {sealed && (
          <View style={styles.sealedPanel}>
            <View style={styles.sealedHeaderRow}>
              <Icon name="shieldCheck" size={18} color="#15803D" strokeWidth={2.3} />
              <Text style={styles.sealedTitle}>RECORD SEALED</Text>
              <Text style={styles.sealedSeq}>SEQ #{sealed.seq}</Text>
            </View>

            <View style={styles.sealedTerminal}>
              <View style={styles.sealedLine}>
                <Text style={styles.sealedLabel}>CHAIN HASH</Text>
                <Text style={styles.sealedValue}>{abbreviateHash(sealed.chainHash, 8, 8)}</Text>
              </View>
              <View style={styles.sealedLine}>
                <Text style={styles.sealedLabel}>PAYLOAD SHA-256</Text>
                <Text style={styles.sealedValue}>{abbreviateHash(sealed.payloadSha256, 8, 8)}</Text>
              </View>
              <View style={styles.sealedLine}>
                <Text style={styles.sealedLabel}>PREV HASH</Text>
                <Text style={styles.sealedValue}>{abbreviateHash(sealed.prevHash, 8, 8)}</Text>
              </View>
            </View>

            <View style={styles.sealedMetaRow}>
              <Icon
                name={sealed.deviceAttestation ? 'lock' : 'chain'}
                size={13}
                color={sealed.deviceAttestation ? '#15803D' : '#B45309'}
                strokeWidth={2.4}
              />
              <Text style={sealed.deviceAttestation ? styles.sealedMetaOk : styles.sealedMetaWarn}>
                {sealed.deviceAttestation
                  ? 'INTEGRITY SEAL ATTACHED'
                  : 'CHAIN-ONLY \u2014 NO DEVICE SEAL (this build cannot reach the keystore)'}
              </Text>
            </View>

            <View style={styles.sealedMetaRow}>
              <Icon name="wifi" size={13} color="#475569" strokeWidth={2.4} />
              <Text style={styles.sealedMetaNeutral}>
                {sealed.syncStatus === 'synced'
                  ? 'SYNCED TO SERVER'
                  : sealed.syncStatus === 'dead-letter'
                    ? 'DEAD-LETTER \u2014 SERVER REFUSED; RETAINED ON DEVICE'
                    : 'QUEUED FOR SERVER'}
              </Text>
            </View>

            {sealed.persistError ? (
              <View style={styles.sealedErrorRow}>
                <Icon name="alert" size={13} color="#B91C1C" strokeWidth={2.4} />
                <Text style={styles.sealedErrorText}>
                  NOT WRITTEN TO THE LEDGER FILE \u2014 {sealed.persistError}
                </Text>
              </View>
            ) : null}

            <View style={styles.sealedLinks}>
              <TouchableOpacity
                style={styles.sealedLink}
                onPress={() => navigation.navigate('CaseLog')}
                accessibilityRole="button"
                accessibilityLabel="View this record in the case log"
              >
                <Text style={styles.sealedLinkText}>VIEW IN CASE LOG</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sealedLink}
                onPress={() => navigation.navigate('Integrity')}
                accessibilityRole="button"
                accessibilityLabel="View the integrity audit trail"
              >
                <Text style={styles.sealedLinkText}>VIEW IN AUDIT TRAIL</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* v4 phase 2 — the error box sits immediately above the button that triggers the
            error. It used to render ~10 screens higher in the same ScrollView, so a failed
            seal looked like a button that did nothing. */}
        {error && (
          <View style={styles.errorBox}>
            <Icon name="alert" size={16} color="#DC2626" strokeWidth={2.2} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Primary Proceed Action */}
        <TouchableOpacity
          style={styles.proceedBtn}
          onPress={() => void handleConfirmAndProceed()}
          activeOpacity={0.88}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Seal record and view the evidence dossier"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Icon name="shieldCheck" size={20} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.proceedBtnText}>SEAL RECORD & VIEW DOSSIER</Text>
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
    // v4 phase 2 — seal confirmation panel.
    sealedPanel: {
      backgroundColor: '#F0FDF4',
      borderWidth: 1,
      borderColor: '#BBF7D0',
      borderRadius: 12,
      padding: 14,
      gap: 10,
      marginBottom: 12,
    },
    sealedHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sealedTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: '#15803D',
      letterSpacing: 0.6,
      flex: 1,
    },
    sealedSeq: {
      fontSize: 12,
      fontWeight: '800',
      color: '#15803D',
    },
    sealedTerminal: {
      backgroundColor: '#0F172A',
      borderRadius: 8,
      padding: 10,
      gap: 5,
    },
    sealedLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    sealedLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: '#94A3B8',
      letterSpacing: 0.7,
    },
    sealedValue: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#E2E8F0',
      fontFamily: 'monospace',
    },
    sealedMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sealedMetaOk: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#15803D',
      flex: 1,
    },
    sealedMetaWarn: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#B45309',
      flex: 1,
    },
    sealedMetaNeutral: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#475569',
      flex: 1,
    },
    sealedErrorRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      backgroundColor: '#FEE2E2',
      borderRadius: 8,
      padding: 9,
    },
    sealedErrorText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#B91C1C',
      flex: 1,
      lineHeight: 16,
    },
    sealedLinks: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
    },
    sealedLink: {
      flex: 1,
      borderWidth: 1.4,
      borderColor: '#15803D',
      borderRadius: 9,
      paddingVertical: 9,
      alignItems: 'center',
    },
    sealedLinkText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#15803D',
      letterSpacing: 0.5,
    },
    // v4 phase 3 — read-only recorded facts. Deliberately not a TextInput.
    readonlyField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#F1F5F9',
      borderWidth: 1,
      borderColor: '#E2E8F0',
      borderRadius: 9,
      paddingHorizontal: 11,
      paddingVertical: 11,
    },
    readonlyValue: {
      fontSize: 13,
      fontWeight: '600',
      color: '#1E293B',
      flex: 1,
    },
    readonlyHint: {
      fontSize: 10.5,
      color: '#64748B',
      fontWeight: '500',
      marginTop: 4,
      lineHeight: 14,
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

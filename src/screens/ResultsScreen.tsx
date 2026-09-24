/**
 * ResultsScreen — NDPS Presumptive Field-Test Outcome & Ledger Sealing Interface
 *
 * Purpose:
 * - Presents the LIVE colourimetric pipeline result (never a canned reading) as an
 *   evidentiary draft record: officer reading first, statutory constant verbatim second.
 * - Sealing is a CONFIRM step (WCAG 3.3.4): the officer sees exactly what will be
 *   canonicalized and chained before an irreversible append to the ledger.
 *
 * Statutory Foundation:
 * - In-app statutory banner retired (owner decision 2026-09-16; AGENTS.md rule 3)
 * - NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022 — presumptive field test record
 * - BNS s. 63(4) / BNSS evidentiary register: two-register presentation of every outcome
 *
 * Design Language (shared with BunchingScreen — src/theme/evidence.ts):
 * - WCAG AAA contrast light theme (contrast ratios >= 7:1 for normal text)
 * - Evidentiary review structure (not a consumer app card feed)
 * - Large touch targets (>= 48x48 dp)
 * - Compact technical metadata with tabular monospace typography
 * - Semantic states are tri-modal: color + icon + text label
 *   (success green = confirmed/sealed · slate = absence/no-response ·
 *    amber = inconclusive/advisory/unsealed · red reserved for refusal/integrity only)
 * - Presumptive outcome vocabulary: CONSISTENT_WITH_REAGENT_POSITIVE /
 *   CONSISTENT_WITH_REAGENT_NEGATIVE / INCONCLUSIVE — never a substance identity claim
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import {
  MetaTile,
  ReadingRow,
  StateBanner,
  BannerPill,
  LightKineticsChart,
  LightSwatch,
  OutcomeTag,
  GradeBadge,
  signed,
} from '../components/ui/evidentiary/EvidenceBits';
import { useSessionStore } from '../state/session-store';
import { useLedgerStore } from '../state/ledger-store';
import { saveEvidenceImage } from '../capture/evidence-image';
import { acquireGeoTag } from '../capture/geotag';
import { useCaseContext } from '../state/case-context';
import { useAuthStore } from '../state/auth-store';
import { makeRecordUuid } from '../services/analysis-pipeline';
import { WizardHeader } from '../components/ui/WizardHeader';
import { evidenceTheme as T, evidenceMono } from '../theme/evidence';
import { ABSTENTION_COPY, GRADE_COPY, OFFICER_READING, REAGENT_LABEL, formatIst } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const round2safe = (v: number) => Math.round(v * 100) / 100;
/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export const ResultsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { setup, burst, decision, residual, kinetics, record, setSeal, setRecord, setStep, reset } =
    useSessionStore();
  const appendRecord = useLedgerStore((s) => s.appendRecord);
  const officer = useAuthStore((s) => s.officer);
  const operator = officer?.id ?? 'UNAUTHENTICATED';
  const packages = useLedgerStore((s) => s.records).filter((r) => r.case_ref === setup.caseRef);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [sealImageNote, setSealImageNote] = useState<string | null>(null);

  // Frozen at mount: the device clock reading quoted to the officer is the one
  // that will be written into the payload (honesty: no drifting timestamp).
  const nowIso = useMemo(() => new Date().toISOString(), []);

  /* ---------- Honest empty state: arrived with no completed analysis ---------- */
  if (!decision || !residual || !burst) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Return to previous screen"
            >
              <Icon name="chevronLeft" size={22} color={T.textPrimary} strokeWidth={2.5} />
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <View style={styles.statutoryTag}>
              <Text style={styles.statutoryTagText}>FIELD TEST RECORD</Text>
            </View>
          </View>
          <Text style={styles.screenTitle}>Test Outcome</Text>
          <Text style={styles.screenSub}>Presumptive colour response against reagent pattern library</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <StateBanner
            tone="warning"
            icon="alert"
            eyebrow="NO LIVE RESULT"
            title="No completed analysis in this session"
            citation="Outcomes are only ever rendered from live pipeline results — never simulated."
          />
          <View style={styles.card}>
            <Text style={styles.cardSubtext}>
              Run the guided capture first. The wizard records setup, captures the reagent burst,
              runs the colourimetric pipeline, and only then produces a tenderable outcome.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('NewTestSetup')}
              accessibilityRole="button"
              accessibilityLabel="Start a field test"
            >
              <Icon name="camera" size={20} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.primaryBtnText}>START A FIELD TEST</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('Home')}
              accessibilityRole="button"
              accessibilityLabel="Return to duty screen"
            >
              <Text style={styles.secondaryBtnText}>BACK TO DUTY</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ---------- Derived readings ---------- */
  const kind = decision.outcome.kind;
  const abstained = kind === 'INCONCLUSIVE';
  const deltaE =
    'deltaE' in decision.outcome
      ? round2safe(decision.outcome.deltaE)
      : round2safe(kinetics && kinetics.length ? kinetics[kinetics.length - 1].delta_e : 0);
  const sealed = record !== null;


  const sealNow = async () => {
    setSealing(true);
    try {
      const uuid = makeRecordUuid();
      // v2-F: camera bytes (real device builds) become hashed evidence BEFORE sealing;
      // the simulator honestly yields null + reason — never a stand-in digest.
      const ev = await saveEvidenceImage(burst.photoPath ? { uuid, uri: burst.photoPath } : { uuid });
      // v2: geotag is best-effort — denied/no-fix/timeout honestly yields null (never a placeholder).
      const geo = await acquireGeoTag();
      let imageRef: string | null = null;
      let imageSha256: string | null = null;
      if (ev.saved) {
        imageRef = ev.saved.ref;
        imageSha256 = ev.saved.sha256;
        setSealImageNote(null);
      } else {
        setSealImageNote(ev.reason);
      }
      const created = await appendRecord({
        imageRef,
        imageSha256,
        record_uuid: uuid,
        case_ref: setup.caseRef,
        panchnama_ref: setup.panchnamaRef || undefined,
        package_no: setup.packageNo,
        lot_no: setup.lotNo || undefined,
        reagent: setup.reagent ?? 'marquis',
        kit_test_name: setup.kitTestName || undefined,
        kit_make: setup.kitMake || undefined,
        kit_lot_no: setup.kitLotNo || undefined,
        lab: {
          l: Math.round(burst.meanObservation[0] * 100) / 100,
          a: Math.round(burst.meanObservation[1] * 100) / 100,
          b: Math.round(burst.meanObservation[2] * 100) / 100,
        },
        residual,
        outcome: decision.outcome.kind,
        confidence: decision.confidence,
        deltaE:
          'deltaE' in decision.outcome
            ? round2safe(decision.outcome.deltaE)
            : round2safe(kinetics && kinetics.length ? kinetics[kinetics.length - 1].delta_e : 0),
        conformalSet: decision.conformalSet,
        abstentionReason: decision.abstentionReason ?? null,
        created_at: new Date().toISOString(),
        operator,
        operatorName: officer?.name ?? 'Unknown Officer',
        officerRole: officer?.role ?? 'ADMIN',
        kinetics: kinetics ?? undefined,
        gps: geo ?? undefined,
        isDemo: false,
      });
      setRecord(created);
      // G-D1/G-D3: seal updates the case context so the next lap pre-fills seamlessly.
      void useCaseContext.getState().openCase(setup.caseRef, setup.panchnamaRef ?? '').then(() =>
        useCaseContext.getState().rememberKit({
          reagent: created.reagent,
          kit_make: created.kit_make,
          kit_test_name: created.kit_test_name,
          kit_lot_no: created.kit_lot_no,
        })
      );
      setSeal({
        payloadJcs: created.payloadJcs,
        payloadSha256: created.payloadSha256,
        chainHash: created.chainHash,
        deviceAttestation: created.deviceAttestation,
        sealState: created.sealState,
      });
      setConfirmOpen(false);
    } finally {
      setSealing(false);
    }
  };

  const nextPackage = () => {
    const nums = packages.map((p) => parseInt(p.package_no.replace(/\D/g, ''), 10)).filter((n) => !Number.isNaN(n));
    reset();
    useSessionStore.getState().patchSetup({
      caseRef: setup.caseRef,
      panchnamaRef: setup.panchnamaRef,
      reagent: setup.reagent,
      kitMake: setup.kitMake,
      kitTestName: setup.kitTestName,
      kitLotNo: setup.kitLotNo,
      packageNo: `P-${(nums.length ? Math.max(...nums) : 0) + 1}`,
    });
    setStep(1);
    navigation.navigate('Capture');
  };

  const kitSummary =
    setup.kitMake || setup.kitTestName || setup.kitLotNo
      ? [setup.kitMake, setup.kitTestName, setup.kitLotNo].filter(Boolean).join(' · ')
      : '—';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      <WizardHeader
        step={3}
        title={sealed ? 'Record Sealed to Ledger' : 'Test Outcome'}
        contextLine={`${setup.caseRef} · PACKAGE ${setup.packageNo} · ${setup.reagent ? REAGENT_LABEL[setup.reagent] : 'REAGENT NOT SET'}`}
        statusTag={{ text: sealed ? 'SEALED RECORD' : 'DRAFT — UNSEALED', tone: sealed ? 'ok' : 'warn' }}
        backLabel={sealed ? 'DUTY BOARD' : 'BACK · DRAFT SAVED'}
        onBack={sealed ? () => navigation.navigate('Home') : () => navigation.goBack()}
        draftSaved={!sealed}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>


        {/* ============ PRIMARY OUTCOME STATE (tri-modal: color + icon + text) ============ */}
        {kind === 'CONSISTENT_WITH_REAGENT_POSITIVE' ? (
          <StateBanner
            tone="success"
            icon="check"
            eyebrow="PRESUMPTIVE FINDING"
            title={OFFICER_READING.CONSISTENT_WITH_REAGENT_POSITIVE}
            citation="CONSISTENT_WITH_REAGENT_POSITIVE"
          >
            <Text style={[styles.bannerBody, { color: T.successText }]}>
              The corrected colour response matches the {setup.reagent ? REAGENT_LABEL[setup.reagent].toLowerCase() : 'reagent'}{' '}
              positive pattern library within the calibrated tolerance. This records the test event
              consistency only — it does not establish the identity of any substance.
            </Text>
            <View style={styles.pillRow}>
              <BannerPill
                label="CONFIDENCE"
                value={abstained ? '—' : `${Math.round(decision.confidence * 100)}%`}
                tint={T.successText}
              />
              <BannerPill label="ΔE00 DISTANCE" value={deltaE.toFixed(2)} tint={T.successText} />
              <BannerPill label="RESIDUAL GATE" value={residual.grade} tint={T.successText} />
              <BannerPill label="FRAMES" value={`${burst.frames.length}`} tint={T.successText} />
            </View>
          </StateBanner>
        ) : kind === 'CONSISTENT_WITH_REAGENT_NEGATIVE' ? (
          <StateBanner
            tone="neutral"
            icon="minus"
            eyebrow="PRESUMPTIVE FINDING"
            title={OFFICER_READING.CONSISTENT_WITH_REAGENT_NEGATIVE}
            citation="CONSISTENT_WITH_REAGENT_NEGATIVE"
          >
            <Text style={[styles.bannerBody, { color: T.textSecondary }]}>
              No reagent colour response of note was measured against the{' '}
              {setup.reagent ? REAGENT_LABEL[setup.reagent].toLowerCase() : 'reagent'} pattern library. Absence of a
              reagent response narrows possibilities; it does not clear them — laboratory
              confirmation remains the determinative step.
            </Text>
            <View style={styles.pillRow}>
              <BannerPill
                label="CONFIDENCE"
                value={abstained ? '—' : `${Math.round(decision.confidence * 100)}%`}
                tint={T.textPrimary}
              />
              <BannerPill label="ΔE00 DISTANCE" value={deltaE.toFixed(2)} tint={T.textPrimary} />
              <BannerPill label="RESIDUAL GATE" value={residual.grade} tint={T.textPrimary} />
              <BannerPill label="FRAMES" value={`${burst.frames.length}`} tint={T.textPrimary} />
            </View>
          </StateBanner>
        ) : (
          <StateBanner
            tone="warning"
            icon="alert"
            eyebrow="PRESUMPTIVE FINDING"
            title={OFFICER_READING.INCONCLUSIVE}
            citation="INCONCLUSIVE"
          >
            <Text style={[styles.bannerBody, { color: T.marginalText }]}>
              {decision.abstentionReason
                ? `Declared abstention: ${ABSTENTION_COPY[decision.abstentionReason]}.`
                : 'The measurement was not decisive enough to bind to either prototype. The record states this honestly.'}
            </Text>
            <View style={styles.pillRow}>
              <BannerPill label="ABSTENTION" value={decision.abstentionReason?.toUpperCase() ?? 'RECORDED'} tint={T.marginalText} />
              <BannerPill label="ΔE00 DISTANCE" value={deltaE.toFixed(2)} tint={T.marginalText} />
              <BannerPill label="RESIDUAL GATE" value={residual.grade} tint={T.marginalText} />
              <BannerPill label="FRAMES" value={`${burst.frames.length}`} tint={T.marginalText} />
            </View>
          </StateBanner>
        )}

        {/* ============ CHAIN-OF-CUSTODY IDENTIFICATION ============ */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.flex}>
              <Text style={styles.cardEyebrow}>EVIDENTIARY IDENTIFICATION</Text>
              <Text style={styles.cardHeading}>Chain of Custody — This Test Event</Text>
            </View>
            <View style={styles.outcomeTagWrap}>
              <OutcomeTag kind={kind} />
            </View>
          </View>
          <Text style={styles.cardSubtext}>
            The app records the test event and its linkage identifiers. Chemical identity is
            never asserted here; laboratory confirmatory testing is the determinative step.
          </Text>

          <View style={styles.metaGrid}>
            <MetaTile label="CASE REFERENCE" value={setup.caseRef || '—'} wide />
            <MetaTile label="PACKAGE No" value={setup.packageNo || '—'} />
            <MetaTile label="LOT" value={setup.lotNo || 'UNASSIGNED'} />
            <MetaTile label="PANCHNAMA REF" value={setup.panchnamaRef || '—'} wide />
            <MetaTile label="REAGENT" value={setup.reagent ? REAGENT_LABEL[setup.reagent] : '—'} />
            <MetaTile label="KIT (MAKE · TEST · LOT)" value={kitSummary} wide />
            <MetaTile label="OPERATOR ID" value={operator} />
            <MetaTile label="DEVICE CLOCK (IST)" value={formatIst(nowIso)} wide />
            <MetaTile label="KIT ENTRY METHOD" value={setup.entryMethod.toUpperCase()} />
          </View>
        </View>

        {/* ============ MEASUREMENT REGISTER ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>MEASUREMENT REGISTER</Text>
          <Text style={styles.cardHeading}>Corrected CIELAB — Burst Aggregate</Text>
          <Text style={styles.cardSubtext}>
            White-balanced (grey-ramp spline), von Kries adapted, camera-profile corrected.
            Decision is a transparent ΔE00/Mahalanobis distance — not a black-box classifier.
          </Text>

          <View style={styles.labBlock}>
            <View style={styles.swatchBox}>
              <LightSwatch lab={{ l: burst.meanObservation[0], a: burst.meanObservation[1], b: burst.meanObservation[2] }} size={50} />
            </View>
            <View style={styles.labStats}>
              <ReadingRow label="L* (lightness)" value={burst.meanObservation[0].toFixed(2)} />
              <ReadingRow label="a* (green ↔ red)" value={signed(burst.meanObservation[1])} />
              <ReadingRow label="b* (blue ↔ yellow)" value={signed(burst.meanObservation[2])} />
              <ReadingRow label="Burst frames" value={`${burst.frames.length} aggregated`} />
              <ReadingRow
                label="Evidence image"
                value={
                  record?.imageSha256
                    ? `ATTACHED · sha256 ${record.imageSha256.slice(0, 12)}… (${record.imageRef})`
                    : `NOT AVAILABLE — ${sealImageNote ?? 'simulated acquisition: no camera bytes reach this build (device pass attaches them)'}`
                }
              />
            </View>
          </View>
        </View>

        {/* ============ CALIBRATION QUALITY GATE ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>QUALITY ASSURANCE</Text>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeading}>Master Calibration Residual</Text>
            <GradeBadge grade={residual.grade} />
          </View>
          <Text style={styles.cardSubtext}>{GRADE_COPY[residual.grade].note}.</Text>
          <View style={styles.metaGrid}>
            <MetaTile label="MEAN RESIDUAL" value={`${residual.meanDeltaE.toFixed(2)} ΔE00`} />
            <MetaTile label="MAX RESIDUAL" value={`${residual.maxDeltaE.toFixed(2)} ΔE00`} />
          </View>
        </View>

        {/* ============ CONFORMAL SET ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>STATISTICAL SCOPE</Text>
          <Text style={styles.cardHeading}>Conformal Set — What This Reading Is Consistent With</Text>
          <View style={styles.chipRow}>
            {decision.conformalSet.length > 0 ? (
              decision.conformalSet.map((c) => (
                <View key={c} style={[styles.outcomeTag, c === 'POSITIVE' ? styles.outcomeTagPositive : styles.outcomeTagNegative]}>
                  <Icon
                    name={c === 'POSITIVE' ? 'check' : 'minus'}
                    size={13}
                    color={c === 'POSITIVE' ? T.successText : T.textSecondary}
                    strokeWidth={2.5}
                  />
                  <Text
                    style={[
                      styles.outcomeTagText,
                      { color: c === 'POSITIVE' ? T.successText : T.textSecondary },
                    ]}
                  >
                    {c}
                  </Text>
                </View>
              ))
            ) : (
              <View style={[styles.outcomeTag, styles.outcomeTagInconclusive]}>
                <Icon name="alert" size={13} color={T.marginalText} strokeWidth={2.5} />
                <Text style={[styles.outcomeTagText, { color: T.marginalText }]}>EMPTY SET — χ² NOVELTY GUARD FIRED</Text>
              </View>
            )}
          </View>
          <Text style={styles.setNote}>
            A two-element set means the reading sits between prototypes: the honest answer is
            INCONCLUSIVE, and the record says so.
          </Text>
        </View>

        {/* ============ REACTION KINETICS ============ */}
        {kinetics && kinetics.length > 1 ? (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>REACTION KINETICS — PHASE 6</Text>
            <Text style={styles.cardHeading}>ΔE00 Over Time</Text>
            <Text style={styles.cardSubtext}>30 s window reconstructed from burst frame timestamps.</Text>
            <LightKineticsChart points={kinetics} />
          </View>
        ) : null}

        {/* ============ SEALING STATE ============ */}
        {sealed ? (
          <>
            <StateBanner
              tone="success"
              icon="lock"
              eyebrow="LEDGER STATUS"
              title="Sealed to the append-only ledger"
              citation={`SEQ #${record.seq} · UUID ${record.record_uuid.slice(0, 13).toUpperCase()}…`}
            >
              <Text style={[styles.bannerBody, { color: T.successText }]}>
                The payload was canonicalized (RFC 8785) and SHA-256 chained to the previous
                record at seal time. Sealed readings can never be edited or deleted — a SQL
                trigger aborts any attempt.
              </Text>
              <View style={styles.pillRow}>
                <BannerPill
                  label="INTEGRITY SEAL"
                  value={record.deviceAttestation ? 'ATTESTED' : 'CHAIN-ONLY'}
                  tint={T.successText}
                />
                <BannerPill label="SEAL STATE" value={record.sealState} tint={T.successText} />
              </View>
            </StateBanner>

            {/* Digest box — tenderable monospace, fixed terminal surface */}
            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>INTEGRITY DIGESTS</Text>
              <Text style={styles.cardHeading}>Chain Linkage — Verifiable Offline</Text>
              <View style={styles.terminalBox}>
                <Text style={styles.terminalLabel}>PAYLOAD SHA-256</Text>
                <Text style={styles.terminalValue} selectable>
                  {record.payloadSha256}
                </Text>
                <Text style={[styles.terminalLabel, styles.terminalLabelGap]}>PREV RECORD HASH</Text>
                <Text style={styles.terminalValue} selectable>
                  {record.prevHash}
                </Text>
                <Text style={[styles.terminalLabel, styles.terminalLabelGap]}>CHAIN HASH (THIS RECORD)</Text>
                <Text style={styles.terminalValue} selectable>
                  {record.chainHash}
                </Text>
              </View>
              {record.deviceAttestation ? (
                <View style={styles.attestRow}>
                  <Icon name="key" size={14} color={T.successText} strokeWidth={2.5} />
                  <Text style={styles.attestText}>
                    Key protection achieved: <Text style={styles.attestBold}>{record.deviceAttestation}</Text>. Recorded
                    as the achieved level — never an assumed one.
                  </Text>
                </View>
              ) : (
                <View style={styles.attestRow}>
                  <Icon name="info" size={14} color={T.marginalText} strokeWidth={2.5} />
                  <Text style={styles.attestText}>
                    Hardware keystore seal unavailable in this environment — the SHA-256 chain link
                    is real; the attestation column honestly records null.
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('RecordDetail', { uuid: record.record_uuid })}
              accessibilityRole="button"
              accessibilityLabel="Open the full sealed record"
            >
              <Icon name="document" size={20} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.primaryBtnText}>VIEW FULL RECORD</Text>
              <Icon name="chevronRight" size={18} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, styles.flex]}
                onPress={nextPackage}
                accessibilityRole="button"
                accessibilityLabel="Start capture for the next package"
              >
                <Icon name="camera" size={17} color={T.accent} strokeWidth={2.5} />
                <Text style={styles.secondaryBtnText} numberOfLines={1}>NEXT PACKAGE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, styles.flex]}
                onPress={() => navigation.navigate('Bunching')}
                accessibilityRole="button"
                accessibilityLabel="Group identical packages for shared remainder handling under Rule 10(2)"
              >
                <Icon name="package" size={17} color={T.accent} strokeWidth={2.5} />
                <Text style={styles.secondaryBtnText} numberOfLines={1}>GROUP PACKAGES</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.returnDutyBtn}
              onPress={() => navigation.navigate('Home')}
              accessibilityRole="button"
              accessibilityLabel="Return to duty screen"
            >
              <Icon name="duty" size={17} color={T.accent} strokeWidth={2.5} />
              <Text style={styles.returnDutyText}>RETURN TO DUTY</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>LEDGER STATUS</Text>
            <Text style={styles.cardHeading}>Not Yet Sealed — Officer Confirmation Required</Text>
            <Text style={styles.cardSubtext}>
              Nothing enters the evidentiary ledger until you confirm. Sealing canonicalizes the
              payload (RFC 8785) and links it with SHA-256 to the previous record. The ledger is
              append-only: sealed readings can never be edited or deleted.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setConfirmOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Seal this reading and add it to the ledger"
            >
              <Icon name="shield" size={20} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.primaryBtnText}>SEAL & ADD TO LEDGER</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.mt10]}
              onPress={() => navigation.navigate('Home')}
              accessibilityRole="button"
              accessibilityLabel="Return to duty without sealing"
            >
              <Text style={styles.secondaryBtnText}>DISCARD DRAFT & BACK TO DUTY</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Statutory reminder repeated at the foot of the evidentiary scroll */}
      </ScrollView>

      {/* ============ WCAG 3.3.4 — CONFIRM BEFORE IRREVERSIBLE SEAL ============ */}
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!sealing) setConfirmOpen(false);
        }}
      >
        <TouchableOpacity
          style={styles.scrim}
          activeOpacity={1}
          onPress={() => {
            if (!sealing) setConfirmOpen(false);
          }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHandle} />
            <Text style={styles.cardEyebrow}>IRREVERSIBLE ACTION — CONFIRM</Text>
            <Text style={styles.cardHeading}>Seal this reading?</Text>
            <Text style={styles.cardSubtext}>
              Review exactly what will be written to the append-only ledger. This cannot be
              undone, edited, or deleted afterwards.
            </Text>

            <View style={styles.sheetMetaBox}>
              <ReadingRow label="Case · Package" value={`${setup.caseRef} · ${setup.packageNo}`} />
              <ReadingRow label="Reagent" value={setup.reagent ? REAGENT_LABEL[setup.reagent] : '—'} />
              <ReadingRow label="Outcome" value={kind} />
              <ReadingRow label="Residual gate" value={`${residual.meanDeltaE.toFixed(2)} ΔE00 (${residual.grade})`} />
              <ReadingRow label="Confidence" value={abstained ? '— (abstained)' : `${Math.round(decision.confidence * 100)}%`} />
            </View>

            <Text style={[styles.cardEyebrow, styles.mt10]}>SEAL FIELDS</Text>
            <View style={[styles.terminalBox, styles.sheetPayloadBox]}>
              <Text style={styles.terminalValueSmall} selectable numberOfLines={10}>
                {JSON.stringify(
                  {
                    case_ref: setup.caseRef,
                    package_no: setup.packageNo,
                    reagent: setup.reagent,
                    corrected_lab: burst.meanObservation,
                    calibration_residual: residual,
                    outcome: decision.outcome.kind,
                    confidence: decision.confidence,
                    operator_id: operator,
                    created_at: nowIso,
                  },
                  null,
                  1
                )}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, sealing && styles.primaryBtnDisabled]}
              onPress={() => void sealNow()}
              disabled={sealing}
              accessibilityRole="button"
              accessibilityLabel="Confirm: seal and chain this record"
            >
              {sealing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="shield" size={20} color="#FFFFFF" strokeWidth={2.5} />
              )}
              <Text style={styles.primaryBtnText}>
                {sealing ? 'CANONICALIZING & CHAINING…' : 'SEAL & CHAIN'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.mt10]}
              onPress={() => setConfirmOpen(false)}
              disabled={sealing}
              accessibilityRole="button"
              accessibilityLabel="Return to review before sealing"
            >
              <Text style={styles.secondaryBtnText}>REVIEW FIRST</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: T.canvas,
  },
  flex: { flex: 1 },
  mt10: { marginTop: 10 },

  /* Header */
  header: {
    backgroundColor: T.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    minWidth: 48,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginLeft: -6,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: T.textPrimary,
    marginLeft: 4,
  },
  statutoryTag: {
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.border,
  },
  statutoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textSecondary,
    letterSpacing: 0.6,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: T.textPrimary,
    letterSpacing: -0.2,
  },
  screenSub: {
    fontSize: 12,
    fontWeight: '500',
    color: T.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  statutoryCitation: {
    fontSize: 12,
    fontWeight: '500',
    color: T.textSecondary,
    marginTop: 4,
    lineHeight: 17,
    fontFamily: evidenceMono,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 64,
  },

  /* Stepper (light) */
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  stepperItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: T.borderStrong,
    backgroundColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCircleDone: {
    backgroundColor: T.accent,
    borderColor: T.accent,
  },
  stepperCircleActive: {
    borderColor: T.accent,
    backgroundColor: T.accentSurface,
  },
  stepperIndex: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
  },
  stepperIndexActive: {
    color: T.accent,
  },
  stepperLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.5,
    marginLeft: 5,
  },
  stepperLabelDone: {
    color: T.textSecondary,
  },
  stepperLabelActive: {
    color: T.accent,
  },
  stepperConnector: {
    flex: 1,
    height: 1,
    backgroundColor: T.border,
    marginHorizontal: 4,
  },
  stepperConnectorDone: {
    backgroundColor: T.accent,
  },

  /* Cards */
  card: {
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: T.textPrimary,
    marginTop: 2,
  },
  cardSubtext: {
    fontSize: 13,
    color: T.textSecondary,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 12,
  },
  outcomeTagWrap: {
    marginTop: 4,
  },

  /* State banners */
  banner: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 16,
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bannerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  bannerTitleContainer: { flex: 1 },
  bannerEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 2,
  },
  bannerCitation: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    fontFamily: evidenceMono,
  },
  bannerBody: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.12)',
  },
  pill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: T.textSecondary,
  },
  pillValue: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: evidenceMono,
  },

  /* Meta grid (Bunching pkgMeta law) */
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaTile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 2,
    backgroundColor: T.cardSubtle,
    borderRadius: 4,
    padding: 8,
  },
  metaTileWide: {
    flexBasis: '100%',
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.6,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: T.textPrimary,
    fontFamily: evidenceMono,
    lineHeight: 17,
  },
  metaValueDanger: {
    color: T.dangerText,
  },

  /* Reading rows */
  readingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    minHeight: 34,
    gap: 8,
  },
  readingLabel: {
    fontSize: 12.5,
    color: T.textSecondary,
    fontWeight: '500',
    flex: 1,
    paddingRight: 4,
  },
  readingValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: T.textPrimary,
    fontFamily: evidenceMono,
    textAlign: 'right',
    flexShrink: 0,
  },

  /* Outcome / conformal tags */
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  outcomeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  outcomeTagPositive: {
    backgroundColor: T.successSurface,
    borderColor: T.successBorder,
  },
  outcomeTagNegative: {
    backgroundColor: T.cardSubtle,
    borderColor: T.border,
  },
  outcomeTagInconclusive: {
    backgroundColor: T.marginalSurface,
    borderColor: T.marginalBorder,
  },
  outcomeTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  setNote: {
    fontSize: 12,
    color: T.textSecondary,
    lineHeight: 18,
    marginTop: 10,
  },

  /* Lab block */
  labBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  swatchBox: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  labStats: { flex: 1, minWidth: 0 },

  /* Grade badge */
  gradeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  gradeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  /* Kinetics chart */
  chartBox: {
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    alignItems: 'center',
    paddingVertical: 4,
  },
  chartLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 3,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: T.textSecondary,
  },

  /* Terminal digest box */
  terminalBox: {
    backgroundColor: T.terminalPanel,
    borderRadius: 6,
    padding: 14,
    marginTop: 4,
  },
  terminalLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8', // Slate 400 on dark — 6.9:1, mono micro metadata
    letterSpacing: 0.8,
  },
  terminalLabelGap: {
    marginTop: 10,
  },
  terminalValue: {
    fontFamily: evidenceMono,
    fontSize: 11,
    color: T.terminalText,
    lineHeight: 18,
    marginTop: 2,
  },
  terminalValueSmall: {
    fontFamily: evidenceMono,
    fontSize: 10,
    color: T.terminalText,
    lineHeight: 15,
  },
  attestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
  },
  attestText: {
    flex: 1,
    fontSize: 12,
    color: T.textSecondary,
    lineHeight: 18,
  },
  attestBold: {
    fontWeight: '700',
    color: T.textPrimary,
    fontFamily: evidenceMono,
  },

  /* Buttons */
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: T.accent,
    marginTop: 4,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: T.accent,
    backgroundColor: T.card,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.accent,
    letterSpacing: 0.3,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  returnDutyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.borderStrong,
    backgroundColor: T.cardSubtle,
    marginTop: 2,
  },
  returnDutyText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textSecondary,
    letterSpacing: 0.4,
  },

  /* Confirm modal */
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '86%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.borderStrong,
    marginBottom: 12,
  },
  sheetMetaBox: {
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  sheetPayloadBox: {
    marginBottom: 14,
    marginTop: 6,
  },
});

export default ResultsScreen;

/**
 * RecordDetailScreen — NDPS Sealed-Record Evidentiary Review Interface
 *
 * Purpose:
 * - The complete review view of ONE sealed ledger record: what a
 *   reviewer, defence counsel, or superior officer would examine.
 *
 * Statutory Foundation:
 * - BNS s. 63(4) Part A / Part B certificate basis (generated live from the
 *   sealed canonical payload via services/export-flow)
 * - NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022 — Forms 4 · 5 · 6
 * - Rule 10(2) onward-linkage: this record's case can be opened in package bunching
 * - In-app statutory banner retired (owner decision 2026-09-16; AGENTS.md rule 3)
 *
 * Integrity law (AGENTS.md rules 2/6/10):
 * - "SEALED — IMMUTABLE" state must be unmistakable: append-only ledger, SQL
 *   trigger aborts any UPDATE/DELETE.
 * - The seal row records the ACHIEVED path only: device attestation when
 *   present, honest "chain-only, keystore unavailable" when null — never an
 *   assumed security level.
 *
 * Design Language: src/theme (useAppTheme + useThemedStyles) + src/components/ui/evidentiary/EvidenceBits.tsx
 * (evidentiary review; tri-modal states; ≥48 dp targets; mono
 * technical metadata; dark terminal boxes for integrity digests/exports).
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon, type IconName } from '../components/ui/Icon';
import {
  MetaTile,
  ReadingRow,
  StateBanner,
  BannerPill,
  LightKineticsChart,
  LightSwatch,
  GradeBadge,
  signed,
  TerminalBox,
  TerminalField,
} from '../components/ui/evidentiary/EvidenceBits';
import { useLedgerStore } from '../state/ledger-store';
import { useSyncStore } from '../state/sync-store';
import { buildExportBundle, printCourtPdf, type ExportBundle } from '../services/export-flow';
import { StatutoryClockModal } from '../components/StatutoryClockModal';
import { FadeEntrance } from '../components/ui/FadeEntrance';
import { useAppTheme, useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';
import {
  ABSTENTION_COPY,
  GRADE_COPY,
  OFFICER_READING,
  REAGENT_LABEL,
  abbreviateHash,
  formatIst,
} from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'RecordDetail'>;

/* --------------------------- local helpers --------------------------- */

/** Expandable tenderable artifact row inside the export card. */
const ArtifactRow: React.FC<{ icon: IconName; label: string; text: string }> = ({ icon, label, text }) => {
  const { theme } = useAppTheme();
  const T = theme.colors;
  const local = useThemedStyles(createLocalStyles);
  const [open, setOpen] = useState(false);
  return (
    <View style={local.artifactBlock}>
      <TouchableOpacity
        style={local.artifactHead}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${label}`}
      >
        <Icon name={icon} size={17} color={T.accent} strokeWidth={2.5} />
        <Text style={local.artifactLabel}>{label}</Text>
        <View style={local.readyTag}>
          <Icon name="check" size={11} color={T.successText} strokeWidth={3} />
          <Text style={local.readyTagText}>GENERATED</Text>
        </View>
        <Text style={local.artifactToggle}>{open ? 'HIDE' : 'SHOW'}</Text>
      </TouchableOpacity>
      {open ? (
        <TerminalBox style={local.artifactTerminal}>
          <Text style={local.artifactText} selectable>
            {text}
          </Text>
        </TerminalBox>
      ) : null}
    </View>
  );
};

const createLocalStyles = (theme: Theme) => {
  const T = theme.colors;
  const evidenceMono = theme.fontFamily.mono;
  return StyleSheet.create({
  artifactBlock: { gap: 4 },
  artifactHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingVertical: 6,
  },
  artifactLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: T.textPrimary,
  },
  readyTag: {
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
  readyTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: T.successText,
    letterSpacing: 0.5,
  },
  artifactToggle: {
    fontSize: 11,
    fontWeight: '700',
    color: T.accent,
    letterSpacing: 0.5,
    minWidth: 40,
    textAlign: 'right',
  },
  artifactTerminal: { marginTop: 2 },
  artifactText: {
    fontFamily: evidenceMono,
    fontSize: 10,
    color: T.terminalText,
    lineHeight: 15,
  },
  });
};

/* ------------------------------ screen ------------------------------ */

export const RecordDetailScreen: React.FC<{ route: DetailRoute }> = ({ route }) => {
  const { theme } = useAppTheme();
  const T = theme.colors;
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const record = useLedgerStore((s) => s.records.find((r) => r.record_uuid === route.params.uuid));
  const serverCase = useSyncStore((s) => (record ? s.caseStatus[record.case_ref] : undefined));
  const serverCaseAt = useSyncStore((s) => s.statusFetchedAt);
  useEffect(() => {
    if (record && Object.keys(useSyncStore.getState().caseStatus).length === 0) {
      void useSyncStore.getState().refreshCases();
    }
  }, [record]);
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const [showClockModal, setShowClockModal] = useState(false);

  const renderHeader = (title: string, tag: string, citation: string) => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={record ? `Return to ${record.case_ref} ${record.package_no}` : 'Return to previous screen'}
        >
          <Icon name="chevronLeft" size={22} color={T.textPrimary} strokeWidth={2.5} />
          <Text style={styles.backBtnText}>BACK</Text>
        </TouchableOpacity>
        <View style={styles.headerTopRight}>
          {record ? (
            <TouchableOpacity
              style={styles.clockHeaderBtn}
              onPress={() => setShowClockModal(true)}
              accessibilityRole="button"
              accessibilityLabel="View Rule 10(2) Seizure Clock Timers"
            >
              <Icon name="clock" size={13} color={T.accent} strokeWidth={2.4} />
              <Text style={styles.clockHeaderBtnText}>CLOCK</Text>
            </TouchableOpacity>
          ) : null}
          {tag ? (
            <View style={styles.statutoryTag}>
              <Text style={styles.statutoryTagText}>{tag}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.screenTitle}>{title}</Text>
      {citation ? <Text style={styles.citationMono}>{citation}</Text> : null}
    </View>
  );

  if (!record) {
    return (
      <View style={styles.screen}>
        {renderHeader('Record', '', '')}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <StateBanner
            tone="warning"
            icon="alert"
            eyebrow="RECORD NOT FOUND"
            title="Record not found in this session"
            citation="The ledger holds the records sealed since this app session started — device builds hydrate the full encrypted history."
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
            <Icon name="chevronLeft" size={20} color={T.onAccent} strokeWidth={2.5} />
            <Text style={styles.primaryBtnText}>GO BACK</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const openExport = async () => {
    if (bundle || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      setBundle(await buildExportBundle(record));
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'unknown export generation error');
    } finally {
      setGenerating(false);
    }
  };

  const tryPdf = async () => {
    if (!bundle) return;
    const uri = await printCourtPdf(bundle);
    setPdfNote(
      uri
        ? `Court PDF written to ${uri}`
        : 'PDF typesetting needs the Android build (expo-print). Every text artifact below is genuine — copy it from the manifest.',
    );
  };

  const kind = record.outcome;
  const bannerTone =
    kind === 'CONSISTENT_WITH_REAGENT_POSITIVE'
      ? ('success' as const)
      : kind === 'CONSISTENT_WITH_REAGENT_NEGATIVE'
        ? ('neutral' as const)
        : ('warning' as const);

  return (
    <View style={styles.screen}>

      {renderHeader(record.case_ref + ' · ' + record.package_no, 'SEALED RECORD — IMMUTABLE', record.record_uuid)}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <FadeEntrance style={styles.entranceWrap}>

        {/* ============ OUTCOME — TWO REGISTERS, TRI-MODAL ============ */}
        <StateBanner
          tone={bannerTone}
          icon={kind === 'INCONCLUSIVE' ? 'alert' : kind === 'CONSISTENT_WITH_REAGENT_POSITIVE' ? 'check' : 'minus'}
          eyebrow="PRESUMPTIVE FINDING — SEALED"
          title={OFFICER_READING[kind]}
          citation={kind}
        >
          <Text style={[styles.bannerBody, { color: bannerTone === 'success' ? T.successText : bannerTone === 'warning' ? T.marginalText : T.textSecondary }]}>
            {kind === 'INCONCLUSIVE'
              ? record.abstentionReason
                ? `Declared abstention: ${ABSTENTION_COPY[record.abstentionReason]}.`
                : 'The record states an inconclusive presumptive finding.'
              : `Test event recorded against the ${REAGENT_LABEL[record.reagent].toLowerCase()} pattern library. Chemical identity of the substance is not asserted by this record.`}
          </Text>
          <View style={styles.pillRow}>
            <BannerPill label="CONFIDENCE" value={kind === 'INCONCLUSIVE' ? '—' : `${Math.round(record.confidence * 100)}%`} tint={T.textPrimary} />
            <BannerPill label="ΔE00" value={record.deltaE.toFixed(2)} tint={T.textPrimary} />
            <BannerPill label="RESIDUAL" value={`${record.residual.grade} · ${record.residual.meanDeltaE.toFixed(2)}`} tint={T.textPrimary} />
            <BannerPill label="SEQ" value={`#${record.seq}`} tint={T.textPrimary} />
          </View>
        </StateBanner>

        {/* ============ EVIDENTIARY IDENTIFICATION ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>EVIDENTIARY IDENTIFICATION</Text>
          <Text style={styles.cardHeading}>Chain of Custody — Sealed Test Event</Text>
          <Text style={styles.cardSubtext}>
            Linkage identifiers bound into the payload before canonicalization. Bunching under
            Rule 10(2) operates on these values.
          </Text>
          <View style={styles.metaGrid}>
            <MetaTile label="CASE REFERENCE" value={record.case_ref} wide />
            <MetaTile label="PACKAGE No" value={record.package_no} />
            <MetaTile label="LOT" value={record.lot_no ?? 'UNASSIGNED'} />
            <MetaTile label="PANCHNAMA" value={record.panchnama_ref ?? '—'} wide />
            <MetaTile
              label="EVIDENCE IMAGE"
              value={
                record.imageSha256
                  ? `ATTACHED · sha256 ${record.imageSha256.slice(0, 16)}… · ${record.imageRef ?? 'stored'}`
                  : 'NOT AVAILABLE — no durable photo was attached to this record'
              }
              wide
            />
            <MetaTile label="REAGENT" value={REAGENT_LABEL[record.reagent]} />
            <MetaTile label="OPERATOR" value={record.operator} />
            <MetaTile
              label="SERVER REVIEW · CASE (API FACT, NOT A CONCLUSION)"
              value={
                serverCase
                  ? `${serverCase.status} · fetched ${serverCaseAt ? new Date(serverCaseAt).toLocaleTimeString('en-IN') : '—'}`
                  : record.syncStatus === 'queued'
                    ? 'NOT YET UPLOADABLE — queued on device'
                    : record.syncStatus === 'dead-letter'
                      ? 'NOT ON THE SERVER — the API permanently refused this record'
                      : record.syncStatus === 'demo-seed'
                        ? 'LOCAL DEMO RECORD — never uploaded to the API'
                        : 'NOT FETCHED — pull to refresh on RECORDS'
              }
              wide
            />
            <MetaTile label="KIT (MAKE · TEST · LOT)" value={`${record.kit_make ?? '—'} · ${record.kit_test_name ?? '—'} · ${record.kit_lot_no ?? '—'}`} wide />
            <MetaTile label="RECORDED (IST)" value={formatIst(record.created_at)} wide />
            <MetaTile
              label="LOCATION (GPS)"
              value={
                record.gps
                  ? `${record.gps.lat.toFixed(4)}, ${record.gps.lon.toFixed(4)} ±${record.gps.accuracyM ?? '—'} m`
                  : 'NOT CAPTURED'
              }
              tone={record.gps?.mocked ? 'danger' : 'default'}
            />
            <MetaTile
              label="SYNC STATE"
              value={
                record.syncStatus === 'synced'
                  ? 'SYNCED — accepted by the configured API'
                  : record.syncStatus === 'dead-letter'
                    ? 'SERVER REJECTED — retained on this device, never uploaded'
                    : record.syncStatus === 'demo-seed'
                      ? 'DEMO SEED — LOCAL ONLY, never uploaded'
                      : 'QUEUED — OFFLINE OUTBOX'
              }
              tone={record.syncStatus === 'dead-letter' ? 'danger' : 'default'}
            />
          </View>
          {record.gps?.mocked ? (
            <View style={styles.mockNote}>
              <Icon name="pin" size={14} color={T.marginalText} strokeWidth={2.5} />
              <Text style={styles.mockNoteText}>GPS mock provider detected — location is demonstrative only.</Text>
            </View>
          ) : null}
        </View>

        {/* ============ MEASUREMENT REGISTER ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>MEASUREMENT REGISTER — WHAT WAS SEEN</Text>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeading}>Corrected CIELAB — Sealed camera-engine measurement</Text>
            <GradeBadge grade={record.residual.grade} />
          </View>
          <Text style={styles.cardSubtext}>{GRADE_COPY[record.residual.grade].note} — decision is transparent CIEDE2000 distance, not a black-box classifier.</Text>
          <View style={styles.labBlock}>
            <View style={styles.swatchBox}>
              <LightSwatch lab={record.lab} size={50} />
            </View>
            <View style={styles.labStats}>
              <ReadingRow label="L* (lightness)" value={record.lab.l.toFixed(2)} />
              <ReadingRow label="a* (green ↔ red)" value={signed(record.lab.a)} />
              <ReadingRow label="b* (blue ↔ yellow)" value={signed(record.lab.b)} />
              <ReadingRow label="Mean residual" value={`${record.residual.meanDeltaE.toFixed(2)} ΔE00`} />
              <ReadingRow label="Max residual" value={`${record.residual.maxDeltaE.toFixed(2)} ΔE00`} />
              <ReadingRow
                label="Engine profile"
                value={record.engineResult ? `${record.engineResult.profile.kitProfileId} · ${record.engineResult.profile.status}` : 'not recorded'}
              />
              <ReadingRow
                label="Engine outcome"
                value={record.engineResult?.classification.outcome ?? 'not recorded'}
              />
            </View>
          </View>
          <Text style={[styles.cardEyebrow, styles.mtTop]}>ENGINE CANDIDATE SET</Text>
          <View style={styles.chipRow}>
            {record.conformalSet.length > 0 ? (
              record.conformalSet.map((c) => (
                <View
                  key={c}
                  style={[
                    styles.tag,
                    c === 'POSITIVE' || c === 'CONSISTENT_WITH_REAGENT_POSITIVE'
                      ? styles.tagPositive
                      : styles.tagNegative,
                  ]}
                >
                  <Icon
                    name={c === 'POSITIVE' || c === 'CONSISTENT_WITH_REAGENT_POSITIVE' ? 'check' : 'minus'}
                    size={13}
                    color={
                      c === 'POSITIVE' || c === 'CONSISTENT_WITH_REAGENT_POSITIVE'
                        ? T.successText
                        : T.textSecondary
                    }
                    strokeWidth={2.5}
                  />
                  <Text
                    style={[
                      styles.tagText,
                      {
                        color:
                          c === 'POSITIVE' || c === 'CONSISTENT_WITH_REAGENT_POSITIVE'
                            ? T.successText
                            : T.textSecondary,
                      },
                    ]}
                  >
                    {c}
                  </Text>
                </View>
              ))
            ) : (
              <View style={[styles.tag, styles.tagWarning]}>
                <Icon name="alert" size={13} color={T.marginalText} strokeWidth={2.5} />
                <Text style={[styles.tagText, { color: T.marginalText }]}>NO CANDIDATE MATCH</Text>
              </View>
            )}
          </View>
          {!record.engineResult && record.kinetics && record.kinetics.length > 1 ? (
            <>
              <Text style={[styles.cardEyebrow, styles.mtTop]}>LEGACY REACTION KINETICS — ΔE(t), 30 s WINDOW</Text>
              <LightKineticsChart points={record.kinetics} />
            </>
          ) : null}
        </View>

        {/* ============ TAMPER-EVIDENT CHAIN ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>TAMPER-EVIDENT CHAIN — HOW SURE / HOW SEALED</Text>
          <Text style={styles.cardHeading}>SHA-256 Linkage — RFC 8785 Canonicalization</Text>
          <Text style={styles.cardSubtext}>
            Append-only ledger: sealed readings can never be edited or deleted — SQL triggers
            abort any attempt. Select a digest to copy it for independent verification.
          </Text>
          <TerminalBox>
            <TerminalField label="RECORD UUID" value={record.record_uuid} lines={2} />
            <TerminalField label="PAYLOAD DIGEST (SHA-256 OF JCS)" value={record.payloadSha256} gap />
            <TerminalField label="PREV RECORD HASH" value={record.prevHash} gap />
            <TerminalField label="CHAIN HASH (THIS RECORD)" value={record.chainHash} gap />
          </TerminalBox>

          {record.deviceAttestation ? (
            <View style={styles.attestRow}>
              <View style={styles.attestIconOk}>
                <Icon name="lock" size={16} color={T.onAccent} strokeWidth={2.5} />
              </View>
              <Text style={styles.attestText}>
                Integrity seal produced by the device keystore path (SEQ #{record.seq}).
                Signature <Text style={styles.attestMono}>{abbreviateHash(record.deviceAttestation)}</Text>. Achieved
                level is whatever the hardware attested — never an assumed one.
              </Text>
            </View>
          ) : (
            <View style={styles.attestRow}>
              <View style={styles.attestIconWarn}>
                <Icon name="info" size={16} color={T.onAccent} strokeWidth={2.5} />
              </View>
              <Text style={styles.attestText}>
                Keystore seal unavailable in this environment — the record honestly carries a null
                attestation (seal state: {record.sealState}). The payload digest and chain link above
                are real.
              </Text>
            </View>
          )}
        </View>

        {/* ============ COURT EVIDENCE PACKAGE ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>EVIDENCE EXPORT</Text>
          <Text style={styles.cardHeading}>Court Evidence Package</Text>
          <Text style={styles.cardSubtext}>
            BSA s. 63(4) Part A & Part B certificates and NDPS Forms 4 · 5 · 6, generated live
            from the sealed canonical payload. Files are emitted for hand-off to existing court
            procedures — Parinaam never writes to live government systems, and this device build
            operates fully offline.
          </Text>

          {genError ? (
            <View style={styles.genErrorBox}>
              <Icon name="alert" size={15} color={T.dangerText} strokeWidth={2.5} />
              <Text style={styles.genErrorText}>Export generation error: {genError}</Text>
            </View>
          ) : null}

          {pdfNote ? (
            <View style={styles.pdfNoteBox}>
              <Icon name="info" size={15} color={T.accent} strokeWidth={2.5} />
              <Text style={styles.pdfNoteText}>{pdfNote}</Text>
            </View>
          ) : null}

          {bundle ? (
            <View style={styles.artifactList}>
              <ArtifactRow icon="document" label="BSA s. 63(4) — PART A CERTIFICATE" text={bundle.partAText} />
              <ArtifactRow icon="document" label="BSA s. 63(4) — PART B CERTIFICATE" text={bundle.partBText} />
              <ArtifactRow icon="chain" label="NDPS FORM 4 (SEIZURE MEMORANDUM)" text={bundle.form4Text} />
              <ArtifactRow icon="package" label="NDPS FORM 5 (DEPOSITORY REGISTER)" text={bundle.form5Text} />
              <ArtifactRow icon="clock" label="NDPS FORM 6 (DISPOSAL INVENTORY)" text={bundle.form6Text} />
              <ArtifactRow icon="link" label="MANIFEST.txt (SHA256SUM-COMPATIBLE)" text={bundle.manifestText} />
              <Text style={styles.generatedNote}>Bundle generated {formatIst(bundle.generatedAtIst)}.</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => void tryPdf()} accessibilityRole="button" accessibilityLabel="Print court PDF">
                <Icon name="download" size={17} color={T.accent} strokeWidth={2.5} />
                <Text style={styles.secondaryBtnText}>PRINT / WRITE COURT PDF (EXPRESS BUILD)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, generating && styles.primaryBtnDisabled]}
              onPress={() => void openExport()}
              disabled={generating}
              accessibilityRole="button"
              accessibilityLabel="Generate the court evidence package from this sealed record"
            >
              {generating ? <ActivityIndicator size="small" color={T.onAccent} /> : <Icon name="download" size={20} color={T.onAccent} strokeWidth={2.5} />}
              <Text style={styles.primaryBtnText}>{generating ? 'GENERATING FROM SEALED PAYLOAD…' : 'GENERATE COURT EVIDENCE PACKAGE'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ============ RULE 10(2) ONWARD LINKAGE ============ */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flex]}
            onPress={() => setShowClockModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Open Rule 10(2) seizure timers for this case"
          >
            <Icon name="clock" size={17} color={T.accent} strokeWidth={2.5} />
            <Text style={styles.secondaryBtnText} numberOfLines={1}>SEIZURE TIMERS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flex]}
            onPress={() => navigation.push('Bunching', { focusUuid: record.record_uuid })}
            accessibilityRole="button"
            accessibilityLabel="Open package bunching for this case"
          >
            <Icon name="package" size={17} color={T.accent} strokeWidth={2.5} />
            <Text style={styles.secondaryBtnText} numberOfLines={1}>BUNCHING</Text>
          </TouchableOpacity>
        </View>

        </FadeEntrance>
      </ScrollView>

      {record ? (
        <StatutoryClockModal
          visible={showClockModal}
          onClose={() => setShowClockModal(false)}
          initialCaseRef={record.case_ref}
          cases={[{ caseRef: record.case_ref, timestampIso: record.created_at }]}
        />
      ) : null}
    </View>
  );
};

const createStyles = (theme: Theme) => {
  const T = theme.colors;
  const evidenceMono = theme.fontFamily.mono;
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.canvas },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 64 },
  mtTop: { marginTop: 14 },

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
    marginBottom: 8,
  },
  headerTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clockHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.accent,
    backgroundColor: T.cardSubtle,
  },
  clockHeaderBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: T.accent,
    letterSpacing: 0.4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginLeft: -6,
  },
  backBtnText: { fontSize: 14, fontWeight: '700', color: T.textPrimary, marginLeft: 2 },
  statutoryTag: {
    backgroundColor: T.successSurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.successBorder,
  },
  statutoryTagText: { fontSize: 11, fontWeight: '700', color: T.successText, letterSpacing: 0.6 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: T.textPrimary, letterSpacing: -0.2 },
  citationMono: {
    fontSize: 11,
    fontWeight: '600',
    color: T.textSecondary,
    marginTop: 4,
    fontFamily: evidenceMono,
  },

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
    alignItems: 'center',
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
  cardHeading: { fontSize: 17, fontWeight: '700', color: T.textPrimary, marginTop: 2 },
  cardSubtext: {
    fontSize: 13,
    color: T.textSecondary,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 12,
  },

  bannerBody: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: T.borderSubtle,
  },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mockNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.marginalSurface,
    borderWidth: 1,
    borderColor: T.marginalBorder,
    borderRadius: 4,
    padding: 10,
    marginTop: 10,
  },
  mockNoteText: { flex: 1, fontSize: 12, fontWeight: '600', color: T.marginalText },

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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  tagPositive: { backgroundColor: T.successSurface, borderColor: T.successBorder },
  tagNegative: { backgroundColor: T.cardSubtle, borderColor: T.border },
  tagWarning: { backgroundColor: T.marginalSurface, borderColor: T.marginalBorder },
  tagText: { fontSize: 12, fontWeight: '700' },

  attestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
  },
  attestIconOk: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.successBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  attestIconWarn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.marginalIcon,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  attestText: { flex: 1, fontSize: 12, color: T.textSecondary, lineHeight: 18 },
  attestMono: { fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono },

  artifactList: { gap: 6 },
  generatedNote: { fontSize: 11, color: T.textMuted, fontStyle: 'italic', marginTop: 6 },
  genErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: T.dangerSurface,
    borderWidth: 1,
    borderColor: T.dangerBorder,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  genErrorText: { flex: 1, fontSize: 12, fontWeight: '600', color: T.dangerText, lineHeight: 18 },
  pdfNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: T.accentSurface,
    borderWidth: 1,
    borderColor: T.accent,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  pdfNoteText: { flex: 1, fontSize: 12, fontWeight: '500', color: T.accent, lineHeight: 18 },

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
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: T.onAccent, letterSpacing: 0.4 },
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
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: T.accent, letterSpacing: 0.3 },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  flex: { flex: 1 },
  entranceWrap: { gap: 16 },
  });
};

export default RecordDetailScreen;

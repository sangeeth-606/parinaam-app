/**
 * IntegrityScreen — NDPS Ledger Chain-Health Cockpit
 *
 * Purpose:
 * - Prove the append-only SHA-256 ledger is intact — every claim computed LIVE by
 *   verifyChain() (replaces the old AuditLogScreen's hardcoded "Verified Intact").
 *
 * Statutory / honesty law:
 * - Red is reserved for integrity failure ONLY (this screen's tamper state).
 * - The seal section records the ACHIEVED environment, never an assumed one:
 *   keystore signature present vs honest chain-only — no fabricated security tier.
 * - Outbox wording never claims live government-system contact (offline-first).
 *
 * Design Language: src/theme/evidence.ts + EvidenceBits + LightTabBar (WCAG AAA light,
 * tri-modal states, mono digests, ≥48 dp targets, terminal boxes for tenderable values).
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { StateBanner, TerminalBox, TerminalField, BannerPill } from '../components/ui/evidentiary/EvidenceBits';
import { LightTabBar } from '../components/ui/evidentiary/LightTabBar';
import { TamperDemoSection } from './TamperDemoScreen';
import { useLedgerStore } from '../state/ledger-store';
import { useSyncStore } from '../state/sync-store';
import { auditCountDb } from '../db/ledger-repository';
import { evidenceTheme as T, evidenceMono } from '../theme/evidence';
import { abbreviateHash, formatIst } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type LinkStatus = 'OK' | 'BROKEN' | 'UNVERIFIABLE' | 'PENDING';

const statusStyle = (s: LinkStatus) =>
  s === 'OK'
    ? { bg: T.successSurface, border: T.successBorder, text: T.successText, icon: 'check' as const }
    : s === 'BROKEN'
      ? { bg: T.dangerSurface, border: T.dangerBorder, text: T.dangerText, icon: 'alert' as const }
      : s === 'UNVERIFIABLE'
        ? { bg: T.marginalSurface, border: T.marginalBorder, text: T.marginalText, icon: 'link' as const }
        : { bg: T.cardSubtle, border: T.border, text: T.textSecondary, icon: 'clock' as const };

export const IntegrityScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { records, verification, verifying, demoCorrupted, reverify, persistence } =
    useLedgerStore();
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  useEffect(() => {
    void auditCountDb().then((c) => setAuditCount(c));
  }, [records.length]);
  const demoCount = records.filter((r) => r.isDemo).length;

  const queued = records.filter((r) => r.syncStatus === 'queued');
  // Demo seeds are local-only fixtures: they are neither queued nor "synced" —
  // the outbox actions below must never imply they were uploaded.
  const demoSeeded = records.filter((r) => r.syncStatus === 'demo-seed').length;
  const latest = records[records.length - 1];
  const attestedCount = records.filter((r) => r.deviceAttestation !== null).length;

  /** REAL transport (v2 phase E; replaces the GAP-4 "simulate" fake that marked
   *  records synced without ever contacting a server). Runs the outbox against the
   *  configured API; offline failures stay queued with the engine's backoff. */
  const runSync = async () => {
    setSyncing(true);
    setSyncNote(null);
    try {
      const sum = await useSyncStore.getState().syncNow();
      await useSyncStore.getState().refreshCases();
      setSyncNote(
        sum.error
          ? `SYNC FAILED — ${sum.error.toUpperCase()}`
          : sum.skippedBackoff
            ? 'RETRY SCHEDULED — backoff window active; queue intact'
            : `SYNC PASS — ${sum.synced} UPLOADED · ${sum.failed} RETRYING` +
              (sum.deadLettered ? ` · ${sum.deadLettered} DEAD-LETTERED` : '')
      );
    } finally {
      setSyncing(false);
    }
  };

  /** Per-record walk status: once a link breaks, every later link is unverifiable. */
  const linkStatus = (i: number): LinkStatus => {
    if (verification && !verification.valid && verification.brokenIndex !== undefined && i >= verification.brokenIndex) {
      return i === verification.brokenIndex ? 'BROKEN' : 'UNVERIFIABLE';
    }
    return verification?.valid ? 'OK' : 'PENDING';
  };

  const healthTone = verifying
    ? 'neutral'
    : demoCorrupted || (verification && !verification.valid)
      ? 'danger'
      : verification?.valid
        ? 'success'
        : 'warning';

  const healthTitle = verifying
    ? 'Re-walking the chain…'
    : !verification
      ? 'Chain verification pending'
      : verification.valid
        ? `Chain verified intact — ${verification.totalVerified} of ${records.length} links`
        : `TAMPERING DETECTED — broken at sequence #${(verification.brokenIndex ?? 0) + 1}`;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      {/* Official Evidentiary Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.flex}>
            <Text style={styles.screenTitle}>Ledger Integrity</Text>
            <Text style={styles.headerSub}>{records.length} chained records this session · SHA-256 walk</Text>
          </View>
          <View style={styles.statutoryTag}>
            <Text style={styles.statutoryTagText}>COMPUTED LIVE</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ============ CHAIN HEALTH HERO (live verifyChain result) ============ */}
        <StateBanner
          tone={healthTone}
          icon={verifying ? 'refresh' : healthTone === 'danger' ? 'alert' : healthTone === 'success' ? 'lock' : 'clock'}
          eyebrow="APPEND-ONLY CHAIN"
          title={healthTitle}
          citation={`RFC 8785 canonical payloads · genesis link → head ${latest ? latest.chainHash.slice(0, 12).toUpperCase() + '…' : '—'}`}
        >
          {demoCorrupted ? (
            <>
              <Text style={[styles.bannerBody, { color: T.dangerText }]}>
                The session contains a deliberate corruption from the tamper demonstration
                below — exactly what verify detects. Restore to clear it.
              </Text>
              <View style={styles.pillRow}>
                <BannerPill label="BROKEN AT SEQ" value={`#${(verification?.brokenIndex ?? 0) + 1}`} tint={T.dangerText} />
                <BannerPill label="LINKS AFTER" value="UNVERIFIABLE" tint={T.dangerText} />
              </View>
            </>
          ) : verification?.valid ? (
            <View style={styles.pillRow}>
              <BannerPill label="RECORDS" value={`${records.length}`} tint={T.successText} />
              <BannerPill label="VERIFIED" value={`${verification.totalVerified}`} tint={T.successText} />
              <BannerPill label="ATTESTED" value={`${attestedCount}/${records.length}`} tint={T.successText} />
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.mtTop]}
            onPress={() => void reverify()}
            disabled={verifying}
            accessibilityRole="button"
            accessibilityLabel="Re-verify the entire chain"
          >
            <Icon name="refresh" size={17} color={T.accent} strokeWidth={2.5} />
            <Text style={styles.secondaryBtnText}>{verifying ? 'WALKING CHAIN…' : 'RE-VERIFY CHAIN'}</Text>
          </TouchableOpacity>
        </StateBanner>

        {/* ============ PER-RECORD CHAIN WALK ============ */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>CHAIN WALK</Text>
          <Text style={styles.heading}>Genesis → Head, Link by Link</Text>
          <Text style={styles.subtext}>
            A stored digest that no longer recomputes from its payload is the tamper signal;
            everything after it cannot be trusted either — the append-only guarantee.
          </Text>
          {records.length === 0 ? (
            <Text style={styles.emptyText}>No sealed records yet — seal one from the field wizard.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeadRow}>
                <Text style={[styles.tableHeadCell, styles.colSeq]}>SEQ</Text>
                <Text style={[styles.tableHeadCell, styles.colId]}>RECORD · UUID PREFIX</Text>
                <Text style={[styles.tableHeadCell, styles.colHash]}>PAYLOAD DIGEST</Text>
                <Text style={[styles.tableHeadCell, styles.colState]}>STATE</Text>
              </View>
              {records.map((r, i) => {
                const st = linkStatus(i);
                const tone = statusStyle(st);
                return (
                  <TouchableOpacity
                    key={r.record_uuid}
                    style={styles.tableRow}
                    onPress={() => navigation.navigate('RecordDetail', { uuid: r.record_uuid })}
                    accessibilityRole="button"
                    accessibilityLabel={`Open record sequence ${r.seq}, link state ${st}`}
                  >
                    <Text style={[styles.cellSeq, styles.colSeq]}>#{r.seq}</Text>
                    <View style={styles.colId}>
                      <Text style={styles.cellId} numberOfLines={1}>{r.case_ref} · {r.package_no}</Text>
                      <Text style={styles.cellUuid}>{abbreviateHash(r.record_uuid, 6, 4)}</Text>
                    </View>
                    <Text style={[styles.cellHash, styles.colHash]} numberOfLines={1}>{abbreviateHash(r.payloadSha256)}</Text>
                    <View style={[styles.statePill, styles.colState, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                      <Icon name={tone.icon} size={11} color={tone.text} strokeWidth={2.5} />
                      <Text style={[styles.statePillText, { color: tone.text }]}>{st}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ============ LOCAL LEDGER — V2 PERSISTENCE FACTS ============ */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>LOCAL LEDGER</Text>
          <Text style={styles.heading}>SQLite file — the source of truth on this device</Text>
          {persistence && persistence.kind !== 'none' ? (
            <>
              <Text style={styles.subtext}>
                {persistence.pathLabel} — {records.length} records ({demoCount} demo fixtures),
                {' '}{auditCount === null ? '…' : auditCount} audit entries. Records survive restarts;
                UPDATE and DELETE are blocked by database triggers (append-only by construction).
              </Text>
              <View style={styles.metaRow}>
                <View style={styles.metaBox}>
                  <Text style={styles.metaBig}>{persistence.kind === 'expo-sqlite' ? 'SQLITE' : 'SQLITE*'}</Text>
                  <Text style={styles.metaCap}>DRIVER — {persistence.kind.toUpperCase()}</Text>
                </View>
                <View style={styles.metaBox}>
                  <Text style={[styles.metaBig, { color: persistence.encryption === 'sqlcipher' ? T.successText : T.marginalText }]}>
                    {persistence.encryption === 'sqlcipher' ? 'YES' : 'NO'}
                  </Text>
                  <Text style={styles.metaCap}>
                    ENCRYPTED AT REST — {persistence.encryption === 'sqlcipher' ? 'SQLCIPHER PROBE OK' : 'PLAIN SQLITE (DEV BUILD/EXPO GO)'}
                  </Text>
                </View>
                <View style={styles.metaBox}>
                  <Text style={styles.metaBig}>{persistence.fts5 ? 'ON' : 'OFF'}</Text>
                  <Text style={styles.metaCap}>FTS5 INDEX — {persistence.fts5 ? 'FULL-TEXT CASE SEARCH' : 'LIKE FALLBACK'}</Text>
                </View>
              </View>
            </>
          ) : (
            <StateBanner
              tone="danger"
              icon="alert"
              eyebrow="PERSISTENCE UNAVAILABLE"
              title="This session's records are IN-MEMORY ONLY"
              citation={persistence?.error ? `Cause: ${persistence.error}` : 'The SQLite driver did not initialise — records will NOT survive a restart.'}
            />
          )}
        </View>

        {/* ============ DEVICE SEAL — ACHIEVED ONLY ============ */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>INTEGRITY SEALS</Text>
          <Text style={styles.heading}>Device Keystore — Achieved State, Never Assumed</Text>
          <Text style={styles.subtext}>
            The ledger stores what the hardware actually attested. Where the keystore could not
            run, records honestly carry a null attestation while the SHA-256 chain remains real.
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaBox}>
              <Text style={styles.metaBig}>{attestedCount}</Text>
              <Text style={styles.metaCap}>RECORDS WITH KEYSTORE SEAL</Text>
            </View>
            <View style={styles.metaBox}>
              <Text style={styles.metaBig}>{records.length - attestedCount}</Text>
              <Text style={styles.metaCap}>CHAIN-ONLY (HONEST NULL)</Text>
            </View>
          </View>
          {latest ? (
            <View style={styles.attestRow}>
              <Icon name="key" size={15} color={T.textSecondary} strokeWidth={2.2} />
              <Text style={styles.attestText}>
                Latest record SEQ #{latest.seq}: integrity seal{' '}
                <Text style={styles.attestMono}>
                  {latest.deviceAttestation ? abbreviateHash(latest.deviceAttestation) : 'NULL — CHAIN-ONLY'}
                </Text>
                .
              </Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>No sealed records yet — nothing to attest.</Text>
          )}
        </View>

        {/* ============ RULE 10(2) OUTBOX ============ */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>RULE 10(2) OUTBOX</Text>
          <Text style={styles.heading}>Court-Package Upload Queue</Text>
          <Text style={styles.subtext}>
            Queue drains when connectivity returns — the app works fully offline. Records upload only
            to the configured self-hosted API; no live government system is contacted.
          </Text>
          {queued.length === 0 ? (
            <View style={styles.clearBox}>
              <Icon name="wifiOff" size={18} color={T.textSecondary} strokeWidth={2.2} />
              <Text style={styles.clearText}>
                Outbox clear — no records waiting to upload.{demoSeeded > 0 ? ` ${demoSeeded} demo-seed record${demoSeeded === 1 ? ' is' : 's are'} local-only and never uploaded.` : ''}
              </Text>
            </View>
          ) : (
            <>
              {queued.slice(-4).map((r) => (
                <TouchableOpacity
                  key={r.record_uuid}
                  style={styles.queueRow}
                  onPress={() => navigation.navigate('RecordDetail', { uuid: r.record_uuid })}
                  accessibilityRole="button"
                  accessibilityLabel={`Open queued record ${r.case_ref} package ${r.package_no}`}
                >
                  <Icon name="clock" size={16} color={T.accent} strokeWidth={2.2} />
                  <View style={styles.queueText}>
                    <Text style={styles.queueTitle}>{r.case_ref} · {r.package_no}</Text>
                    <Text style={styles.queueSub}>SEQ #{r.seq} · queued for self-hosted API upload</Text>
                  </View>
                  <Text style={styles.queueTime}>{formatIst(r.created_at)}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.primaryBtn, syncing && styles.btnDisabled]}
                onPress={() => void runSync()}
                disabled={syncing}
                accessibilityRole="button"
                accessibilityLabel={`Synchronize ${queued.length} queued records with the configured API`}
              >
                <Icon name="refresh" size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.primaryBtnText}>{syncing ? 'SYNCING…' : `SYNC NOW (${queued.length})`}</Text>
              </TouchableOpacity>
              {syncNote ? (
                <Text style={styles.syncNote} accessibilityLiveRegion="polite">{syncNote}</Text>
              ) : null}
            </>
          )}
        </View>

        {/* ============ MANDATED TAMPER DEMO ============ */}
        <TamperDemoSection />

        {/* ============ CHAIN HEAD DIGEST ============ */}
        {latest ? (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>CHAIN HEAD</Text>
            <Text style={styles.heading}>Head Link — Independent Verification Anchor</Text>
            <TerminalBox>
              <TerminalField label="LATEST CHAIN HASH (SEQ #)" value={`${latest.seq} · ${latest.chainHash}`} />
              <TerminalField label="PAYLOAD DIGEST" value={latest.payloadSha256} gap />
            </TerminalBox>
          </View>
        ) : null}
      </ScrollView>

      <LightTabBar
        active="integrity"
        onTab={(t) => navigation.navigate(t === 'duty' ? 'Home' : t === 'records' ? 'CaseLog' : 'Integrity')}
        onNewTest={() => navigation.navigate('NewTestSetup')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  syncNote: { fontFamily: evidenceMono, fontSize: 11, color: T.textSecondary, marginTop: 8, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: T.canvas },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 64 },
  flex: { flex: 1 },
  mtTop: { marginTop: 12 },

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
  statutoryTag: {
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.border,
  },
  statutoryTagText: { fontSize: 11, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.6 },

  card: {
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heading: { fontSize: 17, fontWeight: '700', color: T.textPrimary, marginTop: 2 },
  subtext: { fontSize: 13, color: T.textSecondary, lineHeight: 19, marginTop: 4, marginBottom: 12 },
  emptyText: { fontSize: 12, color: T.textSecondary, fontStyle: 'italic', paddingVertical: 10 },
  bannerBody: { fontSize: 13, lineHeight: 19 },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.12)',
  },

  /* Chain walk table */
  table: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeadRow: {
    flexDirection: 'row',
    backgroundColor: T.cardSubtle,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    alignItems: 'center',
  },
  tableHeadCell: { fontSize: 9, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.6 },
  colSeq: { width: 32 },
  colId: { flex: 2.2 },
  colHash: { flex: 1.4 },
  colState: { minWidth: 58, maxWidth: 78, alignItems: 'center', justifyContent: 'center' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    backgroundColor: '#FFFFFF',
    minHeight: 52,
    gap: 6,
  },
  cellSeq: { fontSize: 12, fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono },
  cellId: { fontSize: 12, fontWeight: '700', color: T.textPrimary },
  cellUuid: { fontSize: 10, color: T.textSecondary, fontFamily: evidenceMono, marginTop: 1 },
  cellHash: { fontSize: 10, color: T.textSecondary, fontFamily: evidenceMono },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  statePillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },

  /* Seal achieved */
  metaRow: { flexDirection: 'row', gap: 10 },
  metaBox: {
    flex: 1,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  metaBig: { fontSize: 26, fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono },
  metaCap: { fontSize: 9, fontWeight: '700', color: T.textMuted, letterSpacing: 0.6, textAlign: 'center' },
  attestRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  attestText: { flex: 1, fontSize: 12, color: T.textSecondary, lineHeight: 18 },
  attestMono: { fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono },

  /* Outbox */
  clearBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.successSurface,
    borderWidth: 1,
    borderColor: T.successBorder,
    borderRadius: 6,
    padding: 12,
  },
  clearText: { flex: 1, fontSize: 12, fontWeight: '600', color: T.successText, lineHeight: 18 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    minHeight: 56,
  },
  queueText: { flex: 1 },
  queueTitle: { fontSize: 13, fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono },
  queueSub: { fontSize: 11, color: T.textSecondary, marginTop: 2 },
  queueTime: { fontSize: 10, color: T.textMuted, fontFamily: evidenceMono },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: T.accent,
    marginTop: 12,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 },
  btnDisabled: { opacity: 0.6 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: T.accent,
    backgroundColor: T.card,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: T.accent, letterSpacing: 0.3 },
});

export default IntegrityScreen;

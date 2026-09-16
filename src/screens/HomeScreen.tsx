/**
 * HomeScreen — "Duty" tab · Offline Field Instrument Panel
 *
 * Purpose:
 * - Operational base at shift start: chain/seal status at a glance, the one
 *   primary action (new presumptive field test), the Rule 10(2) seizure clock
 *   with honest statutory-vs-administrative labelling, and the last readings.
 *
 * Honesty law: every number reads the LIVE ledger store — nothing hardcoded.
 * Red is reserved for integrity failure (active tamper demo). Missed procedural
 * deadlines are amber (administrative guidance), never alarm-red.
 *
 * Design Language: src/theme/evidence.ts + EvidenceBits + LightTabBar (WCAG AAA
 * light; ≥48 dp targets; mono technical metadata; duty instrument, not consumer
 * dashboard). Amber disclaimer banner retired owner-side 2026-09-16 (rule 3).
 */

import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { StateBanner, OutcomeTag } from '../components/ui/evidentiary/EvidenceBits';
import { LightTabBar } from '../components/ui/evidentiary/LightTabBar';
import { STATUTORY_DEADLINES, calculateRemainingHours } from '../components/statutory-timers';
import { useLedgerStore } from '../state/ledger-store';
import { useSyncStore } from '../state/sync-store';
import { useSessionStore } from '../state/session-store';
import { useCaseContext, testedPackagesFor, suggestNextPackageFor } from '../state/case-context';
import { useAuthStore } from '../state/auth-store';
import { evidenceTheme as T, evidenceMono } from '../theme/evidence';
import { formatTimeIst, relativeIst, OFFICER_READING_SHORT, REAGENT_LABEL } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { records, seeded, verification, demoCorrupted } = useLedgerStore();
  const reachability = useSyncStore((s) => s.reachability);
  const hasDraft = useSessionStore((s) => s.hasDraft());
  const setup = useSessionStore((s) => s.setup);
  const operator = useAuthStore((s) => s.officer?.name ?? '—');
  const activeCase = useCaseContext((c) => c.activeCase);
  const clearCase = useCaseContext((c) => c.clearCase);
  const nextPkg = activeCase ? suggestNextPackageFor(records, activeCase.caseRef) : 'P-1';
  const testedPkgs = activeCase ? testedPackagesFor(records, activeCase.caseRef) : [];

  const queued = records.filter((r) => r.syncStatus === 'queued').length;
  const last = records[records.length - 1];
  const recent = [...records].reverse().slice(0, 3);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      {/* Duty Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>ON DUTY</Text>
            <Text style={styles.screenTitle}>{operator}</Text>
          </View>
          <View style={styles.headerBtns}>
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

        {/* Live status strip */}
        <View style={styles.stripRow}>
          {!seeded ? (
            <View style={[styles.stripPill, styles.pillNeutral]}>
              <Icon name="clock" size={12} color={T.textSecondary} strokeWidth={2.5} />
              <Text style={[styles.stripPillText, { color: T.textSecondary }]}>VERIFYING…</Text>
            </View>
          ) : verification?.valid ? (
            <View style={[styles.stripPill, styles.pillOk]}>
              <Icon name="lock" size={12} color={T.successText} strokeWidth={2.5} />
              <Text style={[styles.stripPillText, { color: T.successText }]}>CHAIN INTACT · {records.length}</Text>
            </View>
          ) : (
            <View style={[styles.stripPill, styles.pillDanger]}>
              <Icon name="alert" size={12} color={T.dangerText} strokeWidth={2.5} />
              <Text style={[styles.stripPillText, { color: T.dangerText }]}>CHAIN BROKEN @ #{(verification?.brokenIndex ?? 0) + 1}</Text>
            </View>
          )}
          {last ? (
            <View style={[styles.stripPill, last.deviceAttestation ? styles.pillOk : styles.pillWarn]}>
              <Icon name={last.deviceAttestation ? 'shield' : 'chain'} size={12} color={last.deviceAttestation ? T.successText : T.marginalText} strokeWidth={2.5} />
              <Text style={[styles.stripPillText, { color: last.deviceAttestation ? T.successText : T.marginalText }]}>
                {last.deviceAttestation ? 'SEAL: ATTESTED' : 'SEAL: CHAIN-ONLY'}
              </Text>
            </View>
          ) : null}
          {/* one honest sync chip: reachability × queue in a single glance */}
          <View
            style={[
              styles.stripPill,
              reachability === 'up'
                ? queued > 0 ? styles.pillInfo : styles.pillOk
                : reachability === 'down' ? styles.pillWarn : styles.pillNeutral,
            ]}
          >
            <Icon
              name={reachability === 'down' ? 'wifiOff' : queued > 0 ? 'clock' : 'globe'}
              size={12}
              color={
                reachability === 'up'
                  ? queued > 0 ? T.accent : T.successText
                  : reachability === 'down' ? T.marginalText : T.textSecondary
              }
              strokeWidth={2.5}
            />
            <Text
              style={[
                styles.stripPillText,
                {
                  color:
                    reachability === 'up'
                      ? queued > 0 ? T.accent : T.successText
                      : reachability === 'down' ? T.marginalText : T.textSecondary,
                },
              ]}
            >
              {reachability === 'up'
                ? queued > 0
                  ? `SYNC · ${queued} QUEUED`
                  : 'SYNC · UP TO DATE'
                : reachability === 'down'
                  ? queued > 0
                    ? `OFFLINE · ${queued} HELD`
                    : 'OFFLINE'
                  : queued > 0
                    ? `QUEUE · ${queued} WAITING`
                    : 'SERVER NOT PROBED'}
            </Text>
          </View>
          <View style={[styles.stripPill, reachability === 'up' ? styles.pillOk : reachability === 'down' ? styles.pillWarn : styles.pillNeutral]}>
            <Icon name={reachability === 'down' ? 'wifiOff' : 'globe'} size={12} color={reachability === 'up' ? T.successText : reachability === 'down' ? T.marginalText : T.textSecondary} strokeWidth={2.5} />
            <Text style={[styles.stripPillText, { color: reachability === 'up' ? T.successText : reachability === 'down' ? T.marginalText : T.textSecondary }]}>
              {reachability === 'up' ? 'SERVER REACHABLE' : reachability === 'down' ? 'OFFLINE — QUEUE HOLDS' : 'SERVER NOT PROBED'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ============ G-D5 #1 — ACTIVE CASE (the one act done once per seizure) ============ */}
        {activeCase ? (
          <View style={styles.activeCaseCard}>
            <View style={styles.activeCaseHead}>
              <View style={styles.flex}>
                <Text style={styles.cardEyebrow}>ACTIVE CASE</Text>
                <Text style={styles.activeCaseRef}>{activeCase.caseRef}</Text>
                <Text style={styles.activeCaseSub}>
                  {activeCase.panchnamaRef ? `PANCHNAMA ${activeCase.panchnamaRef} · ` : ''}opened {relativeIst(activeCase.openedAt)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.changeCaseBtn}
                onPress={() => void clearCase()}
                accessibilityRole="button"
                accessibilityLabel="Close this case and select another"
              >
                <Text style={styles.changeCaseText}>SWITCH</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pkgTrackRow}>
              <Text style={styles.pkgTrackLabel}>PACKAGES TESTED</Text>
              <View style={styles.pkgChips}>
                {testedPkgs.map((p) => (
                  <View key={p} style={styles.pkgChipDone}>
                    <Text style={styles.pkgChipDoneText}>{p}</Text>
                  </View>
                ))}
                <View style={styles.pkgChipNext}>
                  <Text style={styles.pkgChipNextText}>{nextPkg} · NEXT</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.emptyCaseCard}
            onPress={() => navigation.navigate('NewTestSetup')}
            accessibilityRole="button"
            accessibilityLabel="Select or open a case to begin the duty"
          >
            <Icon name="document" size={20} color={T.accent} strokeWidth={2.2} />
            <View style={styles.flex}>
              <Text style={styles.emptyCaseTitle}>NO ACTIVE CASE — SELECT OR OPEN ONE</Text>
              <Text style={styles.emptyCaseSub}>
                Everything downstream pre-fills from the case you open here — you type the
                linkage identifiers once, not on every package.
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={T.accent} strokeWidth={2.5} />
          </TouchableOpacity>
        )}

        {/* ============ G-D5 #2 — the one giant context-aware action ============ */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            if (hasDraft) {
              // G-D5 #3 priority: an unfinished lap resumes — never reset by the CTA.
              navigation.navigate(setup.caseRef ? 'Capture' : 'NewTestSetup');
              return;
            }
            if (activeCase) {
              // Next lap: pre-fill identity + kit + bumped package, land on Capture.
              const pre = useSessionStore.getState().setup;
              useSessionStore.getState().resetLap();
              useSessionStore.getState().patchSetup({
                caseRef: activeCase.caseRef,
                panchnamaRef: activeCase.panchnamaRef,
                packageNo: nextPkg,
                ...(pre.reagent ? { reagent: pre.reagent } : {}),
              });
              navigation.navigate('Capture');
            } else {
              navigation.navigate('NewTestSetup');
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={hasDraft ? 'Continue the unfinished test' : activeCase ? `Test the next package ${nextPkg} for ${activeCase.caseRef}` : 'Open a case to start a field test'}
        >
          <Icon name="camera" size={22} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={styles.primaryBtnText}>
            {hasDraft ? 'CONTINUE CURRENT TEST' : activeCase ? `FIELD TEST — ${nextPkg}` : 'OPEN CASE TO START TESTING'}
          </Text>
        </TouchableOpacity>

        {/* G-D5 #3 — Resumable draft */}
        {hasDraft ? (
          <TouchableOpacity
            style={styles.draftCard}
            onPress={() => navigation.navigate('Capture')}
            accessibilityRole="button"
            accessibilityLabel="Resume the unfinished test capture"
          >
            <View style={styles.draftIcon}>
              <Icon name="refresh" size={18} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <View style={styles.draftText}>
              <Text style={styles.draftTitle}>Unfinished test in progress</Text>
              <Text style={styles.draftSub}>
                {setup.caseRef ? `${setup.caseRef} · ${setup.packageNo} — ` : ''}Resume the capture wizard where you left it.
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={T.accent} strokeWidth={2.5} />
          </TouchableOpacity>
        ) : null}

        {/* Rule 10(2) seizure clock — honest statutory labelling */}
        {last ? (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>SEIZURE CLOCK — RULE 10(2) NDPS RULES 2022</Text>
            <Text style={styles.cardHeading}>{last.case_ref}</Text>
            <Text style={styles.cardSubtext}>
              From the most recent recorded test event · {relativeIst(last.created_at)}
            </Text>
            {STATUTORY_DEADLINES.map((item) => {
              const { remainingHours, isExpired } = calculateRemainingHours(last.created_at, item.deadlineHours);
              const admin = item.isAdministrativeGuidance;
              return (
                <View key={item.id} style={[styles.timerRow, admin ? styles.timerAdmin : styles.timerStatutory]}>
                  <View style={styles.timerLeft}>
                    <Text style={styles.timerTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.timerCite}>
                      {admin ? 'ADMIN GUIDANCE' : 'STATUTORY'} ·{' '}
                      {item.deadlineHours >= 24 ? `${item.deadlineHours / 24} DAYS` : `${item.deadlineHours} H`}
                    </Text>
                  </View>
                  <Text style={[styles.timerValue, isExpired ? styles.timerValueExpired : styles.timerValueOk]}>
                    {isExpired ? 'ELAPSED' : `${remainingHours.toFixed(1)} h`}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Latest readings */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.flex}>
              <Text style={styles.cardEyebrow}>LATEST READINGS</Text>
              <Text style={styles.cardHeading}>Case Log</Text>
            </View>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => navigation.navigate('CaseLog')}
              accessibilityRole="button"
              accessibilityLabel="View all records"
            >
              <Text style={styles.viewAllText}>VIEW ALL</Text>
              <Icon name="chevronRight" size={14} color={T.accent} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {!seeded ? (
            <View style={styles.loadingBox}>
              <Icon name="chain" size={18} color={T.textMuted} strokeWidth={2} />
              <Text style={styles.loadingText}>Hydrating encrypted ledger…</Text>
            </View>
          ) : recent.length === 0 ? (
            <View style={styles.emptyBox}>
              <Icon name="flask" size={20} color={T.textSecondary} strokeWidth={2.2} />
              <Text style={styles.emptyText}>
                No test events recorded. Start the first presumptive field test — readings appear
                here with their chain digests.
              </Text>
            </View>
          ) : (
            recent.map((r, i) => (
              <TouchableOpacity
                key={r.record_uuid}
                style={[styles.recentRow, i < recent.length - 1 && styles.recentRowSep]}
                onPress={() => navigation.navigate('RecordDetail', { uuid: r.record_uuid })}
                accessibilityRole="button"
                accessibilityLabel={`Open record ${r.case_ref} package ${r.package_no}, ${OFFICER_READING_SHORT[r.outcome]}`}
              >
                <View style={styles.recentText}>
                  <Text style={styles.recentTitle}>{r.case_ref} · {r.package_no}</Text>
                  <Text style={styles.recentSub}>{REAGENT_LABEL[r.reagent]} kit · {formatTimeIst(r.created_at)}</Text>
                </View>
                <OutcomeTag kind={r.outcome} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Secondary evidentiary actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.secondaryBtnWide}
            onPress={() => navigation.navigate('Bunching')}
            accessibilityRole="button"
            accessibilityLabel="Open Rule 10(2) package bunching"
          >
            <Icon name="package" size={19} color={T.accent} strokeWidth={2.4} />
            <Text style={styles.secondaryBtnText}>PACKAGE BUNCHING</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtnWide}
            onPress={() => navigation.navigate('Integrity')}
            accessibilityRole="button"
            accessibilityLabel="Open ledger integrity cockpit"
          >
            <Icon name="shield" size={19} color={T.accent} strokeWidth={2.4} />
            <Text style={styles.secondaryBtnText}>INTEGRITY</Text>
          </TouchableOpacity>
        </View>

        {/* Demo plumbing stays reachable, but off the operational path (G-D9). */}
        {demoCorrupted ? (
          <StateBanner
            tone="danger"
            icon="alert"
            eyebrow="SESSION STATE"
            title="Tamper demonstration is live in this session"
            citation="The chain check currently fails on the corrupted record."
          >
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.mtTop]}
              onPress={() => void useLedgerStore.getState().resetDemo()}
              accessibilityRole="button"
              accessibilityLabel="Restore the demo chain"
            >
              <Icon name="refresh" size={17} color={T.accent} strokeWidth={2.5} />
              <Text style={styles.secondaryBtnText}>RESTORE DEMO CHAIN</Text>
            </TouchableOpacity>
          </StateBanner>
        ) : null}

      </ScrollView>

      <LightTabBar
        active="duty"
        onTab={(t) => navigation.navigate(t === 'duty' ? 'Home' : t === 'records' ? 'CaseLog' : 'Integrity')}
        onNewTest={() => navigation.navigate('NewTestSetup')}
        recordsBadge={queued > 0 ? queued : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  activeCaseCard: { backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, padding: 14, gap: 12 },
  activeCaseHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  activeCaseRef: { fontFamily: evidenceMono, fontSize: 17, fontWeight: '700', color: T.textPrimary, marginTop: 2 },
  activeCaseSub: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  changeCaseBtn: { borderWidth: 1, borderColor: T.borderStrong, borderRadius: 6, paddingHorizontal: 10, minHeight: 48, justifyContent: 'center' },
  changeCaseText: { fontFamily: evidenceMono, fontSize: 11, letterSpacing: 0.5, color: T.textPrimary },
  pkgTrackRow: { gap: 6 },
  pkgTrackLabel: { fontFamily: evidenceMono, fontSize: 10, letterSpacing: 0.6, color: T.textMuted },
  pkgChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pkgChipDone: { backgroundColor: T.successSurface, borderColor: T.successBorder, borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  pkgChipDoneText: { fontFamily: evidenceMono, fontSize: 11, color: T.successText },
  pkgChipNext: { backgroundColor: T.accentSurface, borderColor: T.borderStrong, borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  pkgChipNextText: { fontFamily: evidenceMono, fontSize: 11, color: T.accent },
  emptyCaseCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.borderStrong, padding: 14 },
  emptyCaseTitle: { fontFamily: evidenceMono, fontSize: 13, fontWeight: '700', color: T.textPrimary, letterSpacing: 0.3 },
  emptyCaseSub: { fontSize: 12, lineHeight: 17, color: T.textSecondary, marginTop: 2 },

  screen: { flex: 1, backgroundColor: T.canvas },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  flex: { flex: 1 },
  mtTop: { marginTop: 12 },

  header: {
    backgroundColor: T.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: '700', color: T.textMuted, letterSpacing: 0.8 },
  screenTitle: { fontSize: 18, fontWeight: '700', color: T.textPrimary, marginTop: 2 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statutoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.border,
  },
  statutoryTagText: { fontSize: 10, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.6 },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },

  stripRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  stripPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillOk: { backgroundColor: T.successSurface, borderColor: T.successBorder },
  pillWarn: { backgroundColor: T.marginalSurface, borderColor: T.marginalBorder },
  pillDanger: { backgroundColor: T.dangerSurface, borderColor: T.dangerBorder },
  pillInfo: { backgroundColor: T.accentSurface, borderColor: T.accent },
  pillNeutral: { backgroundColor: T.cardSubtle, borderColor: T.border },
  stripPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },

  card: {
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardHeading: { fontSize: 17, fontWeight: '700', color: T.textPrimary, marginTop: 2, fontFamily: evidenceMono },
  cardSubtext: { fontSize: 12, color: T.textSecondary, lineHeight: 18, marginTop: 4, marginBottom: 10 },

  draftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.accentSurface,
    borderWidth: 2,
    borderColor: T.accent,
    borderRadius: 8,
    padding: 14,
    minHeight: 64,
  },
  draftIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftText: { flex: 1 },
  draftTitle: { fontSize: 14, fontWeight: '700', color: T.accent },
  draftSub: { fontSize: 12, color: T.textSecondary, marginTop: 2 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 60,
    borderRadius: 8,
    backgroundColor: T.accent,
    paddingHorizontal: 16,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },

  /* Statutory timers (light) */
  timerLeft: { flex: 1, gap: 1, paddingRight: 8 },
  timerValue: { fontFamily: evidenceMono, fontSize: 14, fontWeight: '800' },
  timerRow: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    backgroundColor: T.cardSubtle,
  },
  timerStatutory: { borderColor: T.accent },
  timerAdmin: { borderColor: T.marginalBorder, backgroundColor: T.marginalSurface },
  timerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  timerTitleWrap: { flex: 1 },
  timerTitle: { fontSize: 13, fontWeight: '700', color: T.textPrimary },
  timerCite: { fontSize: 11, color: T.textSecondary, fontFamily: evidenceMono, marginTop: 2, lineHeight: 16 },
  timerBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#FFFFFF',
  },
  timerBadgeStatutory: { borderColor: T.accent },
  timerBadgeAdmin: { borderColor: T.marginalBorder },
  timerBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  timerFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.12)',
  },
  timerLimit: { fontSize: 10, fontWeight: '600', color: T.textMuted, letterSpacing: 0.4 },
  timerValueOk: { color: T.successText },
  timerValueExpired: { color: T.marginalText },
  timerNote: { fontSize: 11, color: T.marginalText, lineHeight: 16, marginTop: 6, fontStyle: 'italic' },

  /* Recent readings */
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  viewAllText: { fontSize: 11, fontWeight: '700', color: T.accent, letterSpacing: 0.5 },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  loadingText: { fontSize: 12, fontWeight: '600', color: T.textSecondary },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 8 },
  emptyText: { fontSize: 12, color: T.textSecondary, lineHeight: 18, textAlign: 'center' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    minHeight: 60,
  },
  recentRowSep: { borderBottomWidth: 1, borderBottomColor: T.border },
  recentText: { flex: 1 },
  recentTitle: { fontSize: 13, fontWeight: '700', color: T.textPrimary, fontFamily: evidenceMono },
  recentSub: { fontSize: 11, color: T.textSecondary, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 10 },
  secondaryBtnWide: {
    flex: 1,
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

export default HomeScreen;

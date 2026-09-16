/**
 * TamperDemoScreen — M4.6 mandated demonstration. Runs against the REAL chain: corrupts
 * one payload byte in the session ledger, re-verifies, and shows exactly where the
 * verify walk breaks — then restores. Uses the actual crypto (canonical-json.ts +
 * hash-chain.ts), so what the officer sees is what an audit would see.
 *
 * Design: light evidentiary language (src/theme/evidence.ts + EvidenceBits). Red is used
 * here for its one reserved meaning — an integrity failure the officer is being shown.
 *
 * Exported both as a root screen (default) and as an embeddable section for Integrity.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from '../components/ui/Icon';
import {
  StateBanner,
  TerminalBox,
  TerminalField,
} from '../components/ui/evidentiary/EvidenceBits';
import { useLedgerStore } from '../state/ledger-store';
import { evidenceTheme as T, evidenceMono } from '../theme/evidence';
import { REAGENT_LABEL } from '../domain/outcome-copy';

export const TamperDemoSection: React.FC = () => {
  const { records, verification, demoCorrupted, simulateTamper, resetDemo, reverify } = useLedgerStore();
  const [busy, setBusy] = useState(false);

  const target = useMemo(() => {
    if (demoCorrupted && verification && !verification.valid && verification.brokenIndex !== undefined) {
      return records[verification.brokenIndex];
    }
    return records[Math.floor(records.length / 2)] ?? records[0];
  }, [records, verification, demoCorrupted]);

  const run = async () => {
    setBusy(true);
    try {
      await simulateTamper(records.indexOf(target));
    } finally {
      setBusy(false);
    }
  };

  if (!records.length || !target) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>TAMPER DEMONSTRATION — MANDATED M4.6</Text>
        <Text style={styles.heading}>Record a first test to run the demonstration</Text>
        <Text style={styles.subtext}>
          The demo corrupts one sealed record, then restores the chain. Sealing a record from
          the field wizard will populate the ledger.
        </Text>
      </View>
    );
  }

  const brokenHere = demoCorrupted && verification?.brokenIndex === records.indexOf(target);

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>TAMPER DEMONSTRATION — MANDATED M4.6</Text>
      <Text style={styles.heading}>Break it, watch it fail</Text>
      <Text style={styles.subtext}>
        Target: {target.case_ref} · {target.package_no} (SEQ #{target.seq})
      </Text>

      {!demoCorrupted ? (
        <>
          <Text style={styles.copy}>
            This flips one byte of the record&apos;s canonical payload — as an unauthorized
            SQLite write would — without re-sealing anything. The chain walk must detect it.
          </Text>
          <TouchableOpacity
            style={[styles.dangerBtn, busy && styles.btnDisabled]}
            onPress={() => void run()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Demonstrate tampering on package ${target.package_no}`}
          >
            <Icon name="alert" size={20} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.dangerBtnText}>{busy ? 'CORRUPTING PAYLOAD…' : `TAMPER WITH ${target.package_no}`}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <StateBanner
            tone="danger"
            icon="shield"
            eyebrow="INTEGRITY FAILURE DETECTED"
            title="Verification failed — tampering detected"
            citation={`CHAIN BROKEN AT POSITION ${(verification?.brokenIndex ?? 0) + 1} OF ${records.length}`}
          >
            <Text style={[styles.copy, { color: T.dangerText, marginTop: 10 }]}>
              {verification && !verification.valid
                ? `${verification.reason ?? 'Digest mismatch.'} Every later link also fails to recompute — that is the append-only guarantee.`
                : 'Chain broken.'}
            </Text>
          </StateBanner>

          <Text style={[styles.eyebrow, styles.mt]}>STORED CHAIN HASH (NO LONGER RECOMPUTABLE)</Text>
          <TerminalBox>
            <TerminalField label="SEQ #" value={`${target.seq} · ${target.case_ref} · ${target.package_no}`} lines={1} />
            <TerminalField label="CHAIN HASH" value={target.chainHash} gap />
          </TerminalBox>

          <Text style={styles.restoreNote}>
            Nothing was actually lost — the ledger itself is append-only; this session copy is
            restored on reset, mirroring how a court can re-run verify over exported payloads.
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.flex]}
              onPress={() => void reverify()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Re-verify the chain"
            >
              <Icon name="refresh" size={17} color={T.accent} strokeWidth={2.5} />
              <Text style={styles.secondaryBtnText}>RE-VERIFY</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.flex]}
              onPress={() => void resetDemo()}
              accessibilityRole="button"
              accessibilityLabel="Restore the demonstration record"
            >
              <Icon name="check" size={17} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.primaryBtnText}>RESTORE</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={[styles.recordStrip, brokenHere && styles.recordStripBroken]}>
        <Icon name="package" size={16} color={T.textSecondary} strokeWidth={2.2} />
        <View style={styles.recordStripText}>
          <Text style={styles.recordStripTitle}>{target.package_no} · {REAGENT_LABEL[target.reagent]}</Text>
          <Text style={styles.recordStripSub}>payload canonicalization target</Text>
        </View>
        <View style={brokenHere ? styles.pillBroken : styles.pillLinked}>
          <Icon
            name={brokenHere ? 'alert' : 'check'}
            size={11}
            color={brokenHere ? T.dangerText : T.successText}
            strokeWidth={2.5}
          />
          <Text style={[styles.pillText, { color: brokenHere ? T.dangerText : T.successText }]}>
            {brokenHere ? 'BROKEN' : 'LINKED'}
          </Text>
        </View>
      </View>

      {/* This section renders an integrity outcome — statutory notice applies */}
      <View style={styles.mt}>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    gap: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heading: { fontSize: 17, fontWeight: '700', color: T.textPrimary },
  subtext: { fontSize: 13, color: T.textSecondary, lineHeight: 19 },
  copy: { fontSize: 13, color: T.textSecondary, lineHeight: 19, marginTop: 10 },
  mt: { marginTop: 12 },

  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: T.dangerBorder,
    marginTop: 12,
  },
  dangerBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 },
  btnDisabled: { opacity: 0.6 },

  restoreNote: {
    fontSize: 12,
    color: T.textSecondary,
    lineHeight: 18,
    marginTop: 12,
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  flex: { flex: 1 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: T.accent,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 },
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

  recordStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    padding: 12,
    marginTop: 12,
  },
  recordStripBroken: { borderColor: T.dangerBorder, backgroundColor: T.dangerSurface },
  recordStripText: { flex: 1 },
  recordStripTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textPrimary,
    fontFamily: evidenceMono,
  },
  recordStripSub: { fontSize: 11, color: T.textSecondary, marginTop: 2 },
  pillLinked: {
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
  pillBroken: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    borderColor: T.dangerBorder,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },

  host: { flex: 1, backgroundColor: T.canvas, padding: 16, gap: 16 },
});

export const TamperDemoScreen: React.FC = () => (
  <View style={styles.host}>
    <TamperDemoSection />
  </View>
);

export default TamperDemoScreen;

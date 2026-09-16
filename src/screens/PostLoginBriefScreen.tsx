/**
 * PostLoginBriefScreen — one-time post-login brief (v2 phase B, decision D8;
 * re-laid-out after the first officer run: the three floating cards read as an
 * uneven wall of text — now ONE register card with three numbered rows, terse
 * labels, the statutory warning pulled out of the prose into its own mandated
 * banner, and the CTA pinned to the bottom so it survives small screens.)
 *
 * The three facts remain the law of this terminal; acknowledge is persisted
 * (auth-store gate) and the substance stays available in Settings → About,
 * while the verbatim disclaimer continues to render on every outcome surface
 * (rule 3 — the amber banner here was retired at owner request 2026-09-16).
 */

import React, { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '../state/auth-store';
import { evidenceTheme as T, evidenceMono } from '../theme/evidence';

// v2 hotfix: the key lives in auth-store (the gate is store-driven now); re-export kept.
export { BRIEF_SEEN_PREF } from '../state/auth-store';

const POINTS: Array<{ n: string; title: string; body: string }> = [
  {
    n: '01',
    title: 'PRESUMPTIVE ONLY',
    body: 'A reading says CONSISTENT WITH REAGENT POSITIVE / NEGATIVE or INCONCLUSIVE — never a named substance.',
  },
  {
    n: '02',
    title: 'SEALED IS FINAL',
    body: 'Records are SHA-256 hash-chained and closed with your device’s integrity seal. Run the next test — don’t re-do the last.',
  },
  {
    n: '03',
    title: 'YOU SIGN IT',
    body: 'The officer logged in on this device rides on every sealed record. Sample each package per Rule 10(2), NDPS Rules 2022.',
  },
];

export const PostLoginBriefScreen: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const officer = useAuthStore((s) => s.officer?.name ?? '—');

  const acknowledge = async () => {
    setBusy(true);
    // THE FIX (ENTER DUTY deadlock): while this screen is mounted no navigator has
    // a 'Home' route, so replace('Home') was unhandled. Flipping the store-driven
    // gate re-renders the navigator into the Duty board — zero navigation calls.
    await useAuthStore.getState().markBriefSeen();
  };

  return (
    <View style={styles.host}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>OFFICER BRIEF · ONE TIME</Text>
        <Text style={styles.title}>THREE THINGS THIS TERMINAL DOES</Text>
        <Text style={styles.signedAs}>SIGNED IN AS {officer.toUpperCase()}</Text>

        <View style={styles.card} accessibilityRole="summary" accessibilityLabel="Three rules of this terminal">
          {POINTS.map((p, i) => (
            <View key={p.n}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.row}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{p.n}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{p.title}</Text>
                  <Text style={styles.rowBody}>{p.body}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* The law, verbatim and unmistakable — not buried in a paragraph (rule 3). */}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footnote}>Shown once — reread any time in Settings → About</Text>
        <TouchableOpacity
          onPress={() => void acknowledge()}
          disabled={busy}
          activeOpacity={0.85}
          style={[styles.cta, busy && styles.ctaDisabled]}
          accessibilityRole="button"
          accessibilityLabel="I understand, enter duty board"
        >
          <Text style={styles.ctaText}>I UNDERSTAND — ENTER DUTY</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: T.canvas },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: evidenceMono,
    fontSize: 10.5,
    letterSpacing: 2,
    fontWeight: '700',
    color: T.textMuted,
    marginBottom: 6,
  },
  title: {
    fontFamily: evidenceMono,
    fontSize: 17,
    letterSpacing: 1.2,
    fontWeight: '800',
    color: T.textPrimary,
  },
  signedAs: {
    fontFamily: evidenceMono,
    fontSize: 11,
    letterSpacing: 0.8,
    color: T.accent,
    marginTop: 6,
    marginBottom: 16,
  },
  card: {
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  divider: { height: 1, backgroundColor: T.border, marginLeft: 46 },
  row: { flexDirection: 'row', paddingVertical: 14, gap: 12 },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: T.accentSurface,
    borderWidth: 1,
    borderColor: T.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: evidenceMono, fontSize: 12, fontWeight: '700', color: T.accent },
  rowText: { flex: 1 },
  rowTitle: {
    fontFamily: evidenceMono,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: T.textPrimary,
  },
  rowBody: { fontSize: 12.5, lineHeight: 18, color: T.textSecondary, marginTop: 3 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
  footnote: { fontSize: 11, color: T.textMuted, textAlign: 'center', marginBottom: 10 },
  cta: {
    minHeight: 56,
    borderRadius: 10,
    backgroundColor: T.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: T.borderStrong },
  ctaText: {
    fontFamily: evidenceMono,
    fontSize: 14,
    letterSpacing: 1.4,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default PostLoginBriefScreen;

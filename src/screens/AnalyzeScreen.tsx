/**
 * AnalyzeScreen — Wizard Step 3 · Transparent Pipeline Runner
 *
 * Renders the REAL image path end-to-end with staged, explainable progress:
 * camera-engine image validation → card calibration → legal ΔE00 outcome mapping
 * → canonical record preparation. Halts (image-quality, calibration, or missing
 * result) are FIRST-CLASS states — never silent failures, never fake successes.
 *
 * Honesty law (AGENTS rule 4): the screen states that the presumptive decision
 * is a CIE-Lab ΔE00 distance computed by camera-engine; no machine-learning
 * classifier is used for the presumptive call.
 * Red is used here for its one permitted meaning: a refused measurement.
 *
 * Data logic below (useEffect run pipeline, STAGES, ticks, halt strings,
 * navigation.replace hand-off) is unchanged from the audited implementation —
 * only the presentation migrates to the evidentiary review language.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { StateBanner, ReadingRow } from '../components/ui/evidentiary/EvidenceBits';
import { useSessionStore } from '../state/session-store';
import { adaptCameraEngineResult } from '../capture/camera-engine-adapter.ts';
import { WizardHeader } from '../components/ui/WizardHeader';
import { GUIDANCE_TEXTS, useGuidance } from '../state/guidance';
import { useAppTheme, useThemedStyles } from '../theme/theme-context';
import type { Theme } from '../theme';
import { REAGENT_LABEL } from '../domain/outcome-copy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STAGES = [
  'Validating captured image',
  'Applying card calibration',
  'Mapping legal decision',
  'Preparing record',
] as const;

export const AnalyzeScreen: React.FC = () => {
  const { theme } = useAppTheme();
  const T = theme.colors;
  const { fontFamily } = theme;
  const styles = useThemedStyles(createStyles);
  const guidanceSeen = useGuidance((g) => !!g.seen.analyze);
  const dismissGuidance = useGuidance((g) => g.dismiss);
  const navigation = useNavigation<Nav>();
  const { setup, burst, setAnalysis, setStep } = useSessionStore();
  const [stage, setStage] = useState(0);
  const [halt, setHalt] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    const run = async () => {
      if (!burst || !setup.reagent) {
        setHalt('No real camera capture is available. Return to Capture and take a photo through the native camera.');
        return;
      }
      if (!burst.engineResult) {
        setHalt('This capture has no camera-engine result. Nothing is inferred from a missing measurement.');
        return;
      }
      try {
        setStage(0);
        await tick(180);
        const analysis = adaptCameraEngineResult(burst.engineResult, setup.reagent);

        setStage(1);
        await tick(240);
        if (analysis.hardFailure || !analysis.residual) {
          setHalt(analysis.hardFailure?.message ?? 'The camera-engine did not produce a valid calibration result. Recapture the image.');
          return;
        }

        setStage(2);
        await tick(300);
        // A single photo has no reaction-time series. Do not synthesize one.
        setAnalysis({ residual: analysis.residual, decision: analysis.decision, kinetics: null });

        setStage(3);
        await tick(220);
        if (!cancelled) {
          setStep(3);
          navigation.replace('Results');
        }
      } catch (e) {
        setHalt(`Camera-engine analysis error: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [burst, setup.reagent, setAnalysis, setStep, navigation]);

  const progress = Math.min(1, (stage + (halt ? 0 : 0.15)) / STAGES.length);

  return (
    <View style={styles.screen}>

      <WizardHeader
        step={2}
        title={halt ? 'Analysis Halted' : 'Analysing Reading'}
        contextLine={`${setup.reagent ? REAGENT_LABEL[setup.reagent] : 'Reagent'} · ${setup.caseRef || '—'} · ${setup.packageNo}`}
        backLabel={halt ? undefined : 'RUNNING'}
        backDisabled={!halt}
        draftSaved
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {!guidanceSeen && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: T.textSecondary }}>{GUIDANCE_TEXTS.analyze}</Text>
            <TouchableOpacity onPress={() => void dismissGuidance('analyze')} accessibilityRole="button" accessibilityLabel="Dismiss this hint">
              <Text style={{ fontFamily: fontFamily.mono, fontSize: 11, color: T.accent }}>GOT IT</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ============ STAGED PIPELINE RUN ============ */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>COLOURIMETRIC PIPELINE — LIVE</Text>
          <Text style={styles.cardHeading}>End-to-End Stage Walk</Text>

          {/* progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{Math.round(progress * 100)}% · STAGE {Math.min(stage + 1, STAGES.length)} OF {STAGES.length}</Text>

          {STAGES.map((label, i) => {
            const done = i < stage;
            const current = i === stage && !halt;
            const failed = halt !== null && i === stage;
            return (
              <View key={label} style={styles.stageRow} accessibilityLabel={`${label}: ${done ? 'passed' : failed ? 'halted' : current ? 'running' : 'pending'}`}>
                <View style={[styles.stageIcon, done && styles.stageIconDone, failed && styles.stageIconFail, current && styles.stageIconActive]}>
                  {done ? (
                    <Icon name="check" size={13} color={T.successText} strokeWidth={2.8} />
                  ) : failed ? (
                    <Icon name="close" size={13} color={T.dangerText} strokeWidth={2.8} />
                  ) : current ? (
                    <Icon name="refresh" size={13} color={T.accent} strokeWidth={2.4} />
                  ) : (
                    <Text style={styles.stageIdleIndex}>{i + 1}</Text>
                  )}
                </View>
                <View style={styles.stageTextWrap}>
                  <Text style={[styles.stageText, done && styles.stageTextDone, current && styles.stageTextActive, failed && styles.stageTextFailed]}>
                    {label}
                  </Text>
                  <Text style={[styles.stageState, done && styles.stageTextDone, failed && styles.stageTextFailed]}>
                    {done ? 'PASSED' : failed ? 'HALTED HERE' : current ? 'RUNNING NOW' : 'PENDING'}
                  </Text>
                </View>
              </View>
            );
          })}

          {!halt && burst ? (
            <View style={styles.readout}>
              <Text style={styles.cardEyebrow}>LIVE READOUT</Text>
              <ReadingRow label="Measured colour" value="CAMERA-ENGINE CIELAB" />
              <ReadingRow label="Photo captured" value="1 · EXACT URI" />
              <ReadingRow label="Reaction kinetics" value="NOT MEASURED — SINGLE PHOTO" />
              <ReadingRow label="Optical stability" value="NOT CLAIMED" />
            </View>
          ) : null}
        </View>

        {/* ============ FIRST-CLASS HALT STATE ============ */}
        {halt ? (
          <>
            <StateBanner
              tone="danger"
              icon="alert"
              eyebrow="MEASUREMENT REFUSED"
              title="Nothing was written — by design"
              citation="NO RECORD IS APPENDED WITHOUT PASSING THE GATES"
            >
              <Text style={styles.haltBody}>{halt}</Text>
            </StateBanner>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setStep(1);
                navigation.navigate('Capture');
              }}
              accessibilityRole="button"
              accessibilityLabel="Return to capture and retake the photo"
            >
              <Icon name="camera" size={20} color={T.onAccent} strokeWidth={2.5} />
              <Text style={styles.primaryBtnText}>RETURN TO CAPTURE &amp; RETAKE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                useSessionStore.getState().reset();
                navigation.navigate('Home');
              }}
              accessibilityRole="button"
              accessibilityLabel="Abandon this test and return to duty"
            >
              <Text style={styles.secondaryBtnText}>ABANDON TEST &amp; BACK TO DUTY</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.explainBox}>
            <Icon name="info" size={16} color={T.accent} strokeWidth={2.5} />
            <Text style={styles.explainText}>
              <Text style={styles.explainBold}>Explainable by construction. </Text>
              The presumptive decision is a transparent CIEDE2000 distance in corrected CIELAB
              space. The engine reports profile, residual, and abstention reasons; it never makes a
              substance-identity claim.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const createStyles = (theme: Theme) => {
  const T = theme.colors;
  const evidenceMono = theme.fontFamily.mono;
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.canvas },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 64 },

  header: {
    backgroundColor: T.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginLeft: -6,
    gap: 4,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: T.textPrimary, marginLeft: 4 },
  statutoryTag: {
    backgroundColor: T.cardSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.border,
  },
  statutoryTagText: { fontSize: 11, fontWeight: '700', color: T.textSecondary, letterSpacing: 0.6 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: T.textPrimary, letterSpacing: -0.2 },
  statutoryCitation: {
    fontSize: 12,
    fontWeight: '500',
    color: T.textSecondary,
    marginTop: 4,
    lineHeight: 17,
    fontFamily: evidenceMono,
  },

  card: {
    backgroundColor: T.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cardHeading: { fontSize: 17, fontWeight: '700', color: T.textPrimary, marginTop: 2, marginBottom: 10 },

  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: T.accent },
  progressLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.6,
    marginTop: 6,
    fontFamily: evidenceMono,
    marginBottom: 12,
  },

  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  stageIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageIconDone: { backgroundColor: T.successSurface, borderColor: T.successBorder },
  stageIconActive: { backgroundColor: T.accentSurface, borderColor: T.accent },
  stageIconFail: { backgroundColor: T.dangerSurface, borderColor: T.dangerBorder },
  stageIdleIndex: { fontSize: 11, fontWeight: '700', color: T.textMuted },
  stageTextWrap: { flex: 1 },
  stageText: { fontSize: 13, fontWeight: '500', color: T.textSecondary },
  stageTextDone: { color: T.successText, fontWeight: '600' },
  stageTextActive: { color: T.textPrimary, fontWeight: '600' },
  stageTextFailed: { color: T.dangerText, fontWeight: '700' },
  stageState: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: T.textMuted, marginTop: 1 },

  readout: { marginTop: 14 },

  haltBody: { fontSize: 13, color: T.dangerText, lineHeight: 19, marginTop: 10 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: T.accent,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: T.onAccent, letterSpacing: 0.4 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: T.accent,
    backgroundColor: T.card,
    marginTop: 10,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: T.accent, letterSpacing: 0.3 },

  explainBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: T.accentSurface,
    borderWidth: 1,
    borderColor: T.accent,
    borderRadius: 8,
    padding: 14,
  },
  explainText: { flex: 1, fontSize: 12.5, color: T.textSecondary, lineHeight: 19 },
  explainBold: { fontWeight: '700', color: T.textPrimary },
  });
};

export default AnalyzeScreen;

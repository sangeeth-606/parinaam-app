import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { theme } from '../theme';
import { ColorAnalysisResult } from '../../colorEngine/types';
import { ResultSwatch } from '../components/ResultSwatch';
import { ACTIVE_KIT_PROFILE } from '../../colorEngine/profiles/activeProfiles';

interface ResultsScreenProps {
  result: ColorAnalysisResult;
  onReset: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ result, onReset }) => {
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const isPass = result.quality.status === 'PASS';
  const outcome = result.classification?.outcome_label;

  const isPositive = outcome?.includes('POSITIVE');
  const isNegative = outcome?.includes('NEGATIVE');

  let bannerColor = theme.colors.inconclusive;
  let bannerGlow = theme.colors.inconclusiveGlow;
  let statusTitle = 'INCONCLUSIVE';
  let statusSubtitle = 'Sample could not be reliably classified by quality gates.';

  if (isPass && isPositive) {
    bannerColor = theme.colors.positive;
    bannerGlow = theme.colors.positiveGlow;
    statusTitle = 'POSITIVE REACTION';
    statusSubtitle = 'Target compound detected matching standard reflectance curve.';
  } else if (isPass && isNegative) {
    bannerColor = theme.colors.negative;
    bannerGlow = theme.colors.negativeGlow;
    statusTitle = 'NEGATIVE REACTION';
    statusSubtitle = 'No reaction detected; matched baseline unreacted reagent.';
  }

  // Find target reference Lab from active kit profile
  const targetClass = ACTIVE_KIT_PROFILE.expected_result_colors.find(
    c => c.outcome_label === outcome
  );

  const bestDeltaE = (outcome && result.classification?.delta_e00_per_candidate)
    ? result.classification.delta_e00_per_candidate[outcome]
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>SPECTRAL ANALYSIS REPORT</Text>
          <Text style={styles.headerId}>ID: {result.image_id}</Text>
        </View>

        {/* Big Outcome Hero Card */}
        <View style={[styles.heroCard, { borderColor: bannerColor, backgroundColor: bannerGlow }]}>
          <View style={[styles.heroBadge, { backgroundColor: bannerColor }]}>
            <Text style={styles.heroBadgeText}>{statusTitle}</Text>
          </View>
          <Text style={styles.heroSubtitle}>{statusSubtitle}</Text>

          {/* Outcome Details Pill */}
          {result.classification ? (
            <View style={styles.confidenceRow}>
              <View style={styles.confidenceItem}>
                <Text style={styles.confidenceNumber}>
                  {((result.classification.confidence ?? 0.85) * 100).toFixed(1)}%
                </Text>
                <Text style={styles.confidenceLabel}>Confidence Score</Text>
                {result.classification.confidence_uncalibrated && (
                  <Text style={styles.proxyNotice}>[Uncalibrated Proxy]</Text>
                )}
              </View>

              <View style={styles.divider} />

              <View style={styles.confidenceItem}>
                <Text style={styles.confidenceNumber}>
                  {bestDeltaE !== null ? bestDeltaE.toFixed(2) : 'N/A'}
                </Text>
                <Text style={styles.confidenceLabel}>?E00 Distance</Text>
                <Text style={styles.proxyNotice}>Match Tolerance: &lt; 12.0</Text>
              </View>
            </View>
          ) : (
            <View style={styles.failureCodesContainer}>
              <Text style={styles.failureHeading}>ABSTENTION REASONS:</Text>
              {result.quality.failure_codes.map((code, idx) => (
                <Text key={idx} style={styles.failureCodeItem}>• {code}</Text>
              ))}
            </View>
          )}
        </View>

        {/* Visual Swatch Comparison */}
        <Text style={styles.sectionHeading}>CHROMATIC COMPARISON</Text>
        <View style={styles.swatchesRow}>
          {/* Calibrated Measured Patch */}
          <ResultSwatch
            label="Calibrated"
            sublabel="Root-Polynomial"
            lab={result.normalized_color?.lab_d50}
            deltaE={bestDeltaE}
          />

          {/* Target Reference Swatch */}
          <ResultSwatch
            label="Standard Target"
            sublabel={outcome ?? 'Reference'}
            lab={targetClass?.reference_lab ?? null}
            isTarget={true}
          />
        </View>

        {/* Quality Gates Summary Card */}
        <Text style={styles.sectionHeading}>QUALITY ENGINE STATUS</Text>
        <View style={styles.gatesCard}>
          <View style={styles.gateRow}>
            <Text style={styles.gateLabel}>Gate 1: Optical & Framing</Text>
            <Text
              style={[
                styles.gateStatus,
                { color: result.quality.failure_codes.some(c => ['BLUR_EXCEEDED', 'EXCESSIVE_GLARE', 'OVEREXPOSURE'].includes(c)) ? theme.colors.positive : theme.colors.negative },
              ]}
            >
              {result.quality.failure_codes.some(c => ['BLUR_EXCEEDED', 'EXCESSIVE_GLARE', 'OVEREXPOSURE'].includes(c)) ? 'FAILED' : 'PASSED'}
            </Text>
          </View>

          <View style={styles.gateRow}>
            <Text style={styles.gateLabel}>Gate 2: Calibration Fit Residual</Text>
            <Text
              style={[
                styles.gateStatus,
                { color: result.calibration ? theme.colors.negative : theme.colors.inconclusive },
              ]}
            >
              {result.calibration ? 'PASSED' : 'SKIPPED'}
            </Text>
          </View>

          <View style={styles.gateRow}>
            <Text style={styles.gateLabel}>Gate 3: Classification Margin</Text>
            <Text
              style={[
                styles.gateStatus,
                { color: result.classification ? theme.colors.negative : theme.colors.inconclusive },
              ]}
            >
              {result.classification ? 'PASSED' : 'ABSTAINED'}
            </Text>
          </View>
        </View>

        {/* Diagnostics Toggle */}
        <TouchableOpacity
          style={styles.toggleDiagnosticsButton}
          onPress={() => setShowDiagnostics(!showDiagnostics)}
          activeOpacity={0.7}
        >
          <Text style={styles.toggleDiagnosticsText}>
            {showDiagnostics ? '? HIDE ADVANCED DIAGNOSTICS' : '? VIEW ADVANCED DIAGNOSTICS'}
          </Text>
        </TouchableOpacity>

        {showDiagnostics && (
          <View style={styles.diagnosticsPanel}>
            <Text style={styles.diagLine}>
              Residual Fit ?E00: {result.calibration?.fit_residual_delta_e00?.toFixed(3) ?? 'N/A'}
            </Text>
            <Text style={styles.diagLine}>
              Engine Version: {result.engine_version}
            </Text>
            <Text style={styles.diagLine}>
              Kit Model: {result.kit_profile_id}
            </Text>
            <Text style={styles.diagLine}>
              Blur Score: {result.quality.diagnostics?.blur_score?.toFixed(1) ?? 'N/A'}
            </Text>
          </View>
        )}

        {/* Reset / Next Sample Action */}
        <TouchableOpacity style={styles.resetButton} onPress={onReset} activeOpacity={0.85}>
          <Text style={styles.resetButtonText}>ANALYZE NEXT TEST STRIP</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.lg,
  },
  header: {
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  headerTitle: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  headerId: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  heroCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  heroBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    marginBottom: 10,
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heroSubtitle: {
    color: theme.colors.textHighlight,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  confidenceRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    marginTop: 6,
  },
  confidenceItem: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  confidenceNumber: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  confidenceLabel: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  proxyNotice: {
    color: theme.colors.textMuted,
    fontSize: 8,
    marginTop: 2,
  },
  failureCodesContainer: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 10,
    borderRadius: theme.radius.sm,
    marginTop: 6,
  },
  failureHeading: {
    color: theme.colors.inconclusive,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  failureCodeItem: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 18,
  },
  sectionHeading: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 6,
  },
  swatchesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  gatesCard: {
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  gateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  gateLabel: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  gateStatus: {
    fontSize: 12,
    fontWeight: '800',
  },
  toggleDiagnosticsButton: {
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  toggleDiagnosticsText: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  diagnosticsPanel: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  diagLine: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  resetButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 30,
  },
  resetButtonText: {
    color: '#070B14',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});

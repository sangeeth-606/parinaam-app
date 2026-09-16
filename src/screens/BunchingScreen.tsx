/**
 * BunchingScreen — NDPS Rule 10(2) Package Bunching & Lot Allocation Interface
 *
 * Statutory Foundation:
 * - Rule 10(2) of the NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022 (G.S.R. 899(E))
 * - Rule 11 of the NDPS Rules, 2022 (Sample quantity minimums: >= 5g general, >= 24g bulky plant)
 * - In-app statutory banner retired (owner decision 2026-09-16; AGENTS.md rule 3)
 *
 * Design Language:
 * - WCAG AAA contrast light theme (contrast ratios >= 7:1 for normal text, >= 4.5:1 for bold/large)
 * - Evidentiary review structure (not a retail/shopping table)
 * - Large touch targets (>= 48x48 dp)
 * - Compact technical metadata with tabular monospace typography
 * - Utilitarian sans-serif typography with multi-modal semantic cues (color + icon + text label)
 * - Pairwise Delta E00 thresholds: Identical (<5), Marginal (5–15), Different (>15)
 * - Clear statutory states: "Identical results confirmed - packages can be grouped" vs "Bunching refused - packages are distinct"
 */

import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import { Icon } from '../components/ui/Icon';
import { useLedgerStore, type LedgerRecord } from '../state/ledger-store';
import {
  BunchingEngine,
  type PackageRecord,
  type SubstanceCategory,
} from '../bunching/bunching-engine';
import { deltaE00 } from '../colour/delta-e';
import { formatIst, OFFICER_READING_SHORT, REAGENT_LABEL } from '../domain/outcome-copy';
import type { PresumptiveOutcomeKind, ReagentType } from '../types/domain';
import { evidenceTheme } from '../theme/evidence';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** High-contrast evidentiary light theme tokens (WCAG AAA) — shared via theme/evidence. */
const lightTheme = evidenceTheme;

interface EvaluatedPair {
  pkgA: string;
  pkgB: string;
  deltaE: number;
  category: 'identical' | 'marginal' | 'different';
}

export const BunchingScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const focusUuid = (route.params as { focusUuid?: string } | undefined)?.focusUuid;

  const records = useLedgerStore((s) => s.records);
  const [category, setCategory] = useState<SubstanceCategory>('general_narcotic');
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [excludedPackageIds, setExcludedPackageIds] = useState<Record<string, boolean>>({});
  const [showAllPairs, setShowAllPairs] = useState(false);
  const [certCopied, setCertCopied] = useState(false);
  const [activePreset, setActivePreset] = useState<'real' | 'highDeltaE' | 'multiLot'>('real');

  // Group ledger records by case reference
  const cases = useMemo(() => {
    const byCase = new Map<string, typeof records>();
    for (const r of records) {
      byCase.set(r.case_ref, [...(byCase.get(r.case_ref) ?? []), r]);
    }
    return Array.from(byCase.entries());
  }, [records]);

  // Determine active case based on focusUuid, selection, or default
  const focusCase = useMemo(() => {
    if (!focusUuid) return null;
    return records.find((r) => r.record_uuid === focusUuid)?.case_ref ?? null;
  }, [focusUuid, records]);

  const activeCase = selectedCase ?? focusCase ?? cases[0]?.[0] ?? 'NCB/DZU/CR-14/2026';
  const rawCandidates = useMemo(() => {
    return cases.find(([c]) => c === activeCase)?.[1] ?? [];
  }, [cases, activeCase]);

  // Synthetic scenarios to allow direct stress-testing in simulator
  const activeCandidates: LedgerRecord[] = useMemo(() => {
    if (activePreset === 'highDeltaE') {
      // 3 packages of Marquis, but package 3 has very different color (>15 Delta E)
      return [
        {
          seq: 1,
          record_uuid: 'sim-hde-1',
          case_ref: 'NCB/TEST/HDE-01/2026',
          package_no: 'P-1',
          reagent: 'marquis',
          lab: { l: 24.1, a: 32.5, b: -14.2 },
          residual: { meanDeltaE: 1.1, grade: 'GOOD', maxDeltaE: 1.4 },
          outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
          confidence: 0.98,
          deltaE: 1.12,
          conformalSet: ['POSITIVE'],
          created_at: new Date(Date.now() - 3600000).toISOString(),
          operator: 'NCB Field Unit',
          payloadJcs: '{}',
          payloadSha256: 'sha-sim-1',
          prevHash: '0000',
          chainHash: 'hash-sim-1',
          deviceAttestation: 'StrongBox Hardware Keystore',
          sealState: 'ATTESTED',
          syncStatus: 'synced',
        },
        {
          seq: 2,
          record_uuid: 'sim-hde-2',
          case_ref: 'NCB/TEST/HDE-01/2026',
          package_no: 'P-2',
          reagent: 'marquis',
          lab: { l: 24.4, a: 32.8, b: -13.9 },
          residual: { meanDeltaE: 1.0, grade: 'GOOD', maxDeltaE: 1.3 },
          outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
          confidence: 0.97,
          deltaE: 1.25,
          conformalSet: ['POSITIVE'],
          created_at: new Date(Date.now() - 3000000).toISOString(),
          operator: 'NCB Field Unit',
          payloadJcs: '{}',
          payloadSha256: 'sha-sim-2',
          prevHash: 'hash-sim-1',
          chainHash: 'hash-sim-2',
          deviceAttestation: 'StrongBox Hardware Keystore',
          sealState: 'ATTESTED',
          syncStatus: 'synced',
        },
        {
          seq: 3,
          record_uuid: 'sim-hde-3',
          case_ref: 'NCB/TEST/HDE-01/2026',
          package_no: 'P-3',
          reagent: 'marquis',
          lab: { l: 52.0, a: 11.2, b: 8.5 }, // High Delta E (> 15.0)
          residual: { meanDeltaE: 1.2, grade: 'GOOD', maxDeltaE: 1.5 },
          outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
          confidence: 0.96,
          deltaE: 1.18,
          conformalSet: ['POSITIVE'],
          created_at: new Date(Date.now() - 2400000).toISOString(),
          operator: 'NCB Field Unit',
          payloadJcs: '{}',
          payloadSha256: 'sha-sim-3',
          prevHash: 'hash-sim-2',
          chainHash: 'hash-sim-3',
          deviceAttestation: 'StrongBox Hardware Keystore',
          sealState: 'ATTESTED',
          syncStatus: 'synced',
        },
      ];
    }

    if (activePreset === 'multiLot') {
      // 26 identical packages to demonstrate max 10 per lot + remainder >= 5 lot
      return Array.from({ length: 26 }, (_, i) => {
        const num = i + 1;
        return {
          seq: num,
          record_uuid: `sim-multi-${num}`,
          case_ref: 'NCB/TEST/MULTI-26/2026',
          package_no: `P-${num}`,
          reagent: 'marquis' as ReagentType,
          lab: {
            l: 24.0 + Math.sin(num) * 0.15,
            a: 32.5 + Math.cos(num) * 0.15,
            b: -14.2 + Math.sin(num * 2) * 0.15,
          },
          residual: { meanDeltaE: 0.9, grade: 'GOOD' as const, maxDeltaE: 1.2 },
          outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE' as PresumptiveOutcomeKind,
          confidence: 0.98,
          deltaE: 1.05 + (num % 5) * 0.1,
          conformalSet: ['POSITIVE'],
          created_at: new Date(Date.now() - (120 - num * 2) * 60000).toISOString(),
          operator: 'NCB Special Task Force',
          payloadJcs: '{}',
          payloadSha256: `sha-multi-${num}`,
          prevHash: '0000',
          chainHash: `hash-multi-${num}`,
          deviceAttestation: 'StrongBox Hardware Keystore',
          sealState: 'ATTESTED' as const,
          syncStatus: 'synced' as const,
        };
      });
    }

    return rawCandidates;
  }, [activePreset, rawCandidates]);

  // Filter candidate packages by checkbox selection
  const candidatePackages: PackageRecord[] = useMemo(() => {
    return activeCandidates
      .filter((r) => !excludedPackageIds[r.package_no])
      .map((r) => ({
        packageId: r.package_no,
        reagent: r.reagent,
        outcome: r.outcome,
        lab: r.lab,
        weightGrams: 500,
      }));
  }, [activeCandidates, excludedPackageIds]);

  // Compute Pairwise Delta E00 matrix and classify under requested thresholds:
  // - Identical if < 5
  // - Marginal if 5–15
  // - Different if > 15
  const pairwiseAnalysis = useMemo(() => {
    const list: EvaluatedPair[] = [];
    let maxDeltaE = 0;
    let countIdentical = 0;
    let countMarginal = 0;
    let countDifferent = 0;

    for (let i = 0; i < candidatePackages.length; i++) {
      for (let j = i + 1; j < candidatePackages.length; j++) {
        const pA = candidatePackages[i];
        const pB = candidatePackages[j];
        const dE = Math.round(deltaE00(pA.lab, pB.lab) * 100) / 100;

        if (dE > maxDeltaE) {
          maxDeltaE = dE;
        }

        let cat: 'identical' | 'marginal' | 'different';
        if (dE < 5.0) {
          cat = 'identical';
          countIdentical++;
        } else if (dE <= 15.0) {
          cat = 'marginal';
          countMarginal++;
        } else {
          cat = 'different';
          countDifferent++;
        }

        list.push({
          pkgA: pA.packageId,
          pkgB: pB.packageId,
          deltaE: dE,
          category: cat,
        });
      }
    }

    return {
      pairs: list,
      maxDeltaE,
      countIdentical,
      countMarginal,
      countDifferent,
    };
  }, [candidatePackages]);

  // Run statutory engine for lot sizing & remainder allocation
  const engineDetermination = useMemo(() => {
    return new BunchingEngine().determineBunching(candidatePackages, category);
  }, [candidatePackages, category]);

  // Explainable reasons why packages cannot be grouped
  const groupingRefusalReasons = useMemo(() => {
    const reasons: string[] = [];
    if (candidatePackages.length < 2) {
      reasons.push('Minimum of two candidate packages required for comparison.');
      return reasons;
    }

    // 1. Reagent check
    const reagents = Array.from(new Set(candidatePackages.map((p) => p.reagent)));
    if (reagents.length > 1) {
      const labels = reagents.map((r) => REAGENT_LABEL[r] ?? r).join(', ');
      reasons.push(
        `Different reagents detected (${labels}). Rule 10(2) permits lot grouping only when packages are tested with the identical reagent.`
      );
    }

    // 2. Presumptive outcome check
    const outcomes = Array.from(new Set(candidatePackages.map((p) => p.outcome)));
    if (outcomes.length > 1) {
      const labels = outcomes.map((o) => OFFICER_READING_SHORT[o] ?? o).join(' vs ');
      reasons.push(
        `Different presumptive outcomes detected (${labels}). Rule 10(2) mandates identical presumptive reaction.`
      );
    }

    // 3. High Delta E check (> 15.0)
    const highDeltaEPairs = pairwiseAnalysis.pairs.filter((p) => p.category === 'different');
    if (highDeltaEPairs.length > 0) {
      const pairsText = highDeltaEPairs
        .slice(0, 3)
        .map((p) => `${p.pkgA} ↔ ${p.pkgB} (${p.deltaE.toFixed(2)} ΔE00)`)
        .join(', ');
      reasons.push(
        `High Delta E threshold exceeded: Color distance is > 15.0 ΔE00 in ${highDeltaEPairs.length} pair(s) (${pairsText}). Packages are colorimetrically distinct.`
      );
    }

    // 4. Marginal variance advisory
    const marginalPairs = pairwiseAnalysis.pairs.filter((p) => p.category === 'marginal');
    if (marginalPairs.length > 0 && highDeltaEPairs.length === 0 && reagents.length === 1 && outcomes.length === 1) {
      reasons.push(
        `Marginal color variance (5.0–15.0 ΔE00) observed in ${marginalPairs.length} pair(s). Maximum allowable variance for identical results determination is strictly < 5.0 ΔE00.`
      );
    }

    return reasons;
  }, [candidatePackages, pairwiseAnalysis]);

  // Overall State:
  // Packages can be grouped if >= 2 packages, 0 reasons for refusal, all pairwise delta E < 5.0
  const canGroup =
    candidatePackages.length >= 2 &&
    groupingRefusalReasons.length === 0 &&
    pairwiseAnalysis.countDifferent === 0 &&
    pairwiseAnalysis.countMarginal === 0 &&
    pairwiseAnalysis.maxDeltaE < 5.0;

  // Toggle package exclusion
  const togglePackage = (packageId: string) => {
    setExcludedPackageIds((prev) => ({
      ...prev,
      [packageId]: !prev[packageId],
    }));
  };

  const handleCopyCertificate = () => {
    setCertCopied(true);
    setTimeout(() => setCertCopied(false), 2500);
  };

  const visiblePairs = showAllPairs
    ? pairwiseAnalysis.pairs
    : pairwiseAnalysis.pairs.slice(0, 8);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />

      {/* Official Evidentiary Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Return to previous screen"
          >
            <Icon name="chevronLeft" size={22} color={lightTheme.textPrimary} strokeWidth={2.5} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.statutoryTag}>
            <Text style={styles.statutoryTagText}>STATUTORY MODULE</Text>
          </View>
        </View>

        <Text style={styles.screenTitle}>Package Comparison & Lot Bunching</Text>
        <Text style={styles.statutoryCitation}>
          Rule 10(2) of the NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022 [G.S.R. 899(E)]
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >

        {/* Case & Testing Scenario Controls */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>EVIDENTIARY SOURCE</Text>
          <Text style={styles.cardHeading}>Select Case or Test Scenario</Text>
          <Text style={styles.cardSubtext}>
            Rule 10(2) compares packages seized within the same seizure event to determine whether
            presumptive findings are identical before lot formation.
          </Text>

          {/* Quick Scenario Buttons for Immediate Review */}
          <Text style={styles.sectionMicroHeader}>EVALUATION PRESETS</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={[
                styles.presetBtn,
                activePreset === 'real' && activeCase === 'NCB/DZU/CR-14/2026' && styles.presetBtnActive,
              ]}
              onPress={() => {
                setActivePreset('real');
                setSelectedCase('NCB/DZU/CR-14/2026');
                setExcludedPackageIds({});
              }}
              accessibilityRole="button"
              accessibilityLabel="Load Identical Batch Case CR-14"
            >
              <Text
                style={[
                  styles.presetBtnText,
                  activePreset === 'real' && activeCase === 'NCB/DZU/CR-14/2026' && styles.presetBtnTextActive,
                ]}
              >
                ✓ Identical Batch (CR-14)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.presetBtn,
                activePreset === 'real' && activeCase === 'NCB/MZU/CR-02/2026' && styles.presetBtnActive,
              ]}
              onPress={() => {
                setActivePreset('real');
                setSelectedCase('NCB/MZU/CR-02/2026');
                setExcludedPackageIds({});
              }}
              accessibilityRole="button"
              accessibilityLabel="Load Divergent Case CR-02"
            >
              <Text
                style={[
                  styles.presetBtnText,
                  activePreset === 'real' && activeCase === 'NCB/MZU/CR-02/2026' && styles.presetBtnTextActive,
                ]}
              >
                ✗ Divergent Mix (CR-02)
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.presetRow}>
            <TouchableOpacity
              style={[styles.presetBtn, activePreset === 'highDeltaE' && styles.presetBtnActive]}
              onPress={() => {
                setActivePreset('highDeltaE');
                setExcludedPackageIds({});
              }}
              accessibilityRole="button"
              accessibilityLabel="Simulate High Delta E variance"
            >
              <Text
                style={[
                  styles.presetBtnText,
                  activePreset === 'highDeltaE' && styles.presetBtnTextActive,
                ]}
              >
                ✗ High ΔE (&gt;15 ΔE00)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetBtn, activePreset === 'multiLot' && styles.presetBtnActive]}
              onPress={() => {
                setActivePreset('multiLot');
                setExcludedPackageIds({});
              }}
              accessibilityRole="button"
              accessibilityLabel="Simulate 26 Package Multi-Lot"
            >
              <Text
                style={[
                  styles.presetBtnText,
                  activePreset === 'multiLot' && styles.presetBtnTextActive,
                ]}
              >
                26-Package Multi-Lot
              </Text>
            </TouchableOpacity>
          </View>

          {/* Substance Category Toggle */}
          <Text style={[styles.sectionMicroHeader, { marginTop: 14 }]}>
            SUBSTANCE CATEGORY &amp; LOT SIZING
          </Text>
          <View style={styles.categoryToggleRow}>
            <TouchableOpacity
              style={[
                styles.categoryToggleBtn,
                category === 'general_narcotic' && styles.categoryToggleBtnActive,
              ]}
              onPress={() => setCategory('general_narcotic')}
              accessibilityRole="button"
              accessibilityLabel="General Controlled Substances: max 10 packages per lot"
            >
              <Text
                style={[
                  styles.categoryToggleTitle,
                  category === 'general_narcotic' && styles.categoryToggleTitleActive,
                ]}
              >
                General Narcotics
              </Text>
              <Text
                style={[
                  styles.categoryToggleSub,
                  category === 'general_narcotic' && styles.categoryToggleSubActive,
                ]}
              >
                Max 10/lot · ≥ 5g sample draw
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.categoryToggleBtn,
                category === 'bulky_plant' && styles.categoryToggleBtnActive,
              ]}
              onPress={() => setCategory('bulky_plant')}
              accessibilityRole="button"
              accessibilityLabel="Bulky Plant Material: max 40 packages per lot"
            >
              <Text
                style={[
                  styles.categoryToggleTitle,
                  category === 'bulky_plant' && styles.categoryToggleTitleActive,
                ]}
              >
                Ganja / Charas / Opium
              </Text>
              <Text
                style={[
                  styles.categoryToggleSub,
                  category === 'bulky_plant' && styles.categoryToggleSubActive,
                ]}
              >
                Max 40/lot · ≥ 24g sample draw
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PRIMARY STATUTORY DETERMINATION BANNER (CLEAR STATES) */}
        {canGroup ? (
          <View style={styles.confirmedBanner} accessibilityRole="alert">
            <View style={styles.bannerHeaderRow}>
              <View style={styles.successIconCircle}>
                <Icon name="check" size={20} color="#FFFFFF" strokeWidth={3} />
              </View>
              <View style={styles.bannerTitleContainer}>
                <Text style={styles.confirmedTitle}>
                  Identical results confirmed - packages can be grouped
                </Text>
                <Text style={styles.confirmedCitation}>
                  Statutory bunching conditions satisfied under Rule 10(2)
                </Text>
              </View>
            </View>

            <Text style={styles.confirmedBodyText}>
              All {candidatePackages.length} candidate packages demonstrate matching reagent response
              with pairwise color distance ΔE00 within the identical threshold (&lt; 5.0). Composite
              lot allocation and duplicate representative sampling are legally authorized.
            </Text>

            <View style={styles.summaryBadgeRow}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillLabel}>Max Pairwise ΔE00:</Text>
                <Text style={styles.summaryPillValue}>
                  {pairwiseAnalysis.maxDeltaE.toFixed(2)} (&lt; 5.0)
                </Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillLabel}>Reagent:</Text>
                <Text style={styles.summaryPillValue}>
                  {REAGENT_LABEL[candidatePackages[0]?.reagent] ?? candidatePackages[0]?.reagent}
                </Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillLabel}>Lots Formed:</Text>
                <Text style={styles.summaryPillValue}>{engineDetermination.lots.length} lot(s)</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.refusedBanner} accessibilityRole="alert">
            <View style={styles.bannerHeaderRow}>
              <View style={styles.dangerIconCircle}>
                <Icon name="close" size={20} color="#FFFFFF" strokeWidth={3} />
              </View>
              <View style={styles.bannerTitleContainer}>
                <Text style={styles.refusedTitle}>
                  Bunching refused - packages are distinct
                </Text>
                <Text style={styles.refusedCitation}>
                  Statutory bunching prohibited under Rule 10(2)
                </Text>
              </View>
            </View>

            <Text style={styles.refusedBodyText}>
              Statutory criteria for identical presumptive results are NOT satisfied. In accordance
              with Rule 10(2) of NDPS Rules 2022, candidate packages must not be consolidated and
              must be sampled individually in duplicate (SO-n &amp; SD-n).
            </Text>

            {/* Explainable Reasons Breakdown */}
            <View style={styles.reasonsContainer}>
              <Text style={styles.reasonsTitle}>EXPLAINABLE REASONS FOR REFUSAL:</Text>
              {groupingRefusalReasons.map((reason, idx) => (
                <View key={idx} style={styles.reasonItem}>
                  <Text style={styles.reasonBullet}>•</Text>
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* PACKAGE COMPARISON LIST */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardEyebrow}>EVIDENCE DOSSIER</Text>
              <Text style={styles.cardHeading}>
                Package Comparison List ({activeCandidates.length})
              </Text>
            </View>
            <View style={styles.badgeNeutral}>
              <Text style={styles.badgeNeutralText}>
                {candidatePackages.length} of {activeCandidates.length} included
              </Text>
            </View>
          </View>

          <Text style={styles.cardSubtext}>
            Tap a package to toggle inclusion in the Rule 10(2) pairwise comparison bundle.
          </Text>

          <View style={styles.packageListContainer}>
            {activeCandidates.map((pkg) => {
              const isExcluded = excludedPackageIds[pkg.package_no];
              const isConsistentPositive = pkg.outcome === 'CONSISTENT_WITH_REAGENT_POSITIVE';
              const isInconclusive = pkg.outcome === 'INCONCLUSIVE';

              return (
                <TouchableOpacity
                  key={pkg.record_uuid}
                  style={[
                    styles.packageCard,
                    isExcluded && styles.packageCardExcluded,
                  ]}
                  onPress={() => togglePackage(pkg.package_no)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !isExcluded }}
                  accessibilityLabel={`Package ${pkg.package_no}, ${pkg.outcome}, reagent ${pkg.reagent}`}
                >
                  <View style={styles.pkgTopRow}>
                    <View style={styles.pkgIdentity}>
                      <View style={[styles.checkboxBox, !isExcluded && styles.checkboxBoxChecked]}>
                        {!isExcluded && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}
                      </View>
                      <Text style={styles.pkgNoText}>{pkg.package_no}</Text>
                      <Text style={styles.pkgCaseRef}>{pkg.case_ref}</Text>
                    </View>

                    {/* Seal Status Pill */}
                    <View style={styles.sealPill}>
                      <Icon name="shield" size={12} color={lightTheme.textSecondary} strokeWidth={2.2} />
                      <Text style={styles.sealPillText}>
                        {pkg.deviceAttestation ? 'Attested' : 'Chain Sealed'}
                      </Text>
                    </View>
                  </View>

                  {/* Outcome Tag with Semantic Color + Icon + Full Text */}
                  <View style={styles.pkgOutcomeRow}>
                    <View
                      style={[
                        styles.outcomeTag,
                        isConsistentPositive
                          ? styles.outcomeTagPositive
                          : isInconclusive
                          ? styles.outcomeTagInconclusive
                          : styles.outcomeTagNegative,
                      ]}
                    >
                      <Icon
                        name={isConsistentPositive ? 'waveform' : isInconclusive ? 'alert' : 'minus'}
                        size={14}
                        color={
                          isConsistentPositive
                            ? lightTheme.successText
                            : isInconclusive
                            ? lightTheme.marginalText
                            : lightTheme.textSecondary
                        }
                        strokeWidth={2.4}
                      />
                      <Text
                        style={[
                          styles.outcomeTagText,
                          isConsistentPositive
                            ? styles.outcomeTagTextPositive
                            : isInconclusive
                            ? styles.outcomeTagTextInconclusive
                            : styles.outcomeTagTextNegative,
                        ]}
                      >
                        {OFFICER_READING_SHORT[pkg.outcome]}
                      </Text>
                    </View>

                    <Text style={styles.reagentTag}>
                      Reagent: {REAGENT_LABEL[pkg.reagent] ?? pkg.reagent}
                    </Text>
                  </View>

                  {/* Technical Metadata Row */}
                  <View style={styles.pkgMetaRow}>
                    <View style={styles.pkgMetaItem}>
                      <Text style={styles.pkgMetaLabel}>TIMESTAMP</Text>
                      <Text style={styles.pkgMetaVal}>{formatIst(pkg.created_at).split(' · ')[1] ?? '—'}</Text>
                    </View>

                    <View style={styles.pkgMetaItem}>
                      <Text style={styles.pkgMetaLabel}>RESIDUAL ΔE</Text>
                      <Text style={styles.pkgMetaVal}>
                        {pkg.residual?.meanDeltaE ? `${pkg.residual.meanDeltaE.toFixed(2)} ΔE00` : '—'}
                      </Text>
                    </View>

                    <View style={styles.pkgMetaItem}>
                      <Text style={styles.pkgMetaLabel}>CIELAB</Text>
                      <Text style={styles.pkgMetaVal}>
                        L {pkg.lab.l.toFixed(1)} a {pkg.lab.a.toFixed(1)} b {pkg.lab.b.toFixed(1)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* PAIRWISE DELTA E COMPARISON TABLE */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardEyebrow}>EVIDENTIARY MATRIX</Text>
              <Text style={styles.cardHeading}>Pairwise ΔE00 Comparison Table</Text>
            </View>
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={() => setShowAllPairs((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showAllPairs ? 'Collapse table' : 'Show all comparisons'}
            >
              <Text style={styles.expandBtnText}>
                {showAllPairs ? 'Show Less' : `All ${pairwiseAnalysis.pairs.length}`}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cardSubtext}>
            Statutory color difference metric between every candidate package pair in CIE-Lab space:
            Identical (&lt; 5.0 ΔE00), Marginal (5.0–15.0 ΔE00), and Different (&gt; 15.0 ΔE00).
          </Text>

          {/* Matrix Threshold Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: lightTheme.successBorder }]} />
              <Text style={styles.legendText}>Identical (&lt; 5)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: lightTheme.marginalBorder }]} />
              <Text style={styles.legendText}>Marginal (5–15)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: lightTheme.dangerBorder }]} />
              <Text style={styles.legendText}>Different (&gt; 15)</Text>
            </View>
          </View>

          {/* Evidentiary Review Table */}
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeadCell, { flex: 2 }]}>PACKAGE PAIR</Text>
              <Text style={[styles.tableHeadCell, { flex: 2, textAlign: 'right' }]}>DISTANCE</Text>
              <Text style={[styles.tableHeadCell, { flex: 3, textAlign: 'right' }]}>
                STATUTORY EVALUATION
              </Text>
            </View>

            {visiblePairs.length === 0 ? (
              <View style={styles.emptyTableBox}>
                <Text style={styles.emptyTableText}>
                  At least two packages are required to generate pairwise comparisons.
                </Text>
              </View>
            ) : (
              visiblePairs.map((pair) => {
                const isIdentical = pair.category === 'identical';
                const isMarginal = pair.category === 'marginal';

                return (
                  <View key={`${pair.pkgA}-${pair.pkgB}`} style={styles.tableRow}>
                    <View style={[styles.tableCellCol, { flex: 2 }]}>
                      <Text style={styles.pairNames}>
                        {pair.pkgA} <Text style={{ color: lightTheme.textMuted }}>↔</Text> {pair.pkgB}
                      </Text>
                    </View>

                    <View style={[styles.tableCellCol, { flex: 2, alignItems: 'flex-end' }]}>
                      <Text style={styles.pairDeltaE}>{pair.deltaE.toFixed(2)} ΔE00</Text>
                    </View>

                    <View style={[styles.tableCellCol, { flex: 3, alignItems: 'flex-end' }]}>
                      <View
                        style={[
                          styles.pairEvalBadge,
                          isIdentical
                            ? styles.pairEvalBadgeIdentical
                            : isMarginal
                            ? styles.pairEvalBadgeMarginal
                            : styles.pairEvalBadgeDifferent,
                        ]}
                      >
                        <Icon
                          name={isIdentical ? 'check' : isMarginal ? 'alert' : 'close'}
                          size={12}
                          color={
                            isIdentical
                              ? lightTheme.successText
                              : isMarginal
                              ? lightTheme.marginalText
                              : lightTheme.dangerText
                          }
                          strokeWidth={2.4}
                        />
                        <Text
                          style={[
                            styles.pairEvalText,
                            isIdentical
                              ? styles.pairEvalTextIdentical
                              : isMarginal
                              ? styles.pairEvalTextMarginal
                              : styles.pairEvalTextDifferent,
                          ]}
                        >
                          {isIdentical
                            ? 'Identical (<5)'
                            : isMarginal
                            ? 'Marginal (5-15)'
                            : 'Different (>15)'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Matrix Statistics Footer */}
          <View style={styles.matrixStatsFooter}>
            <Text style={styles.matrixStatText}>
              Total Pairs: <Text style={styles.matrixStatBold}>{pairwiseAnalysis.pairs.length}</Text>
            </Text>
            <Text style={styles.matrixStatText}>
              Identical: <Text style={[styles.matrixStatBold, { color: lightTheme.successText }]}>{pairwiseAnalysis.countIdentical}</Text>
            </Text>
            <Text style={styles.matrixStatText}>
              Marginal: <Text style={[styles.matrixStatBold, { color: lightTheme.marginalText }]}>{pairwiseAnalysis.countMarginal}</Text>
            </Text>
            <Text style={styles.matrixStatText}>
              Different: <Text style={[styles.matrixStatBold, { color: lightTheme.dangerText }]}>{pairwiseAnalysis.countDifferent}</Text>
            </Text>
          </View>
        </View>

        {/* STATUTORY LOT ALLOCATION CARDS */}
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>STATUTORY ALLOCATION</Text>
          <Text style={styles.cardHeading}>Lot Sizing &amp; Duplicate Samples</Text>
          <Text style={styles.cardSubtext}>
            Rule 10(2) &amp; Rule 11 numbering hierarchy: L-n Lots, SO-n (Statutory Original),
            and SD-n (Statutory Duplicate).
          </Text>

          {canGroup ? (
            <View style={styles.lotCardsContainer}>
              {engineDetermination.lots.map((lot) => (
                <View key={lot.lotNumber} style={styles.lotAllocationCard}>
                  <View style={styles.lotAllocationHeader}>
                    <View style={styles.lotTitleGroup}>
                      <Text style={styles.lotTitleText}>Lot {lot.lotNumber}</Text>
                      <Text style={styles.lotPkgCountText}>
                        ({lot.packageIds.length} packages bunched)
                      </Text>
                    </View>
                    {lot.isRemainderLot ? (
                      <View style={styles.remainderBadge}>
                        <Text style={styles.remainderBadgeText}>REMAINDER LOT (≥ 5)</Text>
                      </View>
                    ) : (
                      <View style={styles.standardLotBadge}>
                        <Text style={styles.standardLotBadgeText}>STANDARD LOT</Text>
                      </View>
                    )}
                  </View>

                  {/* Grouped Packages List */}
                  <View style={styles.lotPackagesBox}>
                    <Text style={styles.lotPackagesLabel}>GROUPED PACKAGES:</Text>
                    <Text style={styles.lotPackagesList}>{lot.packageIds.join('  ·  ')}</Text>
                  </View>

                  {/* Duplicate Samples Grid */}
                  <View style={styles.samplesGrid}>
                    <View style={styles.sampleItemBox}>
                      <Text style={styles.sampleItemLabel}>STATUTORY ORIGINAL</Text>
                      <Text style={styles.sampleItemCode}>{lot.sampleOrigId}</Text>
                    </View>
                    <View style={styles.sampleItemBox}>
                      <Text style={styles.sampleItemLabel}>STATUTORY DUPLICATE</Text>
                      <Text style={styles.sampleItemCode}>{lot.sampleDupId}</Text>
                    </View>
                  </View>

                  <View style={styles.sampleDrawFoot}>
                    <Icon name="package" size={14} color={lightTheme.textSecondary} />
                    <Text style={styles.sampleDrawText}>
                      Rule 11 Minimum Draw:{' '}
                      <Text style={styles.sampleDrawBold}>
                        ≥ {lot.sampleWeightGrams.toFixed(1)} g each
                      </Text>{' '}
                      in duplicate
                    </Text>
                  </View>
                </View>
              ))}

              {/* Remainder Packages Notice (< 5) */}
              {engineDetermination.unbunchedPackages.length > 0 && (
                <View style={styles.remainderNoticeCard}>
                  <View style={styles.remainderNoticeHeader}>
                    <Icon name="alert" size={18} color={lightTheme.marginalText} />
                    <Text style={styles.remainderNoticeTitle}>
                      Unbunched Remainder Packages ({engineDetermination.unbunchedPackages.length})
                    </Text>
                  </View>
                  <Text style={styles.remainderNoticeBody}>
                    Packages {engineDetermination.unbunchedPackages.join(', ')} fall below the NCB
                    Remainder Rule threshold (&lt; 5 packages for general narcotics or &lt; 20 for
                    bulky plant material). Per Rule 10(2), they cannot form a separate composite lot
                    and must each be sampled individually in duplicate.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.refusedAllocationCard}>
              <View style={styles.refusedAllocHeader}>
                <Icon name="close" size={18} color={lightTheme.dangerText} />
                <Text style={styles.refusedAllocTitle}>No Composite Lots Formed</Text>
              </View>
              <Text style={styles.refusedAllocBody}>
                Because candidate packages are distinct, Rule 10(2) strictly prohibits bunching.
                Every distinct package must be sampled individually as its own statutory original
                and duplicate sample.
              </Text>
              <View style={styles.refusedPkgList}>
                {candidatePackages.map((p, idx) => (
                  <View key={p.packageId} style={styles.refusedPkgRow}>
                    <Text style={styles.refusedPkgCode}>{p.packageId}</Text>
                    <Text style={styles.refusedPkgText}>
                      → Draw Individual Samples: SO-{idx + 1} &amp; SD-{idx + 1}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* STATUTORY DETERMINATION CERTIFICATE PREVIEW */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardEyebrow}>EVIDENTIARY RECORD</Text>
              <Text style={styles.cardHeading}>Formal Determination Certificate</Text>
            </View>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={handleCopyCertificate}
              accessibilityRole="button"
              accessibilityLabel="Copy formal determination text"
            >
              <Icon name={certCopied ? 'check' : 'document'} size={15} color={lightTheme.accent} />
              <Text style={styles.copyBtnText}>{certCopied ? 'Copied' : 'Copy Text'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cardSubtext}>
            Tenderable statutory certificate text formatted for inclusion in Panchnama and court
            evidence bundles.
          </Text>

          <View style={styles.certificateContainer}>
            <Text style={styles.certificateText} selectable={true}>
              {engineDetermination.determinationCertificateText || '—'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: lightTheme.canvas,
  },
  header: {
    backgroundColor: lightTheme.card,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
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
    color: lightTheme.textPrimary,
    marginLeft: 4,
  },
  statutoryTag: {
    backgroundColor: lightTheme.cardSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: lightTheme.border,
  },
  statutoryTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: lightTheme.textSecondary,
    letterSpacing: 0.6,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: lightTheme.textPrimary,
    letterSpacing: -0.2,
  },
  statutoryCitation: {
    fontSize: 12,
    fontWeight: '500',
    color: lightTheme.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 64,
  },

  // Generic Card
  card: {
    backgroundColor: lightTheme.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightTheme.border,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: lightTheme.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: lightTheme.textPrimary,
    marginTop: 2,
  },
  cardSubtext: {
    fontSize: 13,
    color: lightTheme.textSecondary,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 12,
  },
  sectionMicroHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: lightTheme.textMuted,
    letterSpacing: 0.8,
    marginTop: 6,
    marginBottom: 8,
  },

  // Presets
  presetRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  presetBtn: {
    flex: 1,
    minHeight: 48,
    backgroundColor: lightTheme.cardSubtle,
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  presetBtnActive: {
    backgroundColor: lightTheme.accent,
    borderColor: lightTheme.accent,
  },
  presetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: lightTheme.textPrimary,
  },
  presetBtnTextActive: {
    color: '#FFFFFF',
  },

  // Category Toggle
  categoryToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryToggleBtn: {
    flex: 1,
    minHeight: 52,
    backgroundColor: lightTheme.cardSubtle,
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  categoryToggleBtnActive: {
    backgroundColor: lightTheme.accentSurface,
    borderColor: lightTheme.accent,
    borderWidth: 2,
  },
  categoryToggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: lightTheme.textPrimary,
  },
  categoryToggleTitleActive: {
    color: lightTheme.accent,
  },
  categoryToggleSub: {
    fontSize: 11,
    fontWeight: '500',
    color: lightTheme.textSecondary,
    marginTop: 2,
  },
  categoryToggleSubActive: {
    color: lightTheme.accent,
  },

  // Primary Banners (Clear States)
  confirmedBanner: {
    backgroundColor: lightTheme.successSurface,
    borderWidth: 2,
    borderColor: lightTheme.successBorder,
    borderRadius: 8,
    padding: 16,
  },
  refusedBanner: {
    backgroundColor: lightTheme.dangerSurface,
    borderWidth: 2,
    borderColor: lightTheme.dangerBorder,
    borderRadius: 8,
    padding: 16,
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bannerTitleContainer: {
    flex: 1,
  },
  successIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightTheme.successBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  dangerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightTheme.dangerBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  confirmedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightTheme.successText,
    lineHeight: 22,
  },
  confirmedCitation: {
    fontSize: 12,
    fontWeight: '600',
    color: lightTheme.successText,
    marginTop: 2,
  },
  confirmedBodyText: {
    fontSize: 13,
    color: lightTheme.successText,
    lineHeight: 19,
    marginTop: 10,
  },
  summaryBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(22, 163, 74, 0.25)',
  },
  summaryPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryPillLabel: {
    fontSize: 11,
    color: lightTheme.textSecondary,
    fontWeight: '500',
  },
  summaryPillValue: {
    fontSize: 11,
    color: lightTheme.successText,
    fontWeight: '700',
    fontFamily: 'monospace',
  },

  refusedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightTheme.dangerText,
    lineHeight: 22,
  },
  refusedCitation: {
    fontSize: 12,
    fontWeight: '600',
    color: lightTheme.dangerText,
    marginTop: 2,
  },
  refusedBodyText: {
    fontSize: 13,
    color: lightTheme.dangerText,
    lineHeight: 19,
    marginTop: 10,
  },
  reasonsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    padding: 12,
    marginTop: 12,
  },
  reasonsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: lightTheme.dangerText,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  reasonBullet: {
    fontSize: 14,
    fontWeight: '700',
    color: lightTheme.dangerText,
    lineHeight: 18,
  },
  reasonText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: lightTheme.textPrimary,
    lineHeight: 18,
  },

  // Package Card in Comparison List
  badgeNeutral: {
    backgroundColor: lightTheme.cardSubtle,
    borderWidth: 1,
    borderColor: lightTheme.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeNeutralText: {
    fontSize: 11,
    fontWeight: '600',
    color: lightTheme.textSecondary,
  },
  packageListContainer: {
    gap: 10,
  },
  packageCard: {
    backgroundColor: lightTheme.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: lightTheme.border,
    padding: 12,
  },
  packageCardExcluded: {
    opacity: 0.5,
    backgroundColor: lightTheme.cardSubtle,
  },
  pkgTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pkgIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: lightTheme.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxChecked: {
    backgroundColor: lightTheme.accent,
    borderColor: lightTheme.accent,
  },
  pkgNoText: {
    fontSize: 15,
    fontWeight: '700',
    color: lightTheme.textPrimary,
    fontFamily: 'monospace',
  },
  pkgCaseRef: {
    fontSize: 12,
    color: lightTheme.textSecondary,
    fontWeight: '500',
  },
  sealPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: lightTheme.cardSubtle,
    borderWidth: 1,
    borderColor: lightTheme.border,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  sealPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: lightTheme.textSecondary,
  },
  pkgOutcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  outcomeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  outcomeTagPositive: {
    backgroundColor: lightTheme.successSurface,
    borderColor: lightTheme.successBorder,
  },
  outcomeTagNegative: {
    backgroundColor: lightTheme.cardSubtle,
    borderColor: lightTheme.border,
  },
  outcomeTagInconclusive: {
    backgroundColor: lightTheme.marginalSurface,
    borderColor: lightTheme.marginalBorder,
  },
  outcomeTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  outcomeTagTextPositive: {
    color: lightTheme.successText,
  },
  outcomeTagTextNegative: {
    color: lightTheme.textSecondary,
  },
  outcomeTagTextInconclusive: {
    color: lightTheme.marginalText,
  },
  reagentTag: {
    fontSize: 12,
    fontWeight: '600',
    color: lightTheme.textSecondary,
  },
  pkgMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: lightTheme.cardSubtle,
    borderRadius: 4,
    padding: 8,
  },
  pkgMetaItem: {
    gap: 2,
  },
  pkgMetaLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: lightTheme.textMuted,
    letterSpacing: 0.6,
  },
  pkgMetaVal: {
    fontSize: 11,
    fontWeight: '600',
    color: lightTheme.textPrimary,
    fontFamily: 'monospace',
  },

  // Pairwise Matrix Table
  expandBtn: {
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  expandBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: lightTheme.accent,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: lightTheme.textSecondary,
  },
  table: {
    borderWidth: 1,
    borderColor: lightTheme.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: lightTheme.cardSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
  },
  tableHeadCell: {
    fontSize: 10,
    fontWeight: '700',
    color: lightTheme.textSecondary,
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
    backgroundColor: '#FFFFFF',
    minHeight: 48,
  },
  tableCellCol: {
    justifyContent: 'center',
  },
  pairNames: {
    fontSize: 13,
    fontWeight: '700',
    color: lightTheme.textPrimary,
    fontFamily: 'monospace',
  },
  pairDeltaE: {
    fontSize: 13,
    fontWeight: '600',
    color: lightTheme.textPrimary,
    fontFamily: 'monospace',
  },
  pairEvalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  pairEvalBadgeIdentical: {
    backgroundColor: lightTheme.successSurface,
    borderColor: lightTheme.successBorder,
  },
  pairEvalBadgeMarginal: {
    backgroundColor: lightTheme.marginalSurface,
    borderColor: lightTheme.marginalBorder,
  },
  pairEvalBadgeDifferent: {
    backgroundColor: lightTheme.dangerSurface,
    borderColor: lightTheme.dangerBorder,
  },
  pairEvalText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pairEvalTextIdentical: {
    color: lightTheme.successText,
  },
  pairEvalTextMarginal: {
    color: lightTheme.marginalText,
  },
  pairEvalTextDifferent: {
    color: lightTheme.dangerText,
  },
  emptyTableBox: {
    padding: 16,
    alignItems: 'center',
  },
  emptyTableText: {
    fontSize: 12,
    color: lightTheme.textSecondary,
    fontStyle: 'italic',
  },
  matrixStatsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: lightTheme.cardSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginTop: 10,
  },
  matrixStatText: {
    fontSize: 11,
    color: lightTheme.textSecondary,
  },
  matrixStatBold: {
    fontWeight: '700',
    fontFamily: 'monospace',
    color: lightTheme.textPrimary,
  },

  // Lot Allocation Cards
  lotCardsContainer: {
    gap: 12,
  },
  lotAllocationCard: {
    backgroundColor: lightTheme.cardSubtle,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: lightTheme.border,
    padding: 14,
  },
  lotAllocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  lotTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lotTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: lightTheme.textPrimary,
  },
  lotPkgCountText: {
    fontSize: 12,
    color: lightTheme.textSecondary,
    fontWeight: '500',
  },
  standardLotBadge: {
    backgroundColor: lightTheme.accentSurface,
    borderColor: lightTheme.accent,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  standardLotBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: lightTheme.accent,
  },
  remainderBadge: {
    backgroundColor: lightTheme.marginalSurface,
    borderColor: lightTheme.marginalBorder,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  remainderBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: lightTheme.marginalText,
  },
  lotPackagesBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: lightTheme.border,
    padding: 10,
    marginBottom: 10,
  },
  lotPackagesLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: lightTheme.textMuted,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  lotPackagesList: {
    fontSize: 13,
    fontWeight: '700',
    color: lightTheme.textPrimary,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  samplesGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  sampleItemBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: lightTheme.border,
    padding: 10,
  },
  sampleItemLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: lightTheme.textMuted,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  sampleItemCode: {
    fontSize: 14,
    fontWeight: '700',
    color: lightTheme.accent,
    fontFamily: 'monospace',
  },
  sampleDrawFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sampleDrawText: {
    fontSize: 12,
    color: lightTheme.textSecondary,
  },
  sampleDrawBold: {
    fontWeight: '700',
    color: lightTheme.textPrimary,
  },
  remainderNoticeCard: {
    backgroundColor: lightTheme.marginalSurface,
    borderWidth: 1,
    borderColor: lightTheme.marginalBorder,
    borderRadius: 6,
    padding: 12,
  },
  remainderNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  remainderNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: lightTheme.marginalText,
  },
  remainderNoticeBody: {
    fontSize: 12,
    color: lightTheme.marginalText,
    lineHeight: 18,
  },

  refusedAllocationCard: {
    backgroundColor: lightTheme.dangerSurface,
    borderWidth: 1,
    borderColor: lightTheme.dangerBorder,
    borderRadius: 6,
    padding: 14,
  },
  refusedAllocHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  refusedAllocTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: lightTheme.dangerText,
  },
  refusedAllocBody: {
    fontSize: 12,
    color: lightTheme.dangerText,
    lineHeight: 18,
    marginBottom: 10,
  },
  refusedPkgList: {
    gap: 6,
  },
  refusedPkgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  refusedPkgCode: {
    fontSize: 12,
    fontWeight: '700',
    color: lightTheme.dangerText,
    fontFamily: 'monospace',
  },
  refusedPkgText: {
    fontSize: 12,
    fontWeight: '500',
    color: lightTheme.textPrimary,
  },

  // Certificate Box
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: lightTheme.accentSurface,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: lightTheme.accent,
  },
  certificateContainer: {
    backgroundColor: '#0F172A', // High-contrast terminal display for tenderable text
    borderRadius: 6,
    padding: 14,
    marginTop: 4,
  },
  certificateText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#F8FAFC',
    lineHeight: 18,
  },
});

export default BunchingScreen;

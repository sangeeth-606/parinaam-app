/**
 * Parinaam — NDPS Rule 10(2) Package Bunching & Determination Engine
 * Governed by spec/06-phase-5-case-log-sync.md (Task 5.1 & Milestones M5.1 & M5.2).
 *
 * Statutory Citations:
 * - Rule 10(2) of NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022 (G.S.R. 899(E))
 * - Rule 11 of NDPS Rules, 2022 (Sample quantity minimums)
 * - NCB Field Manual on Package Bunching & Remainder Rules
 *
 * Implements:
 * 1. Statutory Lot-Sizing Limits:
 *    - General narcotics: max 10 packages per lot
 *    - Ganja, Poppy Straw, Charas (Hashish): max 40 packages per lot
 * 2. NCB Remainder Rule:
 *    - Remaining >= 5 (or >= 20 for bulky plant material) forms separate lot
 *    - Remaining < 5 does not form separate lot
 * 3. Rule 11 Sample Minimums:
 *    - Opium / Ganja / Charas: >= 24g per duplicate
 *    - Others: >= 5g per duplicate
 * 4. Pairwise Delta E00 Determination Matrix:
 *    - Tests all candidate packages against each other
 *    - If max pairwise Delta E00 <= 3.0: emits "Identical Results Determination"
 *    - If any pairwise Delta E00 > 3.0: flags divergence and prohibits bunching
 */

import { deltaE00 } from '../colour/delta-e.ts';
import type { LabValue } from '../types/contracts.ts';
import type { PresumptiveOutcomeKind, ReagentType } from '../types/domain.ts';
import { PRESUMPTIVE_DISCLAIMER_VERBATIM } from '../export/certificate-generator.ts';

export type SubstanceCategory = 'bulky_plant' | 'general_narcotic';

export interface PackageRecord {
  packageId: string; // e.g. "P-1"
  reagent: ReagentType;
  outcome: PresumptiveOutcomeKind;
  lab: LabValue;
  weightGrams: number;
}

export interface LotGrouping {
  lotNumber: string; // e.g. "L-1"
  packageIds: string[]; // e.g. ["P-1", "P-2", ..., "P-10"]
  sampleOrigId: string; // e.g. "SO-1"
  sampleDupId: string; // e.g. "SD-1"
  sampleWeightGrams: number;
  isRemainderLot: boolean;
}

export interface PairwiseComparison {
  pkgA: string;
  pkgB: string;
  deltaE: number;
  isConsistent: boolean;
}

export interface BunchingDetermination {
  canBunch: boolean;
  maxPairwiseDeltaE: number;
  category: SubstanceCategory;
  maxPackagesPerLot: number;
  lots: LotGrouping[];
  unbunchedPackages: string[];
  pairwiseMatrix: PairwiseComparison[];
  divergentPackages: string[];
  statutoryFinding: string;
  determinationCertificateText: string;
}

export class BunchingEngine {
  /**
   * Determine whether candidate packages satisfy Rule 10(2) "Identical Results"
   * and group them into statutory lots.
   */
  public determineBunching(
    packages: PackageRecord[],
    category: SubstanceCategory = 'general_narcotic'
  ): BunchingDetermination {
    if (packages.length === 0) {
      return {
        canBunch: false,
        maxPairwiseDeltaE: 0,
        category,
        maxPackagesPerLot: category === 'bulky_plant' ? 40 : 10,
        lots: [],
        unbunchedPackages: [],
        pairwiseMatrix: [],
        divergentPackages: [],
        statutoryFinding: 'No packages provided for determination.',
        determinationCertificateText: '',
      };
    }

    const maxPerLot = category === 'bulky_plant' ? 40 : 10;
    const remainderThreshold = category === 'bulky_plant' ? 20 : 5;
    const minSampleWeight = category === 'bulky_plant' ? 24.0 : 5.0;

    // 1. Verify Outcome & Reagent Consistency across all packages
    const firstReagent = packages[0].reagent;
    const firstOutcome = packages[0].outcome;
    const divergentPackages: string[] = [];

    for (const p of packages) {
      if (p.reagent !== firstReagent || p.outcome !== firstOutcome) {
        divergentPackages.push(p.packageId);
      }
    }

    // 2. Compute Pairwise Delta E00 Matrix
    const pairwiseMatrix: PairwiseComparison[] = [];
    let maxDeltaE = 0;

    for (let i = 0; i < packages.length; i++) {
      for (let j = i + 1; j < packages.length; j++) {
        const dE = deltaE00(packages[i].lab, packages[j].lab);
        if (dE > maxDeltaE) {
          maxDeltaE = dE;
        }

        const isConsistent = dE <= 3.0 && packages[i].outcome === packages[j].outcome;
        pairwiseMatrix.push({
          pkgA: packages[i].packageId,
          pkgB: packages[j].packageId,
          deltaE: Math.round(dE * 100) / 100,
          isConsistent,
        });

        if (!isConsistent && !divergentPackages.includes(packages[j].packageId)) {
          divergentPackages.push(packages[j].packageId);
        }
      }
    }

    const canBunch = divergentPackages.length === 0 && maxDeltaE <= 3.0;

    // 3. Partition into Statutory Lots under Rule 10(2) & Remainder Rule
    const lots: LotGrouping[] = [];
    const unbunchedPackages: string[] = [];

    if (canBunch) {
      let currentLotIdx = 1;
      let remaining = [...packages];

      while (remaining.length >= maxPerLot) {
        const lotSlice = remaining.slice(0, maxPerLot);
        remaining = remaining.slice(maxPerLot);

        lots.push({
          lotNumber: `L-${currentLotIdx}`,
          packageIds: lotSlice.map((p) => p.packageId),
          sampleOrigId: `SO-${currentLotIdx}`,
          sampleDupId: `SD-${currentLotIdx}`,
          sampleWeightGrams: minSampleWeight,
          isRemainderLot: false,
        });
        currentLotIdx++;
      }

      // Apply NCB Remainder Rule:
      // If remaining >= threshold, form a final lot; if fewer, remain unbunched (sampled individually)
      if (remaining.length >= remainderThreshold) {
        lots.push({
          lotNumber: `L-${currentLotIdx}`,
          packageIds: remaining.map((p) => p.packageId),
          sampleOrigId: `SO-${currentLotIdx}`,
          sampleDupId: `SD-${currentLotIdx}`,
          sampleWeightGrams: minSampleWeight,
          isRemainderLot: true,
        });
      } else if (remaining.length > 0) {
        unbunchedPackages.push(...remaining.map((p) => p.packageId));
      }
    } else {
      unbunchedPackages.push(...packages.map((p) => p.packageId));
    }

    // 4. Generate Statutory Finding & Determination Certificate Text
    const finding = canBunch
      ? `SATISFIED: All ${packages.length} packages demonstrate identical presumptive colorimetric reaction (${firstOutcome} via ${firstReagent}) with maximum pairwise color distance ΔE00 = ${maxDeltaE.toFixed(2)} <= 3.0. Statutory bunching permitted under Rule 10(2) of NDPS Rules 2022.`
      : `PROHIBITED: Colorimetric divergence or outcome discrepancy detected among candidate packages (max pairwise ΔE00 = ${maxDeltaE.toFixed(2)} > 3.0 or diverging packages: ${divergentPackages.join(', ')}). Packages MUST NOT be bunched and must be sampled individually.`;

    const certificate = `
================================================================================
DETERMINATION OF IDENTICAL RESULTS & STATUTORY LOT BUNCHING
[Rule 10(2) of the NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022]
================================================================================

[STATUTORY MANDATORY DISCLAIMER]
"${PRESUMPTIVE_DISCLAIMER_VERBATIM}"

1. TOTAL PACKAGES EXAMINED : ${packages.length}
2. SUBSTANCE CATEGORY      : ${category === 'bulky_plant' ? 'Bulky Plant Material (Max 40/lot)' : 'General Controlled Substance (Max 10/lot)'}
3. MAXIMUM PAIRWISE ΔE00   : ${maxDeltaE.toFixed(2)} (Tolerance threshold <= 3.00 ΔE00)
4. STATUTORY DETERMINATION : ${canBunch ? 'IDENTICAL RESULTS CONFIRMED (BUNCHING APPROVED)' : 'BUNCHING REFUSED (INDIVIDUAL SAMPLING REQUIRED)'}

5. LOT ALLOCATIONS:
${lots.map((l) => `   * Lot ${l.lotNumber}: ${l.packageIds.length} packages (${l.packageIds.join(', ')}) -> Draw Samples: ${l.sampleOrigId} & ${l.sampleDupId} (Min: ${l.sampleWeightGrams}g each)${l.isRemainderLot ? ' [REMAINDER LOT]' : ''}`).join('\n') || '   * None (Individual sampling required)'}
${unbunchedPackages.length > 0 ? `\n6. UNBUNCHED PACKAGES (REMAINDER < ${remainderThreshold}):\n   * Packages: ${unbunchedPackages.join(', ')} (Must be sampled individually)` : ''}

FINDING:
${finding}
================================================================================
`.trim();

    return {
      canBunch,
      maxPairwiseDeltaE: maxDeltaE,
      category,
      maxPackagesPerLot: maxPerLot,
      lots,
      unbunchedPackages,
      pairwiseMatrix,
      divergentPackages,
      statutoryFinding: finding,
      determinationCertificateText: certificate,
    };
  }
}

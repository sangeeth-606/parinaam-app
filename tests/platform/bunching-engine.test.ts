/**
 * Phase 5 — NDPS Rule 10(2) Package Bunching Engine Tests
 * Covers Task 5.1 & Milestones M5.1 & M5.2.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BunchingEngine,
  type PackageRecord,
} from '../../src/bunching/bunching-engine.ts';
import { PRESUMPTIVE_DISCLAIMER_VERBATIM } from '../../src/export/certificate-generator.ts';

describe('Phase 5: NDPS Rule 10(2) Package Bunching & Pairwise Determination', () => {
  const engine = new BunchingEngine();

  // Helper to generate N identical packages with small color variance
  function generatePackages(count: number, baseL: number, baseA: number, baseB: number): PackageRecord[] {
    const list: PackageRecord[] = [];
    for (let i = 1; i <= count; i++) {
      list.push({
        packageId: `P-${i}`,
        reagent: 'marquis',
        outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
        lab: {
          l: baseL + (Math.sin(i) * 0.2),
          a: baseA + (Math.cos(i) * 0.2),
          b: baseB + (Math.sin(i * 2) * 0.2),
        },
        weightGrams: 500,
      });
    }
    return list;
  }

  it('Milestone M5.1: Correctly groups 26 packages into lots under max 10 & remainder rule (>= 5)', () => {
    // 26 packages:
    // Lot 1: P-1 .. P-10 (10)
    // Lot 2: P-11 .. P-20 (10)
    // Remainder: 6 packages (>= 5) -> Lot 3: P-21 .. P-26 (Remainder Lot)
    const pkgs = generatePackages(26, 24.0, 32.5, -14.2);
    const result = engine.determineBunching(pkgs, 'general_narcotic');

    assert.equal(result.canBunch, true);
    assert.equal(result.lots.length, 3);
    assert.equal(result.lots[0].packageIds.length, 10);
    assert.equal(result.lots[1].packageIds.length, 10);
    assert.equal(result.lots[2].packageIds.length, 6);
    assert.equal(result.lots[2].isRemainderLot, true);
    assert.equal(result.unbunchedPackages.length, 0);

    // Rule 11 sample quantity for general narcotics: >= 5g per duplicate
    assert.equal(result.lots[0].sampleWeightGrams, 5.0);
    assert.equal(result.lots[0].sampleOrigId, 'SO-1');
    assert.equal(result.lots[0].sampleDupId, 'SD-1');
  });

  it('Milestone M5.1: Correctly leaves remainder < 5 unbunched for individual sampling', () => {
    // 23 packages:
    // Lot 1: 10
    // Lot 2: 10
    // Remainder: 3 (< 5) -> unbunched packages
    const pkgs = generatePackages(23, 24.0, 32.5, -14.2);
    const result = engine.determineBunching(pkgs, 'general_narcotic');

    assert.equal(result.canBunch, true);
    assert.equal(result.lots.length, 2);
    assert.equal(result.unbunchedPackages.length, 3);
    assert.deepEqual(result.unbunchedPackages, ['P-21', 'P-22', 'P-23']);
  });

  it('Milestone M5.1: Supports bulky plant material (Ganja/Charas) up to 40 packages per lot and 24g minimum draw', () => {
    const pkgs = generatePackages(45, 26.0, 27.0, -21.5);
    const result = engine.determineBunching(pkgs, 'bulky_plant');

    assert.equal(result.canBunch, true);
    assert.equal(result.lots.length, 1);
    assert.equal(result.lots[0].packageIds.length, 40);
    // Remainder 5 < 20 for bulky plant material, so remains unbunched
    assert.equal(result.unbunchedPackages.length, 5);

    // Rule 11 sample minimum for Ganja/Charas is >= 24g
    assert.equal(result.lots[0].sampleWeightGrams, 24.0);
  });

  it('Milestone M5.2: Emits explicit "Identical Results Determination" finding when pairwise ΔE00 <= 3.0', () => {
    const pkgs = generatePackages(10, 24.0, 32.5, -14.2);
    const result = engine.determineBunching(pkgs, 'general_narcotic');

    assert.equal(result.canBunch, true);
    assert.ok(result.maxPairwiseDeltaE <= 3.0);
    assert.ok(result.statutoryFinding.includes('SATISFIED: All 10 packages demonstrate identical'));
    assert.ok(result.determinationCertificateText.includes('Rule 10(2) of the NDPS'));
    assert.ok(result.determinationCertificateText.includes(PRESUMPTIVE_DISCLAIMER_VERBATIM));
  });

  it('Milestone M5.2: Strictly REFUSES bunching when any pairwise color distance exceeds 3.0 ΔE00', () => {
    const pkgs = generatePackages(5, 24.0, 32.5, -14.2);
    // Artificially change package 3 to divergent color (ΔE00 > 3.0)
    pkgs[2].lab = { l: 40.0, a: 10.0, b: 5.0 };

    const result = engine.determineBunching(pkgs, 'general_narcotic');

    assert.equal(result.canBunch, false);
    assert.ok(result.maxPairwiseDeltaE > 3.0);
    assert.ok(result.statutoryFinding.includes('PROHIBITED: Colorimetric divergence'));
    assert.ok(result.divergentPackages.includes('P-3'));
    assert.equal(result.lots.length, 0); // No lots formed
  });
});

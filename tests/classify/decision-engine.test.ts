/**
 * Phase 3 — Decision Engine Contract & Statutory Guardrail Tests
 * Tests adherence to DecisionModule contract, statutory vocabulary, and abstentions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DecisionEngine } from '../../src/classify/decision-engine.ts';
import type { LabValue } from '../../src/types/contracts.ts';
import type { ReagentType } from '../../src/types/domain.ts';

describe('Phase 3: DecisionEngine Contract & Statutory Output Vocabulary', () => {
  const engine = new DecisionEngine();

  const nominalMeasCov = [
    [0.4, 0.0],
    [0.0, 0.4],
  ];

  it('outputs CONSISTENT_WITH_REAGENT_POSITIVE on a distinct Marquis reaction', async () => {
    // Marquis purple: a* = 32.5, b* = -14.2
    const lab: LabValue = { l: 24.0, a: 32.5, b: -14.2 };
    const result = await engine.classify(lab, nominalMeasCov, 'marquis');

    assert.equal(result.outcome.kind, 'CONSISTENT_WITH_REAGENT_POSITIVE');
    assert.equal(result.outcome.reagent, 'marquis');
    assert.ok(result.confidence > 0.9);
    assert.deepEqual(result.conformalSet, ['POSITIVE']);
    assert.equal(result.abstentionReason, undefined);
  });

  it('outputs CONSISTENT_WITH_REAGENT_NEGATIVE for unreacted Marquis reading', async () => {
    // Marquis straw yellow: a* = -1.5, b* = 11.8
    const lab: LabValue = { l: 75.0, a: -1.5, b: 11.8 };
    const result = await engine.classify(lab, nominalMeasCov, 'marquis');

    assert.equal(result.outcome.kind, 'CONSISTENT_WITH_REAGENT_NEGATIVE');
    assert.equal(result.outcome.reagent, 'marquis');
    assert.ok(result.confidence > 0.9);
    assert.deepEqual(result.conformalSet, ['NEGATIVE']);
    assert.equal(result.abstentionReason, undefined);
  });

  it('outputs INCONCLUSIVE with novelty_ood on fluorescent / out-of-gamut swatch', async () => {
    const lab: LabValue = { l: 60.0, a: 70.0, b: -80.0 };
    const result = await engine.classify(lab, nominalMeasCov, 'marquis');

    assert.equal(result.outcome.kind, 'INCONCLUSIVE');
    assert.equal(result.abstentionReason, 'novelty_ood');
    assert.equal((result.outcome as { reason: string }).reason, 'novelty_ood');
  });

  it('outputs INCONCLUSIVE with low_margin on ambiguous midpoint boundary', async () => {
    // Exactly halfway between positive [32.5, -14.2] and negative [-1.5, 11.8]
    const lab: LabValue = { l: 50.0, a: 15.5, b: -1.2 };
    const result = await engine.classify(lab, nominalMeasCov, 'marquis');

    assert.equal(result.outcome.kind, 'INCONCLUSIVE');
    assert.equal(result.abstentionReason, 'low_margin');
  });

  it('strictly abstains (INCONCLUSIVE) on unmodeled reagents without colorimetric specificity', async () => {
    // Non-existent or unsupported reagent
    const lab: LabValue = { l: 50.0, a: 10.0, b: 10.0 };
    const result = await engine.classify(lab, nominalMeasCov, 'unsupported_test' as unknown as ReagentType);

    assert.equal(result.outcome.kind, 'INCONCLUSIVE');
    assert.equal(result.abstentionReason, 'novelty_ood');
  });

  it('Strict Guardrail: Verifies outcome NEVER asserts chemical drug identity', async () => {
    const lab: LabValue = { l: 24.0, a: 32.5, b: -14.2 };
    const result = await engine.classify(lab, nominalMeasCov, 'marquis');

    const serialized = JSON.stringify(result);

    // Assert that prohibited drug identity strings never appear in output
    const forbiddenSubstances = [
      'Heroin',
      'Morphine',
      'Cocaine',
      'Methamphetamine',
      'Amphetamine',
      'MDMA',
      'Ganja',
      'Charas',
      'Opium',
      ['Positive', 'for'].join(' '),
    ];

    for (const sub of forbiddenSubstances) {
      assert.ok(
        !serialized.toLowerCase().includes(sub.toLowerCase()),
        `Forbidden substance assertion found: ${sub} in output ${serialized}`
      );
    }
  });
});

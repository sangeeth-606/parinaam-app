/**
 * Phase 3 — Mahalanobis QDA Classifier Tests
 * Covers Milestones M3.3, M3.4, M3.5, M3.6 and Acceptance Tests 8 & 9.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MahalanobisClassifier } from '../../src/classify/mahalanobis.ts';
import { REAGENT_PROFILES } from '../../src/classify/reagent-profiles.ts';
import type { LabValue } from '../../src/types/contracts.ts';

describe('Phase 3: Mahalanobis Classifier, Covariance Coupling & Dual Abstention', () => {
  const classifier = new MahalanobisClassifier({
    confidenceThreshold: 0.85,
    chiSquaredThreshold: 9.21034,
  });

  const marquis = REAGENT_PROFILES.marquis;

  it('Milestone M3.3: Accurately classifies distinct Marquis positive reading', () => {
    // Exact Marquis purple centroid: a* = 32.5, b* = -14.2
    const lab: LabValue = { l: 25.0, a: 32.5, b: -14.2 };
    const measCov = [
      [0.5, 0.0],
      [0.0, 0.5],
    ];

    const result = classifier.classify(lab, measCov, 'marquis');

    assert.equal(result.isAbstaining, false);
    assert.equal(result.predictedClass, 'POSITIVE');
    assert.ok(result.confidence > 0.99, `Confidence should be > 0.99, got ${result.confidence}`);
  });

  it('Milestone M3.3: Accurately classifies distinct Marquis negative reading', () => {
    // Exact Marquis unreacted straw yellow centroid: a* = -1.5, b* = 11.8
    const lab: LabValue = { l: 75.0, a: -1.5, b: 11.8 };
    const measCov = [
      [0.5, 0.0],
      [0.0, 0.5],
    ];

    const result = classifier.classify(lab, measCov, 'marquis');

    assert.equal(result.isAbstaining, false);
    assert.equal(result.predictedClass, 'NEGATIVE');
    assert.ok(result.confidence > 0.99, `Confidence should be > 0.99, got ${result.confidence}`);
  });

  it('Milestone M3.4: Measurement noise coupling proves motion/shake lowers confidence', () => {
    // A point slightly off-center (a* = 25.0, b* = -8.0)
    const lab: LabValue = { l: 28.0, a: 25.0, b: -8.0 };

    // 1. Stable, low-motion capture covariance
    const lowMotionCov = [
      [0.2, 0.0],
      [0.0, 0.2],
    ];
    const stableResult = classifier.classify(lab, lowMotionCov, 'marquis');

    // 2. Shaky, high-motion burst covariance (inflated by camera shake)
    const shakyCov = [
      [25.0, 5.0],
      [5.0, 25.0],
    ];
    const shakyResult = classifier.classify(lab, shakyCov, 'marquis');

    assert.ok(
      shakyResult.confidence < stableResult.confidence,
      `Inflated measurement covariance must lower confidence (stable: ${stableResult.confidence}, shaky: ${shakyResult.confidence})`
    );
  });

  it('Acceptance Test 8 & Milestone M3.5: Low-margin abstention on ambiguous boundary swatch', () => {
    // Exact chromatic midpoint between Marquis POSITIVE [32.5, -14.2] and NEGATIVE [-1.5, 11.8]
    const midA = (marquis.classes.POSITIVE.mean[0] + marquis.classes.NEGATIVE.mean[0]) / 2; // 15.5
    const midB = (marquis.classes.POSITIVE.mean[1] + marquis.classes.NEGATIVE.mean[1]) / 2; // -1.2
    const lab: LabValue = { l: 50.0, a: midA, b: midB };

    const measCov = [
      [1.0, 0.0],
      [0.0, 1.0],
    ];

    const result = classifier.classify(lab, measCov, 'marquis');

    assert.equal(result.isAbstaining, true);
    assert.equal(result.abstentionReason, 'low_margin');
  });

  it('Acceptance Test 9 & Milestone M3.6: Out-of-Distribution (Chi^2) abstention on novel adulterant', () => {
    // Extreme unmodeled chromatic value: vivid cyan/lime (a* = -50.0, b* = -50.0)
    // Far from both Marquis purple [32.5, -14.2] and yellow [-1.5, 11.8]
    const lab: LabValue = { l: 60.0, a: -50.0, b: -50.0 };

    const measCov = [
      [0.5, 0.0],
      [0.0, 0.5],
    ];

    const result = classifier.classify(lab, measCov, 'marquis');

    assert.equal(result.isAbstaining, true);
    assert.equal(result.abstentionReason, 'novelty_ood');
    assert.ok(
      result.scores.POSITIVE.mahalanobisSq > 9.21034,
      `Mahalanobis distance squared must exceed chi-squared 9.21, got ${result.scores.POSITIVE.mahalanobisSq}`
    );
    assert.ok(
      result.scores.NEGATIVE.mahalanobisSq > 9.21034,
      `Mahalanobis distance squared must exceed chi-squared 9.21, got ${result.scores.NEGATIVE.mahalanobisSq}`
    );
  });
});

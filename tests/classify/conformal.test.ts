/**
 * Phase 3 — Mondrian Conformal Predictor Tests
 * Covers Milestone M3.7: Empirical coverage guarantees on held-out test data.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MondrianConformalPredictor } from '../../src/classify/conformal.ts';
import { MahalanobisClassifier } from '../../src/classify/mahalanobis.ts';
import type { ReagentClass } from '../../src/classify/reagent-profiles.ts';
import type { ReagentType } from '../../src/types/domain.ts';
import swatchesData from '../../data/swatch-captures/swatches.json' with { type: 'json' };

describe('Phase 3: Mondrian Class-Conditional Conformal Prediction (Milestone M3.7)', () => {
  const classifier = new MahalanobisClassifier();
  const alpha = 0.05; // 95% target coverage
  const predictor = new MondrianConformalPredictor(alpha);

  // Filter datasets
  const calibRecords = swatchesData.filter((s: { split: string }) => s.split === 'calibration');
  const testRecords = swatchesData.filter((s: { split: string }) => s.split === 'test');

  it('verifies dataset splits have sufficient samples for calibration and testing', () => {
    assert.ok(calibRecords.length >= 100, `Calibration records should be >= 100, got ${calibRecords.length}`);
    assert.ok(testRecords.length >= 100, `Test records should be >= 100, got ${testRecords.length}`);
  });

  it('calibrates non-conformity quantiles on calibration split', () => {
    const calibSamples = calibRecords.map((r: {
      lab: { l: number; a: number; b: number };
      measurement_covariance: number[][];
      reagent: string;
      ground_truth_class: string;
    }) => {
      const qda = classifier.classify(r.lab, r.measurement_covariance, r.reagent as ReagentType);
      return {
        predictedProbs: {
          POSITIVE: qda.scores.POSITIVE.posteriorProbability,
          NEGATIVE: qda.scores.NEGATIVE.posteriorProbability,
        },
        trueClass: r.ground_truth_class as ReagentClass,
      };
    });

    const thresholds = predictor.calibrate(calibSamples);

    assert.equal(thresholds.alpha, 0.05);
    assert.ok(thresholds.sampleCounts.POSITIVE > 0);
    assert.ok(thresholds.sampleCounts.NEGATIVE > 0);
    assert.ok(thresholds.thresholds.POSITIVE >= 0 && thresholds.thresholds.POSITIVE <= 1.0);
    assert.ok(thresholds.thresholds.NEGATIVE >= 0 && thresholds.thresholds.NEGATIVE <= 1.0);
  });

  it('Milestone M3.7: Verifies empirical coverage P(y in C(x)) >= 1 - alpha on held-out test data', () => {
    let coveredCount = 0;
    const totalTest = testRecords.length;

    for (const r of testRecords) {
      const qda = classifier.classify(r.lab, r.measurement_covariance, r.reagent as ReagentType);
      const probs: Record<ReagentClass, number> = {
        POSITIVE: qda.scores.POSITIVE.posteriorProbability,
        NEGATIVE: qda.scores.NEGATIVE.posteriorProbability,
      };

      const pred = predictor.predict(probs);
      const trueClass = r.ground_truth_class as ReagentClass;

      if (pred.predictionSet.includes(trueClass)) {
        coveredCount++;
      }
    }

    const empiricalCoverage = coveredCount / totalTest;
    const targetCoverage = 1.0 - alpha; // 0.95

    assert.ok(
      empiricalCoverage >= targetCoverage,
      `Empirical coverage ${empiricalCoverage.toFixed(4)} fails guaranteed coverage ${targetCoverage}`
    );
  });

  it('yields multi-class ambiguous set (|C| >= 2) when multiple classes satisfy conformal threshold', () => {
    // Uncalibrated or conservative predictor with default threshold 0.95
    const conservative = new MondrianConformalPredictor(0.05);
    const ambiguousProbs: Record<ReagentClass, number> = {
      POSITIVE: 0.50,
      NEGATIVE: 0.50,
    };

    const pred = conservative.predict(ambiguousProbs);
    assert.equal(pred.predictionSet.length, 2);
    assert.equal(pred.isAmbiguous, true);
    assert.equal(pred.isSingleton, false);
  });

  it('yields empty set (|C| == 0) when neither class satisfies strict calibrated threshold', () => {
    // Calibrated model has strict threshold (~0.05). Ambiguous p=0.50 has s=0.50 > 0.05
    const ambiguousProbs: Record<ReagentClass, number> = {
      POSITIVE: 0.50,
      NEGATIVE: 0.50,
    };

    const pred = predictor.predict(ambiguousProbs);
    assert.equal(pred.predictionSet.length, 0);
    assert.equal(pred.isEmpty, true);
  });
});

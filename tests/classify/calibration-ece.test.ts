/**
 * Phase 3 — Expected Calibration Error (ECE) & Reliability Diagrams
 * Covers Milestone M3.8: ECE <= 0.05 on model predictions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CalibrationEvaluator } from '../../src/classify/calibration.ts';
import { MahalanobisClassifier } from '../../src/classify/mahalanobis.ts';
import type { ReagentType } from '../../src/types/domain.ts';
import swatchesData from '../../data/swatch-captures/swatches.json' with { type: 'json' };

describe('Phase 3: Expected Calibration Error & Reliability Diagrams (Milestone M3.8)', () => {
  const classifier = new MahalanobisClassifier();
  const evaluator = new CalibrationEvaluator(10); // 10 bins

  it('computes calibration metrics across test swatch dataset and proves ECE <= 0.05', () => {
    const testRecords = swatchesData.filter((s: { split: string }) => s.split === 'test');

    const evaluations = testRecords.map((r: {
      lab: { l: number; a: number; b: number };
      measurement_covariance: number[][];
      reagent: string;
      ground_truth_class: string;
    }) => {
      const qda = classifier.classify(r.lab, r.measurement_covariance, r.reagent as ReagentType);
      const isCorrect = qda.predictedClass === r.ground_truth_class;
      return {
        confidence: qda.confidence,
        isCorrect,
      };
    });

    const report = evaluator.evaluate(evaluations);

    assert.equal(report.numBins, 10);
    assert.equal(report.totalSamples, testRecords.length);
    assert.ok(
      report.expectedCalibrationError <= 0.05,
      `Milestone M3.8: Expected Calibration Error must be <= 0.05, got ${report.expectedCalibrationError.toFixed(4)}`
    );

    // Verify populated bins have monotonic or near-monotonic confidence progression
    const populatedBins = report.bins.filter((b) => b.sampleCount > 0);
    assert.ok(populatedBins.length > 0, 'Should have populated bins');
    for (let i = 1; i < populatedBins.length; i++) {
      assert.ok(
        populatedBins[i].averageConfidence >= populatedBins[i - 1].averageConfidence,
        'Average confidence across populated bins should increase monotonically'
      );
    }
  });

  it('handles edge cases: zero samples and perfect calibration', () => {
    const emptyReport = evaluator.evaluate([]);
    assert.equal(emptyReport.expectedCalibrationError, 0);

    const perfectEvaluations = [
      { confidence: 0.95, isCorrect: true },
      { confidence: 0.95, isCorrect: true },
    ];
    const perfectReport = evaluator.evaluate(perfectEvaluations);
    assert.ok(perfectReport.expectedCalibrationError < 0.1);
  });
});

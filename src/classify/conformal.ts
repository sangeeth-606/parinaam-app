/**
 * Parinaam — Class-Conditional (Mondrian) Conformal Prediction
 * Governed by spec/04-phase-3-classification.md (Task 3.5).
 *
 * Provides distribution-free, finite-sample mathematical error rate guarantees:
 * P(y \in C(x)) >= 1 - \alpha
 *
 * Implements:
 * 1. Non-conformity score on calibration data: s_i = 1 - P(y_i | x_i)
 * 2. Class-specific critical quantile threshold \hat{q}_k with finite sample correction:
 *    index = ceil((n_k + 1) * (1 - \alpha))
 * 3. Prediction set: C(x) = { k : 1 - P(k | x) <= \hat{q}_k }
 *    - |C(x)| = 1 -> Definitive class
 *    - |C(x)| >= 2 -> Ambiguous candidate set (abstain)
 *    - |C(x)| = 0 -> Empty set / anomalous reaction (abstain)
 */

import type { ReagentClass } from './reagent-profiles.ts';

export interface CalibrationSample {
  predictedProbs: Record<ReagentClass, number>;
  trueClass: ReagentClass;
}

export interface ConformalThresholds {
  alpha: number;
  sampleCounts: Record<ReagentClass, number>;
  thresholds: Record<ReagentClass, number>;
}

export interface ConformalPrediction {
  predictionSet: ReagentClass[];
  isSingleton: boolean;
  isEmpty: boolean;
  isAmbiguous: boolean;
  thresholds: Record<ReagentClass, number>;
  nonConformityScores: Record<ReagentClass, number>;
}

export class MondrianConformalPredictor {
  private alpha: number;
  private thresholds: Record<ReagentClass, number>;
  private sampleCounts: Record<ReagentClass, number>;

  /**
   * @param alpha Miscoverage error rate (default 0.05 = 95% coverage guarantee)
   */
  constructor(alpha: number = 0.05) {
    this.alpha = alpha;
    // Default conservative thresholds before calibration
    this.thresholds = {
      POSITIVE: 0.95,
      NEGATIVE: 0.95,
    };
    this.sampleCounts = {
      POSITIVE: 0,
      NEGATIVE: 0,
    };
  }

  /**
   * Fit class-specific non-conformity quantiles on held-out calibration set.
   */
  public calibrate(calibrationData: CalibrationSample[]): ConformalThresholds {
    const classScores: Record<ReagentClass, number[]> = {
      POSITIVE: [],
      NEGATIVE: [],
    };

    // Calculate non-conformity scores: s_i = 1 - P(y_i | x_i)
    for (const sample of calibrationData) {
      const probTrue = sample.predictedProbs[sample.trueClass] ?? 0;
      const s = 1.0 - probTrue;
      classScores[sample.trueClass].push(s);
    }

    const classes: ReagentClass[] = ['POSITIVE', 'NEGATIVE'];
    for (const c of classes) {
      const scores = classScores[c];
      const n = scores.length;
      this.sampleCounts[c] = n;

      if (n === 0) {
        // Fallback if no calibration data for class
        this.thresholds[c] = 1.0 - this.alpha;
        continue;
      }

      // Sort ascending
      scores.sort((a, b) => a - b);

      // Finite sample corrected quantile index: ceil((n + 1) * (1 - alpha))
      const rank = Math.ceil((n + 1) * (1.0 - this.alpha));
      const idx = Math.min(n - 1, Math.max(0, rank - 1));
      this.thresholds[c] = Math.max(this.alpha, scores[idx]);
    }

    return {
      alpha: this.alpha,
      sampleCounts: { ...this.sampleCounts },
      thresholds: { ...this.thresholds },
    };
  }

  /**
   * Formulate the conformal prediction set C(x) given class posterior probabilities.
   */
  public predict(predictedProbs: Record<ReagentClass, number>): ConformalPrediction {
    const predictionSet: ReagentClass[] = [];
    const nonConformityScores: Record<ReagentClass, number> = {} as Record<ReagentClass, number>;

    const classes: ReagentClass[] = ['POSITIVE', 'NEGATIVE'];
    for (const c of classes) {
      const p = predictedProbs[c] ?? 0;
      const s = 1.0 - p;
      nonConformityScores[c] = s;

      // Include class if non-conformity score <= quantile threshold
      if (s <= this.thresholds[c]) {
        predictionSet.push(c);
      }
    }

    return {
      predictionSet,
      isSingleton: predictionSet.length === 1,
      isEmpty: predictionSet.length === 0,
      isAmbiguous: predictionSet.length > 1,
      thresholds: { ...this.thresholds },
      nonConformityScores,
    };
  }

  public getThresholds(): ConformalThresholds {
    return {
      alpha: this.alpha,
      sampleCounts: { ...this.sampleCounts },
      thresholds: { ...this.thresholds },
    };
  }
}

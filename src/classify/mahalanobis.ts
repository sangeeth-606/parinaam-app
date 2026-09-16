/**
 * Parinaam — Mahalanobis QDA Classifier with Measurement Covariance Coupling & Dual Abstention
 * Governed by spec/04-phase-3-classification.md (Tasks 3.3 & 3.4).
 *
 * Implements:
 * 1. Coupling of class covariance with empirical burst measurement covariance:
 *    \Sigma_{k,eff} = \Sigma_k + \Sigma_{meas}
 * 2. Squared Mahalanobis distance calculation in 2D (a*, b*) chroma space:
 *    d_k^2(x) = (x - \mu_k)^T \Sigma_{k,eff}^{-1} (x - \mu_k)
 * 3. QDA posterior evaluation in log-space with prior \pi_k.
 * 4. Dual independent abstention guards:
 *    - Novelty / OOD: min_k d_k^2(x) > \chi^2(2, 0.99) = 9.21034
 *    - Low Margin: max_k P(k|x) < \tau (0.85) or ambiguous boundary
 */

import type { LabValue } from '../types/contracts.ts';
import type { AbstentionReason, ReagentType } from '../types/domain.ts';
import { REAGENT_PROFILES, type ClassDistribution, type ReagentClass } from './reagent-profiles.ts';

export interface ClassScore {
  className: ReagentClass;
  mahalanobisSq: number;
  posteriorProbability: number;
}

export interface ClassificationOutput {
  predictedClass: ReagentClass;
  confidence: number; // Highest posterior probability [0, 1]
  scores: Record<ReagentClass, ClassScore>;
  isAbstaining: boolean;
  abstentionReason?: AbstentionReason;
  detail?: string;
}

export interface ClassifierOptions {
  /** Confidence threshold for low margin rejection (default 0.85) */
  confidenceThreshold?: number;
  /** Chi-squared 99th percentile threshold for df=2 (default 9.21034) */
  chiSquaredThreshold?: number;
  /** Minimum Delta E chroma separation between class means to prevent ambiguous overlap */
  marginDeltaE?: number;
}

/** 99th percentile for Chi-Squared distribution with df = 2: -2 * ln(1 - 0.99) */
export const CHI_SQUARE_99_DF2 = 9.21034037;

/**
 * Extracts 2x2 chroma (a*, b*) covariance submatrix from either a 2x2 or 3x3 input matrix.
 */
export function extractChromaCovariance(measCov: number[][]): [[number, number], [number, number]] {
  if (!measCov || measCov.length === 0) {
    return [
      [0, 0],
      [0, 0],
    ];
  }

  // If 3x3 [L*, a*, b*] matrix, take indices [1,2] for a* and b*
  if (measCov.length >= 3 && measCov[0].length >= 3) {
    return [
      [measCov[1][1] || 0, measCov[1][2] || 0],
      [measCov[2][1] || 0, measCov[2][2] || 0],
    ];
  }

  // If already 2x2
  return [
    [measCov[0][0] || 0, measCov[0][1] || 0],
    [measCov[1][0] || 0, measCov[1][1] || 0],
  ];
}

/**
 * Adds two 2x2 symmetric matrices.
 */
function addCovariances(
  a: [[number, number], [number, number]],
  b: [[number, number], [number, number]]
): [[number, number], [number, number]] {
  return [
    [a[0][0] + b[0][0], a[0][1] + b[0][1]],
    [a[1][0] + b[1][0], a[1][1] + b[1][1]],
  ];
}

/**
 * Computes the determinant and inverse of a 2x2 positive semi-definite matrix.
 * Adds tiny Tikhonov regularization epsilon if determinant is near singular.
 */
function invert2x2(matrix: [[number, number], [number, number]]): {
  inv: [[number, number], [number, number]];
  det: number;
} {
  let m00 = matrix[0][0];
  let m01 = matrix[0][1];
  let m10 = matrix[1][0];
  let m11 = matrix[1][1];

  let det = m00 * m11 - m01 * m10;

  // Regularize if near-zero or non-positive
  if (det < 1e-7) {
    const eps = 1e-4;
    m00 += eps;
    m11 += eps;
    det = m00 * m11 - m01 * m10;
  }

  const invDet = 1.0 / det;
  return {
    det,
    inv: [
      [m11 * invDet, -m01 * invDet],
      [-m10 * invDet, m00 * invDet],
    ],
  };
}

/**
 * Computes squared Mahalanobis distance in 2D chroma space:
 * d^2 = (x - mu)^T * Sigma^-1 * (x - mu)
 */
export function mahalanobisDistanceSq(
  x: [number, number],
  mu: [number, number],
  invCov: [[number, number], [number, number]]
): number {
  const dx0 = x[0] - mu[0];
  const dx1 = x[1] - mu[1];

  // y = Sigma^-1 * dx
  const y0 = invCov[0][0] * dx0 + invCov[0][1] * dx1;
  const y1 = invCov[1][0] * dx0 + invCov[1][1] * dx1;

  // dx^T * y
  return dx0 * y0 + dx1 * y1;
}

/**
 * Mahalanobis QDA Classifier with measurement covariance coupling.
 */
export class MahalanobisClassifier {
  private confidenceThreshold: number;
  private chiSquaredThreshold: number;

  constructor(options: ClassifierOptions = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.85;
    this.chiSquaredThreshold = options.chiSquaredThreshold ?? CHI_SQUARE_99_DF2;
  }

  /**
   * Classify a measured Lab coordinate against a specific chemical reagent.
   *
   * @param lab The calibrated Lab color coordinates
   * @param measurementCovariance The empirical burst measurement covariance matrix (2x2 or 3x3)
   * @param reagent The field test reagent type
   */
  public classify(
    lab: LabValue,
    measurementCovariance: number[][],
    reagent: ReagentType
  ): ClassificationOutput {
    const profile = REAGENT_PROFILES[reagent];
    if (!profile) {
      throw new Error(`Unsupported reagent profile: ${reagent}`);
    }

    const x: [number, number] = [lab.a, lab.b];
    const meas2x2 = extractChromaCovariance(measurementCovariance);

    // Evaluate both classes (POSITIVE and NEGATIVE)
    const classKeys: ReagentClass[] = ['POSITIVE', 'NEGATIVE'];
    const logPosteriors: { className: ReagentClass; logP: number; dSq: number }[] = [];

    for (const k of classKeys) {
      const dist: ClassDistribution = profile.classes[k];

      // Effective covariance coupling: Sigma_{eff} = Sigma_{class} + Sigma_{meas}
      const sigmaEff = addCovariances(dist.covariance, meas2x2);
      const { inv, det } = invert2x2(sigmaEff);

      // Squared Mahalanobis distance
      const dSq = mahalanobisDistanceSq(x, dist.mean, inv);

      // QDA log posterior: ln(pi_k) - 0.5 * ln|Sigma| - 0.5 * dSq
      const logP = Math.log(dist.prior) - 0.5 * Math.log(det) - 0.5 * dSq;
      logPosteriors.push({ className: k, logP, dSq });
    }

    // Softmax normalization in log-space to prevent underflow
    const maxLogP = Math.max(...logPosteriors.map((p) => p.logP));
    const unnormalized = logPosteriors.map((p) => Math.exp(p.logP - maxLogP));
    const sumP = unnormalized.reduce((sum, val) => sum + val, 0);

    const scores: Record<ReagentClass, ClassScore> = {} as Record<ReagentClass, ClassScore>;
    for (let i = 0; i < logPosteriors.length; i++) {
      const item = logPosteriors[i];
      scores[item.className] = {
        className: item.className,
        mahalanobisSq: item.dSq,
        posteriorProbability: unnormalized[i] / sumP,
      };
    }

    // Find class with highest posterior probability
    const sorted = [...classKeys].sort(
      (a, b) => scores[b].posteriorProbability - scores[a].posteriorProbability
    );
    const topClass = sorted[0];
    const runnerUpClass = sorted[1];
    const topConfidence = scores[topClass].posteriorProbability;

    // Minimum squared Mahalanobis distance across all modeled classes
    const minMahalanobisSq = Math.min(...logPosteriors.map((p) => p.dSq));

    // Check geometric proximity to the reaction transition axis between class centroids
    const m1 = profile.classes.POSITIVE.mean;
    const m2 = profile.classes.NEGATIVE.mean;
    const v0 = m2[0] - m1[0];
    const v1 = m2[1] - m1[1];
    const lenSq = v0 * v0 + v1 * v1;

    let isBetweenClasses = false;
    if (lenSq > 0) {
      const dx0 = x[0] - m1[0];
      const dx1 = x[1] - m1[1];
      const t = (dx0 * v0 + dx1 * v1) / lenSq;
      if (t >= 0.05 && t <= 0.95) {
        // Orthogonal distance to reaction axis
        const perp0 = dx0 - t * v0;
        const perp1 = dx1 - t * v1;
        const perpDist = Math.sqrt(perp0 * perp0 + perp1 * perp1);
        if (perpDist <= 15.0) {
          isBetweenClasses = true;
        }
      }
    }

    // --- Dual Abstention Guard 1: Low-Margin Guard ---
    // If highest posterior probability fails confidence threshold tau (default 0.85)
    // or if the sample lies in the ambiguous transition corridor between class means
    if (topConfidence < this.confidenceThreshold || isBetweenClasses) {
      return {
        predictedClass: topClass,
        confidence: topConfidence,
        scores,
        isAbstaining: true,
        abstentionReason: 'low_margin',
        detail: `Posterior confidence ${topConfidence.toFixed(3)} fails threshold ${this.confidenceThreshold.toFixed(3)} (runner-up ${scores[runnerUpClass].posteriorProbability.toFixed(3)})`,
      };
    }

    // --- Dual Abstention Guard 2: Novelty / Out-of-Distribution Guard ---
    // If min d_k^2 > Chi^2(2, 0.99) = 9.21034, sample is inconsistent with ANY modeled class.
    if (minMahalanobisSq > this.chiSquaredThreshold) {
      return {
        predictedClass: topClass,
        confidence: topConfidence,
        scores,
        isAbstaining: true,
        abstentionReason: 'novelty_ood',
        detail: `Sample exceeds chi-squared novelty threshold (min d^2 = ${minMahalanobisSq.toFixed(2)} > ${this.chiSquaredThreshold.toFixed(2)})`,
      };
    }

    // Valid, un-abstained classification
    return {
      predictedClass: topClass,
      confidence: topConfidence,
      scores,
      isAbstaining: false,
    };
  }
}

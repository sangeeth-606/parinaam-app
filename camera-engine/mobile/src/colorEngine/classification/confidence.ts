/**
 * Confidence Estimation — §24 of the spec
 *
 * MVP SUBSTITUTE (per addendum §17):
 *   Real calibration (isotonic regression / Platt scaling, ECE, Brier score) is
 *   deferred — it requires Phase B labeled trial data which does not yet exist.
 *
 *   MVP substitute: a monotonic function derived from the ΔE00 margin between
 *   best and second-best candidate. confidence = clamp(margin / max_margin, 0, 1).
 *
 *   This is deliberately hand-chosen and explicitly labeled UNCALIBRATED:
 *   - confidence_uncalibrated: true is always set in ClassificationResult.
 *   - The schema field is preserved so real calibration can be dropped in later
 *     without changing the pipeline shape.
 *   - The abstention threshold code path is exactly as designed (§24) — only
 *     the mapping function changes when real data is available.
 *
 * DO NOT use this number as a calibrated probability — it is not one yet.
 * PHYSICAL EXPERIMENT REQUIRED: run ECE / reliability-diagram / Brier-score
 * validation on Phase-B held-out labeled data, then replace estimateConfidence()
 * with a properly calibrated function (isotonic/Platt) without touching any other
 * part of the pipeline.
 */

import type { QualityGateThresholds } from '../quality/qualityGates';

/**
 * MVP uncalibrated confidence estimator.
 *
 * Maps raw ΔE00 margin (best vs. second-best candidate distance gap) to a
 * confidence value in [0, 1] via a simple clamped linear function.
 *
 * Properties:
 *   - Monotonically increasing in margin (larger margin → higher confidence).
 *   - confidence = 0 when margin = 0 (perfectly ambiguous).
 *   - confidence = 1 when margin ≥ maxMargin (clearly unambiguous).
 *   - Always labeled confidence_uncalibrated: true in ClassificationResult.
 *
 * @param rawMargin    - ΔE00 gap between best and second-best candidate
 * @param maxMargin    - Normalizing constant (from config: confidence_uncalibrated_max_margin)
 * @returns Confidence in [0, 1] — NOT a calibrated probability for MVP.
 */
export function estimateConfidence(rawMargin: number, maxMargin: number): number {
  return Math.min(1, Math.max(0, rawMargin / maxMargin));
}

/**
 * Create a confidence estimator function bound to the current thresholds.
 * This is the form accepted by TestResultClassifier.
 *
 * When real calibration data is available:
 *   - Replace this function with one that applies an isotonic-regression lookup
 *     or Platt-scaling sigmoid fit from Phase-B labeled data.
 *   - The function signature (number → number) is unchanged — no pipeline refactor needed.
 *   - Set confidence_uncalibrated: false in ClassificationResult at that point.
 */
export function makeConfidenceEstimator(
  thresholds: QualityGateThresholds
): (rawMargin: number) => number {
  return (rawMargin: number) =>
    estimateConfidence(rawMargin, thresholds.confidence_uncalibrated_max_margin);
}

/**
 * Check if confidence meets the abstention threshold.
 * Returns true if the system should abstain (→ INCONCLUSIVE / LOW_CONFIDENCE).
 *
 * The threshold is config-driven (abstention_confidence_threshold in
 * quality_gate_thresholds.yaml) and must be set at a jointly agreed
 * technical + domain + legal risk-coverage operating point (§24 / §M point 6).
 * DOMAIN-EXPERT VALIDATION REQUIRED + LEGAL VALIDATION REQUIRED.
 */
export function shouldAbstain(confidence: number, thresholds: QualityGateThresholds): boolean {
  return confidence < thresholds.abstention_confidence_threshold;
}

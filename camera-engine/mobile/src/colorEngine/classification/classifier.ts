/**
 * Test Result Classifier — §23 of the spec
 *
 * Implements nearest-reference classification with ΔE00 distance + margin logic.
 * Exact pseudocode from §E of the spec.
 *
 * TYPE-LEVEL SAFETY: only accepts ValidColorFeatures (branded from QualityGate3)
 * and ValidatedKitProfile (branded from kitProfile.validate()).
 * Neither can be constructed after a gate failure or from a PENDING_VALIDATION
 * profile — making it STRUCTURALLY IMPOSSIBLE to reach classification in those cases.
 *
 * Classification procedure (§23):
 * 1. ΔE00 between test-patch Lab and each outcome's reference_lab.
 * 2. Best candidate: smallest ΔE00, ONLY if within tolerance_radius_de00.
 * 3. Margin check: must be meaningfully smaller than second-best.
 * 4. If neither condition met → INCONCLUSIVE.
 */

import { deltaE00 } from '../colorSpace/deltaE';
import type {
  ValidColorFeatures,
  ValidatedKitProfile,
  ClassificationResult,
  LabColor,
  FailureCode,
} from '../types';
import type { QualityGateThresholds } from '../quality/qualityGates';

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function inconclusiveResult(
  reason: FailureCode,
  distances: Record<string, number>
): ClassificationResult {
  return {
    outcome_label: null,
    confidence: null,
    confidence_uncalibrated: true,
    abstained: true,
    inconclusive_reason: reason,
    delta_e00_per_candidate: distances,
  };
}

// ─── CLASSIFIER ───────────────────────────────────────────────────────────────

/**
 * Classify a test patch against the kit profile's expected result colors.
 *
 * @param features  - ValidColorFeatures from QualityGate3 (branded type)
 * @param profile   - ValidatedKitProfile (status=VALIDATED, all reference_lab non-null)
 * @param thresholds - Loaded quality gate config (for ambiguity_margin_de00)
 * @param confidenceEstimator - Function mapping raw margin → calibrated confidence
 * @returns ClassificationResult
 */
export function classify(
  features: ValidColorFeatures,
  profile: ValidatedKitProfile,
  thresholds: QualityGateThresholds,
  confidenceEstimator: (rawMargin: number) => number
): ClassificationResult {
  const testLab: LabColor = features.normalized_color.lab;

  // Step 1: Compute ΔE00 to every expected outcome
  const distances: Record<string, number> = {};
  for (const outcome of profile.expected_result_colors) {
    // reference_lab is guaranteed non-null by ValidatedKitProfile
    distances[outcome.outcome_label] = deltaE00(testLab, outcome.reference_lab!);
  }

  // Sort outcomes by distance (ascending)
  const sorted = [...profile.expected_result_colors].sort(
    (a, b) => distances[a.outcome_label] - distances[b.outcome_label]
  );

  const best = sorted[0];
  const second = sorted[1];

  // Step 2: Best must be within its tolerance radius (§23 step 2)
  if (distances[best.outcome_label] > best.tolerance_radius_de00) {
    return inconclusiveResult('NO_CLOSE_MATCH', distances);
  }

  // Step 3: Margin check — best must be meaningfully smaller than second-best (§23 step 2)
  const margin = second
    ? distances[second.outcome_label] - distances[best.outcome_label]
    : Infinity; // Only one candidate → no ambiguity

  if (margin < thresholds.ambiguity_margin_de00) {
    return inconclusiveResult('AMBIGUOUS_COLOR', distances);
  }

  // Step 4: Confidence estimation + abstention threshold (§24)
  const confidence = confidenceEstimator(margin);
  if (confidence < (profile.validity_rules.min_confidence_to_classify ?? thresholds.abstention_confidence_threshold)) {
    return inconclusiveResult('LOW_CONFIDENCE', distances);
  }

  // Passes all checks → return classification
  return {
    outcome_label: best.outcome_label,
    confidence,
    confidence_uncalibrated: true, // always true for MVP — ECE calibration deferred
    abstained: false,
    inconclusive_reason: null,
    delta_e00_per_candidate: distances,
  };
}

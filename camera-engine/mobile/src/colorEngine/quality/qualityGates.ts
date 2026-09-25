/**
 * Quality Gate Functions — §25 of the spec
 *
 * One pure function per failure code. Each returns the FailureCode if the
 * condition is detected, or null if the check passes.
 *
 * Hard rule (§25): any failure short-circuits the pipeline. The output is
 * INCONCLUSIVE + all fired codes. The system never proceeds to emit
 * POSITIVE/NEGATIVE after any gate failure.
 *
 * All numeric thresholds come from the loaded config — never hardcoded here.
 */

import type { FailureCode, DetectorPayload, PatchSample } from '../types';

export interface QualityGateThresholds {
  aruco_min_markers_required: number;
  blur_laplacian_variance_min: number;
  exposure_clipping_fraction_max: number;
  glare_masked_fraction_max: number;
  glare_saturation_threshold: number;
  perspective_angle_max_degrees: number;
  achromatic_dynamic_range_min: number;
  patch_erosion_fraction: number;
  patch_trim_fraction: number;
  patch_mad_zscore_cutoff: number;
  calibration_fit_residual_de00_max: number;
  mixed_lighting_delta_max: number;
  ambiguity_margin_de00: number;
  abstention_confidence_threshold: number;
  confidence_uncalibrated_max_margin: number;
  normalization_method: string;
}

// ─── GATE 1: CARD DETECTION ───────────────────────────────────────────────────

/** Returns REFERENCE_CARD_NOT_FOUND if no card detected at all. */
export function checkCardNotFound(payload: DetectorPayload): FailureCode | null {
  if (!payload.found && payload.failure_code === 'REFERENCE_CARD_NOT_FOUND') {
    return 'REFERENCE_CARD_NOT_FOUND';
  }
  return null;
}

/** Returns REFERENCE_CARD_PARTIAL if fewer than minimum markers found. */
export function checkCardPartial(payload: DetectorPayload): FailureCode | null {
  if (payload.failure_code === 'REFERENCE_CARD_PARTIAL') return 'REFERENCE_CARD_PARTIAL';
  return null;
}

/** Returns REFERENCE_CARD_INVALID if card ID is unrecognized or profile expired. */
export function checkCardInvalid(
  payload: DetectorPayload,
  knownCardIds: string[],
  revalidationDate: string
): FailureCode | null {
  if (!payload.card_id) return null;
  if (!knownCardIds.includes(payload.card_id)) return 'REFERENCE_CARD_INVALID';
  const expiry = new Date(revalidationDate);
  if (new Date() > expiry) return 'REFERENCE_CARD_INVALID';
  return null;
}

// ─── GATE 1: IMAGE QUALITY ─────────────────────────────────────────────────────

/** Returns EXCESSIVE_BLUR if Laplacian variance is below threshold. */
export function checkBlur(blurScore: number, thresholds: QualityGateThresholds): FailureCode | null {
  return blurScore < thresholds.blur_laplacian_variance_min ? 'EXCESSIVE_BLUR' : null;
}

/** Returns OVEREXPOSURE / CHANNEL_CLIPPING if too many pixels are clipped. */
export function checkOverexposure(
  clippedFraction: number,
  thresholds: QualityGateThresholds
): FailureCode | null {
  return clippedFraction > thresholds.exposure_clipping_fraction_max ? 'OVEREXPOSURE' : null;
}

/**
 * Returns UNDEREXPOSURE / LOW_LIGHT if achromatic dynamic range is too compressed.
 * Dynamic range = L(white patch) - L(black patch) in linear [0,1].
 */
export function checkUnderexposure(
  achromaticDynamicRange: number,
  thresholds: QualityGateThresholds
): FailureCode | null {
  return achromaticDynamicRange < thresholds.achromatic_dynamic_range_min ? 'UNDEREXPOSURE' : null;
}

/** Returns EXCESSIVE_GLARE if any patch's masked fraction exceeds the threshold. */
export function checkGlare(
  patches: PatchSample[],
  thresholds: QualityGateThresholds
): FailureCode | null {
  const offender = patches.find(p => p.masked_fraction > thresholds.glare_masked_fraction_max);
  return offender ? 'EXCESSIVE_GLARE' : null;
}

/**
 * Returns SEVERE_PERSPECTIVE if the viewing angle implied by the homography
 * exceeds the limit. The native plugin reports a detection_confidence proxy;
 * the TypeScript layer receives it and makes the binary decision.
 * 
 * For MVP: the Kotlin plugin computes the angle from the homography and embeds
 * it in detection_confidence as a [0,1] value where 1 = perpendicular.
 * We use a threshold-scaled check: confidence < 1 - sin(max_angle_deg * pi/180).
 */
export function checkPerspective(
  homographyMatrix: number[] | null,
  detectionConfidence: number,
  thresholds: QualityGateThresholds
): FailureCode | null {
  if (!homographyMatrix) return null;
  // Rough proxy: detection_confidence encodes perspective quality
  const maxAngleRad = thresholds.perspective_angle_max_degrees * Math.PI / 180;
  const minConfidence = 1 - Math.sin(maxAngleRad);
  return detectionConfidence < minConfidence ? 'SEVERE_PERSPECTIVE' : null;
}

// ─── GATE 2: CALIBRATION FIT ─────────────────────────────────────────────────

/** Returns INSUFFICIENT_CALIBRATION_CONFIDENCE if regression residual ΔE00 is too high. */
export function checkCalibrationFit(
  fitResidualDE00: number,
  thresholds: QualityGateThresholds
): FailureCode | null {
  return fitResidualDE00 > thresholds.calibration_fit_residual_de00_max
    ? 'INSUFFICIENT_CALIBRATION_CONFIDENCE'
    : null;
}

/**
 * Returns MIXED_LIGHTING if the card region and test-patch region have materially
 * different luminance statistics (§17 / §25). Indicates card and patch are under
 * different local illumination — shared-illumination assumption is violated.
 */
export function checkMixedLighting(
  cardMeanLuminance: number,
  testPatchLuminance: number | null,
  thresholds: QualityGateThresholds
): FailureCode | null {
  if (testPatchLuminance === null) return null; // test patch not yet sampled
  const delta = Math.abs(cardMeanLuminance - testPatchLuminance);
  return delta > thresholds.mixed_lighting_delta_max ? 'MIXED_LIGHTING' : null;
}

// ─── GATE 3: TEST PATCH ───────────────────────────────────────────────────────

/** Returns TEST_PATCH_NOT_FOUND if roi_card_relative is null (not yet configured). */
export function checkTestPatchFound(roiCardRelative: unknown): FailureCode | null {
  return roiCardRelative === null || roiCardRelative === undefined
    ? 'TEST_PATCH_NOT_FOUND'
    : null;
}

/** Returns EXCESSIVE_GLARE on the test patch itself. */
export function checkTestPatchGlare(
  maskedFraction: number,
  thresholds: QualityGateThresholds
): FailureCode | null {
  return maskedFraction > thresholds.glare_masked_fraction_max ? 'EXCESSIVE_GLARE' : null;
}

// ─── KIT IDENTITY ─────────────────────────────────────────────────────────────

/** Returns UNKNOWN_KIT if no matching kit profile found OR if it is PENDING_VALIDATION. */
export function checkKitProfile(kitProfile: { status: string } | null): FailureCode | null {
  if (!kitProfile) return 'UNKNOWN_KIT';
  // A PENDING_VALIDATION profile may run normalization but NEVER classify
  // (enforced here at gate level AND at the type level via ValidatedKitProfile)
  if (kitProfile.status === 'PENDING_VALIDATION') return 'UNKNOWN_KIT';
  return null;
}

// ─── CLASSIFICATION ───────────────────────────────────────────────────────────

/** Returns NO_CLOSE_MATCH if best ΔE00 exceeds the kit's tolerance radius. */
export function checkNoCloseMatch(
  bestDE00: number,
  toleranceRadius: number
): FailureCode | null {
  return bestDE00 > toleranceRadius ? 'NO_CLOSE_MATCH' : null;
}

/** Returns AMBIGUOUS_COLOR if the margin between best and second-best is too small. */
export function checkAmbiguousColor(
  margin: number,
  thresholds: QualityGateThresholds
): FailureCode | null {
  return margin < thresholds.ambiguity_margin_de00 ? 'AMBIGUOUS_COLOR' : null;
}

/** Returns LOW_CONFIDENCE if confidence is below abstention threshold. */
export function checkLowConfidence(
  confidence: number,
  thresholds: QualityGateThresholds
): FailureCode | null {
  return confidence < thresholds.abstention_confidence_threshold ? 'LOW_CONFIDENCE' : null;
}

// ─── COMPOSITE GATE RUNNERS ────────────────────────────────────────────────────

/** Run all Gate 1 (card + image quality) checks. Returns all fired codes. */
export function runGate1(
  payload: DetectorPayload,
  thresholds: QualityGateThresholds,
  knownCardIds: string[],
  revalidationDate: string
): FailureCode[] {
  const codes: FailureCode[] = [];
  const addIfFired = (code: FailureCode | null) => { if (code) codes.push(code); };

  if (!payload.found) {
    addIfFired(payload.failure_code as FailureCode ?? 'REFERENCE_CARD_NOT_FOUND');
    return codes; // can't do image quality checks without a detected card
  }

  addIfFired(checkCardPartial(payload));
  addIfFired(checkCardInvalid(payload, knownCardIds, revalidationDate));
  addIfFired(checkBlur(payload.blur_score, thresholds));
  addIfFired(checkOverexposure(payload.exposure_stats.clipped_fraction, thresholds));
  addIfFired(checkUnderexposure(payload.exposure_stats.achromatic_dynamic_range, thresholds));
  addIfFired(checkGlare(payload.patch_samples, thresholds));
  addIfFired(checkPerspective(payload.homography_matrix, payload.detection_confidence, thresholds));

  return codes;
}

/** Run Gate 2 (calibration quality). Returns all fired codes. */
export function runGate2(
  fitResidualDE00: number,
  cardMeanLuminance: number,
  testPatchLuminance: number | null,
  thresholds: QualityGateThresholds
): FailureCode[] {
  const codes: FailureCode[] = [];
  const c1 = checkCalibrationFit(fitResidualDE00, thresholds);
  if (c1) codes.push(c1);
  const c2 = checkMixedLighting(cardMeanLuminance, testPatchLuminance, thresholds);
  if (c2) codes.push(c2);
  return codes;
}

/** Run Gate 3 (test patch). Returns all fired codes. */
export function runGate3(
  roiCardRelative: unknown,
  testPatchMaskedFraction: number,
  thresholds: QualityGateThresholds
): FailureCode[] {
  const codes: FailureCode[] = [];
  const c1 = checkTestPatchFound(roiCardRelative);
  if (c1) codes.push(c1);
  if (!c1) {
    const c2 = checkTestPatchGlare(testPatchMaskedFraction, thresholds);
    if (c2) codes.push(c2);
  }
  return codes;
}

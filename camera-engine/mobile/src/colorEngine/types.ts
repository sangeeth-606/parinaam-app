/**
 * Parinaam Color Engine — Canonical Shared Types
 * 
 * These types mirror the §C dataclasses in the spec 1:1.
 * Both the TypeScript mobile engine and (via JSON schema) the Python reference
 * implementation share these definitions — any change to either must be reflected
 * in both and must bump engine_version.
 *
 * Enforced separation (§21-22):
 *   - NormalizedColor has no outcome_label field — the normalizer cannot express a classification.
 *   - TestResultClassifier only accepts ValidColorFeatures (branded type from QualityGate3).
 *   - KitProfile with status PENDING_VALIDATION cannot be upcast to ValidatedKitProfile.
 * These constraints are enforced at the TypeScript type level, not by convention.
 */

// --- PRIMITIVE COLOR TYPES ----------------------------------------------------

export interface LabColor {
  L: number;
  a: number;
  b: number;
}

export interface LchColor {
  L: number;
  C: number;
  h: number;
}

export interface XYZColor {
  X: number;
  Y: number;
  Z: number;
}

/** Linear-light RGB in [0, 1] range. */
export interface LinearRGB {
  r: number;
  g: number;
  b: number;
}

export function makeLinearRgb(r: number, g: number, b: number): LinearRGB {
  return { r, g, b };
}

/** sRGB-encoded (gamma-compressed) RGB in [0, 255] integer range. */
export interface SRGBEncoded {
  r: number;
  g: number;
  b: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point2D {
  x: number;
  y: number;
}

// --- REFERENCE CARD PROFILE ---------------------------------------------------

export type PatchFamily = 'achromatic' | 'chromatic' | 'reagent_adjacent';

export interface DesignRectMm {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PatchDef {
  patch_id: string;        // "P01".."P16"
  family: PatchFamily;
  role: string;
  design_rect_mm: DesignRectMm;
  reference_lab: LabColor; // from spectrophotometer — MVP placeholder values
  source: string;          // audit trail — never empty
}

export interface FiducialDef {
  fiducial_id: string;
  aruco_dict: string;
  aruco_marker_id: number;
  position_mm: Point2D;    // top-left of marker in card-local mm
  size_mm: number;
}

export type CardStatus = 'PENDING_VALIDATION' | 'VALIDATED';

export interface ReferenceCardProfile {
  reference_card_id: string;
  reference_card_version: string;
  manufacturing_batch: string;
  status: CardStatus;
  calibration_profile_id: string;
  issue_date: string;
  revalidation_date: string;
  source: string;
  card_dimensions_mm: { width: number; height: number };
  patch_layout: PatchDef[];
  fiducial_layout: FiducialDef[];
}

// --- KIT PROFILE --------------------------------------------------------------

export type LocatorMethod = 'HOMOGRAPHY_OFFSET' | 'MANUAL_ROI';

export type TestType =
  | 'COLOR_STRIP'
  | 'WELL'
  | 'AMPOULE'
  | 'PRINTED_PATCH_MOCK'; // MVP extension per §MVP TEST-1

/**
 * KitStatus — central to the structural safety guarantee:
 * PENDING_VALIDATION profiles cannot produce POSITIVE/NEGATIVE (§F / §M point 6).
 */
export type KitStatus = 'PENDING_VALIDATION' | 'VALIDATED';

export interface ExpectedResultColor {
  outcome_label: string;
  reference_lab: LabColor | null; // null = PHYSICAL EXPERIMENT REQUIRED
  tolerance_radius_de00: number;
  source: string;
}

export interface TestGeometry {
  locator_method: LocatorMethod;
  roi_card_relative: DesignRectMm | null; // null = not yet set (TEST_PATCH_NOT_FOUND)
}

export interface ValidityRules {
  kit_expiry_check: boolean;
  batch_specific: boolean;
  min_confidence_to_classify: number;
}

export interface KitProfile {
  kit_profile_id: string;
  manufacturer: string;
  kit_name: string;
  model: string;
  test_name: string;
  test_type: TestType;
  kit_profile_version: number;
  effective_date: string;
  supersedes: string | null;
  status: KitStatus;
  reference_mapping: { reference_card_id: string; color_space: string };
  test_geometry: TestGeometry;
  expected_result_colors: ExpectedResultColor[];
  validity_rules: ValidityRules;
  model_version: string;
}

/**
 * ValidatedKitProfile — branded type.
 * Can only be constructed by kitProfile.validate() which checks status === 'VALIDATED'
 * AND all expected_result_colors have non-null reference_lab values.
 * TestResultClassifier only accepts this type, making it structurally impossible
 * to classify using a PENDING_VALIDATION profile.
 */
export type ValidatedKitProfile = KitProfile & { readonly _validated: unique symbol };

// --- PIPELINE INTERMEDIATE TYPES ----------------------------------------------

export interface CalibrationDiagnostics {
  method: CalibrationMethod;
  fit_residual_delta_e00: number;
  illuminant_estimate_xy: { x: number; y: number } | null;
  /** 6×3 matrix (or 3×3 / 4×3 depending on method) for audit export — flattened row-major */
  coefficients: number[];
}

/**
 * NormalizedColor — output of ColorNormalizer.
 * Deliberately has NO outcome_label field — enforces §21-22 separation.
 * The normalizer can never express a classification; type-checking enforces this.
 */
export interface NormalizedColor {
  /** CIE Lab under D50 illuminant */
  color_space: 'CIELAB_D50';
  lab: LabColor;
  xyz: XYZColor;
  raw_device_rgb_linear: LinearRGB;
  raw_device_rgb_srgb: SRGBEncoded;
  calibration_diagnostics: CalibrationDiagnostics;
}

export interface PatchQualityDiagnostics {
  masked_fraction: number;
  clipped: boolean;
  sampled_pixel_count: number;
}

/**
 * ColorFeatures — output of TestPatchAnalyzer.
 * This is the *un-gated* form. Only QualityGate3 can produce ValidColorFeatures.
 */
export interface ColorFeatures {
  normalized_color: NormalizedColor;
  delta_e00_per_candidate: Record<string, number>;
  patch_quality: PatchQualityDiagnostics;
}

/**
 * ValidColorFeatures — branded type.
 * Produced only by QualityGate3.pass(). TestResultClassifier only accepts this.
 * Structurally prevents classification after any quality-gate failure.
 */
export type ValidColorFeatures = ColorFeatures & { readonly _gated: unique symbol };

// --- QUALITY GATE -------------------------------------------------------------

export type QualityGateStatus = 'PASS' | 'FAIL';

/**
 * Full enumerated failure-code set from §25 of the spec.
 * Every code is its own testable function in qualityGates.ts.
 */
export type FailureCode =
  // Card detection
  | 'REFERENCE_CARD_NOT_FOUND'
  | 'REFERENCE_CARD_PARTIAL'
  | 'REFERENCE_CARD_TOO_SMALL'
  | 'REFERENCE_CARD_INVALID'
  // Image quality (card region)
  | 'EXCESSIVE_BLUR'
  | 'LOW_LIGHT'
  | 'OVEREXPOSURE'
  | 'UNDEREXPOSURE'
  | 'CHANNEL_CLIPPING'
  | 'EXCESSIVE_GLARE'
  | 'SEVERE_PERSPECTIVE'
  // Calibration fit
  | 'INSUFFICIENT_CALIBRATION_CONFIDENCE'
  // Illumination consistency
  | 'MIXED_LIGHTING'
  // Test patch
  | 'TEST_PATCH_NOT_FOUND'
  | 'TEST_PATCH_PARTIAL'
  // Kit identity
  | 'UNKNOWN_KIT'
  // Classification
  | 'AMBIGUOUS_COLOR'
  | 'NO_CLOSE_MATCH'
  | 'LOW_CONFIDENCE';

export interface QualityDiagnostics {
  card_detection_confidence: number;
  patches_masked_fraction: Record<string, number>;
  blur_score: number;
  exposure_histogram_summary: {
    mean_luminance: number;
    clipped_fraction: number;
    achromatic_dynamic_range: number;
  };
  mixed_lighting_delta: number;
}

// --- CLASSIFICATION -----------------------------------------------------------

export interface ClassificationResult {
  outcome_label: string | null;
  /** Confidence in [0,1]. Always null if abstained. */
  confidence: number | null;
  /**
   * true for MVP — ECE/isotonic calibration deferred per addendum.
   * Schema field preserved so real calibration can be dropped in later
   * without pipeline shape change (§addendum §17).
   */
  confidence_uncalibrated: boolean;
  abstained: boolean;
  inconclusive_reason: FailureCode | null;
  delta_e00_per_candidate: Record<string, number>;
}

// --- CALIBRATION METHOD -------------------------------------------------------

export type CalibrationMethod =
  | 'root_polynomial'
  | 'ccm_3x3'
  | 'ccm_bias'
  | 'per_channel_scale'
  | 'polynomial';

// --- DETECTOR PLUGIN PAYLOAD --------------------------------------------------

/**
 * Payload returned by the native Kotlin CardDetectorPlugin across the JSI bridge.
 * Contains all image-buffer-heavy results so the TypeScript side never touches pixels.
 */
export interface DetectorPayload {
  found: boolean;
  failure_code: FailureCode | null;
  card_id: string | null;
  card_version: string | null;
  /** 3×3 homography matrix, row-major, 9 elements. Null if found=false. */
  homography_matrix: number[] | null;
  detection_confidence: number;
  /** Per-patch robust-sampled linear RGB + diagnostics */
  patch_samples: PatchSample[];
  /** Laplacian variance of the card region (blur proxy) */
  blur_score: number;
  /** Luminance statistics for exposure checks */
  exposure_stats: ExposureStats;
  /** Mean luminance in the test-patch ROI region (for mixed-lighting check) */
  test_patch_region_luminance: number | null;
}

export interface PatchSample {
  patch_id: string;
  /** Linear RGB in [0,1] — sRGB gamma already removed by native layer */
  linear_rgb: LinearRGB;
  masked_fraction: number;
  clipped: boolean;
  sampled_pixel_count: number;
}

export interface ExposureStats {
  mean_luminance: number;
  clipped_fraction: number;
  achromatic_dynamic_range: number;
}

export interface TestPatchSample {
  linear_rgb: LinearRGB;
  masked_fraction: number;
  clipped: boolean;
  sampled_pixel_count: number;
  /** Luminance of the region immediately adjacent to the test patch, for mixed-lighting check */
  adjacent_luminance: number;
}

// --- FINAL OUTPUT -------------------------------------------------------------

/**
 * ColorAnalysisResult — §34 output schema.
 * Every field needed to (a) reproduce reasoning, (b) audit all versions,
 * (c) support the presumptive-only disclaimer is present.
 * No field can be mistaken for a confirmatory forensic identification.
 */
export interface ColorAnalysisResult {
  /** Semver — bumped on any orchestration change */
  engine_version: string;
  /** Bumped on any regression method/fitting change */
  normalization_model_version: string;
  /** Bumped on any classification/confidence logic change */
  classifier_model_version: string;
  reference_card_id: string;
  reference_card_version: string;
  reference_card_calibration_profile_id: string;
  kit_profile_id: string;
  kit_profile_version: number;
  /** Matches evidence engine image hash record */
  image_id: string;

  quality: {
    status: QualityGateStatus;
    failure_codes: FailureCode[];
    diagnostics: QualityDiagnostics;
  };

  calibration: CalibrationDiagnostics | null;

  raw_color: {
    device_rgb_linear: LinearRGB;
    device_rgb_srgb_encoded: SRGBEncoded;
  } | null;

  normalized_color: {
    color_space: 'CIELAB_D50';
    L: number;
    a: number;
    b: number;
  } | null;

  classification: ClassificationResult | null;

  diagnostics: {
    processing_time_ms: number;
    notes: string;
  };
}

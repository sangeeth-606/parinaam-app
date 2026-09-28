/**
 * The app-owned wire contract for the Dockerized camera-engine.
 *
 * This file is deliberately independent of the research TypeScript engine. The
 * native frame engine and the image-file engine have different inputs; the
 * mobile app only depends on this small, validated seam.
 */

export const CAMERA_ENGINE_SCHEMA_VERSION = 'parinaam-camera-engine-v1' as const;

export const CAMERA_ENGINE_OUTCOMES = [
  'CONSISTENT_WITH_REAGENT_POSITIVE',
  'CONSISTENT_WITH_REAGENT_NEGATIVE',
  'INCONCLUSIVE',
] as const;
export type CameraEngineOutcome = (typeof CAMERA_ENGINE_OUTCOMES)[number];

export interface CameraEngineLab {
  L: number;
  a: number;
  b: number;
}

export interface CameraEngineImageResult {
  sha256: string;
  bytes: number;
  widthPx?: number;
  heightPx?: number;
}

export interface CameraEngineProfileResult {
  kitProfileId: string;
  status: string;
  demoMode: boolean;
  classificationCapable: boolean;
  source: string;
}

export interface CameraEngineQualityResult {
  status: 'PASS' | 'FAIL';
  failureCodes: string[];
  diagnostics: Record<string, unknown>;
}

export interface CameraEngineCalibrationResult {
  method: string;
  rank: number;
  coefficients: number[][];
  fitResidualDeltaE00: number | null;
  maxFitResidualDeltaE00: number | null;
  patchCount: number;
  grade: 'GOOD' | 'DEGRADED' | string;
}

export interface CameraEngineRawColorResult {
  lab: CameraEngineLab;
  linearRgb: number[];
  sampling: Record<string, unknown>;
}

export interface CameraEngineClassificationResult {
  status: 'MATCH' | 'INCONCLUSIVE' | 'BLOCKED' | string;
  outcome: CameraEngineOutcome;
  reason: string | null;
  confidence: number;
  confidenceUncalibrated: boolean;
  bestDeltaE00: number | null;
  marginDeltaE00: number | null;
  distances: Array<{
    label: string;
    deltaE00: number | null;
    toleranceDeltaE00: number | null;
    withinTolerance: boolean;
  }>;
}

export interface CameraEngineResult {
  schemaVersion: typeof CAMERA_ENGINE_SCHEMA_VERSION;
  status: 'PASS' | 'FAIL';
  image: CameraEngineImageResult;
  profile: CameraEngineProfileResult;
  requestedReagent: string;
  quality: CameraEngineQualityResult;
  calibration: CameraEngineCalibrationResult | null;
  rawColor: CameraEngineRawColorResult | null;
  normalizedColor: { lab: CameraEngineLab; deltaE00ToCardMean: number | null } | null;
  classification: CameraEngineClassificationResult;
  diagnostics: Record<string, unknown>;
  wells?: any[];
}

/** The response shape returned by the adapter after JSON decoding. */
export interface CameraEngineWireResult {
  schema_version: string;
  status: string;
  image: Record<string, unknown>;
  profile: Record<string, unknown>;
  requested_reagent: string;
  quality: Record<string, unknown>;
  calibration: Record<string, unknown> | null;
  raw_color: Record<string, unknown> | null;
  normalized_color: Record<string, unknown> | null;
  classification: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  wells?: unknown[];
}

/** Serialize the validated in-app object back to the exact wire shape used by the service. */
export function serializeCameraEngineResult(result: CameraEngineResult): CameraEngineWireResult {
  return {
    schema_version: result.schemaVersion,
    status: result.status,
    image: {
      sha256: result.image.sha256,
      bytes: result.image.bytes,
      ...(result.image.widthPx === undefined ? {} : { width_px: result.image.widthPx }),
      ...(result.image.heightPx === undefined ? {} : { height_px: result.image.heightPx }),
    },
    profile: {
      kit_profile_id: result.profile.kitProfileId,
      status: result.profile.status,
      demo_mode: result.profile.demoMode,
      classification_capable: result.profile.classificationCapable,
      source: result.profile.source,
    },
    requested_reagent: result.requestedReagent,
    quality: {
      status: result.quality.status,
      failure_codes: result.quality.failureCodes,
      diagnostics: result.quality.diagnostics,
    },
    calibration: result.calibration
      ? {
          method: result.calibration.method,
          rank: result.calibration.rank,
          coefficients: result.calibration.coefficients,
          fit_residual_delta_e00: result.calibration.fitResidualDeltaE00,
          max_fit_residual_delta_e00: result.calibration.maxFitResidualDeltaE00,
          patch_count: result.calibration.patchCount,
          grade: result.calibration.grade,
        }
      : null,
    raw_color: result.rawColor
      ? {
          lab: result.rawColor.lab,
          linear_rgb: result.rawColor.linearRgb,
          sampling: result.rawColor.sampling,
        }
      : null,
    normalized_color: result.normalizedColor
      ? {
          lab: result.normalizedColor.lab,
          delta_e00_to_card_mean: result.normalizedColor.deltaE00ToCardMean,
        }
      : null,
    classification: {
      status: result.classification.status,
      outcome: result.classification.outcome,
      reason: result.classification.reason,
      confidence: result.classification.confidence,
      confidence_uncalibrated: result.classification.confidenceUncalibrated,
      best_delta_e00: result.classification.bestDeltaE00,
      margin_delta_e00: result.classification.marginDeltaE00,
      distances: result.classification.distances.map((distance) => ({
        label: distance.label,
        delta_e00: distance.deltaE00,
        tolerance_delta_e00: distance.toleranceDeltaE00,
        within_tolerance: distance.withinTolerance,
      })),
    },
    diagnostics: result.diagnostics,
    ...(result.wells ? { wells: result.wells } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseLab(value: unknown): CameraEngineLab | null {
  if (!isRecord(value) || !isFiniteNumber(value.L) || !isFiniteNumber(value.a) || !isFiniteNumber(value.b)) {
    return null;
  }
  return { L: value.L, a: value.a, b: value.b };
}

function parseImage(value: unknown): CameraEngineImageResult | null {
  if (!isRecord(value) || !isString(value.sha256) || !/^[a-f0-9]{64}$/.test(value.sha256) || !isFiniteNumber(value.bytes)) {
    return null;
  }
  if (value.bytes < 0 || !Number.isInteger(value.bytes)) return null;
  if (value.widthPx !== undefined && !isFiniteNumber(value.widthPx)) return null;
  if (value.heightPx !== undefined && !isFiniteNumber(value.heightPx)) return null;
  return {
    sha256: value.sha256,
    bytes: value.bytes,
    ...(isFiniteNumber(value.widthPx) ? { widthPx: value.widthPx } : {}),
    ...(isFiniteNumber(value.heightPx) ? { heightPx: value.heightPx } : {}),
  };
}

function parseProfile(value: unknown): CameraEngineProfileResult | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.kit_profile_id) ||
    !isString(value.status) ||
    typeof value.demo_mode !== 'boolean' ||
    typeof value.classification_capable !== 'boolean' ||
    !isString(value.source)
  ) {
    return null;
  }
  return {
    kitProfileId: value.kit_profile_id,
    status: value.status,
    demoMode: value.demo_mode,
    classificationCapable: value.classification_capable,
    source: value.source,
  };
}

function parseQuality(value: unknown): CameraEngineQualityResult | null {
  if (!isRecord(value) || (value.status !== 'PASS' && value.status !== 'FAIL')) return null;
  if (!isStringArray(value.failure_codes) || !isRecord(value.diagnostics)) return null;
  return { status: value.status, failureCodes: value.failure_codes, diagnostics: value.diagnostics };
}

function parseCalibration(value: unknown): CameraEngineCalibrationResult | null {
  if (value === null) return null;
  if (!isRecord(value) || !isString(value.method) || !isFiniteNumber(value.rank)) return null;
  if (!Array.isArray(value.coefficients) || !value.coefficients.every((row) => Array.isArray(row) && row.every(isFiniteNumber))) {
    return null;
  }
  if (value.fit_residual_delta_e00 !== null && !isFiniteNumber(value.fit_residual_delta_e00)) return null;
  if (value.max_fit_residual_delta_e00 !== null && !isFiniteNumber(value.max_fit_residual_delta_e00)) return null;
  if (!isFiniteNumber(value.patch_count) || !isString(value.grade)) return null;
  return {
    method: value.method,
    rank: value.rank,
    coefficients: value.coefficients,
    fitResidualDeltaE00: value.fit_residual_delta_e00,
    maxFitResidualDeltaE00: value.max_fit_residual_delta_e00,
    patchCount: value.patch_count,
    grade: value.grade,
  };
}

function parseRawColor(value: unknown): CameraEngineRawColorResult | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  const lab = parseLab(isRecord(value.lab) ? value.lab : null);
  if (!lab || !Array.isArray(value.linear_rgb) || !value.linear_rgb.every(isFiniteNumber) || !isRecord(value.sampling)) {
    return null;
  }
  return { lab, linearRgb: value.linear_rgb, sampling: value.sampling };
}

function parseNormalizedColor(value: unknown): CameraEngineResult['normalizedColor'] {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  const lab = parseLab(isRecord(value.lab) ? value.lab : null);
  if (!lab || (value.delta_e00_to_card_mean !== null && !isFiniteNumber(value.delta_e00_to_card_mean))) return null;
  return { lab, deltaE00ToCardMean: value.delta_e00_to_card_mean };
}

function parseClassification(value: unknown): CameraEngineClassificationResult | null {
  if (!isRecord(value) || !isString(value.status) || !isString(value.outcome)) return null;
  if (!CAMERA_ENGINE_OUTCOMES.includes(value.outcome as CameraEngineOutcome)) return null;
  if (!isNullableString(value.reason) || !isFiniteNumber(value.confidence) || value.confidence < 0 || value.confidence > 1) return null;
  if (typeof value.confidence_uncalibrated !== 'boolean') return null;
  if (value.best_delta_e00 !== null && !isFiniteNumber(value.best_delta_e00)) return null;
  if (value.margin_delta_e00 !== null && !isFiniteNumber(value.margin_delta_e00)) return null;
  if (!Array.isArray(value.distances)) return null;
  const distances: CameraEngineClassificationResult['distances'] = [];
  for (const distance of value.distances) {
    if (!isRecord(distance) || !isString(distance.label) || !isFiniteNumber(distance.tolerance_delta_e00) || typeof distance.within_tolerance !== 'boolean') {
      return null;
    }
    if (distance.delta_e00 !== null && !isFiniteNumber(distance.delta_e00)) return null;
    distances.push({
      label: distance.label,
      deltaE00: distance.delta_e00,
      toleranceDeltaE00: distance.tolerance_delta_e00,
      withinTolerance: distance.within_tolerance,
    });
  }
  return {
    status: value.status,
    outcome: value.outcome as CameraEngineOutcome,
    reason: value.reason,
    confidence: value.confidence,
    confidenceUncalibrated: value.confidence_uncalibrated,
    bestDeltaE00: value.best_delta_e00,
    marginDeltaE00: value.margin_delta_e00,
    distances,
  };
}

/** Parse and validate a response at the mobile seam. */
export function parseCameraEngineResult(value: unknown): CameraEngineResult {
  if (!isRecord(value)) throw new Error('Camera engine response is not an object');
  if (value.schema_version !== CAMERA_ENGINE_SCHEMA_VERSION) throw new Error('Unsupported camera engine schema');
  if (value.status !== 'PASS' && value.status !== 'FAIL') throw new Error('Invalid camera engine status');
  if (!isString(value.requested_reagent)) throw new Error('Invalid requested reagent');
  const image = parseImage(value.image);
  const profile = parseProfile(value.profile);
  const quality = parseQuality(value.quality);
  const calibration = parseCalibration(value.calibration);
  const rawColor = parseRawColor(value.raw_color);
  const normalizedColor = parseNormalizedColor(value.normalized_color);
  const classification = parseClassification(value.classification);
  if (!image || !profile || !quality || !classification || !isRecord(value.diagnostics)) {
    throw new Error('Camera engine response failed schema validation');
  }
  return {
    schemaVersion: CAMERA_ENGINE_SCHEMA_VERSION,
    status: value.status,
    image,
    profile,
    requestedReagent: value.requested_reagent,
    quality,
    calibration,
    rawColor,
    normalizedColor,
    classification,
    diagnostics: value.diagnostics,
    ...(Array.isArray(value.wells) ? { wells: value.wells } : {}),
  };
}

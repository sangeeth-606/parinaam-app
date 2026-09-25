/**
 * Capture Orchestrator
 *
 * Coordinates the full capture flow:
 *   1. AE/AWB lock (native ExposureLockModule)
 *   2. Frame processor plugin call (CardDetectorPlugin via VisionCamera)
 *   3. Hand off detector payload to ColorEngine (TypeScript)
 *   4. Release AE/AWB lock
 *
 * This is the boundary between the camera subsystem and the color engine.
 * It does NOT do any color math — that is entirely in ColorEngine.ts.
 *
 * Note: Full VisionCamera v4 Frame Processor integration requires the
 * VisionCamera dependency to be installed (npm install react-native-vision-camera).
 * The types here follow VisionCamera v4 API conventions.
 */

import { NativeModules } from 'react-native';
import { runColorEngine, type ColorEngineInput } from '../colorEngine/ColorEngine';
import type {
  ColorAnalysisResult,
  DetectorPayload,
  KitProfile,
  ReferenceCardProfile,
  LinearRGB,
  PatchSample,
} from '../colorEngine/types';
import type { QualityGateThresholds } from '../colorEngine/quality/qualityGates';

const { ExposureLockModule } = NativeModules;

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface CaptureConfig {
  cardProfile: ReferenceCardProfile;
  kitProfile: KitProfile;
  thresholds: QualityGateThresholds;
  imageId: string;
}

export interface FrameProcessorResult {
  found: boolean;
  failure_code: string | null;
  card_id: string | null;
  card_version: string | null;
  homography_matrix: number[];
  detection_confidence: number;
  patch_samples: Array<{
    patch_id: string;
    linear_rgb_r: number;
    linear_rgb_g: number;
    linear_rgb_b: number;
    masked_fraction: number;
    clipped: boolean;
    sampled_pixel_count: number;
  }>;
  blur_score: number;
  exposure_stats: {
    mean_luminance: number;
    clipped_fraction: number;
    achromatic_dynamic_range: number;
  };
  test_patch_region_luminance: number;
}

// ─── PAYLOAD ADAPTER ─────────────────────────────────────────────────────────

/**
 * Convert the raw frame processor result (Map from Kotlin) to a typed DetectorPayload.
 * Computes the achromatic dynamic range from patch samples (P01=white, P06=black).
 */
function adaptFrameProcessorResult(raw: FrameProcessorResult): DetectorPayload {
  const patchSamples: PatchSample[] = raw.patch_samples.map(p => ({
    patch_id: p.patch_id,
    linear_rgb: { r: p.linear_rgb_r, g: p.linear_rgb_g, b: p.linear_rgb_b } as LinearRGB,
    masked_fraction: p.masked_fraction,
    clipped: p.clipped,
    sampled_pixel_count: p.sampled_pixel_count,
  }));

  // Compute achromatic dynamic range from P01 (white) and P06 (black)
  const p01 = patchSamples.find(p => p.patch_id === 'P01');
  const p06 = patchSamples.find(p => p.patch_id === 'P06');
  const whiteLum = p01 ? 0.2126 * p01.linear_rgb.r + 0.7152 * p01.linear_rgb.g + 0.0722 * p01.linear_rgb.b : 0;
  const blackLum = p06 ? 0.2126 * p06.linear_rgb.r + 0.7152 * p06.linear_rgb.g + 0.0722 * p06.linear_rgb.b : 0;
  const achromaticDynamicRange = whiteLum - blackLum;

  return {
    found: raw.found,
    failure_code: raw.failure_code as any,
    card_id: raw.card_id,
    card_version: raw.card_version,
    homography_matrix: raw.homography_matrix.length > 0 ? raw.homography_matrix : null,
    detection_confidence: raw.detection_confidence,
    patch_samples: patchSamples,
    blur_score: raw.blur_score,
    exposure_stats: {
      ...raw.exposure_stats,
      achromatic_dynamic_range: achromaticDynamicRange,
    },
    test_patch_region_luminance: raw.test_patch_region_luminance >= 0
      ? raw.test_patch_region_luminance
      : null,
  };
}

// ─── MAIN CAPTURE FUNCTION ────────────────────────────────────────────────────

/**
 * Run a complete capture + analysis cycle.
 *
 * Intended to be called from the VisionCamera Frame Processor (as a worklet
 * or from a JS callback when a capture is triggered).
 *
 * @param rawDetectorResult - Raw payload from CardDetectorPlugin.kt (via JSI)
 * @param config            - Card profile, kit profile, thresholds, imageId
 * @returns ColorAnalysisResult (§34 schema)
 */
export async function runCapture(
  rawDetectorResult: FrameProcessorResult,
  config: CaptureConfig
): Promise<ColorAnalysisResult> {
  const payload = adaptFrameProcessorResult(rawDetectorResult);

  const engineInput: ColorEngineInput = {
    payload,
    cardProfile: config.cardProfile,
    kitProfile: config.kitProfile,
    thresholds: config.thresholds,
    imageId: config.imageId,
  };

  return runColorEngine(engineInput);
}

// ─── EXPOSURE LOCK HELPERS ────────────────────────────────────────────────────

/**
 * Lock Camera2 AE and AWB before capture.
 * Call immediately before triggering the shutter.
 */
export async function lockExposureAndWhiteBalance(): Promise<void> {
  if (!ExposureLockModule) {
    console.warn('[CaptureOrchestrator] ExposureLockModule not available — skipping AE/AWB lock');
    return;
  }
  return ExposureLockModule.lockExposureAndWhiteBalance();
}

/**
 * Unlock Camera2 AE and AWB after capture.
 * Always call after capture, even on error.
 */
export async function unlockExposureAndWhiteBalance(): Promise<void> {
  if (!ExposureLockModule) return;
  return ExposureLockModule.unlockExposureAndWhiteBalance();
}

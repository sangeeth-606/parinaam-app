/**
 * Parinaam — RDTScan Quality Gating System
 * Governed by spec/02-phase-1-guided-capture.md Task 1.4.
 *
 * Implements transparent, explainable image quality verification:
 * 1. Sharpness: Laplacian variance relative to baseline card template
 * 2. Exposure: Luminance histogram checking for underexposure (max L < 125) and blown highlights (L >= 250 >= 20%)
 * 3. Glare: Dichromatic reflection model in HSV (V >= 0.95, S <= 0.15)
 * 4. Framing & Geometry: 50%-70% frame occupancy, centered within 10%, skew <= 10°
 */

import type { QualityReport } from '../types/contracts.ts';

export interface CardFramingMetrics {
  cardWidth: number;
  cardHeight: number;
  frameWidth: number;
  frameHeight: number;
  cardCenterX: number;
  cardCenterY: number;
  rotationDegrees: number;
}

export interface FramingEvaluation {
  framingOk: boolean;
  occupancyFraction: number;
  centerOffsetFraction: number;
  skewDegrees: number;
  reason?: 'TOO_FAR' | 'TOO_CLOSE' | 'OFF_CENTER' | 'EXCESSIVE_SKEW';
  coachingMessage?: string;
}

export interface DetailedQualityResult {
  passed: boolean;
  report: QualityReport;
  framing: FramingEvaluation;
  primaryCoachingMessage: string | null;
}

// ---- Quality Gate Threshold Constants ----
export const SHARPNESS_VARIANCE_FLOOR = 80.0;
export const UNDEREXPOSURE_MAX_L_FLOOR = 125;
export const OVEREXPOSURE_BLOWN_FRACTION_CEIL = 0.20;
export const GLARE_SPECULAR_FRACTION_CEIL = 0.02;
export const GLARE_PATCH_CEIL = 0.05;
export const MIN_FRAME_OCCUPANCY = 0.50;
export const MAX_FRAME_OCCUPANCY = 0.70;
export const MAX_CENTER_OFFSET_FRACTION = 0.10;
export const MAX_SKEW_DEGREES = 10.0;

/**
 * Evaluates Laplacian variance of a grayscale pixel buffer.
 * High variance indicates sharp transitions (edges); low variance indicates blur.
 */
export function calculateLaplacianVariance(
  pixels: Uint8Array | number[],
  width: number,
  height: number
): number {
  if (width < 3 || height < 3 || pixels.length < width * height) {
    return 0;
  }

  // 3x3 Discrete Laplacian Kernel:
  // [  0,  1,  0 ]
  // [  1, -4,  1 ]
  // [  0,  1,  0 ]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    const nextRowOffset = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const center = pixels[rowOffset + x];
      const top = pixels[prevRowOffset + x];
      const bottom = pixels[nextRowOffset + x];
      const left = pixels[rowOffset + x - 1];
      const right = pixels[rowOffset + x + 1];

      const laplacian = top + bottom + left + right - 4 * center;
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.max(0, variance);
}

/**
 * Checks exposure quality on the luminance channel.
 * Underexposure: max L < 125 or mean L < 80.
 * Overexposure: blown pixels (L >= 250) occupy >= 20% of frame.
 */
export function evaluateExposure(luminancePixels: Uint8Array | number[]): {
  exposureOk: boolean;
  meanLuminance: number;
  maxLuminance: number;
  blownFraction: number;
  reason?: 'UNDEREXPOSED' | 'OVEREXPOSED';
} {
  const total = luminancePixels.length;
  if (total === 0) {
    return { exposureOk: false, meanLuminance: 0, maxLuminance: 0, blownFraction: 0, reason: 'UNDEREXPOSED' };
  }

  let sum = 0;
  let max = 0;
  let blownCount = 0;

  for (let i = 0; i < total; i++) {
    const l = luminancePixels[i];
    sum += l;
    if (l > max) max = l;
    if (l >= 250) blownCount++;
  }

  const mean = sum / total;
  const blownFraction = blownCount / total;

  if (max < UNDEREXPOSURE_MAX_L_FLOOR || mean < 80) {
    return {
      exposureOk: false,
      meanLuminance: mean,
      maxLuminance: max,
      blownFraction,
      reason: 'UNDEREXPOSED',
    };
  }

  if (blownFraction >= OVEREXPOSURE_BLOWN_FRACTION_CEIL) {
    return {
      exposureOk: false,
      meanLuminance: mean,
      maxLuminance: max,
      blownFraction,
      reason: 'OVEREXPOSED',
    };
  }

  return {
    exposureOk: true,
    meanLuminance: mean,
    maxLuminance: max,
    blownFraction,
  };
}

/**
 * Detects specular glare using the dichromatic reflection model in HSV space.
 * Specular highlights are high value (V >= 0.95) and low saturation (S <= 0.15).
 * RGB inputs are in [0, 255].
 */
export function evaluateGlare(
  rgbPixels: Uint8Array | number[] // Interleaved R, G, B
): {
  hasGlare: boolean;
  glareFraction: number;
} {
  const pixelCount = Math.floor(rgbPixels.length / 3);
  if (pixelCount === 0) {
    return { hasGlare: false, glareFraction: 0 };
  }

  let specularCount = 0;

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 3;
    const r = rgbPixels[idx] / 255;
    const g = rgbPixels[idx + 1] / 255;
    const b = rgbPixels[idx + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    const v = max;
    const s = max === 0 ? 0 : delta / max;

    // Specular highlight in dichromatic reflection model
    if (v >= 0.95 && s <= 0.15) {
      specularCount++;
    }
  }

  const glareFraction = specularCount / pixelCount;
  const hasGlare = glareFraction > GLARE_SPECULAR_FRACTION_CEIL;

  return { hasGlare, glareFraction };
}

/**
 * Evaluates physical card placement within the camera frame:
 * - Height occupies 50% - 70% of frame height
 * - Centered within 10% of frame center
 * - Skew angle within -10° to +10°
 */
export function evaluateFraming(metrics: CardFramingMetrics): FramingEvaluation {
  const occupancyFraction = metrics.cardHeight / metrics.frameHeight;
  const frameCenterX = metrics.frameWidth / 2;
  const frameCenterY = metrics.frameHeight / 2;

  const offsetX = Math.abs(metrics.cardCenterX - frameCenterX) / metrics.frameWidth;
  const offsetY = Math.abs(metrics.cardCenterY - frameCenterY) / metrics.frameHeight;
  const centerOffsetFraction = Math.max(offsetX, offsetY);
  const skewDegrees = Math.abs(metrics.rotationDegrees);

  if (occupancyFraction < MIN_FRAME_OCCUPANCY) {
    return {
      framingOk: false,
      occupancyFraction,
      centerOffsetFraction,
      skewDegrees,
      reason: 'TOO_FAR',
      coachingMessage: 'Move closer to fill target frame',
    };
  }

  if (occupancyFraction > MAX_FRAME_OCCUPANCY) {
    return {
      framingOk: false,
      occupancyFraction,
      centerOffsetFraction,
      skewDegrees,
      reason: 'TOO_CLOSE',
      coachingMessage: 'Move slightly back to frame calibration card',
    };
  }

  if (centerOffsetFraction > MAX_CENTER_OFFSET_FRACTION) {
    return {
      framingOk: false,
      occupancyFraction,
      centerOffsetFraction,
      skewDegrees,
      reason: 'OFF_CENTER',
      coachingMessage: 'Center the card in the viewfinder',
    };
  }

  if (skewDegrees > MAX_SKEW_DEGREES) {
    return {
      framingOk: false,
      occupancyFraction,
      centerOffsetFraction,
      skewDegrees,
      reason: 'EXCESSIVE_SKEW',
      coachingMessage: 'Align card parallel to phone camera',
    };
  }

  return {
    framingOk: true,
    occupancyFraction,
    centerOffsetFraction,
    skewDegrees,
  };
}

/**
 * Evaluates the full suite of RDTScan quality gates and produces actionable coaching guidance.
 */
export function evaluateFullQuality(params: {
  luminancePixels: Uint8Array | number[];
  rgbPixels: Uint8Array | number[];
  width: number;
  height: number;
  framingMetrics?: CardFramingMetrics;
  baselineVariance?: number;
}): DetailedQualityResult {
  const laplacianVariance = calculateLaplacianVariance(
    params.luminancePixels,
    params.width,
    params.height
  );

  const baseline = params.baselineVariance ?? 100.0;
  const relativeSharpness = laplacianVariance / baseline;
  const isBlurry = relativeSharpness < 0.80 || laplacianVariance < SHARPNESS_VARIANCE_FLOOR;

  const exposure = evaluateExposure(params.luminancePixels);
  const glare = evaluateGlare(params.rgbPixels);

  const framing = params.framingMetrics
    ? evaluateFraming(params.framingMetrics)
    : { framingOk: true, occupancyFraction: 0.60, centerOffsetFraction: 0.02, skewDegrees: 2.0 };

  const report: QualityReport = {
    isBlurry,
    laplacianVariance,
    hasGlare: glare.hasGlare,
    glareFraction: glare.glareFraction,
    exposureOk: exposure.exposureOk,
    meanLuminance: exposure.meanLuminance,
  };

  let primaryCoachingMessage: string | null = null;

  if (isBlurry) {
    primaryCoachingMessage = 'Hold steady — reducing motion blur';
  } else if (!exposure.exposureOk) {
    primaryCoachingMessage =
      exposure.reason === 'UNDEREXPOSED'
        ? 'More light required on test card'
        : 'Reduce illumination — card is overexposed';
  } else if (glare.hasGlare) {
    primaryCoachingMessage = 'Tilt card slightly to eliminate glare';
  } else if (!framing.framingOk && framing.coachingMessage) {
    primaryCoachingMessage = framing.coachingMessage;
  }

  const passed = !isBlurry && exposure.exposureOk && !glare.hasGlare && framing.framingOk;

  return {
    passed,
    report,
    framing,
    primaryCoachingMessage,
  };
}

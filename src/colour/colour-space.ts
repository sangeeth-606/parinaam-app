/**
 * Parinaam — Colour Space Conversions (sRGB, XYZ, CIELAB)
 * Governed by spec/colour-pipeline-algorithm.md Steps 5 & 6.
 * Standard Illuminant: CIE D65, Standard Observer: 2-degree.
 */

import type { LabValue } from '../types/contracts.ts';

export interface RgbColor {
  r: number; // [0, 1] linear
  g: number; // [0, 1] linear
  b: number; // [0, 1] linear
}

export interface XyzColor {
  x: number;
  y: number;
  z: number;
}

// D65 Standard Observer White Point (2°)
export const D65_WHITE_POINT: XyzColor = {
  x: 0.95047,
  y: 1.00000,
  z: 1.08883,
};

// sRGB (linear) to XYZ matrix (D65) - IEC 61966-2-1
const SRGB_TO_XYZ_MATRIX = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];

// XYZ to sRGB (linear) matrix (D65) - IEC 61966-2-1
const XYZ_TO_SRGB_MATRIX = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.9692660, 1.8760108, 0.0415560],
  [0.0556434, -0.2040259, 1.0572252],
];

const DELTA = 6 / 29;
const DELTA_CUBE = DELTA * DELTA * DELTA; // 216 / 24389 ≈ 0.008856
const THREE_DELTA_SQ = 3 * DELTA * DELTA; // 108 / 841

function fCielab(t: number): number {
  if (t > DELTA_CUBE) {
    return Math.cbrt(t);
  }
  return t / THREE_DELTA_SQ + 4 / 29;
}

function fCielabInv(t: number): number {
  if (t > DELTA) {
    return t * t * t;
  }
  return THREE_DELTA_SQ * (t - 4 / 29);
}

/**
 * Converts linear sRGB [0, 1] to CIE XYZ [0, 1].
 */
export function linearRgbToXyz(rgb: RgbColor): XyzColor {
  return {
    x: SRGB_TO_XYZ_MATRIX[0][0] * rgb.r + SRGB_TO_XYZ_MATRIX[0][1] * rgb.g + SRGB_TO_XYZ_MATRIX[0][2] * rgb.b,
    y: SRGB_TO_XYZ_MATRIX[1][0] * rgb.r + SRGB_TO_XYZ_MATRIX[1][1] * rgb.g + SRGB_TO_XYZ_MATRIX[1][2] * rgb.b,
    z: SRGB_TO_XYZ_MATRIX[2][0] * rgb.r + SRGB_TO_XYZ_MATRIX[2][1] * rgb.g + SRGB_TO_XYZ_MATRIX[2][2] * rgb.b,
  };
}

/**
 * Converts CIE XYZ to linear sRGB [0, 1].
 */
export function xyzToLinearRgb(xyz: XyzColor): RgbColor {
  return {
    r: XYZ_TO_SRGB_MATRIX[0][0] * xyz.x + XYZ_TO_SRGB_MATRIX[0][1] * xyz.y + XYZ_TO_SRGB_MATRIX[0][2] * xyz.z,
    g: XYZ_TO_SRGB_MATRIX[1][0] * xyz.x + XYZ_TO_SRGB_MATRIX[1][1] * xyz.y + XYZ_TO_SRGB_MATRIX[1][2] * xyz.z,
    b: XYZ_TO_SRGB_MATRIX[2][0] * xyz.x + XYZ_TO_SRGB_MATRIX[2][1] * xyz.y + XYZ_TO_SRGB_MATRIX[2][2] * xyz.z,
  };
}

/**
 * Converts CIE XYZ to CIELAB under D65 white point.
 */
export function xyzToLab(xyz: XyzColor, whitePoint: XyzColor = D65_WHITE_POINT): LabValue {
  const fx = fCielab(xyz.x / whitePoint.x);
  const fy = fCielab(xyz.y / whitePoint.y);
  const fz = fCielab(xyz.z / whitePoint.z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * Converts CIELAB to CIE XYZ under D65 white point.
 */
export function labToXyz(lab: LabValue, whitePoint: XyzColor = D65_WHITE_POINT): XyzColor {
  const fy = (lab.l + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;

  return {
    x: whitePoint.x * fCielabInv(fx),
    y: whitePoint.y * fCielabInv(fy),
    z: whitePoint.z * fCielabInv(fz),
  };
}

/**
 * Direct conversion from linear sRGB [0, 1] to CIELAB (D65).
 */
export function linearRgbToLab(rgb: RgbColor): LabValue {
  return xyzToLab(linearRgbToXyz(rgb));
}

/**
 * Direct conversion from CIELAB (D65) to linear sRGB [0, 1].
 */
export function labToLinearRgb(lab: LabValue): RgbColor {
  return xyzToLinearRgb(labToXyz(lab));
}

/**
 * Chroma-only distance metric (Horta-Velázquez et al. 2025):
 * ΔE_ab = sqrt((Δa*)^2 + (Δb*)^2)
 * Eliminates luminance (L*) dependency, focusing on equichromatic reaction surfaces.
 */
export function calculateChromaDistance(c1: LabValue, c2: LabValue): number {
  const da = c1.a - c2.a;
  const db = c1.b - c2.b;
  return Math.sqrt(da * da + db * db);
}

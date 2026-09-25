/**
 * CIE XYZ ↔ Lab ↔ LCh Conversions
 *
 * References:
 *   - CIE 015:2004 "Colorimetry" (3rd ed)
 *   - ISO 11664-4:2008 (CIE Lab)
 *   - sRGB → XYZ matrix: IEC 61966-2-1 Annex A (linearized sRGB → CIE XYZ D65)
 *   - D65 → D50 chromatic adaptation: Bradford transform
 *
 * White points (CIE 2° standard observer):
 *   D50: X=0.96429, Y=1.00000, Z=0.82510  (ISO 13655, used for print colorimetry)
 *   D65: X=0.95047, Y=1.00000, Z=1.08883  (sRGB native reference)
 */

import type { LabColor, LchColor, XYZColor, LinearRGB } from '../types';

// ─── WHITE POINTS (CIE 2° observer) ──────────────────────────────────────────

export const WHITE_POINT_D50: XYZColor = { X: 0.96429, Y: 1.00000, Z: 0.82510 };
export const WHITE_POINT_D65: XYZColor = { X: 0.95047, Y: 1.00000, Z: 1.08883 };

// ─── sRGB → XYZ (D65) MATRIX ─────────────────────────────────────────────────
// From IEC 61966-2-1 Annex A. Row-major: [X] = M * [R_lin, G_lin, B_lin]^T
// Applied to LINEARIZED sRGB values.
const sRGB_TO_XYZ_D65 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];

// ─── Bradford D65 → D50 chromatic adaptation matrix ──────────────────────────
// Standard matrix used in ICC color management.
const BRADFORD_D65_TO_D50 = [
  [ 1.0478112,  0.0228866, -0.0501270],
  [ 0.0295424,  0.9904844, -0.0170491],
  [-0.0092345,  0.0150436,  0.7521316],
];

/**
 * Multiply a 3×3 matrix (row-major, outer array = rows) by a 3-vector.
 */
function mat3MulVec3(m: number[][], v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/**
 * Convert linearized sRGB [0,1] to CIE XYZ under D65 illuminant.
 * Input must already be linearized (gamma removed) — use srgb.ts for that.
 */
export function linearRgbToXyzD65(rgb: LinearRGB): XYZColor {
  const [X, Y, Z] = mat3MulVec3(sRGB_TO_XYZ_D65, [rgb.r, rgb.g, rgb.b]);
  return { X, Y, Z };
}

/**
 * Apply Bradford chromatic adaptation: XYZ D65 → XYZ D50.
 * Used so calibration and classification both work in D50 Lab (print standard).
 */
export function adaptD65ToD50(xyz: XYZColor): XYZColor {
  const [X, Y, Z] = mat3MulVec3(BRADFORD_D65_TO_D50, [xyz.X, xyz.Y, xyz.Z]);
  return { X, Y, Z };
}

/**
 * Convert linearized sRGB [0,1] directly to XYZ D50.
 * This is the primary path used by the color engine.
 */
export function linearRgbToXyzD50(rgb: LinearRGB): XYZColor {
  return adaptD65ToD50(linearRgbToXyzD65(rgb));
}

// ─── CIE Lab cube-root function (f) ──────────────────────────────────────────
const LAB_EPSILON = 0.008856; // (6/29)^3
const LAB_KAPPA = 903.3;      // (29/3)^3

function labF(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

/**
 * Convert CIE XYZ to CIE L*a*b* under a given white point.
 * White point should be D50 for card calibration (print standard, ISO 11664-4).
 */
export function xyzToLab(xyz: XYZColor, wp: XYZColor = WHITE_POINT_D50): LabColor {
  const fx = labF(xyz.X / wp.X);
  const fy = labF(xyz.Y / wp.Y);
  const fz = labF(xyz.Z / wp.Z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * Convert CIE L*a*b* back to CIE XYZ under a given white point.
 */
export function labToXyz(lab: LabColor, wp: XYZColor = WHITE_POINT_D50): XYZColor {
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;

  const xr = fx > LAB_EPSILON ** (1/3) ? fx ** 3 : (116 * fx - 16) / LAB_KAPPA;
  const yr = lab.L > LAB_KAPPA * LAB_EPSILON ? ((lab.L + 16) / 116) ** 3 : lab.L / LAB_KAPPA;
  const zr = fz > LAB_EPSILON ** (1/3) ? fz ** 3 : (116 * fz - 16) / LAB_KAPPA;

  return { X: xr * wp.X, Y: yr * wp.Y, Z: zr * wp.Z };
}

/**
 * Convert CIE L*a*b* to CIE LCh (cylindrical Lab).
 * h is in degrees [0, 360).
 */
export function labToLch(lab: LabColor): LchColor {
  const C = Math.sqrt(lab.a ** 2 + lab.b ** 2);
  let h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

/**
 * Derive the illuminant chromaticity (CIE xy) from XYZ.
 * Used to characterize the scene illuminant from achromatic patches (§16).
 */
export function xyzToChromaticity(xyz: XYZColor): { x: number; y: number } {
  const sum = xyz.X + xyz.Y + xyz.Z;
  if (sum === 0) return { x: 0.3333, y: 0.3333 }; // equal-energy fallback
  return { x: xyz.X / sum, y: xyz.Y / sum };
}

/**
 * Primary convenience: linearized sRGB → CIE Lab D50.
 * This is what the calibration engine uses for patch reference values.
 */
export function linearRgbToLabD50(rgb: LinearRGB): LabColor {
  return xyzToLab(linearRgbToXyzD50(rgb));
}

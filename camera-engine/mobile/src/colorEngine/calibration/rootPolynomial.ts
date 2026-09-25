/**
 * Root-Polynomial Color Correction Regression
 *
 * Primary calibration method (working hypothesis per spec §14–16).
 * Reference: Finlayson, Mackiewicz & Hurlbert (2015). "Color Correction Using
 * Root-Polynomial Regression." IEEE TIP 24(5):1460–1470.
 *
 * Key property (why it is preferred over plain 2nd-order polynomial):
 *   Each expanded term scales LINEARLY with exposure — the root-polynomial
 *   basis preserves exposure-invariance while still correcting cross-channel
 *   hue errors that a 3×3 CCM cannot fix. This targets Parinaam's two worst
 *   real-world variables: uncontrolled exposure AND uncontrolled illuminant hue.
 *
 * 2nd-order 6-term basis (§E pseudocode from spec):
 *   expand(r,g,b) = [r, g, b, sqrt(r*g), sqrt(r*b), sqrt(g*b)]
 *
 * Fit: Phi (16×6) @ M (6×3) ˜ X (16×3)   ?  M = least-squares solve
 * Apply: expand(rgb) @ M  ?  XYZ for any pixel (including test patch)
 *
 * Implementation note: uses pure TypeScript Gaussian elimination (no native deps).
 * The matrix size (16×6, 6×3) is tiny — JS execution speed is not a constraint here
 * (per §32: "at most 16 small arrays per capture — do not move to native").
 */

import { xyzToLab, WHITE_POINT_D50 } from '../colorSpace/xyzLab';
import { deltaE00 } from '../colorSpace/deltaE';
import type { LinearRGB, XYZColor, LabColor } from '../types';

// --- LEAST-SQUARES SOLVER (QR via modified Gram-Schmidt) ---------------------

/**
 * Solve overdetermined system Ax = b via QR decomposition (modified Gram-Schmidt).
 * A: m×n  (m rows, n cols, m > n)
 * b: m×k  (k right-hand sides, one per output channel)
 * Returns x: n×k
 */
function leastSquaresQR(A: number[][], b: number[][]): number[][] {
  const m = A.length;
  const n = A[0].length;
  const k = b[0].length;

  const Q: number[][] = A.map(row => [...row]);
  const R: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  // Modified Gram-Schmidt QR
  for (let j = 0; j < n; j++) {
    let norm = 0;
    for (let i = 0; i < m; i++) norm += Q[i][j] ** 2;
    norm = Math.sqrt(norm);
    R[j][j] = norm;

    if (norm < 1e-12) continue;

    for (let i = 0; i < m; i++) Q[i][j] /= norm;

    for (let jj = j + 1; jj < n; jj++) {
      let dot = 0;
      for (let i = 0; i < m; i++) dot += Q[i][j] * Q[i][jj];
      R[j][jj] = dot;
      for (let i = 0; i < m; i++) Q[i][jj] -= dot * Q[i][j];
    }
  }

  // Compute Q^T * b directly: (n x k)
  const Qtb: number[][] = Array.from({ length: n }, () => new Array(k).fill(0));
  for (let j = 0; j < n; j++) {
    for (let c = 0; c < k; c++) {
      let sum = 0;
      for (let i = 0; i < m; i++) {
        sum += Q[i][j] * b[i][c];
      }
      Qtb[j][c] = sum;
    }
  }

  // Back substitution: R x = Q^T b
  const x: number[][] = Array.from({ length: n }, () => new Array(k).fill(0));
  for (let j = n - 1; j >= 0; j--) {
    for (let c = 0; c < k; c++) {
      let val = Qtb[j][c];
      for (let jj = j + 1; jj < n; jj++) {
        val -= R[j][jj] * x[jj][c];
      }
      x[j][c] = R[j][j] < 1e-12 ? 0 : val / R[j][j];
    }
  }
  return x;
}

// --- ROOT-POLYNOMIAL BASIS EXPANSION -----------------------------------------

/**
 * 2nd-order root-polynomial basis expansion.
 * Returns 6-element vector: [r, g, b, v(rg), v(rb), v(gb)]
 * Each term scales linearly with exposure (key property — see §14).
 */
export function expandRootPoly2(r: number, g: number, b: number): [number, number, number, number, number, number] {
  return [r, g, b, Math.sqrt(r * g), Math.sqrt(r * b), Math.sqrt(g * b)];
}

/** Convenience: expand a LinearRGB struct */
export function expandLinearRGB(rgb: LinearRGB): [number, number, number, number, number, number] {
  return expandRootPoly2(rgb.r, rgb.g, rgb.b);
}

// --- FIT ---------------------------------------------------------------------

export interface RootPolynomialModel {
  /** 6×3 coefficient matrix, row-major. Row i = coefficients for basis term i. */
  M: number[][];
  /** Mean ?E00 of the regression's own residuals on the 16 reference patches. */
  fit_residual_delta_e00: number;
  /** Estimated illuminant chromaticity from achromatic patches */
  illuminant_xy: { x: number; y: number } | null;
}

/**
 * Fit a root-polynomial model.
 *
 * @param observedLinearRgbs - Array of 16 observed linear-RGB patch samples
 * @param referenceXyzs      - Array of 16 reference XYZ values (from card profile Lab?XYZ)
 * @returns Fitted model including M (6×3), fit residual ?E00, and illuminant estimate
 */
export function fitRootPolynomial(
  observedLinearRgbs: LinearRGB[],
  referenceXyzs: XYZColor[]
): RootPolynomialModel {
  const n = observedLinearRgbs.length; // should be 16

  // Build Phi: n×6 matrix of expanded observed RGB
  const Phi: number[][] = observedLinearRgbs.map(rgb =>
    expandLinearRGB(rgb) as number[]
  );

  // Build X: n×3 matrix of reference XYZ [X, Y, Z] per patch
  const Xref: number[][] = referenceXyzs.map(xyz => [xyz.X, xyz.Y, xyz.Z]);

  // Least-squares: solve Phi @ M ˜ Xref  ? M is 6×3
  const M = leastSquaresQR(Phi, Xref);

  // Compute fit residual: apply M to Phi, compare against reference in Lab
  let totalDE00 = 0;
  for (let i = 0; i < n; i++) {
    const fittedXyz = applyModel({ M, fit_residual_delta_e00: 0, illuminant_xy: null }, observedLinearRgbs[i]);
    const fittedLab = xyzToLab(fittedXyz, WHITE_POINT_D50);
    const refLab = xyzToLab(referenceXyzs[i], WHITE_POINT_D50);
    totalDE00 += deltaE00(fittedLab, refLab);
  }
  const fit_residual_delta_e00 = totalDE00 / n;

  // Estimate illuminant from achromatic patches (first 6, indices 0-5 = P01-P06)
  // Compute mean fitted XYZ of achromatic patches and derive chromaticity
  let sumX = 0, sumY = 0, sumZ = 0;
  const achromaticCount = Math.min(6, n);
  for (let i = 0; i < achromaticCount; i++) {
    const xyz = applyModel({ M, fit_residual_delta_e00: 0, illuminant_xy: null }, observedLinearRgbs[i]);
    sumX += xyz.X; sumY += xyz.Y; sumZ += xyz.Z;
  }
  const sumTotal = sumX + sumY + sumZ;
  const illuminant_xy = sumTotal > 0
    ? { x: sumX / sumTotal, y: sumY / sumTotal }
    : null;

  return { M, fit_residual_delta_e00, illuminant_xy };
}

// --- APPLY --------------------------------------------------------------------

/**
 * Apply a fitted root-polynomial model to a new linear RGB value.
 * Returns predicted CIE XYZ under D50.
 */
export function applyModel(model: RootPolynomialModel, rgb: LinearRGB): XYZColor {
  const phi = expandLinearRGB(rgb); // 6-element
  const M = model.M;                // 6×3

  let X = 0, Y = 0, Z = 0;
  for (let i = 0; i < 6; i++) {
    X += phi[i] * M[i][0];
    Y += phi[i] * M[i][1];
    Z += phi[i] * M[i][2];
  }
  return { X, Y, Z };
}

/**
 * Apply model and convert directly to CIE Lab D50.
 */
export function applyModelToLab(model: RootPolynomialModel, rgb: LinearRGB): LabColor {
  return xyzToLab(applyModel(model, rgb), WHITE_POINT_D50);
}

/**
 * Serialize the model coefficients as a flat number array for audit export (§34 schema).
 * Row-major flattening of 6×3 M matrix: [M[0][0], M[0][1], M[0][2], M[1][0], ...]
 */
export function serializeCoefficients(model: RootPolynomialModel): number[] {
  return model.M.flatMap(row => row);
}

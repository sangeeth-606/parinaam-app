/**
 * 2nd-Order Full Polynomial Regression — Benchmark (expected to underperform)
 *
 * Method 4 from spec §14.1. Included for completeness.
 * KNOWN WEAKNESS: can non-linearly magnify errors when exposure changes between
 * calibration and test (Finlayson et al. 2015). This is the exact failure mode
 * the root-polynomial method is designed to avoid.
 *
 * 9-term basis: [r, g, b, r^2, g^2, b^2, rg, rb, gb]
 */

import { xyzToLab, WHITE_POINT_D50 } from '../colorSpace/xyzLab';
import { deltaE00 } from '../colorSpace/deltaE';
import type { LinearRGB, XYZColor, LabColor } from '../types';

function leastSquaresQRPoly(A: number[][], b: number[][]): number[][] {
  const m = A.length, n = A[0].length, k = b[0].length;
  const Q = A.map(r => [...r]);
  const R: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Qtb = b.map(r => [...r]);
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
    for (let c = 0; c < k; c++) {
      let dot = 0;
      for (let i = 0; i < m; i++) dot += Q[i][j] * Qtb[i][c];
      for (let i = 0; i < m; i++) Qtb[i][c] -= dot * Q[i][j];
    }
  }
  const x: number[][] = Array.from({ length: n }, () => new Array(k).fill(0));
  for (let j = n - 1; j >= 0; j--) {
    for (let c = 0; c < k; c++) {
      let val = Qtb[j][c];
      for (let jj = j + 1; jj < n; jj++) val -= R[j][jj] * x[jj][c];
      x[j][c] = R[j][j] < 1e-12 ? 0 : val / R[j][j];
    }
  }
  return x;
}

function expandPoly2(r: number, g: number, b: number): number[] {
  return [r, g, b, r * r, g * g, b * b, r * g, r * b, g * b];
}

export interface PolynomialModel {
  M: number[][];
  fit_residual_delta_e00: number;
}

export function fitPolynomial(observed: LinearRGB[], reference: XYZColor[]): PolynomialModel {
  const Phi = observed.map(rgb => expandPoly2(rgb.r, rgb.g, rgb.b));
  const Xref = reference.map(xyz => [xyz.X, xyz.Y, xyz.Z]);
  const M = leastSquaresQRPoly(Phi, Xref);
  let total = 0;
  for (let i = 0; i < observed.length; i++) {
    const phi = expandPoly2(observed[i].r, observed[i].g, observed[i].b);
    const fX = phi.reduce((s, v, j) => s + v * M[j][0], 0);
    const fY = phi.reduce((s, v, j) => s + v * M[j][1], 0);
    const fZ = phi.reduce((s, v, j) => s + v * M[j][2], 0);
    total += deltaE00(xyzToLab({ X: fX, Y: fY, Z: fZ }, WHITE_POINT_D50), xyzToLab(reference[i], WHITE_POINT_D50));
  }
  return { M, fit_residual_delta_e00: total / observed.length };
}

export function applyPolynomial(model: PolynomialModel, rgb: LinearRGB): XYZColor {
  const phi = expandPoly2(rgb.r, rgb.g, rgb.b);
  return {
    X: phi.reduce((s, v, j) => s + v * model.M[j][0], 0),
    Y: phi.reduce((s, v, j) => s + v * model.M[j][1], 0),
    Z: phi.reduce((s, v, j) => s + v * model.M[j][2], 0),
  };
}

export function applyPolynomialToLab(model: PolynomialModel, rgb: LinearRGB): LabColor {
  return xyzToLab(applyPolynomial(model, rgb), WHITE_POINT_D50);
}

export function serializePolynomial(model: PolynomialModel): number[] {
  return model.M.flatMap(r => r);
}

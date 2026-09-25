/**
 * 3×3 CCM + Bias (Affine) Regression — Benchmark Baseline
 *
 * Method 3 from spec §14.1. Adds a constant offset term which can correct
 * black-level/flare offsets that the pure 3×3 CCM misses.
 *
 * Model: [r, g, b, 1] (16×4) @ M (4×3) ≈ X (16×3)
 */

import { xyzToLab, WHITE_POINT_D50 } from '../colorSpace/xyzLab';
import { deltaE00 } from '../colorSpace/deltaE';
import type { LinearRGB, XYZColor, LabColor } from '../types';

function leastSquaresOLS(A: number[][], B: number[][]): number[][] {
  const n = A[0].length;
  const k = B[0].length;
  const ATA = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0))
  );
  const ATB = Array.from({ length: n }, (_, i) =>
    Array.from({ length: k }, (_, c) => A.reduce((s, r, ri) => s + r[i] * B[ri][c], 0))
  );
  const aug = ATA.map((row, i) => [...row, ...ATB[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let j = col; j < n + k; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j < n + k; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map(row => row.slice(n));
}

export interface CCMBiasModel {
  M: number[][]; // 4×3: rows [r_coeff, g_coeff, b_coeff, bias]
  fit_residual_delta_e00: number;
}

export function fitCCMBias(observed: LinearRGB[], reference: XYZColor[]): CCMBiasModel {
  const Phi = observed.map(rgb => [rgb.r, rgb.g, rgb.b, 1.0]);
  const Xref = reference.map(xyz => [xyz.X, xyz.Y, xyz.Z]);
  const M = leastSquaresOLS(Phi, Xref);

  let total = 0;
  for (let i = 0; i < observed.length; i++) {
    const phi = [observed[i].r, observed[i].g, observed[i].b, 1.0];
    const fX = phi.reduce((s, v, j) => s + v * M[j][0], 0);
    const fY = phi.reduce((s, v, j) => s + v * M[j][1], 0);
    const fZ = phi.reduce((s, v, j) => s + v * M[j][2], 0);
    total += deltaE00(xyzToLab({ X: fX, Y: fY, Z: fZ }, WHITE_POINT_D50), xyzToLab(reference[i], WHITE_POINT_D50));
  }
  return { M, fit_residual_delta_e00: total / observed.length };
}

export function applyCCMBias(model: CCMBiasModel, rgb: LinearRGB): XYZColor {
  const phi = [rgb.r, rgb.g, rgb.b, 1.0];
  return {
    X: phi.reduce((s, v, j) => s + v * model.M[j][0], 0),
    Y: phi.reduce((s, v, j) => s + v * model.M[j][1], 0),
    Z: phi.reduce((s, v, j) => s + v * model.M[j][2], 0),
  };
}

export function applyCCMBiasToLab(model: CCMBiasModel, rgb: LinearRGB): LabColor {
  return xyzToLab(applyCCMBias(model, rgb), WHITE_POINT_D50);
}

export function serializeCCMBias(model: CCMBiasModel): number[] {
  return model.M.flatMap(row => row);
}

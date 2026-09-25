/**
 * 3×3 Color Correction Matrix (CCM) Regression — Benchmark Baseline
 *
 * Method 2 from spec §14.1. Strong, simple, exposure-independent baseline.
 * Included in the §15 comparison protocol but NOT the default.
 *
 * Model: Phi (16×3) @ M (3×3) ≈ X (16×3)
 * where Phi = observed linear RGB (no expansion)
 */

import { xyzToLab, WHITE_POINT_D50 } from '../colorSpace/xyzLab';
import { deltaE00 } from '../colorSpace/deltaE';
import type { LinearRGB, XYZColor, LabColor } from '../types';

function leastSquaresSimple(A: number[][], B: number[][]): number[][] {
  // Normal equations: (A^T A) x = A^T B
  const n = A[0].length;
  const k = B[0].length;
  const m = A.length;

  // Compute A^T A (n×n)
  const ATA: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => A.reduce((s, row) => s + row[i] * row[j], 0))
  );
  // Compute A^T B (n×k)
  const ATB: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: k }, (_, c) => A.reduce((s, row, r) => s + row[i] * B[r][c], 0))
  );

  // Gaussian elimination with partial pivoting on ATA | ATB
  const aug: number[][] = ATA.map((row, i) => [...row, ...ATB[i]]);
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

export interface CCM3x3Model {
  M: number[][];
  fit_residual_delta_e00: number;
}

export function fitCCM3x3(observed: LinearRGB[], reference: XYZColor[]): CCM3x3Model {
  const Phi = observed.map(rgb => [rgb.r, rgb.g, rgb.b]);
  const Xref = reference.map(xyz => [xyz.X, xyz.Y, xyz.Z]);
  const M = leastSquaresSimple(Phi, Xref);

  let totalDE00 = 0;
  for (let i = 0; i < observed.length; i++) {
    const phi = [observed[i].r, observed[i].g, observed[i].b];
    const fX = phi.reduce((s, v, j) => s + v * M[j][0], 0);
    const fY = phi.reduce((s, v, j) => s + v * M[j][1], 0);
    const fZ = phi.reduce((s, v, j) => s + v * M[j][2], 0);
    const fLab = xyzToLab({ X: fX, Y: fY, Z: fZ }, WHITE_POINT_D50);
    const rLab = xyzToLab(reference[i], WHITE_POINT_D50);
    totalDE00 += deltaE00(fLab, rLab);
  }
  return { M, fit_residual_delta_e00: totalDE00 / observed.length };
}

export function applyCCM3x3(model: CCM3x3Model, rgb: LinearRGB): XYZColor {
  const phi = [rgb.r, rgb.g, rgb.b];
  return {
    X: phi.reduce((s, v, j) => s + v * model.M[j][0], 0),
    Y: phi.reduce((s, v, j) => s + v * model.M[j][1], 0),
    Z: phi.reduce((s, v, j) => s + v * model.M[j][2], 0),
  };
}

export function applyCCM3x3ToLab(model: CCM3x3Model, rgb: LinearRGB): LabColor {
  return xyzToLab(applyCCM3x3(model, rgb), WHITE_POINT_D50);
}

export function serializeCCM3x3(model: CCM3x3Model): number[] {
  return model.M.flatMap(row => row);
}

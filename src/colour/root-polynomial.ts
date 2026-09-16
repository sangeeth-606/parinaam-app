/**
 * Parinaam — Root-Polynomial Degree-2 Regression (RP-2)
 * Conforms to spec/colour-pipeline-algorithm.md Step 4.
 *
 * Implements Finlayson et al. (2015) exposure-invariant homogeneous degree-1 regression:
 * ϕ2(R, G, B) = [ R, G, B, sqrt(RG), sqrt(GB), sqrt(RB) ]
 */

import type { RgbColor } from './colour-space.ts';

/**
 * Expands a 3-channel RGB vector into 6-term root-polynomial degree-2 features.
 */
export function expandRootPolynomial2(rgb: RgbColor): number[] {
  const r = Math.max(0, rgb.r);
  const g = Math.max(0, rgb.g);
  const b = Math.max(0, rgb.b);

  return [
    r,
    g,
    b,
    Math.sqrt(r * g),
    Math.sqrt(g * b),
    Math.sqrt(r * b),
  ];
}

/**
 * Solves a 6x6 linear system with 3 RHS columns using Gaussian elimination.
 * A is 6x6, Y is 6x3. Returns M (6x3).
 */
function solve6x3(A: number[][], Y: number[][]): number[][] {
  const n = 6;
  const cols = 3;

  // Augmented matrix [A | Y] of size 6 x 9
  const M: number[][] = A.map((row, i) => [...row, ...Y[i]]);

  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    let maxVal = Math.abs(M[i][i]);
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > maxVal) {
        maxVal = Math.abs(M[k][i]);
        maxRow = k;
      }
    }

    if (maxVal < 1e-12) {
      // Degenerate / singular; use identity fallback
      return [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
    }

    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    // Eliminate
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k][i] / M[i][i];
      for (let j = i; j < n + cols; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  // Back-substitute
  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(M[i][n + c] / M[i][i]);
    }
    result.push(row);
  }

  return result;
}

/**
 * Fits regularized RP-2 mapping matrix M (6x3) from source RGB observations
 * to target linear ground-truth RGBs.
 *
 * M = (Φ^T Φ + λ I)^-1 Φ^T Q
 * where λ = 10^-4 * trace(Φ^T Φ) / 6
 */
export function fitRootPolynomial2(
  srcColors: RgbColor[],
  targetColors: RgbColor[]
): number[][] {
  const n = srcColors.length;
  if (n < 6 || n !== targetColors.length) {
    // Fallback: simple 3x3 identity mapped into 6x3
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
  }

  // 1. Construct feature matrix Φ (N x 6) and target matrix Q (N x 3)
  const Phi: number[][] = srcColors.map(expandRootPolynomial2);
  const Q: number[][] = targetColors.map(c => [c.r, c.g, c.b]);

  // 2. Compute A = Φ^T Φ (6 x 6) and Y = Φ^T Q (6 x 3)
  const A: number[][] = [];
  for (let r = 0; r < 6; r++) {
    A.push(new Array(6).fill(0));
  }

  const Y: number[][] = [];
  for (let r = 0; r < 6; r++) {
    Y.push(new Array(3).fill(0));
  }

  for (let i = 0; i < n; i++) {
    const phi_i = Phi[i];
    const q_i = Q[i];

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        A[r][c] += phi_i[r] * phi_i[c];
      }
      for (let c = 0; c < 3; c++) {
        Y[r][c] += phi_i[r] * q_i[c];
      }
    }
  }

  // 3. Tikhonov regularization: λ = 10^-4 * trace(A) / 6
  let trace = 0;
  for (let i = 0; i < 6; i++) {
    trace += A[i][i];
  }
  const lambda = (1e-4 * trace) / 6;
  for (let i = 0; i < 6; i++) {
    A[i][i] += lambda;
  }

  // 4. Solve A M = Y
  return solve6x3(A, Y);
}

/**
 * Applies fitted 6x3 RP-2 matrix to predict calibrated linear sRGB.
 */
export function applyRootPolynomial2(M: number[][], rgb: RgbColor): RgbColor {
  const phi = expandRootPolynomial2(rgb);

  let r = 0;
  let g = 0;
  let b = 0;

  for (let i = 0; i < 6; i++) {
    r += phi[i] * M[i][0];
    g += phi[i] * M[i][1];
    b += phi[i] * M[i][2];
  }

  return {
    r: Math.max(0, r),
    g: Math.max(0, g),
    b: Math.max(0, b),
  };
}

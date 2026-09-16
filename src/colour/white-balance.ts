/**
 * Parinaam — White-Patch von Kries & Bradford Chromatic Adaptation
 * Conforms to spec/colour-pipeline-algorithm.md Step 3.
 */

import type { RgbColor } from './colour-space.ts';

// Bradford Cone Response Matrix (M_BFD)
const M_BFD = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];

// Inverse Bradford Matrix (M_BFD^-1)
const M_BFD_INV = [
  [0.9869929, -0.1470543, 0.1599627],
  [0.4323053, 0.5183603, 0.0492912],
  [-0.0085287, 0.0400428, 0.9684867],
];

function matVecMul3(M: number[][], v: [number, number, number]): [number, number, number] {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}

/**
 * Computes the 3x3 chromatic adaptation matrix mapping measured white patch
 * to target reference white patch using the Bradford transform.
 */
export function computeBradfordAdaptationMatrix(
  measuredWhite: RgbColor,
  targetWhite: RgbColor = { r: 1.0, g: 1.0, b: 1.0 }
): number[][] {
  const mCone = matVecMul3(M_BFD, [
    Math.max(1e-4, measuredWhite.r),
    Math.max(1e-4, measuredWhite.g),
    Math.max(1e-4, measuredWhite.b),
  ]);

  const tCone = matVecMul3(M_BFD, [
    Math.max(1e-4, targetWhite.r),
    Math.max(1e-4, targetWhite.g),
    Math.max(1e-4, targetWhite.b),
  ]);

  // Diagonal cone scaling
  const d0 = tCone[0] / mCone[0];
  const d1 = tCone[1] / mCone[1];
  const d2 = tCone[2] / mCone[2];

  // Combined matrix: M_BFD_INV * D * M_BFD
  const DM: number[][] = [
    [d0 * M_BFD[0][0], d0 * M_BFD[0][1], d0 * M_BFD[0][2]],
    [d1 * M_BFD[1][0], d1 * M_BFD[1][1], d1 * M_BFD[1][2]],
    [d2 * M_BFD[2][0], d2 * M_BFD[2][1], d2 * M_BFD[2][2]],
  ];

  const result: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      result[r][c] =
        M_BFD_INV[r][0] * DM[0][c] +
        M_BFD_INV[r][1] * DM[1][c] +
        M_BFD_INV[r][2] * DM[2][c];
    }
  }

  return result;
}

/**
 * Applies 3x3 chromatic adaptation matrix to a linear RGB color.
 */
export function applyChromaticAdaptation(matrix: number[][], rgb: RgbColor): RgbColor {
  const adapted = matVecMul3(matrix, [rgb.r, rgb.g, rgb.b]);
  return {
    r: Math.max(0, adapted[0]),
    g: Math.max(0, adapted[1]),
    b: Math.max(0, adapted[2]),
  };
}

/**
 * Parinaam — Burst Acquisition Manager & Measurement Covariance Engine
 * Conforms to spec/02-phase-1-guided-capture.md Task 1.5.
 *
 * Collects 5–10 quality-gated frames in a rapid burst and calculates
 * the empirical measurement noise covariance matrix Σ_meas for QDA classification.
 */

import type { CaptureFrame, QualityReport } from '../types/contracts.ts';

export interface OpticalParameters {
  iso: number;
  exposureDurationSec: number;
  whiteBalanceKelvin: number;
}

export interface BurstFrameEntry {
  frame: CaptureFrame;
  opticalParams?: OpticalParameters;
  colorObservation?: number[]; // [L, a, b] or [a, b]
}

export interface BurstAcquisitionResult {
  frames: CaptureFrame[];
  /** v2-F seam: file URI of the representative photo. Real VisionCamera builds fill
   *  this via takePhoto; the simulator leaves it undefined → record carries a NULL
   *  image_ref (honest absence — no gallery path exists either, rule 1). */
  photoPath?: string;
  aggregateReport: QualityReport;
  measurementCovariance: number[][]; // d x d matrix
  meanObservation: number[];
  opticalStabilityVerified: boolean;
}

/**
 * Calculates sample covariance matrix from N multi-dimensional observations:
 * Σ = 1/(N - 1) * sum((x_i - mean)(x_i - mean)^T)
 */
export function calculateCovarianceMatrix(observations: number[][]): number[][] {
  const n = observations.length;
  if (n === 0) return [];
  const dim = observations[0].length;
  if (n < 2) {
    // Single observation: default floor variance on diagonal
    const floorDiag: number[][] = [];
    for (let i = 0; i < dim; i++) {
      const row = new Array(dim).fill(0);
      row[i] = 1.0;
      floorDiag.push(row);
    }
    return floorDiag;
  }

  // 1. Calculate sample mean
  const mean = new Array(dim).fill(0);
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < dim; d++) {
      mean[d] += observations[i][d];
    }
  }
  for (let d = 0; d < dim; d++) {
    mean[d] /= n;
  }

  // 2. Accumulate outer products of deviations
  const cov: number[][] = [];
  for (let r = 0; r < dim; r++) {
    cov.push(new Array(dim).fill(0));
  }

  for (let i = 0; i < n; i++) {
    const diff = observations[i].map((val, d) => val - mean[d]);
    for (let r = 0; r < dim; r++) {
      for (let c = 0; c < dim; c++) {
        cov[r][c] += diff[r] * diff[c];
      }
    }
  }

  // 3. Divide by (n - 1)
  const denom = n - 1;
  for (let r = 0; r < dim; r++) {
    for (let c = 0; c < dim; c++) {
      cov[r][c] /= denom;
      // Add a tiny regularization floor to prevent singular covariance
      if (r === c && cov[r][c] < 1e-4) {
        cov[r][c] = 1e-4;
      }
    }
  }

  return cov;
}

export class BurstManager {
  private readonly targetCount: number;
  private readonly buffer: BurstFrameEntry[] = [];

  constructor(targetCount: number = 8) {
    this.targetCount = Math.max(5, Math.min(10, targetCount));
  }

  addFrame(entry: BurstFrameEntry): boolean {
    if (this.buffer.length >= this.targetCount) {
      return true;
    }

    // Only add if frame passed quality gates
    if (entry.frame.quality.isBlurry || !entry.frame.quality.exposureOk || entry.frame.quality.hasGlare) {
      return false;
    }

    this.buffer.push(entry);
    return this.buffer.length >= this.targetCount;
  }

  isComplete(): boolean {
    return this.buffer.length >= this.targetCount;
  }

  getFrameCount(): number {
    return this.buffer.length;
  }

  reset(): void {
    this.buffer.length = 0;
  }

  finalize(): BurstAcquisitionResult {
    if (this.buffer.length === 0) {
      throw new Error('Cannot finalize empty burst');
    }

    const frames = this.buffer.map(b => b.frame);

    // Aggregate quality metrics across burst
    let sumLaplacian = 0;
    let sumGlare = 0;
    let sumLuminance = 0;

    for (const f of frames) {
      sumLaplacian += f.quality.laplacianVariance;
      sumGlare += f.quality.glareFraction;
      sumLuminance += f.quality.meanLuminance;
    }

    const count = frames.length;
    const aggregateReport: QualityReport = {
      isBlurry: false,
      laplacianVariance: sumLaplacian / count,
      hasGlare: false,
      glareFraction: sumGlare / count,
      exposureOk: true,
      meanLuminance: sumLuminance / count,
    };

    // Calculate measurement covariance from color observations
    const observations = this.buffer
      .map(b => b.colorObservation)
      .filter((obs): obs is number[] => obs !== undefined && obs.length > 0);

    const cov = observations.length > 0
      ? calculateCovarianceMatrix(observations)
      : [[1.0, 0], [0, 1.0]];

    const dim = observations.length > 0 ? observations[0].length : 2;
    const meanObservation = new Array(dim).fill(0);
    if (observations.length > 0) {
      for (const obs of observations) {
        for (let d = 0; d < dim; d++) {
          meanObservation[d] += obs[d];
        }
      }
      for (let d = 0; d < dim; d++) {
        meanObservation[d] /= observations.length;
      }
    }

    // Verify optical stability across burst (ISO, shutter, white balance)
    let opticalStabilityVerified = true;
    if (this.buffer.length > 1 && this.buffer[0].opticalParams) {
      const first = this.buffer[0].opticalParams;
      for (let i = 1; i < this.buffer.length; i++) {
        const current = this.buffer[i].opticalParams;
        if (current) {
          if (
            current.iso !== first.iso ||
            current.exposureDurationSec !== first.exposureDurationSec ||
            current.whiteBalanceKelvin !== first.whiteBalanceKelvin
          ) {
            opticalStabilityVerified = false;
            break;
          }
        }
      }
    }

    return {
      frames,
      aggregateReport,
      measurementCovariance: cov,
      meanObservation,
      opticalStabilityVerified,
    };
  }
}

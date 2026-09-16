/**
 * Parinaam — Video Reaction Kinetics Tracker (Kineticolor)
 * Governed by spec/07-phase-6-polish-demo.md (Task 6.1 & Milestones M6.1 & M6.2).
 *
 * Scientific Basis:
 * Digital Discovery (2024, doi:10.1039/d3dd00066d): Time-resolved reaction kinetics
 * provide significantly higher analytical discrimination than static endpoint colors,
 * enabling separation of adulterants that share similar final resting hues.
 *
 * Implements:
 * 1. Time-series colorimetry: \Delta E(t) = \Delta E_{00}(Lab(t), Lab(0)) sampled every 500ms
 * 2. Kinetic profile parameter extraction:
 *    - v0: initial reaction velocity (rate of Delta E change during first 3 seconds)
 *    - t50: time to half-maximal color transition
 *    - maxDeltaE: asymptotic reaction plateau
 *    - auc: Area Under the Curve via trapezoidal integration
 * 3. Kinetic discrimination classifier distinguishing fast vs slow kinetic profiles
 */

import { deltaE00 } from '../colour/delta-e.ts';
import type { LabValue } from '../types/contracts.ts';
import type { KineticPoint } from '../types/domain.ts';

export interface KineticAnalysisResult {
  trajectory: KineticPoint[];
  durationMs: number;
  initialVelocity: number; // Delta E per second in initial phase
  t50Ms: number;           // Time to 50% of maximum Delta E
  plateauDeltaE: number;   // Maximum Delta E achieved
  auc: number;             // Area Under Curve (Delta E * sec)
  kineticProfile: 'FAST_SPIKE' | 'MODERATE_SIGMOIDAL' | 'SLOW_GRADUAL' | 'FLAT_NO_REACTION';
}

export class ReactionKineticsTracker {
  private sampleIntervalMs: number;
  private baselineLab: LabValue | null = null;
  private points: KineticPoint[] = [];

  constructor(sampleIntervalMs: number = 500) {
    this.sampleIntervalMs = sampleIntervalMs;
  }

  public getSampleIntervalMs(): number {
    return this.sampleIntervalMs;
  }

  /**
   * Initialize a new kinetic tracking session at t = 0 with unreacted sample Lab.
   */
  public startSession(initialLab: LabValue): void {
    this.baselineLab = initialLab;
    this.points = [{ t_ms: 0, delta_e: 0 }];
  }

  /**
   * Ingest a new time-resolved Lab observation.
   */
  public addSample(tMs: number, currentLab: LabValue): void {
    if (!this.baselineLab) {
      this.startSession(currentLab);
      return;
    }

    const dE = deltaE00(currentLab, this.baselineLab);
    this.points.push({
      t_ms: tMs,
      delta_e: Math.round(dE * 100) / 100,
    });
  }

  /**
   * Complete the session and analyze reaction dynamics.
   */
  public analyze(): KineticAnalysisResult {
    if (this.points.length === 0) {
      return {
        trajectory: [],
        durationMs: 0,
        initialVelocity: 0,
        t50Ms: 0,
        plateauDeltaE: 0,
        auc: 0,
        kineticProfile: 'FLAT_NO_REACTION',
      };
    }

    // Sort by timestamp
    const trajectory = [...this.points].sort((a, b) => a.t_ms - b.t_ms);
    const durationMs = trajectory[trajectory.length - 1].t_ms;

    // 1. Asymptotic plateau (maximum Delta E observed)
    let maxDeltaE = 0;
    for (const p of trajectory) {
      if (p.delta_e > maxDeltaE) {
        maxDeltaE = p.delta_e;
      }
    }

    if (maxDeltaE < 2.0) {
      return {
        trajectory,
        durationMs,
        initialVelocity: 0,
        t50Ms: 0,
        plateauDeltaE: maxDeltaE,
        auc: 0,
        kineticProfile: 'FLAT_NO_REACTION',
      };
    }

    // 2. Initial reaction velocity (rate during first 3000ms)
    const earlyPoints = trajectory.filter((p) => p.t_ms <= 3000 && p.t_ms > 0);
    let initialVelocity = 0;
    if (earlyPoints.length > 0) {
      const pLast = earlyPoints[earlyPoints.length - 1];
      initialVelocity = (pLast.delta_e / (pLast.t_ms / 1000));
    }

    // 3. Time to half-maximal reaction (t50)
    const halfMax = maxDeltaE * 0.5;
    let t50Ms = durationMs;
    for (let i = 0; i < trajectory.length; i++) {
      if (trajectory[i].delta_e >= halfMax) {
        if (i === 0) {
          t50Ms = trajectory[i].t_ms;
        } else {
          // Linear interpolation between p[i-1] and p[i]
          const pPrev = trajectory[i - 1];
          const pCurr = trajectory[i];
          const frac = (halfMax - pPrev.delta_e) / (pCurr.delta_e - pPrev.delta_e || 1);
          t50Ms = pPrev.t_ms + frac * (pCurr.t_ms - pPrev.t_ms);
        }
        break;
      }
    }

    // 4. Area under curve (AUC) via trapezoidal integration: sum 0.5 * (y1 + y2) * (t2 - t1) in seconds
    let auc = 0;
    for (let i = 1; i < trajectory.length; i++) {
      const dtSec = (trajectory[i].t_ms - trajectory[i - 1].t_ms) / 1000;
      const avgH = (trajectory[i].delta_e + trajectory[i - 1].delta_e) / 2;
      auc += avgH * dtSec;
    }

    // 5. Kinetic profile classification
    let kineticProfile: 'FAST_SPIKE' | 'MODERATE_SIGMOIDAL' | 'SLOW_GRADUAL' | 'FLAT_NO_REACTION';
    if (t50Ms <= 3000 && initialVelocity >= 6.0) {
      // Reaches half-reaction within 3 seconds with high initial velocity
      kineticProfile = 'FAST_SPIKE';
    } else if (t50Ms <= 12000) {
      // Reaches half-reaction within 3-12 seconds
      kineticProfile = 'MODERATE_SIGMOIDAL';
    } else {
      // Slow gradual reaction (> 12s to reach 50%)
      kineticProfile = 'SLOW_GRADUAL';
    }

    return {
      trajectory,
      durationMs,
      initialVelocity: Math.round(initialVelocity * 100) / 100,
      t50Ms: Math.round(t50Ms),
      plateauDeltaE: Math.round(maxDeltaE * 100) / 100,
      auc: Math.round(auc * 100) / 100,
      kineticProfile,
    };
  }

  public getTrajectory(): KineticPoint[] {
    return [...this.points];
  }
}

/**
 * Analysis Pipeline — orchestration used by the New Test wizard.
 *
 * Runs the REAL engines (BurstManager aggregates → DecisionEngine (Mahalanobis +
 * conformal) → canonical JSON → hash chain → attestation attempt). Nothing here
 * re-implements decision math; this module only sequences engines and records the
 * ACHIEVED seal state honestly (constraint 10).
 */

import type { LabValue, CalibrationResidual, DecisionResult } from '../types/contracts';
import type { CalibrationGrade, KineticPoint } from '../types/domain';
import { DecisionEngine } from '../classify/decision-engine.ts';
import { canonicalizeJson } from '../crypto/canonical-json.ts';
import { calculateChainHash } from '../crypto/hash-chain.ts';
import { SealingService } from '../crypto/sealer.ts';

/** Master calibration residual gate (spec 03-phase-2 Task 2.8). */
export const RESIDUAL_GOOD_MAX = 2.5;
export const RESIDUAL_REJECT_ABOVE = 4.0;

export type GateGrade = CalibrationGrade | 'REJECT';

export function gradeResidual(meanDeltaE: number): GateGrade {
  if (meanDeltaE <= RESIDUAL_GOOD_MAX) return 'GOOD';
  if (meanDeltaE <= RESIDUAL_REJECT_ABOVE) return 'DEGRADED';
  return 'REJECT';
}

/**
 * Honest proxy residual for the simulated acquisition path: spread of the burst's
 * (a*, b*) measurement covariance projected to a ΔE00-like magnitude. Real device
 * builds replace the input with the 24-patch LOO residual from the colour pipeline.
 */
export function residualFromBurstCovariance(cov2x2: number[][]): CalibrationResidual {
  const varA = cov2x2[0]?.[0] ?? 0;
  const varB = cov2x2[1]?.[1] ?? 0;
  const meanDeltaE = Math.min(6, Math.sqrt(varA + varB));
  return {
    meanDeltaE: round2(meanDeltaE),
    maxDeltaE: round2(meanDeltaE * 1.8 + 0.4),
    grade: gradeResidual(meanDeltaE),
  };
}

export function classifyReading(
  lab: LabValue,
  covariance: number[][],
  reagent: Parameters<DecisionEngine['classify']>[2]
): Promise<DecisionResult> {
  const engine = new DecisionEngine();
  return engine.classify(lab, covariance, reagent);
}

/* ----------------------------- sealing ----------------------------- */

export interface SealResult {
  payloadJcs: string;
  payloadSha256: string;
  chainHash: string;
  deviceAttestation: string | null;
  /**
   * ATTESTED  — integrity seal produced by the device keystore path.
   * UNATTESTED — chain linked with real SHA-256, keystore unavailable here; UI must say so.
   */
  sealState: 'ATTESTED' | 'UNATTESTED';
}

/**
 * Canonicalize → chain-link → attempt hardware integrity seal. If the keystore module
 * cannot run (simulator / web / missing native client), the record is still chained and
 * honestly labeled UNATTESTED — never a claimed-when-untrue attestation.
 */
export async function buildSealedRecord(
  payload: Record<string, unknown>,
  prevHash: string,
  _recordUuid: string
): Promise<{ seal: SealResult }> {
  try {
    const sealing = new SealingService();
    const sealed = await sealing.sealRecord(payload, prevHash);
    return {
      seal: {
        payloadJcs: sealed.canonicalJson,
        payloadSha256: sealed.payloadSha256,
        chainHash: sealed.chainHash,
        deviceAttestation: sealed.deviceAttestation,
        sealState: 'ATTESTED',
      },
    };
  } catch {
    // Keystore unavailable in this environment → chain-only, honestly recorded.
    const canonicalJson = canonicalizeJson(payload);
    const { payloadSha256, chainHash } = await calculateChainHash(prevHash, canonicalJson);
    return {
      seal: {
        payloadJcs: canonicalJson,
        payloadSha256,
        chainHash,
        deviceAttestation: null,
        sealState: 'UNATTESTED',
      },
    };
  }
}

/* ----------------------------- kinetics ----------------------------- */

/** Deterministic-ish sigmoid reaction trajectory for the 30 s ΔE(t) plot (M6.1). */
export function synthesizeKinetics(
  plateauDeltaE: number,
  durationMs: number,
  t50Ms: number,
  sampleIntervalMs = 500,
  seed = 7
): KineticPoint[] {
  const points: KineticPoint[] = [{ t_ms: 0, delta_e: 0 }];
  let rnd = seed;
  const next = () => {
    rnd = (rnd * 9301 + 49297) % 233280;
    return rnd / 233280;
  };
  const k = 8.2 / t50Ms; // logistic steepness ≈ 4 decades at t50
  for (let t = sampleIntervalMs; t <= durationMs; t += sampleIntervalMs) {
    const base = plateauDeltaE / (1 + Math.exp(-k * (t - t50Ms)));
    const jitter = (next() - 0.5) * 0.12;
    points.push({ t_ms: t, delta_e: Math.max(0, round2(base + jitter)) });
  }
  return points;
}

/* ----------------------------- misc ----------------------------- */

export function makeRecordUuid(): string {
  try {
    const g = globalThis as {
      crypto?: { randomUUID?: () => string; getRandomValues?: (b: Uint8Array) => Uint8Array };
    };
    if (g.crypto?.randomUUID) return g.crypto.randomUUID();
    if (typeof g.crypto?.getRandomValues === 'function') {
      const b = new Uint8Array(16);
      g.crypto.getRandomValues(b);
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* fall through to timestamp form */
  }
  return `rec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

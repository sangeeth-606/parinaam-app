/**
 * Analysis Pipeline — orchestration used by the New Test wizard.
 *
 * Legacy sealing helpers retained for compatibility. The production wizard does
 * not use a burst/QDA/kinetics path: CameraView sends one real photo to the
 * self-hosted camera-engine, and ResultsScreen persists its explicit result.
 * The legacy measurement helpers below fail closed rather than manufacturing
 * observations.
 */

import type { LabValue, CalibrationResidual, DecisionResult } from '../types/contracts';
import type { CalibrationGrade, KineticPoint } from '../types/domain';
import type { DecisionEngine } from '../classify/decision-engine.ts';
import { canonicalizeJson } from '../crypto/canonical-json.ts';
import { calculateChainHash } from '../crypto/hash-chain.ts';
import { SealingService } from '../crypto/sealer.ts';

/** Legacy grade helper; the canonical camera-engine gate is 5.0 ΔE00. */
export const RESIDUAL_GOOD_MAX = 2.5;
export const RESIDUAL_REJECT_ABOVE = 5.0;

export type GateGrade = CalibrationGrade | 'REJECT';

export function gradeResidual(meanDeltaE: number): GateGrade {
  if (meanDeltaE <= RESIDUAL_GOOD_MAX) return 'GOOD';
  if (meanDeltaE <= RESIDUAL_REJECT_ABOVE) return 'DEGRADED';
  return 'REJECT';
}

/** Legacy compatibility hook; production records must carry engine residuals. */
export function residualFromBurstCovariance(_cov2x2: number[][]): CalibrationResidual {
  throw new Error('Burst covariance residuals are disabled; use camera-engine calibration.');
}

export function classifyReading(
  _lab: LabValue,
  _covariance: number[][],
  _reagent: Parameters<DecisionEngine['classify']>[2]
): Promise<DecisionResult> {
  return Promise.reject(new Error('Legacy QDA classification is disabled; use the camera-engine adapter.'));
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

/** Legacy compatibility hook; a single still photo has no kinetic series. */
export function synthesizeKinetics(
  _plateauDeltaE: number,
  _durationMs: number,
  _t50Ms: number,
  _sampleIntervalMs = 500,
  _seed = 7
): KineticPoint[] {
  throw new Error('Synthetic kinetics are disabled; capture a real time series explicitly.');
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

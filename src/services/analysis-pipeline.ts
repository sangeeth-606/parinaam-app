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
const defaultSealingService = new SealingService();

export async function buildSealedRecord(
  payload: Record<string, unknown>,
  prevHash: string,
  _recordUuid: string,
  service: SealingService = defaultSealingService
): Promise<{ seal: SealResult }> {
  try {
    const sealed = await service.sealRecord(payload, prevHash);
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
  const g = globalThis as {
    crypto?: { randomUUID?: () => string; getRandomValues?: (b: Uint8Array) => Uint8Array };
  };
  if (typeof g.crypto?.randomUUID === 'function') {
    const u = g.crypto.randomUUID();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u)) {
      return u.toLowerCase();
    }
  }

  let bytes: Uint8Array | null = null;
  if (typeof g.crypto?.getRandomValues === 'function') {
    bytes = new Uint8Array(16);
    g.crypto.getRandomValues(bytes);
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeCrypto = require('node:crypto') as { randomBytes?: (size: number) => Buffer };
      if (typeof nodeCrypto.randomBytes === 'function') {
        bytes = new Uint8Array(nodeCrypto.randomBytes(16));
      }
    } catch {
      bytes = null;
    }
  }

  if (!bytes) {
    throw new Error('Secure randomness is unavailable; cannot generate record UUID.');
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`.toLowerCase();
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

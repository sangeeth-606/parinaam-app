/**
 * Parinaam — 7 Frozen Core Module Contracts
 * As defined in spec/00-overview.md.
 */

import { PresumptiveOutcome, ReagentType } from './domain.ts';

export interface QualityReport {
  isBlurry: boolean;
  laplacianVariance: number;
  hasGlare: boolean;
  glareFraction: number;
  exposureOk: boolean;
  meanLuminance: number;
}

export interface CaptureFrame {
  uri: string;
  width: number;
  height: number;
  timestamp: number;
  quality: QualityReport;
}

export interface HomographyMatrix {
  data: number[]; // 3x3 matrix values (row-major)
  reprojectionError: number;
}

export interface CardIdentity {
  version: string;
  batchNumber: string;
  referenceHash: string;
}

export interface LabValue {
  l: number;
  a: number;
  b: number;
}

export interface CalibrationResidual {
  meanDeltaE: number;
  maxDeltaE: number;
  grade: 'GOOD' | 'DEGRADED' | 'REJECT';
}

export interface DecisionResult {
  outcome: PresumptiveOutcome;
  confidence: number;
  conformalSet: string[];
  abstentionReason?: 'low_margin' | 'novelty_ood' | 'calibration_failed';
}

export interface SealedRecordPayload {
  canonicalJson: string;
  payloadSha256: string;
  chainHash: string;
  deviceAttestation: string;
}

export interface CertifiedBundle {
  partAPdfUri: string;
  partBPdfUri: string;
  ndpsForm4Uri: string;
  ndpsForm5Uri: string;
  ndpsForm6Uri: string;
  manifestUri: string;
  verifierScriptUri: string;
}

// ---- The 7 Core Module Signatures ----

export interface CaptureModule {
  startSession(config: { lockedAe: boolean; lockedAwb: boolean; lockedAf: boolean }): Promise<void>;
  captureBurst(count: number): Promise<{ frames: CaptureFrame[]; report: QualityReport }>;
  stopSession(): Promise<void>;
}

export interface CardDetectModule {
  detectCard(frame: CaptureFrame): Promise<
    | { success: true; homography: HomographyMatrix; card: CardIdentity; warpedImageUri: string }
    | { success: false; reason: string; coachingMessage: string }
  >;
}

export interface ColourModule {
  calibrateAndExtract(
    warpedImageUri: string,
    homography: HomographyMatrix,
    cardRef: CardIdentity
  ): Promise<{ reagentLab: LabValue; residual: CalibrationResidual }>;
}

export interface DecisionModule {
  classify(
    reagentLab: LabValue,
    measurementCovariance: number[][],
    reagent: ReagentType
  ): Promise<DecisionResult>;
}

export interface SealModule {
  sealRecord(
    recordData: Record<string, unknown>,
    prevHash: string,
    keyAlias: string
  ): Promise<SealedRecordPayload>;
}

export interface CertifyModule {
  generateEvidenceBundle(
    recordUuid: string
  ): Promise<CertifiedBundle>;
}

export interface SyncModule {
  queueRecord(recordUuid: string): Promise<string>; // Returns idempotencyKey
  processOutbox(): Promise<{ syncedCount: number; failureCount: number }>;
}

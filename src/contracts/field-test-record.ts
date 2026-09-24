/**
 * Authoritative field-test wire contract shared by the officer app and API.
 *
 * The immutable evidence envelope deliberately excludes review metadata. Case status
 * and panchnama references are mutable workflow facts owned by the server and never
 * participate in an evidence record hash.
 */

import type { ReagentType } from '../types/domain.ts';
import { canonicalizeJson } from '../crypto/canonical-json.ts';
import { calculateChainHash, GENESIS_PREV_HASH } from '../crypto/hash-chain.ts';

export const FIELD_TEST_SCHEMA_VERSION = 'parinaam-field-record-v1' as const;
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export const REAGENT_TYPES = [
  'marquis',
  'mecke',
  'mandelin',
  'scott',
  'duquenois_levine',
  'simons',
  'ehrlich',
  'nitric_acid',
  'ferric_chloride',
] as const satisfies readonly ReagentType[];

export const PRESUMPTIVE_OUTCOMES = [
  'CONSISTENT_WITH_REAGENT_POSITIVE',
  'CONSISTENT_WITH_REAGENT_NEGATIVE',
  'INCONCLUSIVE',
] as const;

export const ABSTENTION_REASONS = ['low_margin', 'novelty_ood', 'calibration_failed'] as const;
export const CALIBRATION_GRADES = ['GOOD', 'DEGRADED'] as const;
export const OFFICER_ROLE_VALUES = ['JUNIOR', 'SENIOR', 'ADMIN', 'SUPERVISOR', 'JUDICIARY'] as const;

export type FieldTestOutcome = (typeof PRESUMPTIVE_OUTCOMES)[number];
export type FieldTestAbstentionReason = (typeof ABSTENTION_REASONS)[number];
export type FieldTestCalibrationGrade = (typeof CALIBRATION_GRADES)[number];
export type FieldTestOfficerRole = (typeof OFFICER_ROLE_VALUES)[number];

export interface FieldTestKineticPoint {
  t_ms: number;
  delta_e: number;
}

export interface FieldTestGps {
  lat: number;
  lon: number;
  accuracy_m: number | null;
  mocked: boolean;
}

export interface FieldTestKit {
  make: string | null;
  test_name: string | null;
  lot_no: string | null;
  expiry: string | null;
}

export interface FieldTestCalibrationResidual {
  mean: number;
  max: number;
  grade: FieldTestCalibrationGrade;
}

/** Exactly the object whose JCS representation is covered by record_hash. */
export interface SealedFieldTestPayload {
  schema_version: typeof FIELD_TEST_SCHEMA_VERSION;
  seq: number;
  record_uuid: string;
  case_ref: string;
  package_no: string;
  lot_no: string | null;
  reagent: ReagentType;
  kit: FieldTestKit;
  corrected_lab: { l: number; a: number; b: number };
  delta_e_00: number;
  calibration_residual: FieldTestCalibrationResidual;
  outcome: FieldTestOutcome;
  confidence: number;
  conformal_set: string[];
  abstention_reason: FieldTestAbstentionReason | null;
  kinetics: FieldTestKineticPoint[] | null;
  gps: FieldTestGps | null;
  image_sha256: string | null;
  operator_id: string;
  operator_name: string | null;
  officer_role: FieldTestOfficerRole;
  created_at: string;
  is_demo: boolean;
}

export type FieldTestRecordCore = Omit<
  SealedFieldTestPayload,
  'schema_version' | 'seq' | 'payload_jcs' | 'record_hash' | 'prev_hash' | 'chain_hash'
>;

/** Wire representation sent to the self-hosted API. */
export interface FieldTestRecordV1 extends SealedFieldTestPayload {
  payload_jcs: string;
  record_hash: string;
  prev_hash: string;
  chain_hash: string;
  device_attestation: string | null;
}

/** Mutable case-level review data is never part of FieldTestRecordV1. */
export interface MutableCaseReview {
  case_status: 'REPORTED' | 'UNDER_REVIEW' | 'REVIEWED' | 'ESCALATED';
  panchnama_ref: string | null;
}

export interface CreateFieldTestRecordInput extends FieldTestRecordCore {
  seq: number;
  device_attestation?: string | null;
}

export function sealedPayloadFromCore(input: CreateFieldTestRecordInput): SealedFieldTestPayload {
  return {
    schema_version: FIELD_TEST_SCHEMA_VERSION,
    seq: input.seq,
    record_uuid: input.record_uuid,
    case_ref: input.case_ref,
    package_no: input.package_no,
    lot_no: input.lot_no,
    reagent: input.reagent,
    kit: input.kit,
    corrected_lab: input.corrected_lab,
    delta_e_00: input.delta_e_00,
    calibration_residual: input.calibration_residual,
    outcome: input.outcome,
    confidence: input.confidence,
    conformal_set: input.conformal_set,
    abstention_reason: input.abstention_reason,
    kinetics: input.kinetics,
    gps: input.gps,
    image_sha256: input.image_sha256,
    operator_id: input.operator_id,
    operator_name: input.operator_name,
    officer_role: input.officer_role,
    created_at: input.created_at,
    is_demo: input.is_demo,
  };
}

export async function createFieldTestRecord(
  input: CreateFieldTestRecordInput,
  prevHash: string = GENESIS_PREV_HASH
): Promise<FieldTestRecordV1> {
  const sealed = sealedPayloadFromCore(input);
  const payloadJcs = canonicalizeJson(sealed);
  const { payloadSha256, chainHash } = await calculateChainHash(prevHash, payloadJcs);
  return {
    ...sealed,
    payload_jcs: payloadJcs,
    record_hash: payloadSha256,
    prev_hash: prevHash,
    chain_hash: chainHash,
    device_attestation: input.device_attestation ?? null,
  };
}

export function isFieldTestRecord(value: unknown): value is FieldTestRecordV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<FieldTestRecordV1>;
  return (
    record.schema_version === FIELD_TEST_SCHEMA_VERSION &&
    typeof record.seq === 'number' &&
    typeof record.record_uuid === 'string' &&
    typeof record.payload_jcs === 'string' &&
    typeof record.record_hash === 'string' &&
    typeof record.prev_hash === 'string' &&
    typeof record.chain_hash === 'string'
  );
}

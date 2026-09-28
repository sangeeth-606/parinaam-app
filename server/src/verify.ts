/**
 * Strict validation and cryptographic verification for the authoritative field-test
 * contract. This module has no database dependency and is used by ingest, detail
 * verification, and tests.
 */

import {
  ABSTENTION_REASONS,
  CALIBRATION_GRADES,
  FIELD_TEST_SCHEMA_VERSION,
  GPS_GOOD_ACCURACY_M,
  GPS_POOR_ACCURACY_M,
  GPS_SOURCES,
  OFFICER_ROLE_VALUES,
  PRESUMPTIVE_OUTCOMES,
  REAGENT_TYPES,
  isFieldTestRecord,
  sealedPayloadFromCore,
  type CreateFieldTestRecordInput,
  type FieldTestRecordV1,
} from '../../src/contracts/field-test-record.ts';
import { canonicalizeJson } from '../../src/crypto/canonical-json.ts';
import { GENESIS_PREV_HASH } from '../../src/crypto/hash-chain.ts';
import { sha256Hex } from '../../src/crypto/sha256.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CASE_RE = /^[A-Z0-9-]+\/[A-Z0-9-]+\/[A-Z0-9-]+\/\d{4}$/;
const PACKAGE_RE = /^P-\d+$/;
const KIT_LOT_RE = /^[A-Za-z0-9._/-]{1,80}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._/()'-]{0,119}$/u;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_TEXT = 200;

export interface VerificationFailure {
  code: string;
  reason: string;
  status: number;
  retryable: boolean;
}

export interface VerificationResult {
  ok: boolean;
  code: string;
  reason: string | null;
  status: 200 | 403 | 409 | 422;
  retryable: boolean;
  checks: string[];
}

export interface VerifyOptions {
  expectedSeq?: number;
  expectedPrevHash?: string;
  expectedRecordHash?: string;
  operatorCode?: string;
  indexed?: Record<string, unknown>;
}

const fail = (
  code: string,
  reason: string,
  status: 403 | 409 | 422 = 422,
  retryable = false,
  checks: string[] = []
): VerificationResult => ({ ok: false, code, reason, status, retryable, checks });

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableString(value: unknown, max = MAX_TEXT): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= max);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validateIsoDate(value: unknown, field: string): string | null {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return `${field} must be an ISO-8601 UTC timestamp with milliseconds`;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return `${field} is not a valid timestamp`;
  return null;
}

function validateKnownShape(record: Record<string, unknown>): string | null {
  const keys = [
    'schema_version', 'seq', 'record_uuid', 'case_ref', 'package_no', 'lot_no', 'reagent', 'kit',
    'corrected_lab', 'delta_e_00', 'calibration_residual', 'outcome', 'confidence', 'conformal_set',
    'abstention_reason', 'kinetics', 'gps', 'image_sha256', 'operator_id', 'operator_name',
    'officer_role', 'created_at', 'is_demo', 'payload_jcs', 'record_hash', 'prev_hash', 'chain_hash',
    'device_attestation',
  ] as const;
  if (!exactKeys(record, keys)) return 'record contains missing or unknown fields';

  if (record.schema_version !== FIELD_TEST_SCHEMA_VERSION) return `schema_version must be ${FIELD_TEST_SCHEMA_VERSION}`;
  if (!Number.isSafeInteger(record.seq) || Number(record.seq) < 1) return 'seq must be a positive safe integer';
  if (typeof record.record_uuid !== 'string' || !UUID_RE.test(record.record_uuid)) return 'record_uuid must be a UUID';
  if (typeof record.case_ref !== 'string' || !CASE_RE.test(record.case_ref)) return 'case_ref has an invalid format';
  if (typeof record.package_no !== 'string' || !PACKAGE_RE.test(record.package_no)) return 'package_no must use P-n format';
  if (!isNullableString(record.lot_no, 80)) return 'lot_no must be null or a non-empty string';
  if (typeof record.reagent !== 'string' || !(REAGENT_TYPES as readonly string[]).includes(record.reagent)) return 'reagent is not supported';
  if (!isRecordObject(record.kit) || !exactKeys(record.kit, ['make', 'test_name', 'lot_no', 'expiry'])) return 'kit has an invalid shape';
  for (const key of ['make', 'test_name', 'lot_no', 'expiry'] as const) {
    if (!isNullableString(record.kit[key], 120)) return `kit.${key} must be null or a non-empty string`;
  }
  const kitLot = record.kit.lot_no;
  const kitExpiry = record.kit.expiry;
  if (kitLot !== null && (typeof kitLot !== 'string' || !KIT_LOT_RE.test(kitLot))) return 'kit.lot_no has an invalid format';
  if (kitExpiry !== null && (typeof kitExpiry !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(kitExpiry))) return 'kit.expiry must be null or YYYY-MM-DD';

  if (!isRecordObject(record.corrected_lab) || !exactKeys(record.corrected_lab, ['l', 'a', 'b'])) return 'corrected_lab has an invalid shape';
  if (![record.corrected_lab.l, record.corrected_lab.a, record.corrected_lab.b].every(isFiniteNumber)) return 'corrected_lab values must be finite numbers';
  if (!isFiniteNumber(record.delta_e_00) || record.delta_e_00 < 0) return 'delta_e_00 must be a non-negative finite number';
  if (!isRecordObject(record.calibration_residual) || !exactKeys(record.calibration_residual, ['mean', 'max', 'grade'])) return 'calibration_residual has an invalid shape';
  if (!isFiniteNumber(record.calibration_residual.mean) || record.calibration_residual.mean < 0) return 'calibration residual mean must be non-negative';
  if (!isFiniteNumber(record.calibration_residual.max) || record.calibration_residual.max < record.calibration_residual.mean) return 'calibration residual max must be at least mean';
  if (typeof record.calibration_residual.grade !== 'string' || !(CALIBRATION_GRADES as readonly string[]).includes(record.calibration_residual.grade)) return 'calibration grade is not supported';

  if (typeof record.outcome !== 'string' || !(PRESUMPTIVE_OUTCOMES as readonly string[]).includes(record.outcome)) return 'outcome is not supported';
  if (!isFiniteNumber(record.confidence) || record.confidence < 0 || record.confidence > 1) return 'confidence must be between 0 and 1';
  if (!Array.isArray(record.conformal_set) || record.conformal_set.length === 0 || !record.conformal_set.every((v) => v === 'POSITIVE' || v === 'NEGATIVE')) return 'conformal_set must contain POSITIVE and/or NEGATIVE';
  if (record.outcome === 'INCONCLUSIVE') {
    if (typeof record.abstention_reason !== 'string' || !(ABSTENTION_REASONS as readonly string[]).includes(record.abstention_reason)) return 'INCONCLUSIVE requires a supported abstention_reason';
  } else if (record.abstention_reason !== null) return 'abstention_reason must be null for a non-INCONCLUSIVE outcome';

  if (record.kinetics !== null) {
    if (!Array.isArray(record.kinetics) || record.kinetics.length === 0 || record.kinetics.length > 500) return 'kinetics must be null or a non-empty array of at most 500 points';
    let previous = -1;
    for (const point of record.kinetics) {
      if (!isRecordObject(point) || !exactKeys(point, ['t_ms', 'delta_e']) || !isFiniteNumber(point.t_ms) || point.t_ms < 0 || !isFiniteNumber(point.delta_e) || point.delta_e < 0 || point.t_ms <= previous) return 'kinetics points require increasing non-negative t_ms and non-negative delta_e';
      previous = point.t_ms;
    }
  }
  if (record.gps !== null) {
    if (!isRecordObject(record.gps)) return 'gps has an invalid shape';
    const hasRequiredOnly = exactKeys(record.gps, ['lat', 'lon', 'accuracy_m', 'mocked']);
    const hasWithSource = exactKeys(record.gps, ['lat', 'lon', 'accuracy_m', 'mocked', 'source']);
    if (!hasRequiredOnly && !hasWithSource) return 'gps has an invalid shape';
    if (!isFiniteNumber(record.gps.lat) || record.gps.lat < -90 || record.gps.lat > 90) return 'gps.lat is outside valid bounds';
    if (!isFiniteNumber(record.gps.lon) || record.gps.lon < -180 || record.gps.lon > 180) return 'gps.lon is outside valid bounds';
    if (record.gps.accuracy_m !== null && (!isFiniteNumber(record.gps.accuracy_m) || record.gps.accuracy_m < 0)) return 'gps.accuracy_m must be null or non-negative';
    if (typeof record.gps.mocked !== 'boolean') return 'gps.mocked must be boolean';
    if ('source' in record.gps && !(GPS_SOURCES as readonly string[]).includes(record.gps.source as string)) {
      return 'gps.source must be expo-location, simulator, or manual';
    }
  }
  if (record.image_sha256 !== null && (typeof record.image_sha256 !== 'string' || !HASH_RE.test(record.image_sha256))) return 'image_sha256 must be null or a lowercase SHA-256 digest';
  if (typeof record.operator_id !== 'string' || !/^[A-Za-z0-9._-]{2,80}$/.test(record.operator_id)) return 'operator_id has an invalid format';
  if (!isNullableString(record.operator_name, 120) || (record.operator_name !== null && !NAME_RE.test(record.operator_name))) return 'operator_name has an invalid format';
  if (typeof record.officer_role !== 'string' || !(OFFICER_ROLE_VALUES as readonly string[]).includes(record.officer_role)) return 'officer_role is not supported';
  const dateError = validateIsoDate(record.created_at, 'created_at');
  if (dateError) return dateError;
  if (typeof record.is_demo !== 'boolean') return 'is_demo must be boolean';
  if (typeof record.payload_jcs !== 'string' || record.payload_jcs.length > 250_000) return 'payload_jcs must be a bounded string';
  for (const key of ['record_hash', 'prev_hash', 'chain_hash'] as const) {
    if (typeof record[key] !== 'string' || !HASH_RE.test(record[key])) return `${key} must be a lowercase SHA-256 digest`;
  }
  if (record.device_attestation !== null && (typeof record.device_attestation !== 'string' || !/^[0-9a-f]+$/.test(record.device_attestation) || record.device_attestation.length > 16_384)) return 'device_attestation must be null or lowercase hex';
  return null;
}

function toCore(record: Record<string, unknown>): CreateFieldTestRecordInput {
  return {
    seq: Number(record.seq),
    record_uuid: String(record.record_uuid),
    case_ref: String(record.case_ref),
    package_no: String(record.package_no),
    lot_no: record.lot_no as string | null,
    reagent: record.reagent as CreateFieldTestRecordInput['reagent'],
    kit: record.kit as CreateFieldTestRecordInput['kit'],
    corrected_lab: record.corrected_lab as CreateFieldTestRecordInput['corrected_lab'],
    delta_e_00: Number(record.delta_e_00),
    calibration_residual: record.calibration_residual as CreateFieldTestRecordInput['calibration_residual'],
    outcome: record.outcome as CreateFieldTestRecordInput['outcome'],
    confidence: Number(record.confidence),
    conformal_set: record.conformal_set as string[],
    abstention_reason: record.abstention_reason as CreateFieldTestRecordInput['abstention_reason'],
    kinetics: record.kinetics as CreateFieldTestRecordInput['kinetics'],
    gps: record.gps as CreateFieldTestRecordInput['gps'],
    image_sha256: record.image_sha256 as string | null,
    operator_id: String(record.operator_id),
    operator_name: record.operator_name as string | null,
    officer_role: record.officer_role as CreateFieldTestRecordInput['officer_role'],
    created_at: String(record.created_at),
    is_demo: record.is_demo as boolean,
  };
}

const INDEXED_PROJECTIONS = ['seq', 'record_uuid', 'case_ref', 'package_no', 'operator_id', 'outcome', 'confidence', 'created_at', 'payload_jcs', 'record_hash', 'prev_hash', 'chain_hash', 'image_sha256'] as const;

function indexedMatches(record: FieldTestRecordV1, indexed: Record<string, unknown>): string | null {
  for (const key of INDEXED_PROJECTIONS) {
    if (Object.prototype.hasOwnProperty.call(indexed, key) && indexed[key] !== record[key]) return `indexed column ${key} does not match the sealed record`;
  }
  return null;
}

export async function verifyFieldTestRecord(value: unknown, options: VerifyOptions = {}): Promise<VerificationResult> {
  if (!isFieldTestRecord(value)) return fail('invalid-record-shape', 'record does not match the field-test contract');
  const record = value as FieldTestRecordV1;
  const known = isRecordObject(value) ? validateKnownShape(value as unknown as Record<string, unknown>) : 'record must be an object';
  if (known) return fail('schema-validation', known, 422, false, ['known_fields: failed']);

  let expectedPayload: string;
  try {
    expectedPayload = canonicalizeJson(sealedPayloadFromCore(toCore(value as unknown as Record<string, unknown>)));
  } catch {
    return fail('canonicalization-failed', 'sealed payload cannot be canonicalized', 422, false, ['canonical_json: failed']);
  }
  if (record.payload_jcs !== expectedPayload) return fail('noncanonical-payload', 'payload_jcs is not the canonical sealed payload', 422, false, ['canonical_json: failed']);

  const recordHash = await sha256Hex(record.payload_jcs);
  if (recordHash !== record.record_hash) return fail('record-hash-mismatch', 'record_hash does not match payload_jcs', 422, false, ['record_hash: failed']);
  const expectedChain = await sha256Hex(record.prev_hash + record.record_hash);
  if (expectedChain !== record.chain_hash) return fail('chain-hash-mismatch', 'chain_hash does not match prev_hash + record_hash', 422, false, ['chain_hash: failed']);

  if (options.expectedPrevHash !== undefined && record.prev_hash !== options.expectedPrevHash) {
    if (record.prev_hash === GENESIS_PREV_HASH || /^[0-9a-f]{64}$/.test(record.prev_hash)) {
      return fail('PREV_HASH_NOT_STORED', 'record predecessor is not the current ledger head; retry after its predecessor is stored', 409, true, ['prev_hash: pending']);
    }
    return fail('prev-hash-invalid', 'prev_hash is invalid', 422, false, ['prev_hash: failed']);
  }
  if (options.expectedSeq !== undefined && record.seq !== options.expectedSeq) return fail('sequence-conflict', 'record sequence is not the next ledger sequence', 409, false, ['sequence: failed']);
  if (options.expectedRecordHash !== undefined && record.record_hash !== options.expectedRecordHash) return fail('record-hash-conflict', 'record hash differs from the existing UUID', 409, false, ['record_hash: conflict']);
  if (options.operatorCode !== undefined && record.operator_id !== options.operatorCode) return fail('operator-binding-mismatch', 'record operator does not match the authenticated officer', 403, false, ['operator_binding: failed']);
  if (options.indexed) {
    const mismatch = indexedMatches(record, options.indexed);
    if (mismatch) return fail('indexed-body-mismatch', mismatch, 422, false, ['indexed_body: failed']);
  }

  return {
    ok: true,
    code: 'verified',
    reason: null,
    status: 200,
    retryable: false,
    checks: [
      'known_fields: passed',
      'canonical_json: passed',
      'record_hash: passed',
      'chain_hash: passed',
      'prev_hash: passed',
      ...(options.operatorCode ? ['operator_binding: passed'] : []),
      ...(options.indexed ? ['indexed_body: passed'] : []),
      ...(record.gps === null
        ? ['gps: absent (record sealed without coordinates)']
        : record.gps.mocked
          ? ['gps: flagged (coordinates from mock provider)']
          : record.gps.accuracy_m !== null && record.gps.accuracy_m > GPS_POOR_ACCURACY_M
            ? [`gps: flagged (marginal accuracy > ${GPS_POOR_ACCURACY_M}m)`]
            : record.gps.accuracy_m !== null && record.gps.accuracy_m <= GPS_GOOD_ACCURACY_M
              ? ['gps: passed (survey-grade)']
              : ['gps: passed']),
      'device_attestation: stored but not cryptographically verified by this API',
    ],
  };
}

export function indexedFieldsFromRecord(record: FieldTestRecordV1): Record<string, unknown> {
  return {
    seq: record.seq,
    record_uuid: record.record_uuid,
    case_ref: record.case_ref,
    package_no: record.package_no,
    operator_id: record.operator_id,
    outcome: record.outcome,
    confidence: record.confidence,
    created_at: record.created_at,
    payload_jcs: record.payload_jcs,
    record_hash: record.record_hash,
    prev_hash: record.prev_hash,
    chain_hash: record.chain_hash,
    image_sha256: record.image_sha256,
  };
}

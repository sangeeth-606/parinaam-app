import type { ServerDb } from './db.ts';
import type { SqlStore } from './storage.ts';
import type { AuthedOfficer } from './auth.ts';
import { ApiError } from '../../src/contracts/api-errors.ts';
import { MAX_EVIDENCE_BYTES, type FieldTestRecordV1 } from '../../src/contracts/field-test-record.ts';
import { canonicalizeJson } from '../../src/crypto/canonical-json.ts';
import { sha256Hex } from '../../src/crypto/sha256.ts';
import { sha256HexBytes } from '../../src/crypto/sha256-bytes.ts';
import { verifyFieldTestRecord } from './verify.ts';
import { publish } from './bus.ts';

export interface StoredRecordResult {
  status: 200 | 201;
  body: Record<string, unknown>;
  event: 'stored' | 'replayed' | 'already-stored' | null;
}

function idemKey(officerCode: string, key: string): string {
  return `${officerCode}:${key}`;
}

async function requestHash(record: FieldTestRecordV1): Promise<string> {
  return sha256Hex(canonicalizeJson(record));
}

function parseStoredBody(value: unknown): FieldTestRecordV1 {
  if (typeof value !== 'string') throw new Error('stored record body is not text');
  return JSON.parse(value) as FieldTestRecordV1;
}

export async function ingestRecord(
  db: ServerDb,
  officer: AuthedOfficer,
  value: unknown,
  idempotencyKey: string | undefined
): Promise<StoredRecordResult> {
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'a valid Idempotency-Key header (8-160 characters) is required');
  }
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value as { is_demo?: unknown; record_uuid?: unknown } : null;
  if (candidate?.is_demo === true && typeof candidate.record_uuid === 'string' && candidate.record_uuid.startsWith('00000000-')) {
    throw new ApiError(400, 'DEMO_RECORD_UPLOAD_FORBIDDEN', 'deterministic demo records are installed only by the local seed and cannot be uploaded');
  }
  const preliminary = await verifyFieldTestRecord(value, { operatorCode: officer.officerCode });
  if (!preliminary.ok && preliminary.code !== 'PREV_HASH_NOT_STORED') {
    throw new ApiError(preliminary.status, preliminary.code, preliminary.reason ?? 'record validation failed', preliminary.retryable, { checks: preliminary.checks });
  }
  const record = value as FieldTestRecordV1;
  const scopedIdempotencyKey = idemKey(officer.officerCode, idempotencyKey);
  const hash = await requestHash(record);

  const demoFlag = db.engine === 'postgres' ? true : 1;
  const result = await db.store.transaction(async (tx) => {
    // Serialize the single global capture chain. SQLite already uses BEGIN
    // IMMEDIATE; PostgreSQL takes a transaction-scoped row lock before any
    // idempotency/evidence/head decision so concurrent clients cannot fork it.
    const head = await tx.get<{ seq: number; chain_hash: string }>(
      db.engine === 'postgres'
        ? 'SELECT seq, chain_hash FROM ledger_head WHERE id = 1 FOR UPDATE'
        : 'SELECT seq, chain_hash FROM ledger_head WHERE id = 1'
    );
    const hit = await tx.get<{
      officer_code: string;
      request_hash: string;
      record_uuid: string;
      response_status: number;
      response_json: string;
    }>('SELECT officer_code, request_hash, record_uuid, response_status, response_json FROM idempotency WHERE key = ?', scopedIdempotencyKey);
    if (hit) {
      if (hit.officer_code !== officer.officerCode || hit.request_hash !== hash || hit.record_uuid !== record.record_uuid) {
        throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'idempotency key was already used for a different request');
      }
      return { status: hit.response_status as 200 | 201, body: JSON.parse(hit.response_json) as Record<string, unknown>, event: 'replayed' as const };
    }

    const existing = await tx.get<{ body: string; record_hash: string }>(
      'SELECT body, record_hash FROM field_test WHERE record_uuid = ?',
      record.record_uuid
    );
    if (existing) {
      const stored = parseStoredBody(existing.body);
      if (existing.record_hash !== record.record_hash || canonicalizeJson(stored) !== canonicalizeJson(record)) {
        throw new ApiError(409, 'RECORD_CONFLICT', 'a different record is already stored under this record_uuid');
      }
      const currentCase = await tx.get<{ case_status: string }>('SELECT case_status FROM cases WHERE case_ref = ?', record.case_ref);
      const response = {
        status: 'already-stored',
        record_uuid: record.record_uuid,
        case_ref: record.case_ref,
        case_status: currentCase?.case_status ?? 'REPORTED',
        checks: preliminary.checks,
      };
      await tx.run(
        'INSERT INTO idempotency (key, officer_code, request_hash, record_uuid, response_status, response_json, created_at) VALUES (?,?,?,?,?,?,?)',
        scopedIdempotencyKey,
        officer.officerCode,
        hash,
        record.record_uuid,
        200,
        JSON.stringify(response),
        new Date().toISOString()
      );
      return { status: 200 as const, body: response, event: 'already-stored' as const };
    }

    const expectedSeq = Number(head?.seq ?? 0) + 1;
    const expectedPrev = head?.chain_hash ?? '0'.repeat(64);
    const verified = await verifyFieldTestRecord(record, {
      expectedSeq,
      expectedPrevHash: expectedPrev,
      operatorCode: officer.officerCode,
      indexed: {
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
      },
    });
    if (!verified.ok) {
      throw new ApiError(verified.status, verified.code, verified.reason ?? 'record verification failed', verified.retryable, { checks: verified.checks });
    }

    const receivedAt = new Date().toISOString();
    await tx.run(
      `INSERT INTO field_test (
        seq, record_uuid, case_ref, package_no, officer_code, operator_id, operator_name, outcome, confidence,
        reagent, kit_type, kit_batch, region, department, location_label,
        created_at, received_at, payload_jcs, record_hash, prev_hash, chain_hash,
        device_attestation, image_ref, image_sha256, is_demo, body
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      record.seq,
      record.record_uuid,
      record.case_ref,
      record.package_no,
      officer.officerCode,
      record.operator_id,
      record.operator_name,
      record.outcome,
      record.confidence,
      record.reagent,
      record.kit.test_name,
      record.kit.lot_no,
      regionFromCaseRef(record.case_ref),
      // Provenance must be measured, not assumed. The wire contract has no department
      // field, so this is the authenticated account's unit, not a hardcoded 'NCB'.
      await departmentForOfficer(tx, record.operator_id),
      // Derived from the case-reference STRING, not from the record's own sealed GPS.
      // A region code is a routing hint, never a claim about where a seizure happened;
      // the sealed coordinates are the only location fact in the payload.
      locationFromCaseRef(record.case_ref),
      record.created_at,
      receivedAt,
      record.payload_jcs,
      record.record_hash,
      record.prev_hash,
      record.chain_hash,
      record.device_attestation,
      null,
      record.image_sha256,
      record.is_demo ? demoFlag : db.engine === 'postgres' ? false : 0,
      JSON.stringify(record)
    );
    // A panchnama reference is a fact about a real seizure record, and it is deliberately
    // NOT part of the sealed device payload (MutableCaseReview owns it). The server must
    // never infer one from a case-reference string; a reviewer sets it from the actual
    // panchnama, or it stays absent.
    const panchnama: string | null = null;
    await tx.run(
      `INSERT INTO cases (
        case_ref, case_status, panchnama_ref, region, department, location_label,
        first_record_at, last_record_at, created_at, updated_at
      ) VALUES (?, 'REPORTED', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (case_ref) DO UPDATE SET
        first_record_at = CASE WHEN cases.first_record_at IS NULL OR excluded.first_record_at < cases.first_record_at THEN excluded.first_record_at ELSE cases.first_record_at END,
        last_record_at = CASE WHEN cases.last_record_at IS NULL OR excluded.last_record_at > cases.last_record_at THEN excluded.last_record_at ELSE cases.last_record_at END,
        panchnama_ref = COALESCE(cases.panchnama_ref, excluded.panchnama_ref),
        updated_at = excluded.updated_at`,
      record.case_ref,
      panchnama,
      regionFromCaseRef(record.case_ref),
      await departmentForOfficer(tx, record.operator_id),
      locationFromCaseRef(record.case_ref),
      record.created_at,
      record.created_at,
      receivedAt,
      receivedAt
    );
    await tx.run('UPDATE ledger_head SET seq = ?, chain_hash = ?, updated_at = ? WHERE id = 1', record.seq, record.chain_hash, receivedAt);
    const currentCase = await tx.get<{ case_status: string }>('SELECT case_status FROM cases WHERE case_ref = ?', record.case_ref);
    const response = {
      status: 'stored',
      record_uuid: record.record_uuid,
      case_ref: record.case_ref,
      case_status: currentCase?.case_status ?? 'REPORTED',
      evidence_status: record.image_sha256 ? 'PENDING' : 'NOT_PROVIDED',
      checks: verified.checks,
    };
    await tx.run(
      'INSERT INTO idempotency (key, officer_code, request_hash, record_uuid, response_status, response_json, created_at) VALUES (?,?,?,?,?,?,?)',
      scopedIdempotencyKey,
      officer.officerCode,
      hash,
      record.record_uuid,
      201,
      JSON.stringify(response),
      receivedAt
    );
    await tx.run(
      'INSERT INTO server_audit (actor, action, subject, at, detail) VALUES (?,?,?,?,?)',
      officer.username,
      'record-ingested',
      record.record_uuid,
      receivedAt,
      `case ${record.case_ref} / ${record.package_no}`
    );
    return { status: 201 as const, body: response, event: 'stored' as const };
  });

  if (result.event === 'stored') {
    publish('record-ingested', {
      record_uuid: record.record_uuid,
      case_ref: record.case_ref,
      package_no: record.package_no,
      operator_id: record.operator_id,
    });
  }
  return result;
}

/**
 * The ingesting officer's unit. This used to be a hardcoded 'NCB' literal stamped on every
 * ingested record, which made an unverifiable provenance column look like a captured fact.
 * The `officers` table has no department column yet, so this honestly reports
 * 'UNSPECIFIED' until unit provisioning lands (docs/known-gaps.md). Provenance must be
 * measured, not assumed.
 */
async function departmentForOfficer(tx: SqlStore, operatorId: string): Promise<string> {
  // OfficerRow carries no department yet, so this honestly reports 'UNSPECIFIED' rather
  // than stamping a unit that was never captured. The read must run on the
  // transaction-bound store, not the parent handle.
  try {
    const row = await tx.get<{ department?: string | null }>(
      'SELECT department FROM officers WHERE officer_code = ?',
      operatorId
    );
    const value = typeof row?.department === 'string' ? row.department.trim() : '';
    return value.length > 0 ? value : 'UNSPECIFIED';
  } catch {
    // Column not provisioned yet — absence is reported, never invented.
    return 'UNSPECIFIED';
  }
}

export function regionFromCaseRef(caseRef: string): string {
  return caseRef.split('/')[1] ?? 'UNKNOWN';
}

/**
 * A region ROUTING label derived from the case-reference string (DZU → Delhi). This is a
 * filing convenience, not a statement about where a seizure occurred: the only location
 * fact in a record is its own sealed GPS, which is validated and stored in the payload.
 */
export function locationFromCaseRef(caseRef: string): string {
  const region = regionFromCaseRef(caseRef);
  const locations: Record<string, string> = {
    DZU: 'Delhi',
    MZU: 'Mumbai',
    KZU: 'Kolkata',
    BZU: 'Bengaluru',
  };
  return locations[region] ?? region;
}

export async function storeEvidence(
  db: ServerDb,
  officer: AuthedOfficer,
  recordUuid: string,
  bytes: Uint8Array,
  contentType: string
): Promise<{ status: 200 | 201; body: Record<string, unknown> }> {
  if (!['image/jpeg', 'image/png'].includes(contentType)) throw new ApiError(415, 'UNSUPPORTED_IMAGE_TYPE', 'evidence must be image/jpeg or image/png');
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_EVIDENCE_BYTES) throw new ApiError(413, 'INVALID_EVIDENCE_SIZE', `evidence must be between 1 byte and ${MAX_EVIDENCE_BYTES} bytes`);
  if (!isExpectedImageSignature(bytes, contentType)) throw new ApiError(422, 'INVALID_IMAGE_BYTES', 'uploaded bytes do not match the declared image type');

  return db.store.transaction(async (tx) => {
    const record = await tx.get<{ image_sha256: string | null; operator_id: string }>(
      db.engine === 'postgres'
        ? 'SELECT image_sha256, operator_id FROM field_test WHERE record_uuid = ? FOR UPDATE'
        : 'SELECT image_sha256, operator_id FROM field_test WHERE record_uuid = ?',
      recordUuid
    );
    if (!record) throw new ApiError(404, 'RECORD_NOT_FOUND', 'record not found');
    if (officer.role === 'JUNIOR' && officer.officerCode !== record.operator_id) throw new ApiError(403, 'OPERATOR_BINDING_MISMATCH', 'junior officers may only attach evidence to their own records');
    if (!record.image_sha256) throw new ApiError(409, 'EVIDENCE_NOT_DECLARED', 'record does not declare an evidence image hash');
    const digest = await sha256HexBytes(bytes);
    if (digest !== record.image_sha256) throw new ApiError(422, 'EVIDENCE_HASH_MISMATCH', 'uploaded image bytes do not match the sealed image_sha256');

    const existing = await tx.get<{ sha256: string }>('SELECT sha256 FROM evidence_blobs WHERE record_uuid = ?', recordUuid);
    if (existing) {
      if (existing.sha256 !== digest) throw new ApiError(409, 'EVIDENCE_CONFLICT', 'different evidence is already stored for this record');
      return { status: 200, body: { status: 'already-stored', record_uuid: recordUuid, sha256: digest, content_type: contentType } };
    }
    const now = new Date().toISOString();
    await tx.run(
      'INSERT INTO evidence_blobs (record_uuid, sha256, content_type, byte_size, bytes, created_at) VALUES (?,?,?,?,?,?)',
      recordUuid,
      digest,
      contentType,
      bytes.byteLength,
      Buffer.from(bytes),
      now
    );
    await tx.run('INSERT INTO server_audit (actor, action, subject, at, detail) VALUES (?,?,?,?,?)', officer.username, 'evidence-stored', recordUuid, now, `${contentType} ${bytes.byteLength} bytes`);
    return { status: 201, body: { status: 'stored', record_uuid: recordUuid, sha256: digest, content_type: contentType, byte_size: bytes.byteLength } };
  });
}

function isExpectedImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/jpeg') return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.byteLength >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

export async function getEvidence(
  db: ServerDb,
  officer: AuthedOfficer,
  recordUuid: string
): Promise<{ bytes: Uint8Array; contentType: string; sha256: string; size: number }> {
  const row = await db.store.get<Record<string, unknown>>(
    `SELECT e.sha256, e.content_type, e.byte_size, e.bytes, f.operator_id
     FROM evidence_blobs e JOIN field_test f ON f.record_uuid = e.record_uuid
     WHERE e.record_uuid = ?`,
    recordUuid
  );
  if (!row) throw new ApiError(404, 'EVIDENCE_NOT_FOUND', 'evidence image not found');
  if (officer.role === 'JUNIOR' && officer.officerCode !== String(row.operator_id)) throw new ApiError(403, 'OPERATOR_BINDING_MISMATCH', 'junior officers may only read evidence for their own records');
  const bytes = row.bytes;
  const normalized = bytes instanceof Uint8Array ? bytes : Buffer.from(String(bytes), 'base64');
  return {
    bytes: normalized,
    contentType: String(row.content_type),
    sha256: String(row.sha256),
    size: Number(row.byte_size),
  };
}
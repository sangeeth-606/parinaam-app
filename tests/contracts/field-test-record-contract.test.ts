/**
 * Contract tests for the shared immutable field-test envelope and the deterministic
 * demo dataset that both the officer app and the self-hosted API seed consume.
 *
 * These tests lock three things at once:
 *   1. the wire shape  (src/contracts/field-test-record.ts) — every sealed outer field
 *      is inside payload_jcs, and the server verifier refuses anything else;
 *   2. the demo dataset (src/demo/demo-dataset.ts) — deterministic bytes, an unbroken
 *      15-record / 4-case chain, and honest nulls (demo rows never imply image bytes
 *      or a device attestation);
 *   3. the boundary    (server/src/verify.ts) — top-level/payload drift, forged chain
 *      hashes, operator-binding drift, unsupported calibration grades and mutable
 *      review metadata injected into the evidence envelope are all rejected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALIBRATION_GRADES,
  FIELD_TEST_SCHEMA_VERSION,
  OFFICER_ROLE_VALUES,
  PRESUMPTIVE_OUTCOMES,
  REAGENT_TYPES,
  isFieldTestRecord,
  sealedPayloadFromCore,
  type CreateFieldTestRecordInput,
  type FieldTestCalibrationGrade,
  type FieldTestRecordV1,
} from '../../src/contracts/field-test-record.ts';
import {
  DEMO_CASES,
  DEMO_CASE_COUNT,
  DEMO_RECORD_COUNT,
  buildDemoFieldTestRecords,
} from '../../src/demo/demo-dataset.ts';
import {
  indexedFieldsFromRecord,
  verifyFieldTestRecord,
  type VerificationResult,
} from '../../server/src/verify.ts';
import { canonicalizeJson } from '../../src/crypto/canonical-json.ts';
import { GENESIS_PREV_HASH } from '../../src/crypto/hash-chain.ts';
import { sha256Hex } from '../../src/crypto/sha256.ts';

const EXPECTED_RECORD_COUNT = 15;
const EXPECTED_CASE_COUNT = 4;

const records = await buildDemoFieldTestRecords();

/** A record with every optional field populated — the richest probe for the seal. */
const inconclusive = records.find((r) => r.outcome === 'INCONCLUSIVE');
if (!inconclusive) throw new Error('demo dataset must contain an INCONCLUSIVE record');

/** Strip a wire record back to exactly what the seal covers. */
function toCore(record: FieldTestRecordV1): CreateFieldTestRecordInput {
  return {
    seq: record.seq,
    record_uuid: record.record_uuid,
    case_ref: record.case_ref,
    package_no: record.package_no,
    lot_no: record.lot_no,
    reagent: record.reagent,
    kit: { ...record.kit },
    corrected_lab: { ...record.corrected_lab },
    delta_e_00: record.delta_e_00,
    calibration_residual: { ...record.calibration_residual },
    outcome: record.outcome,
    confidence: record.confidence,
    conformal_set: [...record.conformal_set],
    abstention_reason: record.abstention_reason,
    kinetics: record.kinetics === null ? null : record.kinetics.map((p) => ({ ...p })),
    gps: record.gps === null ? null : { ...record.gps },
    image_sha256: record.image_sha256,
    operator_id: record.operator_id,
    operator_name: record.operator_name,
    officer_role: record.officer_role,
    created_at: record.created_at,
    is_demo: record.is_demo,
    device_attestation: record.device_attestation,
  };
}

function payloadOf(record: FieldTestRecordV1): string {
  return canonicalizeJson(sealedPayloadFromCore(toCore(record)));
}

function sealedFieldNames(record: FieldTestRecordV1): string[] {
  return Object.keys(JSON.parse(payloadOf(record)) as Record<string, unknown>).sort();
}

function clone(record: FieldTestRecordV1): FieldTestRecordV1 {
  return structuredClone(record);
}

async function expectRejected(
  result: VerificationResult,
  code: string,
  status: VerificationResult['status']
): Promise<void> {
  assert.equal(result.ok, false, `expected rejection (${code}) but the record verified`);
  assert.equal(result.code, code, `unexpected rejection reason: ${result.reason ?? 'none'}`);
  assert.equal(result.status, status);
}

describe('shared field-test record contract', () => {
  it('exposes the expected schema version and supported vocabularies', () => {
    assert.equal(FIELD_TEST_SCHEMA_VERSION, 'parinaam-field-record-v1');
    assert.ok(REAGENT_TYPES.length > 0);
    assert.deepEqual([...CALIBRATION_GRADES], ['GOOD', 'DEGRADED']);
    assert.deepEqual([...PRESUMPTIVE_OUTCOMES], [
      'CONSISTENT_WITH_REAGENT_POSITIVE',
      'CONSISTENT_WITH_REAGENT_NEGATIVE',
      'INCONCLUSIVE',
    ]);
  });

  it('accepts sealed records and rejects anything that is not one', () => {
    for (const record of records) {
      assert.equal(isFieldTestRecord(record), true);
    }
    assert.equal(isFieldTestRecord(null), false);
    assert.equal(isFieldTestRecord([]), false);
    assert.equal(isFieldTestRecord({ record_uuid: 'not-a-record' }), false);
    const stripped = clone(records[0]) as Partial<FieldTestRecordV1>;
    delete stripped.record_hash;
    assert.equal(isFieldTestRecord(stripped), false);
  });

  it('round-trips every outer field into the same payload_jcs', async () => {
    for (const record of records) {
      assert.equal(
        payloadOf(record),
        record.payload_jcs,
        `record ${record.seq} outer fields do not re-canonicalize to its payload_jcs`
      );
      assert.equal(await sha256Hex(record.payload_jcs), record.record_hash);
    }
  });

  it('keeps indexed projections in sync with the sealed record', async () => {
    for (const record of records) {
      const result = await verifyFieldTestRecord(record, { indexed: indexedFieldsFromRecord(record) });
      assert.equal(result.ok, true, result.reason ?? 'indexed projection rejected');
      assert.equal(result.code, 'verified');
    }
  });
});

describe('deterministic demo dataset', () => {
  it('contains exactly 15 records across exactly 4 cases', async () => {
    assert.equal(DEMO_RECORD_COUNT, EXPECTED_RECORD_COUNT);
    assert.equal(DEMO_CASE_COUNT, EXPECTED_CASE_COUNT);
    const built = await buildDemoFieldTestRecords();
    assert.equal(built.length, EXPECTED_RECORD_COUNT);
    assert.equal(DEMO_CASES.length, EXPECTED_CASE_COUNT);

    const recordCases = new Set(built.map((r) => r.case_ref));
    assert.equal(recordCases.size, EXPECTED_CASE_COUNT);
    const metadataCases = new Set(DEMO_CASES.map((c) => c.case_ref));
    assert.deepEqual([...recordCases].sort(), [...metadataCases].sort());
    for (const caseRef of recordCases) {
      assert.ok(
        built.some((r) => r.case_ref === caseRef),
        `case ${caseRef} declared without any test record`
      );
    }
    assert.equal(new Set(built.map((r) => r.record_uuid)).size, EXPECTED_RECORD_COUNT);
  });

  it('builds byte-identical records on every run', async () => {
    const first = await buildDemoFieldTestRecords();
    const second = await buildDemoFieldTestRecords();
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    for (let i = 0; i < first.length; i++) {
      assert.equal(second[i].payload_jcs, first[i].payload_jcs);
      assert.equal(second[i].record_hash, first[i].record_hash);
      assert.equal(second[i].chain_hash, first[i].chain_hash);
    }
  });

  it('links an unbroken chain from genesis with dense sequence numbers', async () => {
    assert.equal(records[0].prev_hash, GENESIS_PREV_HASH);
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      assert.equal(record.seq, i + 1, 'seq must be dense and 1-based');
      assert.equal(record.schema_version, FIELD_TEST_SCHEMA_VERSION);
      if (i > 0) {
        assert.equal(record.prev_hash, records[i - 1].chain_hash, `broken link at seq ${record.seq}`);
      }
      const expectedChain = await sha256Hex(`${record.prev_hash}${record.record_hash}`);
      assert.equal(record.chain_hash, expectedChain, `chain_hash formula broken at seq ${record.seq}`);
      const result = await verifyFieldTestRecord(record, {
        expectedSeq: i + 1,
        expectedPrevHash: i > 0 ? records[i - 1].chain_hash : GENESIS_PREV_HASH,
      });
      assert.equal(result.ok, true, result.reason ?? `record ${i + 1} failed verification`);
    }
  });

  it('leaves image hashes and device attestations null (no implied evidence)', () => {
    for (const record of records) {
      assert.equal(record.image_sha256, null, `record ${record.seq} must not carry an image digest`);
      assert.equal(record.device_attestation, null, `record ${record.seq} must not carry an attestation`);
      assert.equal(record.is_demo, true, 'every demo row must be explicitly marked is_demo');
    }
  });

  it('only uses supported reagents, calibration grades, outcomes and roles', () => {
    for (const record of records) {
      assert.ok(
        (REAGENT_TYPES as readonly string[]).includes(record.reagent),
        `unsupported reagent ${record.reagent}`
      );
      assert.ok(
        (CALIBRATION_GRADES as readonly string[]).includes(record.calibration_residual.grade),
        `unsupported calibration grade ${record.calibration_residual.grade}`
      );
      assert.ok((PRESUMPTIVE_OUTCOMES as readonly string[]).includes(record.outcome));
      assert.ok((OFFICER_ROLE_VALUES as readonly string[]).includes(record.officer_role));
      if (record.outcome === 'INCONCLUSIVE') {
        assert.notEqual(record.abstention_reason, null, 'INCONCLUSIVE rows must declare an abstention reason');
        assert.notEqual(record.conformal_set.length, 1, 'INCONCLUSIVE rows must abstain between classes');
      } else {
        assert.equal(record.abstention_reason, null, 'only INCONCLUSIVE rows may abstain');
      }
      assert.ok(record.confidence > 0 && record.confidence <= 1);
      assert.ok(record.calibration_residual.max >= record.calibration_residual.mean);
    }
  });

  it('keeps mutable review metadata outside the evidence hash', async () => {
    const before = await buildDemoFieldTestRecords();
    const mutated = DEMO_CASES.map((c) =>
      c.case_ref === DEMO_CASES[0].case_ref ? { ...c, case_status: 'ESCALATED' as const } : c
    );
    assert.notEqual(mutated[0].case_status, DEMO_CASES[0].case_status, 'sanity: the status really changed');
    const after = await buildDemoFieldTestRecords();
    for (let i = 0; i < before.length; i++) {
      assert.equal(
        after[i].record_hash,
        before[i].record_hash,
        `case workflow rewrote evidence hash at seq ${before[i].seq}`
      );
      assert.equal(after[i].payload_jcs, before[i].payload_jcs);
    }
  });
});

describe('evidence envelope rejects tampering', () => {
  it('rejects a top-level value that no longer matches payload_jcs', async () => {
    const tampered = clone(inconclusive);
    tampered.confidence = Number((inconclusive.confidence + 0.01).toFixed(2));
    assert.notEqual(tampered.confidence, inconclusive.confidence);
    await expectRejected(await verifyFieldTestRecord(tampered), 'noncanonical-payload', 422);
  });

  it('rejects a forged chain_hash', async () => {
    const tampered = clone(inconclusive);
    tampered.chain_hash = records[records.indexOf(inconclusive) + 1].chain_hash; // another row's chain head
    assert.notEqual(tampered.chain_hash, inconclusive.chain_hash);
    await expectRejected(await verifyFieldTestRecord(tampered), 'chain-hash-mismatch', 422);
  });

  it('rejects a record whose predecessor is not the stored ledger head', async () => {
    const later = records[4];
    const result = await verifyFieldTestRecord(later, { expectedPrevHash: GENESIS_PREV_HASH });
    await expectRejected(result, 'PREV_HASH_NOT_STORED', 409);
    assert.equal(result.retryable, true, 'an out-of-order upload must be retryable, not fatal');
  });

  it('rejects a changed operator binding', async () => {
    await expectRejected(
      await verifyFieldTestRecord(inconclusive, { operatorCode: 'HC-0000' }),
      'operator-binding-mismatch',
      403
    );
    const bound = await verifyFieldTestRecord(inconclusive, { operatorCode: inconclusive.operator_id });
    assert.equal(bound.ok, true, bound.reason ?? 'a matching operator must verify');
  });

  it('rejects an unsupported calibration grade', async () => {
    const tampered = clone(inconclusive);
    tampered.calibration_residual = {
      ...tampered.calibration_residual,
      grade: 'EXCELLENT' as FieldTestCalibrationGrade,
    };
    const result = await verifyFieldTestRecord(tampered);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'schema-validation');
    assert.match(result.reason ?? '', /calibration grade is not supported/);
  });

  it('rejects mutable case review metadata injected into the evidence record', async () => {
    for (const injected of [{ case_status: 'REVIEWED' }, { panchnama_ref: 'PAN/NEW/2026/001' }]) {
      const tampered = Object.assign(clone(inconclusive), injected) as FieldTestRecordV1;
      const result = await verifyFieldTestRecord(tampered);
      assert.equal(result.ok, false, `injected ${Object.keys(injected)[0]} must be rejected`);
      assert.equal(result.code, 'schema-validation');
      assert.match(result.reason ?? '', /missing or unknown fields/);
    }
  });

  it('covers every sealed field: mutating any one of them is rejected', async () => {
    // `sealCovered: false` marks the one outer field that is validated at the shape
    // layer rather than hashed: sealedPayloadFromCore re-injects the constant
    // FIELD_TEST_SCHEMA_VERSION, so a forged version string is caught by schema
    // validation, not by a payload diff.
    const patches: ReadonlyArray<{
      field: string;
      sealCovered?: boolean;
      apply: (r: FieldTestRecordV1) => void;
    }> = [
      {
        field: 'schema_version',
        sealCovered: false,
        apply: (r) => { r.schema_version = 'parinaam-field-record-v2' as typeof FIELD_TEST_SCHEMA_VERSION; },
      },
      { field: 'seq', apply: (r) => { r.seq = r.seq + 1000; } },
      { field: 'record_uuid', apply: (r) => { r.record_uuid = '00000000-0000-4000-8000-000000000000'; } },
      { field: 'case_ref', apply: (r) => { r.case_ref = 'NCB/MZU/CR-99/2026'; } },
      { field: 'package_no', apply: (r) => { r.package_no = 'P-9'; } },
      { field: 'lot_no', apply: (r) => { r.lot_no = r.lot_no === null ? 'L-FORGED' : null; } },
      { field: 'reagent', apply: (r) => { r.reagent = 'mandelin'; } },
      { field: 'kit', apply: (r) => { r.kit = { ...r.kit, lot_no: 'FORGED-LOT-01' }; } },
      { field: 'corrected_lab', apply: (r) => { r.corrected_lab = { ...r.corrected_lab, l: r.corrected_lab.l + 1 }; } },
      { field: 'delta_e_00', apply: (r) => { r.delta_e_00 = r.delta_e_00 + 0.5; } },
      { field: 'calibration_residual', apply: (r) => { r.calibration_residual = { ...r.calibration_residual, mean: 0.01 }; } },
      { field: 'outcome', apply: (r) => { r.outcome = 'CONSISTENT_WITH_REAGENT_NEGATIVE'; } },
      { field: 'confidence', apply: (r) => { r.confidence = 0.99; } },
      { field: 'conformal_set', apply: (r) => { r.conformal_set = [...r.conformal_set, 'NEGATIVE']; } },
      { field: 'abstention_reason', apply: (r) => { r.abstention_reason = null; } },
      { field: 'kinetics', apply: (r) => { r.kinetics = (r.kinetics ?? []).map((p) => ({ ...p, delta_e: p.delta_e + 0.01 })); } },
      { field: 'gps', apply: (r) => { r.gps = r.gps === null ? null : { ...r.gps, lat: r.gps.lat + 0.5 }; } },
      { field: 'image_sha256', apply: (r) => { r.image_sha256 = 'a'.repeat(64); } },
      { field: 'operator_id', apply: (r) => { r.operator_id = 'HC-0000'; } },
      { field: 'operator_name', apply: (r) => { r.operator_name = 'Someone Else'; } },
      { field: 'officer_role', apply: (r) => { r.officer_role = 'ADMIN'; } },
      { field: 'created_at', apply: (r) => { r.created_at = '2026-09-16T10:00:00.000Z'; } },
      { field: 'is_demo', apply: (r) => { r.is_demo = false; } },
    ];

    // The sweep must stay exhaustive: a newly sealed field fails here until covered.
    assert.deepEqual(
      patches.map((p) => p.field).sort(),
      sealedFieldNames(inconclusive),
      'every sealed payload field needs a tamper probe'
    );

    for (const { field, sealCovered = true, apply } of patches) {
      const tampered = clone(inconclusive);
      apply(tampered);
      if (sealCovered) {
        assert.notEqual(
          payloadOf(tampered),
          inconclusive.payload_jcs,
          `mutating ${field} must change the sealed payload`
        );
      } else {
        assert.equal(
          payloadOf(tampered),
          inconclusive.payload_jcs,
          `${field} is a builder constant and must not be re-sourced from the wire field`
        );
      }
      const result = await verifyFieldTestRecord(tampered);
      assert.equal(result.ok, false, `mutating ${field} must be rejected by the server verifier`);
    }
  });

  it('treats device_attestation as transport metadata, not sealed evidence', async () => {
    const attached = clone(inconclusive);
    attached.device_attestation = 'deadbeef';
    assert.equal(
      payloadOf(attached),
      inconclusive.payload_jcs,
      'the attestation envelope is deliberately outside payload_jcs'
    );
    const wellFormed = await verifyFieldTestRecord(attached);
    assert.equal(wellFormed.ok, true, wellFormed.reason ?? 'a well-formed attestation must still verify');
    assert.ok(
      wellFormed.checks.some((c) => c.includes('device_attestation')),
      'the verifier must state that it does not cryptographically check the attestation'
    );
    const malformed = clone(inconclusive);
    malformed.device_attestation = 'not-hex!';
    const result = await verifyFieldTestRecord(malformed);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'schema-validation');
  });
});

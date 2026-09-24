/** Adapter from the app ledger's view model to the authoritative snake_case wire contract. */

import { canonicalizeJson } from '../crypto/canonical-json.ts';
import {
  OFFICER_ROLE_VALUES,
  sealedPayloadFromCore,
  type FieldTestOfficerRole,
  type FieldTestRecordV1,
} from '../contracts/field-test-record.ts';
import type { LedgerRecord } from '../state/ledger-store';

export type FieldTestRecord = FieldTestRecordV1;

export function toFieldTestRecord(record: LedgerRecord): FieldTestRecordV1 {
  if (!record.operatorName || !record.officerRole || !(OFFICER_ROLE_VALUES as readonly string[]).includes(record.officerRole)) {
    throw new Error('[permanent] record lacks bound operator identity');
  }
  if (record.residual.grade === 'REJECT') {
    throw new Error('[permanent] REJECT calibration cannot be transmitted as valid field evidence');
  }
  const payload = sealedPayloadFromCore({
    seq: record.seq,
    record_uuid: record.record_uuid,
    case_ref: record.case_ref,
    package_no: record.package_no,
    lot_no: record.lot_no ?? null,
    reagent: record.reagent,
    kit: {
      make: record.kit_make ?? null,
      test_name: record.kit_test_name ?? null,
      lot_no: record.kit_lot_no ?? null,
      expiry: record.kit_expiry ?? null,
    },
    corrected_lab: record.lab,
    delta_e_00: record.deltaE,
    calibration_residual: {
      mean: record.residual.meanDeltaE,
      max: record.residual.maxDeltaE,
      grade: record.residual.grade,
    },
    outcome: record.outcome,
    confidence: record.confidence,
    conformal_set: record.conformalSet,
    abstention_reason: record.abstentionReason ?? null,
    kinetics: record.kinetics?.length ? record.kinetics : null,
    gps: record.gps
      ? {
          lat: record.gps.lat,
          lon: record.gps.lon,
          accuracy_m: record.gps.accuracyM ?? null,
          mocked: record.gps.mocked,
        }
      : null,
    image_sha256: record.imageSha256 ?? null,
    operator_id: record.operator,
    operator_name: record.operatorName,
    officer_role: record.officerRole as FieldTestOfficerRole,
    created_at: record.created_at,
    is_demo: record.isDemo ?? false,
  });
  const payloadJcs = canonicalizeJson(payload);
  if (payloadJcs !== record.payloadJcs) {
    throw new Error('[permanent] sealed payload does not match the persisted outer record fields');
  }
  return {
    ...payload,
    payload_jcs: payloadJcs,
    record_hash: record.payloadSha256,
    prev_hash: record.prevHash,
    chain_hash: record.chainHash,
    device_attestation: record.deviceAttestation,
  };
}

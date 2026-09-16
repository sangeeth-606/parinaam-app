/**
 * FieldTestRecord wire adapter (v2 phase E; contract docs/v2-plan/04).
 *
 * Projects the app's richer LedgerRecord onto the backend FieldTestRecord shape.
 * Key properties the tests enforce:
 *  • record_hash = the chain's payload_sha256 = sha256(payload_jcs) — the server can
 *    recompute it (nothing here invents a new digest);
 *  • panchnama_ref rides along but is OUTSIDE the hashed payload (v2 §6);
 *  • outcome keeps the trilevel wire vocabulary (decision D1);
 *  • device_attestation is the signature hex or null — never a tier claim.
 */

import type { LedgerRecord } from '../state/ledger-store';

export interface FieldTestRecordWire {
  record_uuid: string;
  case_ref: string;
  panchnama_ref: string | null;
  package_no: string;
  lot_no: string | null;
  reagent: string;
  kit: { make: string | null; test_name: string | null; lot_no: string | null; expiry: string | null };
  corrected_lab: { l: number; a: number; b: number };
  delta_e_00: number;
  calibration_residual: { mean: number; max: number; grade: string };
  outcome: string;
  confidence: number;
  conformal_set: string[];
  abstention_reason: string | null;
  kinetics: KineticPointWire[] | null;
  gps: { lat: number; lon: number; accuracy_m: number | null; mocked: boolean } | null;
  image_ref: string | null;
  image_sha256: string | null;
  operator_id: string;
  operator_name: string | null;
  officer_role: string | null;
  created_at: string;
  payload_jcs: string;
  record_hash: string;
  prev_hash: string;
  chain_hash: string;
  device_attestation: string | null;
  is_demo?: boolean;
  sync_status_at_seal: string;
}

interface KineticPointWire {
  t_ms: number;
  delta_e: number;
}

export function toFieldTestRecord(rec: LedgerRecord): FieldTestRecordWire {
  return {
    record_uuid: rec.record_uuid,
    case_ref: rec.case_ref,
    panchnama_ref: rec.panchnama_ref ?? null,
    package_no: rec.package_no,
    lot_no: rec.lot_no ?? null,
    reagent: rec.reagent,
    kit: {
      make: rec.kit_make ?? null,
      test_name: rec.kit_test_name ?? null,
      lot_no: rec.kit_lot_no ?? null,
      expiry: rec.kit_expiry ?? null,
    },
    corrected_lab: { l: rec.lab.l, a: rec.lab.a, b: rec.lab.b },
    delta_e_00: rec.deltaE,
    calibration_residual: {
      mean: rec.residual.meanDeltaE,
      max: rec.residual.maxDeltaE,
      grade: rec.residual.grade,
    },
    outcome: rec.outcome,
    confidence: rec.confidence,
    conformal_set: rec.conformalSet,
    abstention_reason: rec.abstentionReason ?? null,
    kinetics: rec.kinetics && rec.kinetics.length
      ? rec.kinetics.map((k) => ({ t_ms: k.t_ms, delta_e: k.delta_e }))
      : null,
    gps: rec.gps
      ? { lat: rec.gps.lat, lon: rec.gps.lon, accuracy_m: rec.gps.accuracyM ?? null, mocked: rec.gps.mocked }
      : null,
    image_ref: rec.imageRef ?? null,
    image_sha256: rec.imageSha256 ?? null,
    operator_id: rec.operator,
    operator_name: rec.operatorName ?? null,
    officer_role: rec.officerRole ?? null,
    created_at: rec.created_at,
    payload_jcs: rec.payloadJcs,
    record_hash: rec.payloadSha256,
    prev_hash: rec.prevHash,
    chain_hash: rec.chainHash,
    device_attestation: rec.deviceAttestation,
    is_demo: rec.isDemo ?? false,
    sync_status_at_seal: rec.syncStatus,
  };
}

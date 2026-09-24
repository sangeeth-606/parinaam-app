/**
 * App adapter for the shared deterministic self-hosted demo dataset.
 * Server and app consume the same JCS/hash chain; no current-clock or random salt is
 * introduced into evidence records.
 */

import { buildDemoFieldTestRecords, type DemoCaseMetadata } from '../demo/demo-dataset.ts';
import type { LedgerRecord } from '../state/ledger-store.ts';

export type LedgerSeed = LedgerRecord;

function coreFromDemo(record: Awaited<ReturnType<typeof buildDemoFieldTestRecords>>[number]): Omit<
  LedgerRecord,
  | 'seq'
  | 'payloadJcs'
  | 'payloadSha256'
  | 'prevHash'
  | 'chainHash'
  | 'deviceAttestation'
  | 'sealState'
  | 'syncStatus'
  | 'panchnama_ref'
> & { panchnama_ref?: string } {
  return {
    record_uuid: record.record_uuid,
    case_ref: record.case_ref,
    package_no: record.package_no,
    lot_no: record.lot_no ?? undefined,
    reagent: record.reagent,
    kit_test_name: record.kit.test_name ?? undefined,
    kit_make: record.kit.make ?? undefined,
    kit_lot_no: record.kit.lot_no ?? undefined,
    kit_expiry: record.kit.expiry ?? undefined,
    lab: record.corrected_lab,
    residual: {
      meanDeltaE: record.calibration_residual.mean,
      maxDeltaE: record.calibration_residual.max,
      grade: record.calibration_residual.grade,
    },
    outcome: record.outcome,
    confidence: record.confidence,
    deltaE: record.delta_e_00,
    conformalSet: record.conformal_set,
    abstentionReason: record.abstention_reason,
    created_at: record.created_at,
    operator: record.operator_id,
    operatorName: record.operator_name ?? undefined,
    officerRole: record.officer_role,
    isDemo: true,
    kinetics: record.kinetics ?? undefined,
    gps: record.gps
      ? {
          lat: record.gps.lat,
          lon: record.gps.lon,
          accuracyM: record.gps.accuracy_m ?? undefined,
          mocked: record.gps.mocked,
        }
      : undefined,
    imageRef: null,
    imageSha256: record.image_sha256,
  };
}

export async function seedLedgerRecords(): Promise<LedgerSeed[]> {
  const wireRecords = await buildDemoFieldTestRecords();
  const cases = new Map<string, DemoCaseMetadata>(
    (await import('../demo/demo-dataset.ts')).DEMO_CASES.map((entry) => [entry.case_ref, entry]),
  );
  return wireRecords.map((record) => ({
    ...coreFromDemo(record),
    panchnama_ref: cases.get(record.case_ref)?.panchnama_ref ?? undefined,
    seq: record.seq,
    payloadJcs: record.payload_jcs,
    payloadSha256: record.record_hash,
    prevHash: record.prev_hash,
    chainHash: record.chain_hash,
    deviceAttestation: record.device_attestation,
    sealState: 'UNATTESTED',
    syncStatus: 'demo-seed',
  }));
}

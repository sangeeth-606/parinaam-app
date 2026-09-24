/**
 * One deterministic, synthetic dataset shared by the officer app and API seed.
 *
 * No real evidence, substance identity, image bytes, or device attestation is implied.
 * Every row is explicitly marked is_demo and is suitable only for local demonstration.
 */

import {
  createFieldTestRecord,
  type FieldTestOfficerRole,
  type FieldTestOutcome,
  type FieldTestRecordV1,
  type FieldTestAbstentionReason,
  type FieldTestCalibrationGrade,
} from '../contracts/field-test-record.ts';
import { GENESIS_PREV_HASH } from '../crypto/hash-chain.ts';
import type { ReagentType } from '../types/domain.ts';

export const DEMO_DATASET_VERSION = 'self-hosted-demo-v1' as const;
export const PRESUMPTIVE_DISCLAIMER =
  'Presumptive result only — not a substitute for laboratory confirmatory testing.' as const;

export interface DemoCaseStatusEvent {
  from: 'REPORTED' | 'UNDER_REVIEW' | 'REVIEWED' | 'ESCALATED';
  to: 'REPORTED' | 'UNDER_REVIEW' | 'REVIEWED' | 'ESCALATED';
  actor: string;
  at: string;
  note: string;
}

export interface DemoCaseMetadata {
  case_ref: string;
  region: string;
  department: string;
  location_label: string;
  panchnama_ref: string | null;
  case_status: 'REPORTED' | 'UNDER_REVIEW' | 'REVIEWED' | 'ESCALATED';
  history: DemoCaseStatusEvent[];
}

interface DemoRecordSpec {
  uuid: string;
  case_ref: string;
  package_no: string;
  lot_no: string | null;
  reagent: ReagentType;
  kit_make: string;
  kit_test_name: string;
  kit_lot_no: string;
  kit_expiry: string;
  lab: { l: number; a: number; b: number };
  delta_e: number;
  residual: { mean: number; max: number; grade: FieldTestCalibrationGrade };
  outcome: FieldTestOutcome;
  confidence: number;
  conformal_set: string[];
  abstention_reason?: FieldTestAbstentionReason;
  kinetics: { t_ms: number; delta_e: number }[];
  gps: { lat: number; lon: number; accuracy_m: number; mocked: boolean };
  operator_id: string;
  operator_name: string;
  officer_role: FieldTestOfficerRole;
  created_at: string;
}

function kinetics(delta: number): { t_ms: number; delta_e: number }[] {
  return [
    { t_ms: 0, delta_e: 0.2 },
    { t_ms: 5_000, delta_e: Number((delta * 0.18).toFixed(2)) },
    { t_ms: 15_000, delta_e: Number((delta * 0.68).toFixed(2)) },
    { t_ms: 30_000, delta_e: delta },
  ];
}

const DZU_GPS = { lat: 28.5562, lon: 77.0999, accuracy_m: 5.2, mocked: false };
const MZU_GPS = { lat: 18.9438, lon: 72.8354, accuracy_m: 6.8, mocked: false };
const KZU_GPS = { lat: 22.5831, lon: 88.3426, accuracy_m: 4.8, mocked: false };
const BZU_GPS = { lat: 12.8452, lon: 77.6602, accuracy_m: 3.9, mocked: true };

const RECORD_SPECS: DemoRecordSpec[] = [
  ...[1, 2, 3, 4, 5].map((n) => ({
    uuid: `a3f19c20-7d41-4b02-9e58-1c6d2f70ab1${n}`,
    case_ref: 'NCB/DZU/CR-14/2026',
    package_no: `P-${n}`,
    lot_no: n <= 3 ? 'L-14A' : null,
    reagent: 'marquis' as const,
    kit_make: 'Sirchie',
    kit_test_name: 'NARK II',
    kit_lot_no: 'MK-24B-118',
    kit_expiry: '2027-04-30',
    lab: { l: Number((19.4 + n * 0.18).toFixed(2)), a: Number((16.2 + n * 0.1).toFixed(2)), b: Number((-12.4 - n * 0.08).toFixed(2)) },
    delta_e: Number((1.8 + n * 0.15).toFixed(2)),
    residual: { mean: 0.82, max: 1.46, grade: 'GOOD' as const },
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE' as const,
    confidence: n === 5 ? 0.95 : 0.97,
    conformal_set: ['POSITIVE'],
    kinetics: kinetics(Number((1.8 + n * 0.15).toFixed(2))),
    gps: DZU_GPS,
    operator_id: 'HC-4412',
    operator_name: 'Head Constable R. Sharma',
    officer_role: 'SENIOR' as const,
    created_at: `2026-09-14T09:${String(10 + n).padStart(2, '0')}:00.000Z`,
  })),
  {
    uuid: 'd41b6620-8f03-4a2b-90ce-5b2f7a9133dd', case_ref: 'NCB/MZU/CR-02/2026', package_no: 'P-1', lot_no: 'L-02A',
    reagent: 'duquenois_levine', kit_make: 'Anchor', kit_test_name: 'Field Kit DQL', kit_lot_no: 'AD-25C-031', kit_expiry: '2027-02-28',
    lab: { l: 33.6, a: 4.8, b: 2.1 }, delta_e: 4.2, residual: { mean: 1.18, max: 2.04, grade: 'DEGRADED' },
    outcome: 'INCONCLUSIVE', confidence: 0.54, conformal_set: ['POSITIVE', 'NEGATIVE'], abstention_reason: 'low_margin', kinetics: kinetics(4.2), gps: MZU_GPS,
    operator_id: 'IC-9007', operator_name: 'Intelligence Officer S. Gill', officer_role: 'JUNIOR', created_at: '2026-09-15T11:05:00.000Z',
  },
  {
    uuid: 'c92e77f0-15ba-4d84-a2c6-3e08f1d547aa', case_ref: 'NCB/MZU/CR-02/2026', package_no: 'P-2', lot_no: 'L-02B',
    reagent: 'scott', kit_make: 'Sirchie', kit_test_name: 'NARK II', kit_lot_no: 'MK-24B-118', kit_expiry: '2027-04-30',
    lab: { l: 55.2, a: 0.9, b: -1.2 }, delta_e: 1.4, residual: { mean: 0.76, max: 1.31, grade: 'GOOD' },
    outcome: 'CONSISTENT_WITH_REAGENT_NEGATIVE', confidence: 0.95, conformal_set: ['NEGATIVE'], kinetics: kinetics(1.4), gps: MZU_GPS,
    operator_id: 'IC-9007', operator_name: 'Intelligence Officer S. Gill', officer_role: 'JUNIOR', created_at: '2026-09-15T11:20:00.000Z',
  },
  {
    uuid: 'e07c9a34-2d1f-46b8-8a70-0c5e39bd61f2', case_ref: 'NCB/MZU/CR-02/2026', package_no: 'P-3', lot_no: null,
    reagent: 'mecke', kit_make: 'Anchor', kit_test_name: 'Field Kit MK', kit_lot_no: 'AM-25C-077', kit_expiry: '2027-05-15',
    lab: { l: 22.8, a: 1.2, b: -8.4 }, delta_e: 2.1, residual: { mean: 0.91, max: 1.62, grade: 'GOOD' },
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE', confidence: 0.93, conformal_set: ['POSITIVE'], kinetics: kinetics(2.1), gps: { ...MZU_GPS, mocked: true },
    operator_id: 'IC-9007', operator_name: 'Intelligence Officer S. Gill', officer_role: 'JUNIOR', created_at: '2026-09-15T11:45:00.000Z',
  },
  {
    uuid: 'f5e32110-3a12-4c89-b789-7e12f45a0001', case_ref: 'NCB/KZU/CR-07/2026', package_no: 'P-1', lot_no: 'L-07A',
    reagent: 'mandelin', kit_make: 'Sirchie', kit_test_name: 'NARK II', kit_lot_no: 'MK-25A-201', kit_expiry: '2027-08-15',
    lab: { l: 24.1, a: -4.2, b: 18.5 }, delta_e: 2.0, residual: { mean: 0.88, max: 1.55, grade: 'GOOD' },
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE', confidence: 0.96, conformal_set: ['POSITIVE'], kinetics: kinetics(2), gps: KZU_GPS,
    operator_id: 'SI-5521', operator_name: 'Sub-Inspector A. Mukherjee', officer_role: 'SENIOR', created_at: '2026-09-12T07:45:00.000Z',
  },
  {
    uuid: 'f5e32110-3a12-4c89-b789-7e12f45a0002', case_ref: 'NCB/KZU/CR-07/2026', package_no: 'P-2', lot_no: 'L-07A',
    reagent: 'mandelin', kit_make: 'Sirchie', kit_test_name: 'NARK II', kit_lot_no: 'MK-25A-201', kit_expiry: '2027-08-15',
    lab: { l: 24.5, a: -4, b: 18.2 }, delta_e: 2.3, residual: { mean: 0.93, max: 1.67, grade: 'GOOD' },
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE', confidence: 0.94, conformal_set: ['POSITIVE'], kinetics: kinetics(2.3), gps: KZU_GPS,
    operator_id: 'SI-5521', operator_name: 'Sub-Inspector A. Mukherjee', officer_role: 'SENIOR', created_at: '2026-09-12T08:00:00.000Z',
  },
  {
    uuid: 'f5e32110-3a12-4c89-b789-7e12f45a0003', case_ref: 'NCB/KZU/CR-07/2026', package_no: 'P-3', lot_no: null,
    reagent: 'marquis', kit_make: 'Sirchie', kit_test_name: 'NARK II', kit_lot_no: 'MK-24B-118', kit_expiry: '2027-04-30',
    lab: { l: 18.9, a: 15.8, b: -11.9 }, delta_e: 1.6, residual: { mean: 0.81, max: 1.42, grade: 'GOOD' },
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE', confidence: 0.98, conformal_set: ['POSITIVE'], kinetics: kinetics(1.6), gps: KZU_GPS,
    operator_id: 'SI-5521', operator_name: 'Sub-Inspector A. Mukherjee', officer_role: 'SENIOR', created_at: '2026-09-12T08:20:00.000Z',
  },
  {
    uuid: 'f5e32110-3a12-4c89-b789-7e12f45a0004', case_ref: 'NCB/KZU/CR-07/2026', package_no: 'P-4', lot_no: null,
    reagent: 'marquis', kit_make: 'Sirchie', kit_test_name: 'NARK II', kit_lot_no: 'MK-24B-118', kit_expiry: '2027-04-30',
    lab: { l: 19.2, a: 16.1, b: -12.2 }, delta_e: 1.7, residual: { mean: 0.85, max: 1.48, grade: 'GOOD' },
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE', confidence: 0.97, conformal_set: ['POSITIVE'], kinetics: kinetics(1.7), gps: KZU_GPS,
    operator_id: 'SI-5521', operator_name: 'Sub-Inspector A. Mukherjee', officer_role: 'SENIOR', created_at: '2026-09-12T08:40:00.000Z',
  },
  ...[1, 2, 3].map((n) => ({
    uuid: `b78a9c40-1e54-4f90-8801-44aa00bb11${String(n).padStart(2, '0')}`,
    case_ref: 'NCB/BZU/CR-19/2026',
    package_no: `P-${n}`,
    lot_no: n === 1 ? 'L-19A' : null,
    reagent: 'marquis' as const,
    kit_make: 'Anchor',
    kit_test_name: 'Field Kit MK',
    kit_lot_no: 'AM-25C-082',
    kit_expiry: '2027-06-30',
    lab: { l: Number((48.2 + n * 0.4).toFixed(2)), a: Number((28.5 - n * 0.3).toFixed(2)), b: Number((42.1 - n * 0.3).toFixed(2)) },
    delta_e: Number((1.9 + n * 0.1).toFixed(2)),
    residual: { mean: 0.84, max: 1.49, grade: 'GOOD' as const },
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE' as const,
    confidence: Number((0.98 - n * 0.005).toFixed(3)),
    conformal_set: ['POSITIVE'],
    kinetics: kinetics(Number((1.9 + n * 0.1).toFixed(2))),
    gps: BZU_GPS,
    operator_id: 'INSP-1044',
    operator_name: 'Inspector V. Rao',
    officer_role: 'SENIOR' as const,
    created_at: `2026-09-15T13:${String(41 + n * 5).padStart(2, '0')}:00.000Z`,
  })),
];

export const DEMO_CASES: readonly DemoCaseMetadata[] = [
  {
    case_ref: 'NCB/DZU/CR-14/2026', region: 'DZU', department: 'NCB', location_label: 'Delhi air cargo complex', panchnama_ref: 'PAN/DZU/2026/884', case_status: 'UNDER_REVIEW',
    history: [{ from: 'REPORTED', to: 'UNDER_REVIEW', actor: 'supervisor', at: '2026-09-14T14:30:00.000Z', note: 'Synthetic demo workflow marker assigned for supervisor review; no confirmatory laboratory conclusion is recorded.' }],
  },
  {
    case_ref: 'NCB/MZU/CR-02/2026', region: 'MZU', department: 'NCB', location_label: 'JNPT parcel receiving area', panchnama_ref: 'PAN/MZU/2026/091', case_status: 'REPORTED', history: [],
  },
  {
    case_ref: 'NCB/KZU/CR-07/2026', region: 'KZU', department: 'NCB', location_label: 'Kolkata railway parcel office', panchnama_ref: 'PAN/KZU/2026/312', case_status: 'REVIEWED',
    history: [
      { from: 'REPORTED', to: 'UNDER_REVIEW', actor: 'supervisor', at: '2026-09-12T16:00:00.000Z', note: 'Synthetic demo review opened after four package test events were received.' },
      { from: 'UNDER_REVIEW', to: 'REVIEWED', actor: 'admin', at: '2026-09-13T11:30:00.000Z', note: 'Synthetic demo workflow review completed; this marker is not a statutory disposal or laboratory certificate.' },
    ],
  },
  {
    case_ref: 'NCB/BZU/CR-19/2026', region: 'BZU', department: 'NCB', location_label: 'Bengaluru courier hub', panchnama_ref: 'PAN/BZU/2026/505', case_status: 'ESCALATED',
    history: [
      { from: 'REPORTED', to: 'UNDER_REVIEW', actor: 'supervisor', at: '2026-09-15T17:30:00.000Z', note: 'Synthetic demo case routed for additional supervisory review.' },
      { from: 'UNDER_REVIEW', to: 'ESCALATED', actor: 'supervisor', at: '2026-09-16T08:00:00.000Z', note: 'Synthetic demo escalation marker; no external agency transfer is represented.' },
    ],
  },
];

export async function buildDemoFieldTestRecords(): Promise<FieldTestRecordV1[]> {
  const records: FieldTestRecordV1[] = [];
  let prevHash = GENESIS_PREV_HASH;
  const orderedSpecs = [...RECORD_SPECS].sort((left, right) =>
    left.created_at.localeCompare(right.created_at) || left.uuid.localeCompare(right.uuid)
  );
  for (const spec of orderedSpecs) {
    const record = await createFieldTestRecord(
      {
        seq: records.length + 1,
        record_uuid: spec.uuid,
        case_ref: spec.case_ref,
        package_no: spec.package_no,
        lot_no: spec.lot_no,
        reagent: spec.reagent,
        kit: { make: spec.kit_make, test_name: spec.kit_test_name, lot_no: spec.kit_lot_no, expiry: spec.kit_expiry },
        corrected_lab: spec.lab,
        delta_e_00: spec.delta_e,
        calibration_residual: spec.residual,
        outcome: spec.outcome,
        confidence: spec.confidence,
        conformal_set: spec.conformal_set,
        abstention_reason: spec.abstention_reason ?? null,
        kinetics: spec.kinetics,
        gps: spec.gps,
        image_sha256: null,
        operator_id: spec.operator_id,
        operator_name: spec.operator_name,
        officer_role: spec.officer_role,
        created_at: spec.created_at,
        is_demo: true,
        device_attestation: null,
      },
      prevHash
    );
    records.push(record);
    prevHash = record.chain_hash;
  }
  return records;
}

export const DEMO_RECORD_COUNT = RECORD_SPECS.length;
export const DEMO_CASE_COUNT = DEMO_CASES.length;

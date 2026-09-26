/**
 * Parinaam — Domain Types & Database Entities
 * Governed by spec/data-model.md and legal constraints in spec/legal-constraints.md.
 */

export type ReagentType =
  | 'marquis'
  | 'mecke'
  | 'mandelin'
  | 'scott'
  | 'duquenois_levine'
  | 'simons'
  | 'ehrlich'
  | 'nitric_acid'
  | 'ferric_chloride';

export type KitEntryMethod = 'ocr' | 'manual';
export type SecurityLevel = 'StrongBox' | 'TrustedEnvironment' | 'Software';
export type CalibrationGrade = 'GOOD' | 'DEGRADED';
export type AbstentionReason = 'low_margin' | 'novelty_ood' | 'calibration_failed';

export type PresumptiveOutcomeKind =
  | 'CONSISTENT_WITH_REAGENT_POSITIVE'
  | 'CONSISTENT_WITH_REAGENT_NEGATIVE'
  | 'INCONCLUSIVE';

export type PresumptiveOutcome =
  | {
      kind: 'CONSISTENT_WITH_REAGENT_POSITIVE';
      reagent: ReagentType;
      confidence: number;
      deltaE: number;
    }
  | {
      kind: 'CONSISTENT_WITH_REAGENT_NEGATIVE';
      reagent: ReagentType;
      confidence: number;
      deltaE: number;
    }
  | {
      kind: 'INCONCLUSIVE';
      reagent: ReagentType;
      reason: AbstentionReason;
      detail?: string;
    };

export interface KineticPoint {
  t_ms: number;
  delta_e: number;
}

export interface TestRecordEntity {
  seq?: number;
  record_uuid: string;

  // Case & Rule 10 Numbering (NDPS Rules 2022 Rule 10)
  case_ref?: string;
  panchnama_ref?: string;
  package_no: string; // P-1 .. P-n
  lot_no?: string;    // L-1 .. L-n
  sample_orig_no?: string; // SO-n
  sample_dup_no?: string;  // SD-n

  // Kit Data
  kit_make?: string;
  kit_test_name?: string;
  kit_lot_no?: string;
  reagent: ReagentType;
  kit_entry_method: KitEntryMethod;

  // Colorimetry
  corrected_lab_l: number;
  corrected_lab_a: number;
  corrected_lab_b: number;
  calib_residual_mean: number;
  calib_residual_max: number;
  calib_grade: CalibrationGrade;
  card_version: string;
  card_print_batch?: string;
  card_is_self_printed: 0 | 1;
  meas_covariance: string; // JSON: number[][]
  delta_e_trajectory?: string; // JSON: KineticPoint[]

  // Outcome
  outcome: PresumptiveOutcomeKind;
  confidence: number;
  conformal_set: string; // JSON: string[]
  abstention_reason?: AbstentionReason | null;

  // Provenance
  operator_id: string;
  biometric_ok: 0 | 1;
  device_model: string;
  device_serial?: string;
  security_level: SecurityLevel;
  attestation_chain?: string; // JSON: string[]
  play_integrity?: string;

  // Geolocation & Telemetry
  gps_lat?: number;
  gps_lon?: number;
  gps_accuracy_m?: number;
  gps_mocked: 0 | 1;
  mock_provider_flag: 0 | 1;
  root_detected: 0 | 1;
  dev_settings_on: 0 | 1;

  // Clocks
  device_clock_iso: string;
  ntp_corrected_iso?: string;
  gnss_time_iso?: string;
  tz_offset_min: number;
  clock_divergence_ms?: number;

  // Integrity & Hash Chain
  image_sha256: string | null; // v2-F: honest absence beats substitution (export-flow fabrication killed)
  video_sha256?: string;
  seal_image_sha256?: string;
  seal_count?: number;
  seal_inscription?: string;
  payload_jcs: string;
  payload_sha256: string;
  prev_hash: string;
  chain_hash: string;
  /**
   * null when no device key attested the record. The migration and the wire contract both
   * allow NULL (app-migrations.ts, FieldTestRecordV1) and the ledger genuinely stores null
   * whenever the keystore could not run — typing this as `string` used to force consumers
   * to invent a sentinel string for "no seal", which is exactly the claim rule 10 forbids.
   */
  device_attestation: string | null;
  rfc3161_token?: string;
  esign_pkcs7?: string;

  created_at: string;
}

export interface AuditLogEntity {
  id?: number;
  record_uuid?: string;
  actor: string;
  action: 'view' | 'export' | 'print' | 'sync';
  at: string;
  detail?: string;
}

export interface SyncQueueEntity {
  id?: number;
  record_uuid: string;
  idempotency_key: string;
  attempts: number;
  next_attempt_at?: string;
  last_error?: string;
}

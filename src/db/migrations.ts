/**
 * Parinaam — Database Migrations
 * Bootstraps schema tables, triggers, and virtual tables.
 */

export const MIGRATION_V1_SQL = `
CREATE TABLE IF NOT EXISTS test_record (
  seq                 INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uuid         TEXT NOT NULL UNIQUE,

  -- Statutory Case Linkage (NDPS Rules 2022 Rule 10 Numbering)
  case_ref            TEXT,
  panchnama_ref       TEXT,
  package_no          TEXT NOT NULL,
  lot_no              TEXT,
  sample_orig_no      TEXT,
  sample_dup_no       TEXT,

  -- Kit & Reagent Metadata
  kit_make            TEXT,
  kit_test_name       TEXT,
  kit_lot_no          TEXT,
  reagent             TEXT NOT NULL,
  kit_entry_method    TEXT NOT NULL,

  -- Scientific Colorimetry & Residuals
  corrected_lab_l     REAL NOT NULL,
  corrected_lab_a     REAL NOT NULL,
  corrected_lab_b     REAL NOT NULL,
  calib_residual_mean REAL NOT NULL,
  calib_residual_max  REAL NOT NULL,
  calib_grade         TEXT NOT NULL,
  card_version        TEXT NOT NULL,
  card_print_batch    TEXT,
  card_is_self_printed INTEGER NOT NULL,
  meas_covariance     TEXT NOT NULL,
  delta_e_trajectory  TEXT,

  -- Presumptive Outcome
  outcome             TEXT NOT NULL,
  confidence          REAL NOT NULL,
  conformal_set       TEXT NOT NULL,
  abstention_reason   TEXT,

  -- Officer & Hardware Provenance
  operator_id         TEXT NOT NULL,
  biometric_ok        INTEGER NOT NULL,
  device_model        TEXT NOT NULL,
  device_serial       TEXT,
  security_level      TEXT NOT NULL,
  attestation_chain   TEXT,
  play_integrity      TEXT,

  -- Geolocation & Anti-Spoofing Telemetry
  gps_lat             REAL,
  gps_lon             REAL,
  gps_accuracy_m      REAL,
  gps_mocked          INTEGER NOT NULL,
  mock_provider_flag  INTEGER NOT NULL,
  root_detected       INTEGER NOT NULL,
  dev_settings_on     INTEGER NOT NULL,

  -- Quadruple Independent Clocks
  device_clock_iso    TEXT NOT NULL,
  ntp_corrected_iso   TEXT,
  gnss_time_iso       TEXT,
  tz_offset_min       INTEGER NOT NULL,
  clock_divergence_ms INTEGER,

  -- Cryptographic Integrity & Hash Chain
  image_sha256        TEXT NOT NULL,
  video_sha256        TEXT,
  seal_image_sha256   TEXT,
  seal_count          INTEGER,
  seal_inscription    TEXT,
  payload_jcs         TEXT NOT NULL,
  payload_sha256      TEXT NOT NULL,
  prev_hash           TEXT NOT NULL,
  chain_hash          TEXT NOT NULL,
  device_attestation  TEXT NOT NULL,
  rfc3161_token       TEXT,
  esign_pkcs7         TEXT,

  created_at          TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS test_record_no_update BEFORE UPDATE ON test_record
BEGIN 
  SELECT RAISE(ABORT, 'test_record table is append-only: UPDATE disallowed'); 
END;

CREATE TRIGGER IF NOT EXISTS test_record_no_delete BEFORE DELETE ON test_record
BEGIN 
  SELECT RAISE(ABORT, 'test_record table is append-only: DELETE disallowed'); 
END;

CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uuid  TEXT,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,
  at           TEXT NOT NULL,
  detail       TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uuid     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error      TEXT
);
`;

export const MIGRATION_FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS record_fts USING fts5(
  record_uuid UNINDEXED,
  case_ref,
  panchnama_ref,
  package_no,
  kit_test_name,
  reagent,
  outcome
);
`;

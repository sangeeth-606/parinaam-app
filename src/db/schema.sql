-- Parinaam Append-Only SQLite Database Schema
-- Conforms to spec/data-model.md

CREATE TABLE IF NOT EXISTS test_record (
  seq                 INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uuid         TEXT NOT NULL UNIQUE,

  -- Statutory Case Linkage (NDPS Rules 2022 Rule 10 Numbering)
  case_ref            TEXT,
  panchnama_ref       TEXT,
  package_no          TEXT NOT NULL,        -- P-1 .. P-n
  lot_no              TEXT,                 -- L-1 .. L-n
  sample_orig_no      TEXT,                 -- SO-n (Statutory Sample Original)
  sample_dup_no       TEXT,                 -- SD-n (Statutory Sample Duplicate)

  -- Kit & Reagent Metadata
  kit_make            TEXT,
  kit_test_name       TEXT,                 -- e.g., "NIK Test A - Marquis"
  kit_lot_no          TEXT,
  reagent             TEXT NOT NULL,
  kit_entry_method    TEXT NOT NULL,        -- 'ocr' | 'manual'

  -- Scientific Colorimetry & Residuals
  corrected_lab_l     REAL NOT NULL,
  corrected_lab_a     REAL NOT NULL,
  corrected_lab_b     REAL NOT NULL,
  calib_residual_mean REAL NOT NULL,        -- THE MASTER GATE (Leave-one-out mean ΔE00)
  calib_residual_max  REAL NOT NULL,
  calib_grade         TEXT NOT NULL,        -- 'GOOD' | 'DEGRADED'
  card_version        TEXT NOT NULL,
  card_print_batch    TEXT,
  card_is_self_printed INTEGER NOT NULL,    -- 1 if self-printed, 0 if certified batch
  meas_covariance     TEXT NOT NULL,        -- JSON string of Σ_meas matrix from frame burst
  delta_e_trajectory  TEXT,                 -- JSON array of [{t_ms, delta_e}] for kinetics

  -- Presumptive Outcome (Strict Vocabulary)
  outcome             TEXT NOT NULL,        -- 'CONSISTENT_WITH_REAGENT_POSITIVE' | ..._NEGATIVE | 'INCONCLUSIVE'
  confidence          REAL NOT NULL,        -- Conformal/QDA confidence (0.0 to 1.0)
  conformal_set       TEXT NOT NULL,        -- JSON array of candidate class strings
  abstention_reason   TEXT,                 -- 'low_margin' | 'novelty_ood' | 'calibration_failed' | NULL

  -- Officer & Hardware Provenance
  operator_id         TEXT NOT NULL,
  biometric_ok        INTEGER NOT NULL,
  device_model        TEXT NOT NULL,
  device_serial       TEXT,
  security_level      TEXT NOT NULL,        -- 'StrongBox' | 'TrustedEnvironment' | 'Software'
  attestation_chain   TEXT,                 -- JSON array of base64-encoded X.509 certificates
  play_integrity      TEXT,

  -- Geolocation & Anti-Spoofing Telemetry
  gps_lat             REAL,
  gps_lon             REAL,
  gps_accuracy_m      REAL,
  gps_mocked          INTEGER NOT NULL,     -- 1 if expo-location coords.mocked is true
  mock_provider_flag  INTEGER NOT NULL,     -- 1 if MockLocationProvider detected
  root_detected       INTEGER NOT NULL,     -- 1 if JailMonkey root detected
  dev_settings_on     INTEGER NOT NULL,

  -- Quadruple Independent Clocks (Divergence Tracking)
  device_clock_iso    TEXT NOT NULL,
  ntp_corrected_iso   TEXT,
  gnss_time_iso       TEXT,
  tz_offset_min       INTEGER NOT NULL,
  clock_divergence_ms INTEGER,

  -- Cryptographic Integrity & Hash Chain
  image_sha256        TEXT NOT NULL,        -- SHA-256 of raw image file
  video_sha256        TEXT,                 -- SHA-256 of reaction kinetics video
  seal_image_sha256   TEXT,                 -- SHA-256 of package seal impression photo
  seal_count          INTEGER,              -- Specifically litigated fact in NDPS trials
  seal_inscription    TEXT,
  payload_jcs         TEXT NOT NULL,        -- RFC 8785 Canonical JSON representation
  payload_sha256      TEXT NOT NULL,        -- SHA-256 of payload_jcs
  prev_hash           TEXT NOT NULL,        -- Previous record's chain_hash (or genesis)
  chain_hash          TEXT NOT NULL,        -- SHA256(prev_hash || payload_sha256)
  device_attestation  TEXT NOT NULL,        -- Attestation signature over chain_hash
  rfc3161_token       TEXT,                 -- Time Stamping Authority token (if online)
  esign_pkcs7         TEXT,

  created_at          TEXT NOT NULL
);

-- STRICT APPEND-ONLY TRIGGERS: Prevent any mutation or deletion
CREATE TRIGGER IF NOT EXISTS test_record_no_update BEFORE UPDATE ON test_record
BEGIN 
  SELECT RAISE(ABORT, 'test_record table is append-only: UPDATE disallowed'); 
END;

CREATE TRIGGER IF NOT EXISTS test_record_no_delete BEFORE DELETE ON test_record
BEGIN 
  SELECT RAISE(ABORT, 'test_record table is append-only: DELETE disallowed'); 
END;

-- Audit Logging Table
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uuid  TEXT,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,               -- 'view' | 'export' | 'print' | 'sync'
  at           TEXT NOT NULL,
  detail       TEXT
);

-- Offline Outbox Sync Queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uuid     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error      TEXT,
  dead_lettered_at TEXT
);

-- Full-Text Search Table (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS record_fts USING fts5(
  record_uuid UNINDEXED,
  case_ref,
  panchnama_ref,
  package_no,
  kit_test_name,
  reagent,
  outcome
);

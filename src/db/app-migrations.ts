/**
 * V2 app schema (phase C) — the REAL shape the officer app produces today, persisted.
 *
 * Deliberately NOT the aspirational spec/data-model.md table (which stays covered by
 * tests/db/schema-triggers.test.ts): a schema with 20 NOT NULL columns the app cannot
 * honestly fill would force fabricated values (AGENTS rule-10 culture). Every column
 * here maps to a live LedgerRecord field; new v2 fields (kit_expiry, image_ref,
 * image_sha256, officer identity) are included so later phases don't re-migrate.
 *
 * Immutability (rule 2): UPDATE/DELETE on field_test raise ABORT. Mutable sync state
 * lives in sync_queue / synced_record; key/value prefs in app_state. FTS5 keeps a
 * search mirror via INSERT triggers (allowed — the base row never changes).
 */

export const MIGRATION_APP_V1 = `
CREATE TABLE IF NOT EXISTS field_test (
  seq                 INTEGER NOT NULL,
  record_uuid         TEXT PRIMARY KEY NOT NULL UNIQUE,

  case_ref            TEXT NOT NULL,
  panchnama_ref       TEXT,
  package_no          TEXT NOT NULL,
  lot_no              TEXT,

  reagent             TEXT NOT NULL,
  kit_test_name       TEXT,
  kit_make            TEXT,
  kit_lot_no          TEXT,
  kit_expiry          TEXT,

  corrected_lab_l     REAL NOT NULL,
  corrected_lab_a     REAL NOT NULL,
  corrected_lab_b     REAL NOT NULL,
  delta_e             REAL NOT NULL,
  calib_residual_mean REAL NOT NULL,
  calib_residual_max  REAL NOT NULL,
  calib_grade         TEXT NOT NULL,

  outcome             TEXT NOT NULL,
  confidence          REAL NOT NULL,
  conformal_set       TEXT NOT NULL,
  abstention_reason   TEXT,
  kinetics            TEXT,

  gps_lat             REAL,
  gps_lon             REAL,
  gps_accuracy_m      REAL,
  gps_mocked          INTEGER,

  image_ref           TEXT,
  image_sha256        TEXT,

  operator_id         TEXT NOT NULL,
  operator_name       TEXT,
  officer_role        TEXT,
  is_demo             INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,

  payload_jcs         TEXT NOT NULL,
  payload_sha256      TEXT NOT NULL,
  prev_hash           TEXT NOT NULL,
  chain_hash          TEXT NOT NULL,
  device_attestation  TEXT,
  seal_state          TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_field_test_seq ON field_test (seq);
CREATE INDEX IF NOT EXISTS idx_field_test_case ON field_test (case_ref, package_no);
CREATE INDEX IF NOT EXISTS idx_field_test_created ON field_test (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_test_outcome ON field_test (outcome);

CREATE TRIGGER IF NOT EXISTS field_test_no_update BEFORE UPDATE ON field_test
BEGIN
  SELECT RAISE(ABORT, 'field_test is append-only: UPDATE disallowed (AGENTS rule 2)');
END;

CREATE TRIGGER IF NOT EXISTS field_test_no_delete BEFORE DELETE ON field_test
BEGIN
  SELECT RAISE(ABORT, 'field_test is append-only: DELETE disallowed (AGENTS rule 2)');
END;

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uuid TEXT,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  at          TEXT NOT NULL,
  detail      TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uuid     TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error      TEXT
);

CREATE TABLE IF NOT EXISTS synced_record (
  record_uuid  TEXT PRIMARY KEY NOT NULL,
  synced_at    TEXT NOT NULL,
  server_ack   TEXT
);

CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;

/** FTS5 mirror — applied only when the SQLite build supports it (driver probes). */
export const MIGRATION_APP_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS field_test_fts USING fts5(
  record_uuid UNINDEXED,
  case_ref,
  panchnama_ref,
  package_no,
  kit_test_name,
  reagent,
  outcome
);

CREATE TRIGGER IF NOT EXISTS field_test_fts_ai AFTER INSERT ON field_test
BEGIN
  INSERT INTO field_test_fts (record_uuid, case_ref, panchnama_ref, package_no, kit_test_name, reagent, outcome)
  VALUES (NEW.record_uuid, NEW.case_ref, NEW.panchnama_ref, NEW.package_no, NEW.kit_test_name, NEW.reagent, NEW.outcome);
END;
`;

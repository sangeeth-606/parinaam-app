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
CREATE TABLE IF NOT EXISTS app_schema_migrations (
  version    INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

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
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uuid      TEXT NOT NULL UNIQUE,
  idempotency_key  TEXT NOT NULL UNIQUE,
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TEXT,
  last_error       TEXT,
  dead_lettered_at TEXT
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

export const MIGRATION_APP_V2 = `
CREATE TABLE IF NOT EXISTS record_sync_state (
  record_uuid TEXT PRIMARY KEY NOT NULL,
  state       TEXT NOT NULL CHECK (state IN ('demo-seed','queued','synced','dead-letter')),
  reason      TEXT,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (record_uuid) REFERENCES field_test(record_uuid) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_record_sync_state ON record_sync_state (state, updated_at);
`;

/**
 * A dead-lettered record must stay visible. Deleting the queue row used to make an
 * unuploaded record vanish while the ledger still said "queued" and the UI said
 * "outbox clear" — evidence loss that looked like success. The row is now marked
 * terminal and the ledger carries the matching 'dead-letter' state, which
 * record_sync_state already permitted in its CHECK constraint.
 */
export const MIGRATION_APP_V4 = `
ALTER TABLE sync_queue ADD COLUMN dead_lettered_at TEXT;
`;

/**
 * MIGRATION_APP_V5 — bounds checks on recorded coordinates.
 *
 * V1 declared `gps_lat REAL, gps_lon REAL, gps_accuracy_m REAL, gps_mocked INTEGER` with no
 * constraints, so a row could hold latitude 900 or a negative accuracy. Those values cannot be
 * produced by `acquireGeoTag`, but the table is the last line of defence for a record whose JSON
 * arrived from a sync path.
 *
 * SQLite cannot add a CHECK to an existing table, so this is a table rebuild. **That drops
 * `field_test_no_update` and `field_test_no_delete`, so both are re-declared verbatim below.** They
 * are not optional: losing them silently breaks AGENTS rule 2, and the ledger is append-only.
 *
 * The rebuild is copy-forward, not lossy: every existing row is re-inserted unchanged. Rows that
 * violate a new CHECK would abort the migration rather than be silently dropped — an existing
 * device with a bad row must fail loudly and visibly, not lose evidence.
 */
export const MIGRATION_APP_V5 = `
CREATE TABLE field_test_v5 (
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
  seal_state          TEXT NOT NULL,

  -- v5: a recorded fix must be a real coordinate. NULL stays legal — a seizure record
  -- with no fix is truthful, and inventing (0,0) to satisfy a constraint would be worse.
  CHECK (gps_lat IS NULL OR (gps_lat >= -90 AND gps_lat <= 90)),
  CHECK (gps_lon IS NULL OR (gps_lon >= -180 AND gps_lon <= 180)),
  CHECK (gps_accuracy_m IS NULL OR gps_accuracy_m >= 0),
  CHECK (gps_mocked IS NULL OR gps_mocked IN (0, 1))
);

INSERT INTO field_test_v5 (
  seq, record_uuid, case_ref, panchnama_ref, package_no, lot_no,
  reagent, kit_test_name, kit_make, kit_lot_no, kit_expiry,
  corrected_lab_l, corrected_lab_a, corrected_lab_b, delta_e,
  calib_residual_mean, calib_residual_max, calib_grade,
  outcome, confidence, conformal_set, abstention_reason, kinetics,
  gps_lat, gps_lon, gps_accuracy_m, gps_mocked,
  image_ref, image_sha256,
  operator_id, operator_name, officer_role, is_demo, created_at,
  payload_jcs, payload_sha256, prev_hash, chain_hash, device_attestation, seal_state
)
SELECT
  seq, record_uuid, case_ref, panchnama_ref, package_no, lot_no,
  reagent, kit_test_name, kit_make, kit_lot_no, kit_expiry,
  corrected_lab_l, corrected_lab_a, corrected_lab_b, delta_e,
  calib_residual_mean, calib_residual_max, calib_grade,
  outcome, confidence, conformal_set, abstention_reason, kinetics,
  gps_lat, gps_lon, gps_accuracy_m, gps_mocked,
  image_ref, image_sha256,
  operator_id, operator_name, officer_role, is_demo, created_at,
  payload_jcs, payload_sha256, prev_hash, chain_hash, device_attestation, seal_state
FROM field_test;

DROP TABLE field_test;
ALTER TABLE field_test_v5 RENAME TO field_test;

CREATE UNIQUE INDEX IF NOT EXISTS idx_field_test_seq ON field_test (seq);
CREATE INDEX IF NOT EXISTS idx_field_test_case ON field_test (case_ref, package_no);
CREATE INDEX IF NOT EXISTS idx_field_test_created ON field_test (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_test_outcome ON field_test (outcome);

-- Re-declared verbatim from MIGRATION_APP_V1: the rebuild above dropped them with the table.
-- Without these, the ledger would become mutable and AGENTS rule 2 would be silently broken.
CREATE TRIGGER IF NOT EXISTS field_test_no_update BEFORE UPDATE ON field_test
BEGIN
  SELECT RAISE(ABORT, 'field_test is append-only: UPDATE disallowed (AGENTS rule 2)');
END;

CREATE TRIGGER IF NOT EXISTS field_test_no_delete BEFORE DELETE ON field_test
BEGIN
  SELECT RAISE(ABORT, 'field_test is append-only: DELETE disallowed (AGENTS rule 2)');
END;
`;

/**
 * Camera-engine diagnostics are kept in their own append-only projection.
 * The authoritative sealed payload remains the existing field-test contract;
 * this table preserves the exact image-bound engine JSON for local audit and
 * future query without pretending it is an additional signed wire field.
 */
export const MIGRATION_APP_V3 = `
CREATE TABLE IF NOT EXISTS camera_engine_result (
  record_uuid   TEXT PRIMARY KEY NOT NULL,
  schema_version TEXT NOT NULL,
  image_sha256  TEXT NOT NULL,
  result_json   TEXT NOT NULL,
  result_sha256 TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (record_uuid) REFERENCES field_test(record_uuid) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS camera_engine_result_no_update
BEFORE UPDATE ON camera_engine_result
BEGIN
  SELECT RAISE(ABORT, 'camera_engine_result is append-only: UPDATE disallowed (AGENTS rule 2)');
END;

CREATE TRIGGER IF NOT EXISTS camera_engine_result_no_delete
BEFORE DELETE ON camera_engine_result
BEGIN
  SELECT RAISE(ABORT, 'camera_engine_result is append-only: DELETE disallowed (AGENTS rule 2)');
END;
`;

/** FTS5 mirror — applied only when the SQLite build supports it (driver probes). */
export interface AppMigrationAdapter {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: unknown[]): Promise<unknown>;
  get<T>(sql: string, ...params: unknown[]): Promise<T | null>;
}

export async function applyVersionedAppMigrations(adapter: AppMigrationAdapter): Promise<void> {
  await adapter.exec(MIGRATION_APP_V1);
  try {
    await adapter.exec('ALTER TABLE sync_queue ADD COLUMN dead_lettered_at TEXT;');
  } catch {
    /* column already exists */
  }
  await adapter.run(
    'INSERT OR IGNORE INTO app_schema_migrations (version, applied_at) VALUES (?, ?)',
    1,
    new Date().toISOString()
  );
  const version2 = await adapter.get<{ version: number }>('SELECT MAX(version) AS version FROM app_schema_migrations');
  if (!version2 || Number(version2.version) < 2) {
    try {
      await adapter.exec('BEGIN IMMEDIATE');
      await adapter.exec(MIGRATION_APP_V2);
      await adapter.run(
        'INSERT INTO app_schema_migrations (version, applied_at) VALUES (?, ?)',
        2,
        new Date().toISOString()
      );
      await adapter.exec('COMMIT');
    } catch (error) {
      await adapter.exec('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
  const version3 = await adapter.get<{ version: number }>('SELECT MAX(version) AS version FROM app_schema_migrations');
  if (!version3 || Number(version3.version) < 3) {
    try {
      await adapter.exec('BEGIN IMMEDIATE');
      await adapter.exec(MIGRATION_APP_V3);
      await adapter.run(
        'INSERT INTO app_schema_migrations (version, applied_at) VALUES (?, ?)',
        3,
        new Date().toISOString()
      );
      await adapter.exec('COMMIT');
    } catch (error) {
      await adapter.exec('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
  const version4 = await adapter.get<{ version: number }>('SELECT MAX(version) AS version FROM app_schema_migrations');
  if (!version4 || Number(version4.version) < 4) {
    try {
      await adapter.exec('BEGIN IMMEDIATE');
      await adapter.exec(MIGRATION_APP_V4);
      await adapter.run(
        'INSERT INTO app_schema_migrations (version, applied_at) VALUES (?, ?)',
        4,
        new Date().toISOString()
      );
      await adapter.exec('COMMIT');
    } catch (error) {
      await adapter.exec('ROLLBACK').catch(() => undefined);
      // A pre-existing dead_lettered_at column means the migration is already applied;
      // that is not a failure condition.
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column name/i.test(message)) throw error;
    }
  }

  // v4 phase 3.4 — rebuild field_test to add coordinate bounds checks.
  //
  // No tolerance clause is used here, deliberately: unlike V4's idempotent column add, a
  // partially-applied table rebuild would mean rows are missing from the ledger. That must
  // abort loudly so the officer's data is never silently lost (see the MIGRATION_APP_V5 note).
  const version5 = await adapter.get<{ version: number }>('SELECT MAX(version) AS version FROM app_schema_migrations');
  if (!version5 || Number(version5.version) < 5) {
    await adapter.exec('BEGIN IMMEDIATE');
    try {
      await adapter.exec(MIGRATION_APP_V5);
      await adapter.run(
        'INSERT INTO app_schema_migrations (version, applied_at) VALUES (?, ?)',
        5,
        new Date().toISOString()
      );
      await adapter.exec('COMMIT');
    } catch (error) {
      await adapter.exec('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
}

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

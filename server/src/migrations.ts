/**
 * Versioned server database migrations.
 *
 * Migration 1 is a transactionally applied baseline for both storage engines. It
 * creates a clean schema, or upgrades the server schema shipped before versioned
 * migrations existed. Legacy SQLite rows are copied without parsing or reserialising
 * `field_test.body`; PostgreSQL is upgraded in place for the same reason.
 */

import { createHash } from 'node:crypto';
import type { SqlEngine, SqlStore } from './storage.ts';

export const LATEST_SCHEMA_VERSION = 1;
export const SCHEMA_MIGRATION_NAME = 'server_schema_v1';

const MIGRATION_IDENTITY = `${LATEST_SCHEMA_VERSION}:${SCHEMA_MIGRATION_NAME}`;
const MIGRATION_ALGORITHM = 'transactional-legacy-baseline-v1';

import { OFFICER_ROLES as OFFICER_ROLES_ARRAY } from '../../src/contracts/officer-roles.ts';
const OFFICER_ROLES: Set<string> = new Set<string>(OFFICER_ROLES_ARRAY);
const CASE_STATUSES = new Set(['REPORTED', 'UNDER_REVIEW', 'REVIEWED', 'ESCALATED']);

const SQLITE_CORE_TABLES = [
  'officers',
  'sessions',
  'field_test',
  'idempotency',
  'cases',
  'case_status_history',
  'server_audit',
] as const;

const POSTGRES_CORE_TABLES = SQLITE_CORE_TABLES;

const APPEND_ONLY_TABLES = [
  'field_test',
  'case_status_history',
  'server_audit',
  'idempotency',
  'evidence_blobs',
] as const;

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  fresh: boolean;
}

interface AppliedMigrationRow {
  version: number | string;
  name: string;
  checksum: string;
}

interface SqliteColumnRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

interface SqliteTableRow {
  name: string;
}

interface SqliteFieldRow {
  seq: number | null;
  record_uuid: string;
  case_ref: string;
  package_no: string;
  operator_id: string;
  outcome: string;
  confidence: number;
  created_at: string;
  received_at: string;
  payload_jcs: string;
  record_hash: string;
  prev_hash: string;
  chain_hash: string;
  device_attestation: string | null;
  image_ref: string | null;
  image_sha256: string | null;
  body: unknown;
}

interface SqliteOfficerRow {
  id: number;
  username: string;
  pass_salt: string;
  pass_hash: string;
  display_name: string;
  role: string;
  created_at: string;
}

interface SqliteSessionRow {
  token: string;
  officer_id: number;
  created_at: string;
  expires_at: string;
}

interface SqliteIdempotencyRow {
  key: string;
  record_uuid: string;
  created_at: string;
}

interface SqliteCaseRow {
  case_ref: string;
  case_status: string;
  first_seen: string;
  last_seen: string;
  panchnama_ref: string | null;
}

interface SqliteHistoryRow {
  id: number;
  case_ref: string;
  from_status: string;
  to_status: string;
  actor: string;
  at: string;
  note: string | null;
}

interface SqliteAuditRow {
  id: number;
  actor: string;
  action: string;
  subject: string | null;
  at: string;
  detail: string | null;
}

interface PostgresColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
}

interface PostgresFieldRow {
  seq: number | string | null;
  record_uuid: string;
  case_ref: string;
  package_no: string;
  operator_id: string;
  outcome: string;
  confidence: number | string;
  created_at: string;
  received_at: string;
  payload_jcs: string;
  record_hash: string;
  prev_hash: string;
  chain_hash: string;
  device_attestation: string | null;
  image_ref: string | null;
  image_sha256: string | null;
  body: string;
}

interface PostgresSessionRow {
  token: string;
  officer_id: number | string;
  created_at: string;
  expires_at: string;
}

interface PostgresIdempotencyRow {
  key: string;
  record_uuid: string;
  created_at: string;
}

interface CountRow {
  c: number | string;
}

interface LedgerRow {
  seq: number | string;
  record_uuid: string;
  chain_hash: string;
  updated_at: string;
}

export class MigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MigrationError';
  }
}

function migrationTableSql(engine: SqlEngine): string {
  return engine === 'postgres'
    ? `CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        checksum   TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`
    : `CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        checksum   TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`;
}

function sqliteTableDefinitions(): string[] {
  return [
    `CREATE TABLE officers (
      id            INTEGER PRIMARY KEY,
      officer_code  TEXT NOT NULL UNIQUE,
      username      TEXT NOT NULL UNIQUE,
      pass_salt     TEXT NOT NULL,
      pass_hash     TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('JUNIOR','SENIOR','ADMIN','SUPERVISOR','JUDICIARY')),
      status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED')),
      created_at    TEXT NOT NULL,
      approved_at   TEXT,
      approved_by   INTEGER REFERENCES officers(id) ON DELETE SET NULL,
      last_login_at TEXT
    )`,
    `CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
      officer_id INTEGER NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`,
    `CREATE TABLE field_test (
      seq                INTEGER NOT NULL UNIQUE,
      record_uuid        TEXT PRIMARY KEY,
      officer_code       TEXT REFERENCES officers(officer_code) ON UPDATE RESTRICT ON DELETE RESTRICT,
      case_ref           TEXT NOT NULL,
      package_no         TEXT NOT NULL,
      operator_id        TEXT NOT NULL,
      operator_name      TEXT,
      outcome            TEXT NOT NULL,
      confidence         REAL NOT NULL,
      reagent            TEXT,
      kit_type           TEXT,
      kit_batch          TEXT,
      region             TEXT,
      department         TEXT,
      location_label     TEXT,
      created_at         TEXT NOT NULL,
      received_at        TEXT NOT NULL,
      payload_jcs        TEXT NOT NULL,
      record_hash        TEXT NOT NULL,
      prev_hash          TEXT NOT NULL,
      chain_hash         TEXT NOT NULL UNIQUE,
      device_attestation TEXT,
      image_ref          TEXT,
      image_sha256       TEXT,
      is_demo            INTEGER,
      body               TEXT NOT NULL
    )`,
    `CREATE TABLE cases (
      case_ref                 TEXT PRIMARY KEY,
      case_status              TEXT NOT NULL DEFAULT 'REPORTED' CHECK (case_status IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED')),
      version                  INTEGER NOT NULL DEFAULT 1,
      region                   TEXT NOT NULL DEFAULT '',
      department               TEXT NOT NULL DEFAULT '',
      location                 TEXT NOT NULL DEFAULT '',
      location_label           TEXT NOT NULL DEFAULT '',
      first_record_at          TEXT,
      last_record_at           TEXT,
      first_seen               TEXT,
      last_seen                TEXT,
      panchnama_ref            TEXT,
      created_at               TEXT,
      updated_at               TEXT,
      assigned_officer_code    TEXT REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL,
      reviewer_officer_code    TEXT REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL,
      review_note              TEXT,
      reviewed_at              TEXT
    )`,
    `CREATE TABLE case_status_history (
      id          INTEGER PRIMARY KEY,
      case_ref    TEXT NOT NULL REFERENCES cases(case_ref) ON UPDATE RESTRICT ON DELETE RESTRICT,
      officer_code TEXT REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL,
      from_status TEXT NOT NULL CHECK (from_status IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED')),
      to_status   TEXT NOT NULL CHECK (to_status IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED')),
      actor       TEXT NOT NULL,
      at          TEXT NOT NULL,
      note        TEXT
    )`,
    `CREATE TABLE server_audit (
      id          INTEGER PRIMARY KEY,
      officer_code TEXT REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL,
      actor       TEXT NOT NULL,
      action      TEXT NOT NULL,
      subject     TEXT,
      at          TEXT NOT NULL,
      detail      TEXT
    )`,
    `CREATE TABLE ledger_head (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      seq         INTEGER NOT NULL UNIQUE CHECK (seq >= 0),
      record_uuid TEXT UNIQUE REFERENCES field_test(record_uuid) ON UPDATE RESTRICT ON DELETE RESTRICT,
      chain_hash  TEXT NOT NULL UNIQUE,
      updated_at  TEXT NOT NULL
    )`,
    `CREATE TABLE idempotency (
      officer_code  TEXT NOT NULL REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE RESTRICT,
      key           TEXT NOT NULL,
      request_hash  TEXT NOT NULL,
      record_uuid   TEXT NOT NULL REFERENCES field_test(record_uuid) ON UPDATE RESTRICT ON DELETE RESTRICT,
      response_status INTEGER NOT NULL,
      response_json   TEXT NOT NULL,
      response      TEXT GENERATED ALWAYS AS (response_json) STORED,
      created_at    TEXT NOT NULL,
      PRIMARY KEY (officer_code, key)
    )`,
    `CREATE TABLE evidence_blobs (
      record_uuid  TEXT PRIMARY KEY REFERENCES field_test(record_uuid) ON UPDATE RESTRICT ON DELETE RESTRICT,
      sha256       TEXT NOT NULL,
      content_type TEXT NOT NULL,
      byte_size    INTEGER NOT NULL CHECK (byte_size > 0),
      bytes        BLOB NOT NULL,
      hash         TEXT GENERATED ALWAYS AS (sha256) STORED,
      size         INTEGER GENERATED ALWAYS AS (byte_size) STORED,
      created_at   TEXT NOT NULL
    )`,
  ];
}

function sqliteIndexDefinitions(): string[] {
  return [
    'CREATE UNIQUE INDEX idx_officers_officer_code ON officers (officer_code)',
    'CREATE UNIQUE INDEX idx_officers_username ON officers (username)',
    'CREATE INDEX idx_officers_status_role ON officers (status, role)',
    'CREATE INDEX idx_sessions_officer ON sessions (officer_id)',
    'CREATE INDEX idx_sessions_expiry ON sessions (expires_at)',
    'CREATE UNIQUE INDEX idx_field_test_seq ON field_test (seq)',
    'CREATE UNIQUE INDEX idx_field_test_record_uuid ON field_test (record_uuid)',
    'CREATE UNIQUE INDEX idx_field_test_chain_hash ON field_test (chain_hash)',
    'CREATE INDEX idx_field_test_case_created ON field_test (case_ref, created_at)',
    'CREATE INDEX idx_field_test_operator_created ON field_test (operator_id, created_at)',
    'CREATE INDEX idx_field_test_outcome ON field_test (outcome)',
    'CREATE INDEX idx_field_test_received ON field_test (received_at)',
    'CREATE INDEX idx_field_test_officer ON field_test (officer_code)',
    'CREATE INDEX idx_field_test_reagent ON field_test (reagent)',
    'CREATE INDEX idx_field_test_region ON field_test (region)',
    'CREATE INDEX idx_field_test_department ON field_test (department)',
    'CREATE INDEX idx_field_test_location ON field_test (location_label)',
    'CREATE INDEX idx_cases_status_last_seen ON cases (case_status, last_seen)',
    'CREATE INDEX idx_cases_first_record ON cases (first_record_at)',
    'CREATE INDEX idx_cases_last_record ON cases (last_record_at)',
    'CREATE INDEX idx_cases_region ON cases (region)',
    'CREATE INDEX idx_cases_department ON cases (department)',
    'CREATE INDEX idx_case_history_case_at ON case_status_history (case_ref, at)',
    'CREATE INDEX idx_case_history_officer ON case_status_history (officer_code)',
    'CREATE INDEX idx_server_audit_at ON server_audit (at)',
    'CREATE INDEX idx_server_audit_officer ON server_audit (officer_code)',
    'CREATE INDEX idx_idempotency_record ON idempotency (record_uuid)',
    'CREATE INDEX idx_evidence_hash ON evidence_blobs (hash)',
  ];
}

function sqliteTriggerDefinitions(): string[] {
  const appendOnly: string[] = [];
  for (const table of APPEND_ONLY_TABLES) {
    appendOnly.push(
      `CREATE TRIGGER ${table}_reject_update BEFORE UPDATE ON ${table}
       BEGIN
         SELECT RAISE(ABORT, '${table} is append-only: UPDATE disallowed');
       END`,
      `CREATE TRIGGER ${table}_reject_delete BEFORE DELETE ON ${table}
       BEGIN
         SELECT RAISE(ABORT, '${table} is append-only: DELETE disallowed');
       END`,
    );
  }
  appendOnly.push(
    `CREATE TRIGGER field_test_advance_ledger_head AFTER INSERT ON field_test
     BEGIN
       INSERT INTO ledger_head (id, seq, record_uuid, chain_hash, updated_at)
       VALUES (1, NEW.seq, NEW.record_uuid, NEW.chain_hash, NEW.received_at)
       ON CONFLICT(id) DO UPDATE SET
         seq = excluded.seq,
         record_uuid = excluded.record_uuid,
         chain_hash = excluded.chain_hash,
         updated_at = excluded.updated_at
       WHERE excluded.seq >= ledger_head.seq;
     END`,
  );
  return appendOnly;
}

function postgresTableDefinitions(): string[] {
  return [
    `CREATE TABLE officers (
      id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      officer_code  TEXT NOT NULL UNIQUE,
      username      TEXT NOT NULL UNIQUE,
      pass_salt     TEXT NOT NULL,
      pass_hash     TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('JUNIOR','SENIOR','ADMIN','SUPERVISOR','JUDICIARY')),
      status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED')),
      created_at    TEXT NOT NULL,
      approved_at   TEXT,
      approved_by   BIGINT REFERENCES officers(id) ON DELETE SET NULL,
      last_login_at TEXT
    )`,
    `CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
      officer_id BIGINT NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`,
    `CREATE TABLE field_test (
      seq                BIGINT NOT NULL UNIQUE,
      record_uuid        TEXT PRIMARY KEY,
      officer_code       TEXT REFERENCES officers(officer_code) ON UPDATE RESTRICT ON DELETE RESTRICT,
      case_ref           TEXT NOT NULL,
      package_no         TEXT NOT NULL,
      operator_id        TEXT NOT NULL,
      operator_name      TEXT,
      outcome            TEXT NOT NULL,
      confidence         DOUBLE PRECISION NOT NULL,
      reagent            TEXT,
      kit_type           TEXT,
      kit_batch          TEXT,
      region             TEXT,
      department         TEXT,
      location_label     TEXT,
      created_at         TEXT NOT NULL,
      received_at        TEXT NOT NULL,
      payload_jcs        TEXT NOT NULL,
      record_hash        TEXT NOT NULL,
      prev_hash          TEXT NOT NULL,
      chain_hash         TEXT NOT NULL UNIQUE,
      device_attestation TEXT,
      image_ref          TEXT,
      image_sha256       TEXT,
      is_demo            BOOLEAN,
      body               TEXT NOT NULL
    )`,
    `CREATE TABLE cases (
      case_ref                 TEXT PRIMARY KEY,
      case_status              TEXT NOT NULL DEFAULT 'REPORTED' CHECK (case_status IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED')),
      version                  INTEGER NOT NULL DEFAULT 1,
      region                   TEXT NOT NULL DEFAULT '',
      department               TEXT NOT NULL DEFAULT '',
      location                 TEXT NOT NULL DEFAULT '',
      location_label           TEXT NOT NULL DEFAULT '',
      first_record_at          TEXT,
      last_record_at           TEXT,
      first_seen               TEXT,
      last_seen                TEXT,
      panchnama_ref            TEXT,
      created_at               TEXT,
      updated_at               TEXT,
      assigned_officer_code    TEXT REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL,
      reviewer_officer_code    TEXT REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL,
      review_note              TEXT,
      reviewed_at              TEXT
    )`,
    `CREATE TABLE case_status_history (
      id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      case_ref     TEXT NOT NULL REFERENCES cases(case_ref) ON UPDATE RESTRICT ON DELETE RESTRICT,
      officer_code TEXT REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL,
      from_status  TEXT NOT NULL CHECK (from_status IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED')),
      to_status    TEXT NOT NULL CHECK (to_status IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED')),
      actor        TEXT NOT NULL,
      at           TEXT NOT NULL,
      note         TEXT
    )`,
    `CREATE TABLE server_audit (
      id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      officer_code TEXT REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL,
      actor        TEXT NOT NULL,
      action       TEXT NOT NULL,
      subject      TEXT,
      at           TEXT NOT NULL,
      detail       TEXT
    )`,
    `CREATE TABLE ledger_head (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      seq         BIGINT NOT NULL UNIQUE CHECK (seq >= 0),
      record_uuid TEXT UNIQUE REFERENCES field_test(record_uuid) ON UPDATE RESTRICT ON DELETE RESTRICT,
      chain_hash  TEXT NOT NULL UNIQUE,
      updated_at  TEXT NOT NULL
    )`,
    `CREATE TABLE idempotency (
      officer_code   TEXT NOT NULL REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE RESTRICT,
      key            TEXT NOT NULL,
      request_hash   TEXT NOT NULL,
      record_uuid    TEXT NOT NULL REFERENCES field_test(record_uuid) ON UPDATE RESTRICT ON DELETE RESTRICT,
      response_status INTEGER NOT NULL,
      response_json   TEXT NOT NULL,
      response       TEXT GENERATED ALWAYS AS (response_json) STORED,
      created_at     TEXT NOT NULL,
      PRIMARY KEY (officer_code, key)
    )`,
    `CREATE TABLE evidence_blobs (
      record_uuid  TEXT PRIMARY KEY REFERENCES field_test(record_uuid) ON UPDATE RESTRICT ON DELETE RESTRICT,
      sha256       TEXT NOT NULL,
      content_type TEXT NOT NULL,
      byte_size    BIGINT NOT NULL CHECK (byte_size > 0),
      bytes        BYTEA NOT NULL,
      hash         TEXT GENERATED ALWAYS AS (sha256) STORED,
      size         BIGINT GENERATED ALWAYS AS (byte_size) STORED,
      created_at   TEXT NOT NULL
    )`,
  ];
}

function postgresIndexDefinitions(): string[] {
  return [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_officers_officer_code ON officers (officer_code)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_officers_username ON officers (username)',
    'CREATE INDEX IF NOT EXISTS idx_officers_status_role ON officers (status, role)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_officer ON sessions (officer_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_field_test_seq ON field_test (seq)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_field_test_record_uuid ON field_test (record_uuid)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_field_test_chain_hash ON field_test (chain_hash)',
    'CREATE INDEX IF NOT EXISTS idx_field_test_case_created ON field_test (case_ref, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_field_test_operator_created ON field_test (operator_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_field_test_outcome ON field_test (outcome)',
    'CREATE INDEX IF NOT EXISTS idx_field_test_received ON field_test (received_at)',
    'CREATE INDEX IF NOT EXISTS idx_field_test_officer ON field_test (officer_code)',
    'CREATE INDEX IF NOT EXISTS idx_field_test_reagent ON field_test (reagent)',
    'CREATE INDEX IF NOT EXISTS idx_field_test_region ON field_test (region)',
    'CREATE INDEX IF NOT EXISTS idx_field_test_department ON field_test (department)',
    'CREATE INDEX IF NOT EXISTS idx_field_test_location ON field_test (location_label)',
    'CREATE INDEX IF NOT EXISTS idx_cases_status_last_seen ON cases (case_status, last_seen)',
    'CREATE INDEX IF NOT EXISTS idx_cases_first_record ON cases (first_record_at)',
    'CREATE INDEX IF NOT EXISTS idx_cases_last_record ON cases (last_record_at)',
    'CREATE INDEX IF NOT EXISTS idx_cases_region ON cases (region)',
    'CREATE INDEX IF NOT EXISTS idx_cases_department ON cases (department)',
    'CREATE INDEX IF NOT EXISTS idx_case_history_case_at ON case_status_history (case_ref, at)',
    'CREATE INDEX IF NOT EXISTS idx_case_history_officer ON case_status_history (officer_code)',
    'CREATE INDEX IF NOT EXISTS idx_server_audit_at ON server_audit (at)',
    'CREATE INDEX IF NOT EXISTS idx_server_audit_officer ON server_audit (officer_code)',
    'CREATE INDEX IF NOT EXISTS idx_idempotency_record ON idempotency (record_uuid)',
    'CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence_blobs (hash)',
  ];
}

function postgresTriggerDefinitions(): string[] {
  const statements = [
    `CREATE OR REPLACE FUNCTION parinaam_reject_append_only_mutation()
     RETURNS trigger
     LANGUAGE plpgsql
     AS $parinaam$
     BEGIN
       RAISE EXCEPTION '% is append-only: % disallowed', TG_TABLE_NAME, TG_OP
         USING ERRCODE = '55000';
       RETURN NULL;
     END
     $parinaam$`,
  ];
  for (const table of APPEND_ONLY_TABLES) {
    statements.push(
      `DROP TRIGGER IF EXISTS ${table}_reject_update ON ${table}`,
      `DROP TRIGGER IF EXISTS ${table}_reject_delete ON ${table}`,
      `CREATE TRIGGER ${table}_reject_update BEFORE UPDATE ON ${table}
       FOR EACH ROW EXECUTE FUNCTION parinaam_reject_append_only_mutation()`,
      `CREATE TRIGGER ${table}_reject_delete BEFORE DELETE ON ${table}
       FOR EACH ROW EXECUTE FUNCTION parinaam_reject_append_only_mutation()`,
    );
  }
  statements.push(
    `CREATE TRIGGER field_test_advance_ledger_head AFTER INSERT ON field_test
     FOR EACH ROW EXECUTE FUNCTION parinaam_advance_ledger_head()`,
  );
  return statements;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function assertNonEmpty(value: string, table: string, column: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MigrationError(`legacy ${table}.${column} contains an empty or non-text value`);
  }
}

function isSqliteType(actual: string, expected: readonly string[]): boolean {
  const normalized = actual.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  return expected.some((candidate) => normalized === candidate.toUpperCase());
}

async function sqliteExistingTables(store: SqlStore): Promise<Set<string>> {
  const rows = await store.all<SqliteTableRow>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name IN (${SQLITE_CORE_TABLES.map(() => '?').join(',')})`,
    ...SQLITE_CORE_TABLES,
  );
  return new Set(rows.map((row) => row.name));
}

async function postgresExistingTables(store: SqlStore): Promise<Set<string>> {
  const rows = await store.all<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name IN (${POSTGRES_CORE_TABLES.map(() => '?').join(',')})`,
    ...POSTGRES_CORE_TABLES,
  );
  return new Set(rows.map((row) => row.table_name));
}

interface ColumnSpec {
  required: boolean;
  types: readonly string[];
  primaryKey?: boolean;
}

const SQLITE_LEGACY_COLUMNS: Record<(typeof SQLITE_CORE_TABLES)[number], Record<string, ColumnSpec>> = {
  officers: {
    id: { required: true, types: ['INTEGER'], primaryKey: true },
    username: { required: true, types: ['TEXT', 'VARCHAR'] },
    pass_salt: { required: true, types: ['TEXT', 'VARCHAR'] },
    pass_hash: { required: true, types: ['TEXT', 'VARCHAR'] },
    display_name: { required: true, types: ['TEXT', 'VARCHAR'] },
    role: { required: true, types: ['TEXT', 'VARCHAR'] },
    created_at: { required: true, types: ['TEXT', 'VARCHAR'] },
  },
  sessions: {
    token: { required: true, types: ['TEXT', 'VARCHAR'], primaryKey: true },
    officer_id: { required: true, types: ['INTEGER', 'BIGINT'] },
    created_at: { required: true, types: ['TEXT', 'VARCHAR'] },
    expires_at: { required: true, types: ['TEXT', 'VARCHAR'] },
  },
  field_test: {
    seq: { required: false, types: ['INTEGER', 'BIGINT'] },
    record_uuid: { required: true, types: ['TEXT', 'VARCHAR'], primaryKey: true },
    case_ref: { required: true, types: ['TEXT', 'VARCHAR'] },
    package_no: { required: true, types: ['TEXT', 'VARCHAR'] },
    operator_id: { required: true, types: ['TEXT', 'VARCHAR'] },
    outcome: { required: true, types: ['TEXT', 'VARCHAR'] },
    confidence: { required: true, types: ['REAL', 'DOUBLE', 'DOUBLE PRECISION', 'NUMERIC'] },
    created_at: { required: true, types: ['TEXT', 'VARCHAR'] },
    received_at: { required: true, types: ['TEXT', 'VARCHAR'] },
    payload_jcs: { required: true, types: ['TEXT', 'VARCHAR'] },
    record_hash: { required: true, types: ['TEXT', 'VARCHAR'] },
    prev_hash: { required: true, types: ['TEXT', 'VARCHAR'] },
    chain_hash: { required: true, types: ['TEXT', 'VARCHAR'] },
    device_attestation: { required: false, types: ['TEXT', 'VARCHAR'] },
    image_ref: { required: false, types: ['TEXT', 'VARCHAR'] },
    image_sha256: { required: false, types: ['TEXT', 'VARCHAR'] },
    body: { required: true, types: ['TEXT', 'VARCHAR'] },
  },
  idempotency: {
    key: { required: true, types: ['TEXT', 'VARCHAR'], primaryKey: true },
    record_uuid: { required: true, types: ['TEXT', 'VARCHAR'] },
    created_at: { required: true, types: ['TEXT', 'VARCHAR'] },
  },
  cases: {
    case_ref: { required: true, types: ['TEXT', 'VARCHAR'], primaryKey: true },
    case_status: { required: true, types: ['TEXT', 'VARCHAR'] },
    first_seen: { required: true, types: ['TEXT', 'VARCHAR'] },
    last_seen: { required: true, types: ['TEXT', 'VARCHAR'] },
    panchnama_ref: { required: false, types: ['TEXT', 'VARCHAR'] },
  },
  case_status_history: {
    id: { required: true, types: ['INTEGER', 'BIGINT'], primaryKey: true },
    case_ref: { required: true, types: ['TEXT', 'VARCHAR'] },
    from_status: { required: true, types: ['TEXT', 'VARCHAR'] },
    to_status: { required: true, types: ['TEXT', 'VARCHAR'] },
    actor: { required: true, types: ['TEXT', 'VARCHAR'] },
    at: { required: true, types: ['TEXT', 'VARCHAR'] },
    note: { required: false, types: ['TEXT', 'VARCHAR'] },
  },
  server_audit: {
    id: { required: true, types: ['INTEGER', 'BIGINT'], primaryKey: true },
    actor: { required: true, types: ['TEXT', 'VARCHAR'] },
    action: { required: true, types: ['TEXT', 'VARCHAR'] },
    subject: { required: false, types: ['TEXT', 'VARCHAR'] },
    at: { required: true, types: ['TEXT', 'VARCHAR'] },
    detail: { required: false, types: ['TEXT', 'VARCHAR'] },
  },
};

async function validateSqliteLegacyShape(store: SqlStore): Promise<void> {
  const existing = await sqliteExistingTables(store);
  if (existing.size === 0) return;
  const missingTables = SQLITE_CORE_TABLES.filter((table) => !existing.has(table));
  if (missingTables.length > 0) {
    throw new MigrationError(
      `legacy SQLite schema is partial or unknown; missing recognized tables: ${missingTables.join(', ')}`,
    );
  }

  for (const table of SQLITE_CORE_TABLES) {
    const columns = await store.all<SqliteColumnRow>(`PRAGMA table_info(${table})`);
    const byName = new Map(columns.map((column) => [column.name, column]));
    const specs = SQLITE_LEGACY_COLUMNS[table];
    const unknownColumns = columns
      .map((column) => column.name)
      .filter((name) => !(name in specs));
    if (unknownColumns.length > 0) {
      throw new MigrationError(
        `legacy SQLite table ${table} has unknown columns that cannot be migrated safely: ${unknownColumns.join(', ')}`,
      );
    }
    for (const [name, spec] of Object.entries(specs)) {
      const column = byName.get(name);
      if (!column) {
        if (spec.required) throw new MigrationError(`legacy SQLite table ${table} is missing required column ${name}`);
        continue;
      }
      if (!isSqliteType(column.type, spec.types)) {
        throw new MigrationError(
          `legacy SQLite table ${table}.${name} has unexpected type ${column.type}; expected ${spec.types.join(' or ')}`,
        );
      }
      if (spec.primaryKey && column.pk === 0) {
        throw new MigrationError(`legacy SQLite table ${table}.${name} must be the primary key`);
      }
    }
  }

  const triggers = await store.all<{ name: string; tbl_name: string }>(
    `SELECT name, tbl_name FROM sqlite_master
     WHERE type = 'trigger' AND tbl_name IN (${SQLITE_CORE_TABLES.map(() => '?').join(',')})`,
    ...SQLITE_CORE_TABLES,
  );
  if (triggers.length > 0) {
    throw new MigrationError(
      `legacy SQLite schema has unrecognised triggers that could affect migration: ${triggers.map((row) => row.name).join(', ')}`,
    );
  }
}

async function validateSqliteLegacyData(store: SqlStore): Promise<void> {
  const officers = await store.all<SqliteOfficerRow>('SELECT id, username, pass_salt, pass_hash, display_name, role, created_at FROM officers');
  const officerIds = new Set<number>();
  const usernames = new Set<string>();
  for (const officer of officers) {
    if (!Number.isSafeInteger(officer.id) || officer.id <= 0 || officerIds.has(officer.id)) {
      throw new MigrationError(`legacy SQLite officers.id is missing, invalid, or duplicated: ${String(officer.id)}`);
    }
    assertNonEmpty(officer.username, 'officers', 'username');
    assertNonEmpty(officer.display_name, 'officers', 'display_name');
    assertNonEmpty(officer.created_at, 'officers', 'created_at');
    if (!OFFICER_ROLES.has(officer.role)) {
      throw new MigrationError(`legacy SQLite officer ${officer.username} has unsupported role ${officer.role}`);
    }
    if (!/^[0-9a-f]{32,128}$/i.test(officer.pass_salt) || !/^[0-9a-f]{64,256}$/i.test(officer.pass_hash)) {
      throw new MigrationError(`legacy SQLite officer ${officer.username} has malformed password salt/hash metadata`);
    }
    const normalizedUsername = officer.username.toLowerCase();
    if (usernames.has(normalizedUsername)) {
      throw new MigrationError(`legacy SQLite officers.username is duplicated: ${officer.username}`);
    }
    usernames.add(normalizedUsername);
    officerIds.add(officer.id);
  }

  const fieldColumns = await store.all<SqliteColumnRow>('PRAGMA table_info(field_test)');
  const hasLegacySeq = fieldColumns.some((column) => column.name === 'seq');
  const fields = await store.all<SqliteFieldRow>(
    `SELECT ${hasLegacySeq ? 'seq' : 'NULL AS seq'}, record_uuid, case_ref, package_no, operator_id, outcome, confidence, created_at, received_at,
            payload_jcs, record_hash, prev_hash, chain_hash, device_attestation, image_ref, image_sha256, body
       FROM field_test`,
  );
  const seqs = new Set<number>();
  const chains = new Set<string>();
  for (const field of fields) {
    if (typeof field.body !== 'string') {
      throw new MigrationError(`legacy SQLite field_test.body for ${String(field.record_uuid)} is not TEXT; refusing to rewrite it`);
    }
    assertNonEmpty(field.record_uuid, 'field_test', 'record_uuid');
    assertNonEmpty(field.chain_hash, 'field_test', 'chain_hash');
    assertNonEmpty(field.record_hash, 'field_test', 'record_hash');
    if (field.seq !== null) {
      if (!Number.isSafeInteger(field.seq) || field.seq <= 0 || seqs.has(field.seq)) {
        throw new MigrationError(`legacy SQLite field_test.seq is invalid or duplicated: ${String(field.seq)}`);
      }
      seqs.add(field.seq);
    }
    if (chains.has(field.chain_hash)) {
      throw new MigrationError(`legacy SQLite field_test.chain_hash is duplicated; immutable rows cannot be migrated safely`);
    }
    chains.add(field.chain_hash);
  }

  const sessions = await store.all<SqliteSessionRow>('SELECT token, officer_id, created_at, expires_at FROM sessions');
  const sessionHashes = new Set<string>();
  for (const session of sessions) {
    assertNonEmpty(session.token, 'sessions', 'token');
    if (!officerIds.has(session.officer_id)) {
      throw new MigrationError(`legacy SQLite session references missing officer id ${String(session.officer_id)}`);
    }
    const tokenHash = hashToken(session.token);
    if (sessionHashes.has(tokenHash)) {
      throw new MigrationError('legacy SQLite sessions contain duplicate bearer tokens');
    }
    sessionHashes.add(tokenHash);
  }

  const orphanIdempotency = await store.get<CountRow>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS c FROM idempotency i
     LEFT JOIN field_test f ON f.record_uuid = i.record_uuid
     WHERE f.record_uuid IS NULL`,
  );
  if (Number(orphanIdempotency?.c ?? 0) > 0) {
    throw new MigrationError('legacy SQLite idempotency rows reference missing field_test records');
  }
  if (officers.length === 0) {
    const idempotencyCount = await store.get<CountRow>('SELECT CAST(COUNT(*) AS INTEGER) AS c FROM idempotency');
    if (Number(idempotencyCount?.c ?? 0) > 0) {
      throw new MigrationError('legacy SQLite idempotency rows cannot be officer-scoped because no legacy officer exists');
    }
  }

  const invalidCases = await store.all<{ case_ref: string; case_status: string }>(
    'SELECT case_ref, case_status FROM cases',
  );
  for (const row of invalidCases) {
    assertNonEmpty(row.case_ref, 'cases', 'case_ref');
    if (!CASE_STATUSES.has(row.case_status)) {
      throw new MigrationError(`legacy SQLite case ${row.case_ref} has unsupported status ${row.case_status}`);
    }
  }
  const caseRefs = new Set(invalidCases.map((row) => row.case_ref));
  const orphanHistory = await store.get<CountRow>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS c FROM case_status_history h
     LEFT JOIN cases c ON c.case_ref = h.case_ref WHERE c.case_ref IS NULL`,
  );
  if (Number(orphanHistory?.c ?? 0) > 0) {
    throw new MigrationError('legacy SQLite case_status_history contains orphaned rows');
  }
  const history = await store.all<{ case_ref: string; from_status: string; to_status: string }>(
    'SELECT case_ref, from_status, to_status FROM case_status_history',
  );
  for (const row of history) {
    if (!caseRefs.has(row.case_ref) || !CASE_STATUSES.has(row.from_status) || !CASE_STATUSES.has(row.to_status)) {
      throw new MigrationError(`legacy SQLite case history for ${row.case_ref} contains invalid status data`);
    }
  }
}

async function sqliteCreateTables(store: SqlStore): Promise<void> {
  for (const sql of sqliteTableDefinitions()) await store.run(sql);
}

async function sqliteCreateIndexesAndGuards(store: SqlStore): Promise<void> {
  for (const sql of sqliteIndexDefinitions()) await store.run(sql);
  for (const sql of sqliteTriggerDefinitions()) await store.run(sql);
}

async function applyFreshSqliteMigration(store: SqlStore): Promise<void> {
  await sqliteCreateTables(store);
  await store.run(
    'INSERT INTO ledger_head (id, seq, record_uuid, chain_hash, updated_at) VALUES (1,0,NULL,?,?)',
    '0'.repeat(64),
    new Date().toISOString(),
  );
  await sqliteCreateIndexesAndGuards(store);
}

/* Legacy first draft retained temporarily in this working file.
async function copySqliteLegacyRows(store: SqlStore): Promise<void> {
  const officers = await store.all<SqliteOfficerRow>(
    'SELECT id, username, pass_salt, pass_hash, display_name, role, created_at FROM officers ORDER BY id ASC',
  );
  const officerCodeById = new Map<number, string>();
  const officerCodeByUsername = new Map<string, string>();
  for (const officer of officers) {
    const officerCode = officer.username === 'admin' ? 'OFFICER-ADMIN' : `OFFICER-${officer.id}`;
    officerCodeById.set(officer.id, officerCode);
    officerCodeByUsername.set(officer.username, officerCode);
    await store.run(
      `INSERT INTO officers
       (id, officer_code, username, pass_salt, pass_hash, display_name, role, status, created_at, approved_at, approved_by, last_login_at)
       VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?,NULL,NULL)`,
      officer.id,
      officerCode,
      officer.username,
      officer.pass_salt,
      officer.pass_hash,
      officer.display_name,
      officer.role,
      officer.created_at,
      officer.created_at,
    );
  }

  const sessions = await store.all<SqliteSessionRow>(
    'SELECT token, officer_id, created_at, expires_at FROM sessions ORDER BY created_at ASC',
  );
  for (const session of sessions) {
    await store.run(
      'INSERT INTO sessions (token_hash, officer_id, created_at, expires_at) VALUES (?,?,?,?)',
      hashToken(session.token),
      session.officer_id,
      session.created_at,
      session.expires_at,
    );
  }

  const columns = await store.all<SqliteColumnRow>('PRAGMA table_info(field_test)');
  const hasLegacySeq = columns.some((column) => column.name === 'seq');
  const selectSeq = hasLegacySeq ? 'seq' : 'NULL AS seq';
  const fields = await store.all<SqliteFieldRow>(
    `SELECT ${selectSeq}, record_uuid, case_ref, package_no, operator_id, outcome, confidence,
            created_at, received_at, payload_jcs, record_hash, prev_hash, chain_hash,
            device_attestation, image_ref, image_sha256, body
       FROM field_test
       ORDER BY received_at ASC, created_at ASC, record_uuid ASC`,
  );
  let nextSeq = fields.reduce((maximum, field) => Math.max(maximum, field.seq ?? 0), 0) + 1;
  const recordHashByUuid = new Map<string, string>();
  for (const field of fields) {
    const seq = field.seq ?? nextSeq++;
    if (seq === nextSeq - 1) nextSeq = seq + 1;
    recordHashByUuid.set(field.record_uuid, field.record_hash);
    await store.run(
      `INSERT INTO field_test
       (seq, record_uuid, officer_code, case_ref, package_no, operator_id, outcome, confidence,
        created_at, received_at, payload_jcs, record_hash, prev_hash, chain_hash,
        device_attestation, image_ref, image_sha256, body)
       VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      seq,
      field.record_uuid,
      field.case_ref,
      field.package_no,
      field.operator_id,
      field.outcome,
      field.confidence,
      field.created_at,
      field.received_at,
      field.payload_jcs,
      field.record_hash,
      field.prev_hash,
      field.chain_hash,
      field.device_attestation,
      field.image_ref,
      field.image_sha256,
      field.body,
    );
  }

  const cases = await store.all<SqliteCaseRow>(
    'SELECT case_ref, case_status, first_seen, last_seen, panchnama_ref FROM cases ORDER BY case_ref ASC',
  );
  for (const row of cases) {
    await store.run(
      `INSERT INTO cases
       (case_ref, case_status, region, department, location, location_label,
        first_record_at, last_record_at, first_seen, last_seen, panchnama_ref, created_at, updated_at,
        assigned_officer_code, reviewer_officer_code, review_note, reviewed_at)
       VALUES (?,?,'','','','',?,?,?,?,?,?,?,NULL,NULL,NULL,NULL)`,
      row.case_ref,
      row.case_status,
      row.first_seen,
      row.last_seen,
      row.first_seen,
      row.last_seen,
      row.panchnama_ref,
      row.first_seen,
      row.last_seen,
    );
  }

  const history = await store.all<SqliteHistoryRow>(
    'SELECT case_ref, from_status, to_status, actor, at, note FROM case_status_history ORDER BY id ASC',
  );
  for (const row of history) {
    await store.run(
      `INSERT INTO case_status_history
       (id, case_ref, officer_code, from_status, to_status, actor, at, note)
       VALUES (?,?,?,?,?,?,?,?)`,
      row.case_ref,
      officerCodeByUsername.get(row.actor) ?? null,
      row.from_status,
      row.to_status,
      row.actor,
      row.at,
      row.note,
    );
  }
}

function sqliteCopyStatement(): string {
  throw new Error('sqliteCopyStatement is not implemented');
}
*/

async function sqliteCopyRows(store: SqlStore): Promise<void> {
  const officers = await store.all<SqliteOfficerRow>(
    `SELECT id, username, pass_salt, pass_hash, display_name, role, created_at
       FROM officers_legacy_v0 ORDER BY id ASC`,
  );
  const officerCodeByUsername = new Map<string, string>();
  for (const officer of officers) {
    const officerCode = officer.username === 'admin' ? 'OFFICER-ADMIN' : `OFFICER-${officer.id}`;
    officerCodeByUsername.set(officer.username, officerCode);
    await store.run(
      `INSERT INTO officers
       (id, officer_code, username, pass_salt, pass_hash, display_name, role, status, created_at, approved_at, approved_by, last_login_at)
       VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?,NULL,NULL)`,
      officer.id,
      officerCode,
      officer.username,
      officer.pass_salt,
      officer.pass_hash,
      officer.display_name,
      officer.role,
      officer.created_at,
      officer.created_at,
    );
  }

  const sessions = await store.all<SqliteSessionRow>(
    `SELECT token, officer_id, created_at, expires_at
       FROM sessions_legacy_v0 ORDER BY created_at ASC`,
  );
  for (const session of sessions) {
    await store.run(
      'INSERT INTO sessions (token_hash, officer_id, created_at, expires_at) VALUES (?,?,?,?)',
      hashToken(session.token),
      session.officer_id,
      session.created_at,
      session.expires_at,
    );
  }

  const fieldColumns = await store.all<SqliteColumnRow>('PRAGMA table_info(field_test_legacy_v0)');
  const legacyFieldColumns = new Set(fieldColumns.map((column) => column.name));
  const optionalColumn = (name: string): string => (legacyFieldColumns.has(name) ? name : `NULL AS ${name}`);
  const fields = await store.all<SqliteFieldRow>(
    `SELECT ${legacyFieldColumns.has('seq') ? 'seq' : 'NULL AS seq'}, record_uuid, case_ref, package_no,
            operator_id, outcome, confidence, created_at, received_at, payload_jcs, record_hash,
            prev_hash, chain_hash, ${optionalColumn('device_attestation')},
            ${optionalColumn('image_ref')}, ${optionalColumn('image_sha256')}, body
       FROM field_test_legacy_v0
       ORDER BY received_at ASC, created_at ASC, record_uuid ASC`,
  );
  let nextSeq = fields.reduce((maximum, field) => Math.max(maximum, Number(field.seq ?? 0)), 0);
  const recordHashByUuid = new Map<string, string>();
  for (const field of fields) {
    const seq = field.seq ?? ++nextSeq;
    recordHashByUuid.set(field.record_uuid, field.record_hash);
    await store.run(
      `INSERT INTO field_test
       (seq, record_uuid, officer_code, case_ref, package_no, operator_id, operator_name, outcome, confidence,
        reagent, kit_type, kit_batch, region, department, location_label,
        created_at, received_at, payload_jcs, record_hash, prev_hash, chain_hash,
        device_attestation, image_ref, image_sha256, is_demo, body)
       VALUES (?,?,NULL,?,?,?,NULL,?,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?,?,?,?,?,?,?,?,NULL,?)`,
      seq,
      field.record_uuid,
      field.case_ref,
      field.package_no,
      field.operator_id,
      field.outcome,
      field.confidence,
      field.created_at,
      field.received_at,
      field.payload_jcs,
      field.record_hash,
      field.prev_hash,
      field.chain_hash,
      field.device_attestation,
      field.image_ref,
      field.image_sha256,
      field.body as string,
    );
  }

  const caseColumns = await store.all<SqliteColumnRow>('PRAGMA table_info(cases_legacy_v0)');
  const hasPanchNama = caseColumns.some((column) => column.name === 'panchnama_ref');
  const cases = await store.all<SqliteCaseRow>(
    `SELECT case_ref, case_status, first_seen, last_seen,
            ${hasPanchNama ? 'panchnama_ref' : 'NULL AS panchnama_ref'}
       FROM cases_legacy_v0 ORDER BY case_ref ASC`,
  );
  for (const row of cases) {
    await store.run(
      `INSERT INTO cases
       (case_ref, case_status, region, department, location, location_label,
        first_record_at, last_record_at, first_seen, last_seen, panchnama_ref, created_at, updated_at,
        assigned_officer_code, reviewer_officer_code, review_note, reviewed_at)
       VALUES (?,?,'','','','',?,?,?,?,?,?,?,NULL,NULL,NULL,NULL)`,
      row.case_ref,
      row.case_status,
      row.first_seen,
      row.last_seen,
      row.first_seen,
      row.last_seen,
      row.panchnama_ref,
      row.first_seen,
      row.last_seen,
    );
  }

  const idempotency = await store.all<SqliteIdempotencyRow>(
    `SELECT key, record_uuid, created_at FROM idempotency_legacy_v0 ORDER BY created_at ASC, key ASC`,
  );
  const legacyOfficerCode = officers.find((officer) => officer.username === 'admin')
    ? 'OFFICER-ADMIN'
    : officers[0]
      ? `OFFICER-${officers[0].id}`
      : null;
  for (const row of idempotency) {
    if (!legacyOfficerCode) {
      throw new MigrationError('legacy SQLite idempotency rows cannot be officer-scoped because no officer exists');
    }
    const requestHash = recordHashByUuid.get(row.record_uuid);
    if (!requestHash) {
      throw new MigrationError(`legacy SQLite idempotency row ${row.key} references a missing field_test row`);
    }
    const responseJson = JSON.stringify({ status: 'replayed', migrated: true, officer_scope: 'legacy-inferred' });
    await store.run(
      `INSERT INTO idempotency
       (officer_code, key, request_hash, record_uuid, response_status, response_json, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      legacyOfficerCode,
      row.key,
      requestHash,
      row.record_uuid,
      200,
      responseJson,
      row.created_at,
    );
  }

  const history = await store.all<SqliteHistoryRow>(
    `SELECT id, case_ref, from_status, to_status, actor, at, note
       FROM case_status_history_legacy_v0 ORDER BY id ASC`,
  );
  for (const row of history) {
    await store.run(
      `INSERT INTO case_status_history
       (id, case_ref, officer_code, from_status, to_status, actor, at, note)
       VALUES (?,?,?,?,?,?,?,?)`,
      row.id,
      row.case_ref,
      officerCodeByUsername.get(row.actor) ?? null,
      row.from_status,
      row.to_status,
      row.actor,
      row.at,
      row.note,
    );
  }

  const audit = await store.all<SqliteAuditRow>(
    `SELECT id, actor, action, subject, at, detail FROM server_audit_legacy_v0 ORDER BY id ASC`,
  );
  for (const row of audit) {
    await store.run(
      `INSERT INTO server_audit
       (id, officer_code, actor, action, subject, at, detail)
       VALUES (?,?,?,?,?,?,?)`,
      row.id,
      officerCodeByUsername.get(row.actor) ?? null,
      row.actor,
      row.action,
      row.subject,
      row.at,
      row.detail,
    );
  }
}

async function applyLegacySqliteMigration(store: SqlStore): Promise<void> {
  await validateSqliteLegacyShape(store);
  await validateSqliteLegacyData(store);

  for (const table of SQLITE_CORE_TABLES) {
    await store.run(`ALTER TABLE ${table} RENAME TO ${table}_legacy_v0`);
  }
  await sqliteCreateTables(store);
  await sqliteCopyRows(store);

  for (const table of [...SQLITE_CORE_TABLES].reverse()) {
    await store.run(`DROP TABLE ${table}_legacy_v0`);
  }
  await sqliteCreateIndexesAndGuards(store);

  const foreignKeyProblems = await store.all<Record<string, unknown>>('PRAGMA foreign_key_check');
  if (foreignKeyProblems.length > 0) {
    throw new MigrationError(`migrated SQLite schema has ${foreignKeyProblems.length} foreign-key violation(s)`);
  }

  const last = await store.get<LedgerRow>(
    'SELECT seq, record_uuid, chain_hash, received_at AS updated_at FROM field_test ORDER BY seq DESC LIMIT 1',
  );
  if (last) {
    await store.run(
      'INSERT INTO ledger_head (id, seq, record_uuid, chain_hash, updated_at) VALUES (1,?,?,?,?)',
      Number(last.seq),
      last.record_uuid,
      last.chain_hash,
      last.updated_at,
    );
  } else {
    await store.run(
      'INSERT INTO ledger_head (id, seq, record_uuid, chain_hash, updated_at) VALUES (1,0,NULL,?,?)',
      '0'.repeat(64),
      new Date().toISOString(),
    );
  }
}

async function applySqliteBaseline(store: SqlStore): Promise<boolean> {
  const existing = await sqliteExistingTables(store);
  if (existing.size === 0) {
    await applyFreshSqliteMigration(store);
    return true;
  }
  await applyLegacySqliteMigration(store);
  return false;
}

const POSTGRES_LEGACY_COLUMNS: Record<(typeof POSTGRES_CORE_TABLES)[number], Record<string, readonly string[]>> = {
  officers: {
    id: ['bigint', 'integer'],
    username: ['text'],
    pass_salt: ['text'],
    pass_hash: ['text'],
    display_name: ['text'],
    role: ['text'],
    created_at: ['text'],
  },
  sessions: {
    token: ['text'],
    officer_id: ['bigint', 'integer'],
    created_at: ['text'],
    expires_at: ['text'],
  },
  field_test: {
    seq: ['bigint', 'integer'],
    record_uuid: ['text'],
    case_ref: ['text'],
    package_no: ['text'],
    operator_id: ['text'],
    outcome: ['text'],
    confidence: ['double precision'],
    created_at: ['text'],
    received_at: ['text'],
    payload_jcs: ['text'],
    record_hash: ['text'],
    prev_hash: ['text'],
    chain_hash: ['text'],
    device_attestation: ['text'],
    image_ref: ['text'],
    image_sha256: ['text'],
    body: ['text'],
  },
  idempotency: {
    key: ['text'],
    record_uuid: ['text'],
    created_at: ['text'],
  },
  cases: {
    case_ref: ['text'],
    case_status: ['text'],
    first_seen: ['text'],
    last_seen: ['text'],
    panchnama_ref: ['text'],
  },
  case_status_history: {
    id: ['bigint', 'integer'],
    case_ref: ['text'],
    from_status: ['text'],
    to_status: ['text'],
    actor: ['text'],
    at: ['text'],
    note: ['text'],
  },
  server_audit: {
    id: ['bigint', 'integer'],
    actor: ['text'],
    action: ['text'],
    subject: ['text'],
    at: ['text'],
    detail: ['text'],
  },
};

function postgresColumnType(row: PostgresColumnRow): string {
  return row.data_type === 'USER-DEFINED' ? row.udt_name : row.data_type;
}

async function postgresHasColumn(store: SqlStore, table: string, column: string): Promise<boolean> {
  const row = await store.get<{ present: number | string }>(
    `SELECT 1 AS present FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`,
    table,
    column,
  );
  return row !== undefined;
}

async function ensurePostgresColumn(
  store: SqlStore,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!(await postgresHasColumn(store, table, column))) {
    await store.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function postgresConstraintExists(store: SqlStore, table: string, constraint: string): Promise<boolean> {
  const row = await store.get<{ present: number | string }>(
    `SELECT 1 AS present FROM pg_constraint
      WHERE conrelid = to_regclass(?) AND conname = ?`,
    table,
    constraint,
  );
  return row !== undefined;
}

async function ensurePostgresConstraint(
  store: SqlStore,
  table: string,
  constraint: string,
  definition: string,
): Promise<void> {
  if (!(await postgresConstraintExists(store, table, constraint))) {
    await store.run(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} ${definition}`);
  }
}

async function dropPostgresPrimaryKey(store: SqlStore, table: string): Promise<void> {
  const keys = await store.all<{ conname: string }>(
    `SELECT conname FROM pg_constraint
      WHERE conrelid = to_regclass(?) AND contype = 'p'`,
    table,
  );
  for (const key of keys) {
    await store.run(`ALTER TABLE ${table} DROP CONSTRAINT "${key.conname.replaceAll('"', '""')}"`);
  }
}

async function validatePostgresLegacyShape(store: SqlStore): Promise<void> {
  const existing = await postgresExistingTables(store);
  if (existing.size === 0) return;
  const missingTables = POSTGRES_CORE_TABLES.filter((table) => !existing.has(table));
  if (missingTables.length > 0) {
    throw new MigrationError(
      `legacy PostgreSQL schema is partial or unknown; missing recognized tables: ${missingTables.join(', ')}`,
    );
  }
  const rows = await store.all<PostgresColumnRow>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name IN (${POSTGRES_CORE_TABLES.map(() => '?').join(',')})`,
    ...POSTGRES_CORE_TABLES,
  );
  for (const table of POSTGRES_CORE_TABLES) {
    const byName = new Map(
      rows.filter((row) => row.table_name === table).map((row) => [row.column_name, row]),
    );
    for (const [column, expectedTypes] of Object.entries(POSTGRES_LEGACY_COLUMNS[table])) {
      const actual = byName.get(column);
      if (!actual) {
        if (column === 'seq' && table === 'field_test') continue;
        if (column === 'panchnama_ref' && table === 'cases') continue;
        throw new MigrationError(`legacy PostgreSQL table ${table} is missing required column ${column}`);
      }
      const actualType = postgresColumnType(actual);
      if (!expectedTypes.includes(actualType)) {
        throw new MigrationError(
          `legacy PostgreSQL table ${table}.${column} has unexpected type ${actualType}; expected ${expectedTypes.join(' or ')}`,
        );
      }
    }
  }
}

async function validatePostgresLegacyData(store: SqlStore): Promise<void> {
  const invalidOfficers = await store.get<CountRow>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS c FROM officers
      WHERE username IS NULL OR display_name IS NULL OR created_at IS NULL
         OR role NOT IN ('JUNIOR','SENIOR','ADMIN','SUPERVISOR','JUDICIARY')`,
  );
  if (Number(invalidOfficers?.c ?? 0) > 0) {
    throw new MigrationError('legacy PostgreSQL officers contain missing identity fields or unsupported roles');
  }
  const duplicateSeq = await store.get<{ chain_hash: string }>(
    `SELECT chain_hash FROM field_test WHERE chain_hash IS NOT NULL
      GROUP BY chain_hash HAVING CAST(COUNT(*) AS INTEGER) > 1 LIMIT 1`,
  );
  if (duplicateSeq) throw new MigrationError('legacy PostgreSQL field_test.chain_hash is duplicated');
  const invalidCases = await store.get<CountRow>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS c FROM cases
      WHERE case_status NOT IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED')`,
  );
  if (Number(invalidCases?.c ?? 0) > 0) {
    throw new MigrationError('legacy PostgreSQL cases contain unsupported status values');
  }
  const orphanHistory = await store.get<CountRow>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS c FROM case_status_history h
      LEFT JOIN cases c ON c.case_ref = h.case_ref WHERE c.case_ref IS NULL`,
  );
  if (Number(orphanHistory?.c ?? 0) > 0) {
    throw new MigrationError('legacy PostgreSQL case_status_history contains orphaned rows');
  }
}

async function postgresCreateTables(store: SqlStore): Promise<void> {
  for (const sql of postgresTableDefinitions()) await store.run(sql);
}

async function postgresCreateIndexesAndGuards(store: SqlStore): Promise<void> {
  await store.run(`CREATE OR REPLACE FUNCTION parinaam_advance_ledger_head()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $parinaam$
    BEGIN
      INSERT INTO ledger_head (id, seq, record_uuid, chain_hash, updated_at)
      VALUES (1, NEW.seq, NEW.record_uuid, NEW.chain_hash, NEW.received_at)
      ON CONFLICT (id) DO UPDATE SET
        seq = EXCLUDED.seq,
        record_uuid = EXCLUDED.record_uuid,
        chain_hash = EXCLUDED.chain_hash,
        updated_at = EXCLUDED.updated_at
      WHERE EXCLUDED.seq >= ledger_head.seq;
      RETURN NEW;
    END
    $parinaam$`);
  for (const sql of postgresIndexDefinitions()) await store.run(sql);
  for (const sql of postgresTriggerDefinitions()) await store.run(sql);
}

async function applyFreshPostgresMigration(store: SqlStore): Promise<void> {
  await postgresCreateTables(store);
  await store.run(
    'INSERT INTO ledger_head (id, seq, record_uuid, chain_hash, updated_at) VALUES (1,0,NULL,?,?)',
    '0'.repeat(64),
    new Date().toISOString(),
  );
  await postgresCreateIndexesAndGuards(store);
}

async function addPostgresOfficerColumns(store: SqlStore): Promise<void> {
  await ensurePostgresColumn(store, 'officers', 'officer_code', 'officer_code TEXT');
  await ensurePostgresColumn(store, 'officers', 'status', "status TEXT DEFAULT 'PENDING'");
  await ensurePostgresColumn(store, 'officers', 'approved_at', 'approved_at TEXT');
  await ensurePostgresColumn(store, 'officers', 'approved_by', 'approved_by BIGINT');
  await ensurePostgresColumn(store, 'officers', 'last_login_at', 'last_login_at TEXT');
  await store.run(
    `UPDATE officers
        SET officer_code = CASE
              WHEN officer_code IS NULL OR officer_code = ''
                THEN CASE WHEN username = 'admin' THEN 'OFFICER-ADMIN' ELSE 'OFFICER-' || id::text END
              ELSE officer_code
            END,
            status = CASE WHEN status IS NULL THEN 'ACTIVE' ELSE status END,
            approved_at = CASE WHEN status = 'ACTIVE' THEN COALESCE(approved_at, created_at) ELSE approved_at END`,
  );
  await store.run(
    `UPDATE officers SET approved_at = COALESCE(approved_at, created_at)
      WHERE status = 'ACTIVE' AND approved_at IS NULL`,
  );
  await store.run("ALTER TABLE officers ALTER COLUMN status SET DEFAULT 'PENDING'");
  await store.run('ALTER TABLE officers ALTER COLUMN officer_code SET NOT NULL');
  await store.run('ALTER TABLE officers ALTER COLUMN status SET NOT NULL');
  await ensurePostgresConstraint(store, 'officers', 'officers_officer_code_unique', 'UNIQUE (officer_code)');
  await ensurePostgresConstraint(
    store,
    'officers',
    'officers_status_v1',
    "CHECK (status IN ('PENDING','ACTIVE','SUSPENDED'))",
  );
  await ensurePostgresConstraint(
    store,
    'officers',
    'officers_approved_by_fk',
    'FOREIGN KEY (approved_by) REFERENCES officers(id) ON DELETE SET NULL',
  );
}

async function replacePostgresSessions(store: SqlStore): Promise<void> {
  const rows = await store.all<PostgresSessionRow>('SELECT token, officer_id, created_at, expires_at FROM sessions');
  const hashes = new Set<string>();
  for (const row of rows) {
    assertNonEmpty(row.token, 'sessions', 'token');
    const digest = hashToken(row.token);
    if (hashes.has(digest)) throw new MigrationError('legacy PostgreSQL sessions contain duplicate bearer tokens');
    hashes.add(digest);
  }
  await store.run('DROP TABLE sessions');
  await store.run(
    `CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
      officer_id BIGINT NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`,
  );
  for (const row of rows) {
    await store.run(
      'INSERT INTO sessions (token_hash, officer_id, created_at, expires_at) VALUES (?,?,?,?)',
      hashToken(row.token),
      Number(row.officer_id),
      row.created_at,
      row.expires_at,
    );
  }
}

async function upgradePostgresFieldTests(store: SqlStore): Promise<Map<string, string>> {
  const columns = await store.all<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'field_test'`,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has('seq')) await store.run('ALTER TABLE field_test ADD COLUMN seq BIGINT');
  if (!names.has('officer_code')) await store.run('ALTER TABLE field_test ADD COLUMN officer_code TEXT');
  if (!names.has('reagent')) await store.run('ALTER TABLE field_test ADD COLUMN reagent TEXT');
  if (!names.has('kit_type')) await store.run('ALTER TABLE field_test ADD COLUMN kit_type TEXT');
  if (!names.has('kit_batch')) await store.run('ALTER TABLE field_test ADD COLUMN kit_batch TEXT');
  if (!names.has('operator_name')) await store.run('ALTER TABLE field_test ADD COLUMN operator_name TEXT');
  if (!names.has('region')) await store.run('ALTER TABLE field_test ADD COLUMN region TEXT');
  if (!names.has('department')) await store.run('ALTER TABLE field_test ADD COLUMN department TEXT');
  if (!names.has('location_label')) await store.run('ALTER TABLE field_test ADD COLUMN location_label TEXT');
  if (!names.has('is_demo')) await store.run('ALTER TABLE field_test ADD COLUMN is_demo BOOLEAN');

  const fields = await store.all<PostgresFieldRow>(
    `SELECT seq, record_uuid, case_ref, package_no, operator_id, outcome, confidence, created_at, received_at,
            payload_jcs, record_hash, prev_hash, chain_hash, device_attestation, image_ref, image_sha256, body
       FROM field_test ORDER BY received_at, created_at, record_uuid`,
  );
  const seqs = new Set<number>();
  let maxSeq = 0;
  for (const field of fields) {
    if (field.seq !== null) {
      const seq = Number(field.seq);
      if (!Number.isSafeInteger(seq) || seq <= 0 || seqs.has(seq)) {
        throw new MigrationError(`legacy PostgreSQL field_test.seq is invalid or duplicated: ${String(field.seq)}`);
      }
      seqs.add(seq);
      maxSeq = Math.max(maxSeq, seq);
    }
  }
  const recordHashByUuid = new Map<string, string>();
  for (const field of fields) {
    const seq = field.seq === null ? ++maxSeq : Number(field.seq);
    if (field.seq === null) {
      await store.run('UPDATE field_test SET seq = ? WHERE record_uuid = ?', seq, field.record_uuid);
    }
    recordHashByUuid.set(field.record_uuid, field.record_hash);
  }
  await store.run('ALTER TABLE field_test ALTER COLUMN seq SET NOT NULL');
  await ensurePostgresConstraint(store, 'field_test', 'field_test_seq_unique', 'UNIQUE (seq)');
  await ensurePostgresConstraint(store, 'field_test', 'field_test_chain_hash_unique', 'UNIQUE (chain_hash)');
  await ensurePostgresConstraint(
    store,
    'field_test',
    'field_test_officer_fk',
    'FOREIGN KEY (officer_code) REFERENCES officers(officer_code) ON UPDATE RESTRICT ON DELETE RESTRICT',
  );
  return recordHashByUuid;
}

async function upgradePostgresCases(store: SqlStore): Promise<void> {
  const columns = await store.all<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'cases'`,
  );
  const names = new Set(columns.map((column) => column.column_name));
  if (!names.has('panchnama_ref')) await store.run('ALTER TABLE cases ADD COLUMN panchnama_ref TEXT');
  await ensurePostgresColumn(store, 'cases', 'version', 'version INTEGER NOT NULL DEFAULT 1');
  await ensurePostgresColumn(store, 'cases', 'region', "region TEXT NOT NULL DEFAULT ''");
  await ensurePostgresColumn(store, 'cases', 'department', "department TEXT NOT NULL DEFAULT ''");
  await ensurePostgresColumn(store, 'cases', 'location', "location TEXT NOT NULL DEFAULT ''");
  await ensurePostgresColumn(store, 'cases', 'location_label', "location_label TEXT NOT NULL DEFAULT ''");
  await ensurePostgresColumn(store, 'cases', 'first_record_at', 'first_record_at TEXT');
  await ensurePostgresColumn(store, 'cases', 'last_record_at', 'last_record_at TEXT');
  await ensurePostgresColumn(store, 'cases', 'created_at', 'created_at TEXT');
  await ensurePostgresColumn(store, 'cases', 'updated_at', 'updated_at TEXT');
  await ensurePostgresColumn(store, 'cases', 'assigned_officer_code', 'assigned_officer_code TEXT');
  await ensurePostgresColumn(store, 'cases', 'reviewer_officer_code', 'reviewer_officer_code TEXT');
  await ensurePostgresColumn(store, 'cases', 'review_note', 'review_note TEXT');
  await ensurePostgresColumn(store, 'cases', 'reviewed_at', 'reviewed_at TEXT');
  await store.run('UPDATE cases SET first_record_at = COALESCE(first_record_at, first_seen), last_record_at = COALESCE(last_record_at, last_seen), created_at = COALESCE(created_at, first_seen), updated_at = COALESCE(updated_at, last_seen)');
  await store.run('ALTER TABLE cases ALTER COLUMN first_seen DROP NOT NULL');
  await store.run('ALTER TABLE cases ALTER COLUMN last_seen DROP NOT NULL');
  await store.run("ALTER TABLE cases ALTER COLUMN case_status SET DEFAULT 'REPORTED'");
  await ensurePostgresConstraint(
    store,
    'cases',
    'cases_status_v1',
    "CHECK (case_status IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED'))",
  );
  await ensurePostgresConstraint(
    store,
    'cases',
    'cases_assigned_officer_fk',
    'FOREIGN KEY (assigned_officer_code) REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL',
  );
  await ensurePostgresConstraint(
    store,
    'cases',
    'cases_reviewer_officer_fk',
    'FOREIGN KEY (reviewer_officer_code) REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL',
  );
}

async function upgradePostgresHistoryAndAudit(store: SqlStore): Promise<void> {
  await ensurePostgresColumn(store, 'case_status_history', 'officer_code', 'officer_code TEXT');
  await ensurePostgresConstraint(
    store,
    'case_status_history',
    'case_history_case_fk',
    'FOREIGN KEY (case_ref) REFERENCES cases(case_ref) ON UPDATE RESTRICT ON DELETE RESTRICT',
  );
  await ensurePostgresConstraint(
    store,
    'case_status_history',
    'case_history_officer_fk',
    'FOREIGN KEY (officer_code) REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL',
  );
  await ensurePostgresConstraint(
    store,
    'case_status_history',
    'case_history_from_status_v1',
    "CHECK (from_status IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED'))",
  );
  await ensurePostgresConstraint(
    store,
    'case_status_history',
    'case_history_to_status_v1',
    "CHECK (to_status IN ('REPORTED','UNDER_REVIEW','REVIEWED','ESCALATED'))",
  );
  await ensurePostgresColumn(store, 'server_audit', 'officer_code', 'officer_code TEXT');
  await ensurePostgresConstraint(
    store,
    'server_audit',
    'server_audit_officer_fk',
    'FOREIGN KEY (officer_code) REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE SET NULL',
  );
  await store.run(
    `UPDATE case_status_history h SET officer_code = o.officer_code
       FROM officers o WHERE o.username = h.actor`,
  );
  await store.run(
    `UPDATE server_audit a SET officer_code = o.officer_code
       FROM officers o WHERE o.username = a.actor`,
  );
}

async function upgradePostgresIdempotency(
  store: SqlStore,
  recordHashByUuid: Map<string, string>,
): Promise<void> {
  await ensurePostgresColumn(store, 'idempotency', 'officer_code', 'officer_code TEXT');
  await ensurePostgresColumn(store, 'idempotency', 'request_hash', 'request_hash TEXT');
  await ensurePostgresColumn(store, 'idempotency', 'response_status', 'response_status INTEGER');
  await ensurePostgresColumn(store, 'idempotency', 'response_json', 'response_json TEXT');
  await ensurePostgresColumn(store, 'idempotency', 'response', 'response TEXT');
  const officer = await store.get<{ officer_code: string }>(
    `SELECT officer_code FROM officers
      ORDER BY CASE WHEN username = 'admin' THEN 0 ELSE 1 END, id LIMIT 1`,
  );
  const rows = await store.all<PostgresIdempotencyRow>(
    'SELECT key, record_uuid, created_at FROM idempotency ORDER BY created_at, key',
  );
  if (rows.length > 0 && !officer) {
    throw new MigrationError('legacy PostgreSQL idempotency rows cannot be officer-scoped because no officer exists');
  }
  for (const row of rows) {
    const requestHash = recordHashByUuid.get(row.record_uuid);
    if (!requestHash) {
      throw new MigrationError(
        `legacy PostgreSQL idempotency row ${row.key} references missing field_test ${row.record_uuid}`,
      );
    }
    const responseJson = JSON.stringify({ status: 'replayed', migrated: true, officer_scope: 'legacy-inferred' });
    await store.run(
      `UPDATE idempotency
          SET officer_code = ?, request_hash = ?, response_status = ?, response_json = ?, response = ?
        WHERE key = ?`,
      officer?.officer_code ?? null,
      requestHash,
      200,
      responseJson,
      responseJson,
      row.key,
    );
  }
  await store.run('ALTER TABLE idempotency ALTER COLUMN officer_code SET NOT NULL');
  await store.run('ALTER TABLE idempotency ALTER COLUMN request_hash SET NOT NULL');
  await store.run('ALTER TABLE idempotency ALTER COLUMN response_status SET NOT NULL');
  await store.run('ALTER TABLE idempotency ALTER COLUMN response_json SET NOT NULL');
  await store.run('ALTER TABLE idempotency ALTER COLUMN response SET NOT NULL');
  await dropPostgresPrimaryKey(store, 'idempotency');
  await store.run('ALTER TABLE idempotency ADD PRIMARY KEY (officer_code, key)');
  await ensurePostgresConstraint(
    store,
    'idempotency',
    'idempotency_officer_fk',
    'FOREIGN KEY (officer_code) REFERENCES officers(officer_code) ON UPDATE CASCADE ON DELETE RESTRICT',
  );
  await ensurePostgresConstraint(
    store,
    'idempotency',
    'idempotency_record_fk',
    'FOREIGN KEY (record_uuid) REFERENCES field_test(record_uuid) ON UPDATE RESTRICT ON DELETE RESTRICT',
  );
}

async function createPostgresLedgerAndEvidence(store: SqlStore): Promise<void> {
  await store.run(
    `CREATE TABLE IF NOT EXISTS ledger_head (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      seq         BIGINT NOT NULL UNIQUE CHECK (seq >= 0),
      record_uuid TEXT UNIQUE REFERENCES field_test(record_uuid) ON UPDATE RESTRICT ON DELETE RESTRICT,
      chain_hash  TEXT NOT NULL UNIQUE,
      updated_at  TEXT NOT NULL
    )`,
  );
  await store.run(
    `CREATE TABLE IF NOT EXISTS evidence_blobs (
      record_uuid  TEXT PRIMARY KEY REFERENCES field_test(record_uuid) ON UPDATE RESTRICT ON DELETE RESTRICT,
      sha256       TEXT NOT NULL,
      content_type TEXT NOT NULL,
      byte_size    BIGINT NOT NULL CHECK (byte_size > 0),
      bytes        BYTEA NOT NULL,
      hash         TEXT GENERATED ALWAYS AS (sha256) STORED,
      size         BIGINT GENERATED ALWAYS AS (byte_size) STORED,
      created_at   TEXT NOT NULL
    )`,
  );
  const existingHead = await store.get<{ id: number | string }>('SELECT id FROM ledger_head LIMIT 1');
  if (existingHead) return;
  const inserted = await store.run(
    `INSERT INTO ledger_head (id, seq, record_uuid, chain_hash, updated_at)
     SELECT 1, seq, record_uuid, chain_hash, received_at
       FROM field_test ORDER BY seq DESC LIMIT 1`,
  );
  if (inserted.rowCount === 0) {
    await store.run(
      'INSERT INTO ledger_head (id, seq, record_uuid, chain_hash, updated_at) VALUES (1,0,NULL,?,?)',
      '0'.repeat(64),
      new Date().toISOString(),
    );
  }
}

async function applyLegacyPostgresMigration(store: SqlStore): Promise<void> {
  await validatePostgresLegacyShape(store);
  await validatePostgresLegacyData(store);
  await addPostgresOfficerColumns(store);
  await replacePostgresSessions(store);
  const recordHashByUuid = await upgradePostgresFieldTests(store);
  await upgradePostgresCases(store);
  await upgradePostgresHistoryAndAudit(store);
  await upgradePostgresIdempotency(store, recordHashByUuid);
  await createPostgresLedgerAndEvidence(store);
  await postgresCreateIndexesAndGuards(store);
}

async function applyPostgresBaseline(store: SqlStore): Promise<boolean> {
  const existing = await postgresExistingTables(store);
  if (existing.size === 0) {
    await applyFreshPostgresMigration(store);
    return true;
  }
  await applyLegacyPostgresMigration(store);
  return false;
}

function migrationChecksum(): string {
  const canonicalSql = JSON.stringify({
    identity: MIGRATION_IDENTITY,
    algorithm: MIGRATION_ALGORITHM,
    sqlite: [...sqliteTableDefinitions(), ...sqliteIndexDefinitions(), ...sqliteTriggerDefinitions()],
    postgres: [...postgresTableDefinitions(), ...postgresIndexDefinitions(), ...postgresTriggerDefinitions()],
  });
  return createHash('sha256').update(canonicalSql, 'utf8').digest('hex');
}

function safeMigrationMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted database URL]');
}

async function readAppliedVersion(store: SqlStore): Promise<AppliedMigrationRow[]> {
  const rows = await store.all<AppliedMigrationRow>(
    'SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC',
  );
  for (const row of rows) {
    const version = Number(row.version);
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new MigrationError(`schema_migrations contains invalid version ${String(row.version)}`);
    }
    if (version > LATEST_SCHEMA_VERSION) {
      throw new MigrationError(
        `database schema version ${version} is newer than supported version ${LATEST_SCHEMA_VERSION}`,
      );
    }
    if (version === LATEST_SCHEMA_VERSION && (row.name !== SCHEMA_MIGRATION_NAME || row.checksum !== migrationChecksum())) {
      throw new MigrationError(`schema migration ${version} does not match this server build`);
    }
  }
  return rows;
}

export async function runMigrations(store: SqlStore): Promise<MigrationResult> {
  await store.run(migrationTableSql(store.engine));

  const existingRows = await readAppliedVersion(store);
  if (existingRows.some((row) => Number(row.version) === LATEST_SCHEMA_VERSION)) {
    return { fromVersion: LATEST_SCHEMA_VERSION, toVersion: LATEST_SCHEMA_VERSION, fresh: false };
  }

  const sqliteForeignKeysDisabled = store.engine === 'node:sqlite';
  if (sqliteForeignKeysDisabled) await store.run('PRAGMA foreign_keys = OFF');
  try {
    return await store.transaction(async (transaction) => {
      if (store.engine === 'postgres') {
        await transaction.run('SELECT pg_advisory_xact_lock(1937001, 1)');
      }
      const concurrentRows = await readAppliedVersion(transaction);
      if (concurrentRows.some((row) => Number(row.version) === LATEST_SCHEMA_VERSION)) {
        return { fromVersion: LATEST_SCHEMA_VERSION, toVersion: LATEST_SCHEMA_VERSION, fresh: false };
      }

      const fresh =
        store.engine === 'node:sqlite'
          ? await applySqliteBaseline(transaction)
          : await applyPostgresBaseline(transaction);
      await transaction.run(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?,?,?,?)',
        LATEST_SCHEMA_VERSION,
        SCHEMA_MIGRATION_NAME,
        migrationChecksum(),
        new Date().toISOString(),
      );
      return { fromVersion: 0, toVersion: LATEST_SCHEMA_VERSION, fresh };
    });
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError(
      `database migration ${LATEST_SCHEMA_VERSION} failed: ${safeMigrationMessage(error)}`,
      { cause: error },
    );
  } finally {
    if (sqliteForeignKeysDisabled) await store.run('PRAGMA foreign_keys = ON');
  }
}

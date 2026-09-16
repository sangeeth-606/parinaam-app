/**
 * Parinaam API — PostgreSQL store adapter.
 * Speaks the exact same portable-SQL dialect as the sqlite store (see db.ts header
 * rules); the only PG-specific work here is `?` → `$n` placeholder rewriting and the
 * schema types. One pool, max 1 connection: record ingestion computes seq/chain from
 * the previous row, so serialising through the pool is also the correctness guard.
 */

import type { SqlStore } from './db.ts';

const SCHEMA_PG = `
CREATE TABLE IF NOT EXISTS officers (
  id           BIGSERIAL PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE,
  pass_salt    TEXT NOT NULL,
  pass_hash    TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('JUNIOR','SENIOR','ADMIN','SUPERVISOR','JUDICIARY')),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  officer_id BIGINT NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS field_test (
  seq                BIGINT NOT NULL,
  record_uuid        TEXT PRIMARY KEY,
  case_ref           TEXT NOT NULL,
  package_no         TEXT NOT NULL,
  operator_id        TEXT NOT NULL,
  outcome            TEXT NOT NULL,
  confidence         DOUBLE PRECISION NOT NULL,
  created_at         TEXT NOT NULL,
  received_at        TEXT NOT NULL,
  payload_jcs        TEXT NOT NULL,
  record_hash        TEXT NOT NULL,
  prev_hash          TEXT NOT NULL,
  chain_hash         TEXT NOT NULL,
  device_attestation TEXT,
  image_ref          TEXT,
  image_sha256       TEXT,
  body               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ft_case ON field_test (case_ref, created_at);
CREATE INDEX IF NOT EXISTS idx_ft_seq ON field_test (seq);

CREATE TABLE IF NOT EXISTS idempotency (
  key         TEXT PRIMARY KEY,
  record_uuid TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  case_ref      TEXT PRIMARY KEY,
  case_status   TEXT NOT NULL,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  panchnama_ref TEXT
);

CREATE TABLE IF NOT EXISTS case_status_history (
  id          BIGSERIAL PRIMARY KEY,
  case_ref    TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  actor       TEXT NOT NULL,
  at          TEXT NOT NULL,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS server_audit (
  id         BIGSERIAL PRIMARY KEY,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  subject    TEXT,
  at         TEXT NOT NULL,
  detail     TEXT
);
`;

export const DEFAULT_DATABASE_URL = 'postgres://parinaam:parinaam@localhost:55433/parinaam';

export class PgStore implements SqlStore {
  readonly engine = 'postgres' as const;
  // pg types are ambient-free here: the package is loaded dynamically so the
  // sqlite/test path never requires it at runtime.
  private pool: {
    query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
    end(): Promise<void>;
  };

  private constructor(pool: PgStore['pool']) {
    this.pool = pool;
  }

  static async connect(url?: string): Promise<SqlStore> {
    const target = url ?? DEFAULT_DATABASE_URL;
    const pg = (await import('pg')) as unknown as {
      default?: {
        Pool: new (c: Record<string, unknown>) => PgStore['pool'];
        types?: { setTypeParser: (oid: number, fn: (val: string) => unknown) => void };
      };
      Pool?: new (c: Record<string, unknown>) => PgStore['pool'];
      types?: { setTypeParser: (oid: number, fn: (val: string) => unknown) => void };
    };
    const types = pg.default?.types ?? pg.types;
    if (types?.setTypeParser) {
      types.setTypeParser(20, (v: string) => parseInt(v, 10)); // int8 / BIGINT -> number
    }
    const Pool = (pg.default?.Pool ?? pg.Pool)!;
    const pool = new Pool({ connectionString: target, max: 1 });
    const store = new PgStore(pool);
    for (const stmt of SCHEMA_PG.split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
      await pool.query(stmt);
    }
    try {
      await pool.query('ALTER TABLE cases ADD COLUMN IF NOT EXISTS panchnama_ref TEXT;');
      await pool.query('ALTER TABLE officers DROP CONSTRAINT IF EXISTS officers_role_check;');
      await pool.query("ALTER TABLE officers ADD CONSTRAINT officers_role_check CHECK (role IN ('JUNIOR','SENIOR','ADMIN','SUPERVISOR','JUDICIARY'));");
    } catch {
      /* already up to date */
    }
    return store;
  }

  /** Portable dialect uses `?`; node-postgres wants $1..$n. No literal '?' exists in SQL text. */
  private static positional(sql: string): string {
    let n = 0;
    return sql.replace(/\?/g, () => `$${++n}`);
  }

  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const res = await this.pool.query(PgStore.positional(sql), params);
    return res.rows[0] as T | undefined;
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const res = await this.pool.query(PgStore.positional(sql), params);
    return res.rows as T[];
  }

  async run(sql: string, ...params: unknown[]): Promise<void> {
    await this.pool.query(PgStore.positional(sql), params);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

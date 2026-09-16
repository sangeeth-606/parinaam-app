/**
 * Parinaam API — database layer (v2 phase D, Postgres-complete 2026-09).
 *
 * Storage is behind a minimal async SQL store (`SqlStore`) with two interchangeable
 * engines speaking the SAME queries:
 *   • node:sqlite — embedded file / :memory:  (default; hermetic tests, quick local runs)
 *   • PostgreSQL  — `PARINAAM_DB=postgres` + DATABASE_URL (docker compose service `db`)
 * The HTTP JSON contract on top is engine-independent; nothing else may know which
 * store is underneath. No cloud database is used or planned.
 *
 * Query-portability rules (both engines must accept every statement):
 *   • positional `?` placeholders (the PG store rewrites them to $n)
 *   • TEXT timestamps (ISO strings), not engine date types
 *   • ON CONFLICT DO UPDATE/NOTHING (never INSERT OR IGNORE)
 *   • field_test.seq via (SELECT COALESCE(MAX(seq),0)+1 …) — never implicit rowid
 *   • mixed-case aliases must be double-quoted (PG lowercases unquoted ones)
 *   • CAST(COUNT(*) AS INTEGER) so bigint rows never surface as strings
 */

import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const CASE_STATUSES = ['REPORTED', 'UNDER_REVIEW', 'REVIEWED', 'ESCALATED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const OFFICER_ROLES = ['JUNIOR', 'SENIOR', 'ADMIN', 'SUPERVISOR', 'JUDICIARY'] as const;
export type OfficerRole = (typeof OFFICER_ROLES)[number];

export interface OfficerRow {
  id: number;
  username: string;
  display_name: string;
  role: OfficerRole;
}

/** The minimal async SQL surface every engine adapter must satisfy. */
export interface SqlStore {
  readonly engine: 'node:sqlite' | 'postgres';
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<void>;
  close(): Promise<void>;
}

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS officers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  pass_salt    TEXT NOT NULL,
  pass_hash    TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('JUNIOR','SENIOR','ADMIN','SUPERVISOR','JUDICIARY')),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  officer_id INTEGER NOT NULL REFERENCES officers(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS field_test (
  seq                INTEGER NOT NULL,
  record_uuid        TEXT PRIMARY KEY,
  case_ref           TEXT NOT NULL,
  package_no         TEXT NOT NULL,
  operator_id        TEXT NOT NULL,
  outcome            TEXT NOT NULL,
  confidence         REAL NOT NULL,
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
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  case_ref    TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  actor       TEXT NOT NULL,
  at          TEXT NOT NULL,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS server_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  subject    TEXT,
  at         TEXT NOT NULL,
  detail     TEXT
);
`;

class SqliteStore implements SqlStore {
  readonly engine = 'node:sqlite' as const;
  private handle: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.handle = new DatabaseSync(path);
    this.handle.exec('PRAGMA journal_mode = WAL;');
    this.handle.exec(SCHEMA_SQLITE);
    try {
      this.handle.exec('ALTER TABLE cases ADD COLUMN panchnama_ref TEXT;');
    } catch {
      /* already exists */
    }
    try {
      this.handle.exec('ALTER TABLE field_test ADD COLUMN seq INTEGER;');
    } catch {
      /* already exists */
    }
    try {
      const row = this.handle.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='officers'").get() as { sql: string } | undefined;
      if (row && !row.sql.includes('SUPERVISOR')) {
        this.handle.exec(`
          PRAGMA foreign_keys = OFF;
          DROP TABLE IF EXISTS officers_new;
          CREATE TABLE officers_new (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            username     TEXT NOT NULL UNIQUE,
            pass_salt    TEXT NOT NULL,
            pass_hash    TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role         TEXT NOT NULL CHECK (role IN ('JUNIOR','SENIOR','ADMIN','SUPERVISOR','JUDICIARY')),
            created_at   TEXT NOT NULL
          );
          INSERT INTO officers_new SELECT * FROM officers;
          DROP TABLE officers;
          ALTER TABLE officers_new RENAME TO officers;
          PRAGMA foreign_keys = ON;
        `);
      }
    } catch {
      /* migration error / fresh table */
    }
  }

  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return this.handle.prepare(sql).get(...(params as never[])) as T | undefined;
  }
  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.handle.prepare(sql).all(...(params as never[])) as T[];
  }
  async run(sql: string, ...params: unknown[]): Promise<void> {
    this.handle.prepare(sql).run(...(params as never[]));
  }
  async close(): Promise<void> {
    this.handle.close();
  }
}

export function hashPassword(password: string, saltHex: string): string {
  return scryptSync(password, Buffer.from(saltHex, 'hex'), 32).toString('hex');
}

export function verifyPassword(password: string, saltHex: string, expectedHex: string): boolean {
  const got = Buffer.from(hashPassword(password, saltHex), 'hex');
  const want = Buffer.from(expectedHex, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Random hex salt — shared by the admin seed, officer inserts and the seed script. */
export function newSalt(): string {
  return randomBytes(16).toString('hex');
}

export class ServerDb {
  readonly store: SqlStore;

  private constructor(store: SqlStore) {
    this.store = store;
  }

  /**
   * Open + migrate + ensure the admin credential exists.
   * target: ':memory:' or a sqlite file path; for Postgres pass 'postgres'
   * (or set PARINAAM_DB=postgres) and the URL from DATABASE_URL is used.
   */
  static async open(target?: string): Promise<ServerDb> {
    const wantPostgres =
      target === 'postgres' || process.env.PARINAAM_DB === 'postgres' ||
      (target !== undefined && target.startsWith('postgres://'));
    let store: SqlStore;
    if (wantPostgres) {
      const { PgStore } = await import('./pg-store.ts');
      store = await PgStore.connect(target !== undefined && target.startsWith('postgres://') ? target : process.env.DATABASE_URL);
    } else {
      store = new SqliteStore(target ?? defaultDbPath());
    }
    const db = new ServerDb(store);
    await db.seedOfficer();
    return db;
  }

  get engine(): 'node:sqlite' | 'postgres' {
    return this.store.engine;
  }

  /** Seeded demo credential (v2 directive): username admin / password adminpass. */
  private async seedOfficer(): Promise<void> {
    const existing = await this.store.get<{ id: number }>('SELECT id FROM officers LIMIT 1');
    if (existing) return;
    await this.insertOfficer('admin', process.env.PARINAAM_API_ADMIN_PASSWORD ?? 'adminpass', 'Station House Officer (demo)', 'SENIOR');
  }

  async insertOfficer(username: string, password: string, displayName: string, role: OfficerRole): Promise<void> {
    const salt = newSalt();
    await this.store.run(
      `INSERT INTO officers (username, pass_salt, pass_hash, display_name, role, created_at)
       VALUES (?,?,?,?,?,?) ON CONFLICT (username) DO NOTHING`,
      username, salt, hashPassword(password, salt), displayName, role, new Date().toISOString()
    );
  }

  async audit(actor: string, action: string, subject: string | null, detail?: string): Promise<void> {
    await this.store.run(
      'INSERT INTO server_audit (actor, action, subject, at, detail) VALUES (?,?,?,?,?)',
      actor, action, subject, new Date().toISOString(), detail ?? null
    );
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

export function defaultDbPath(): string {
  return process.env.PARINAAM_SERVER_DB ?? join(process.cwd(), 'server', 'data', 'parinaam-server.db');
}

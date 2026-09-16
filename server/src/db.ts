/**
 * Parinaam API — database layer (v2 phase D).
 * node:sqlite file store, zero external deps. The SAME JSON contract (§ docs/v2-plan/04)
 * is what a future Supabase deployment must expose; this module is the seam to swap.
 */

import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const CASE_STATUSES = ['REPORTED', 'UNDER_REVIEW', 'REVIEWED', 'ESCALATED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export interface OfficerRow {
  id: number;
  username: string;
  display_name: string;
  role: 'JUNIOR' | 'SENIOR';
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS officers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  pass_salt    TEXT NOT NULL,
  pass_hash    TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('JUNIOR','SENIOR')),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  officer_id INTEGER NOT NULL REFERENCES officers(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS field_test (
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
  case_ref    TEXT PRIMARY KEY,
  case_status TEXT NOT NULL,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL
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

export function hashPassword(password: string, saltHex: string): string {
  return scryptSync(password, Buffer.from(saltHex, 'hex'), 32).toString('hex');
}

export function verifyPassword(password: string, saltHex: string, expectedHex: string): boolean {
  const got = Buffer.from(hashPassword(password, saltHex), 'hex');
  const want = Buffer.from(expectedHex, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export class ServerDb {
  readonly handle: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.handle = new DatabaseSync(path);
    this.handle.exec('PRAGMA journal_mode = WAL;');
    this.handle.exec(SCHEMA);
    this.seedOfficer();
  }

  /** Seeded demo credential (v2 directive): username admin / password adminpass. */
  private seedOfficer(): void {
    const existing = this.handle.prepare('SELECT id FROM officers LIMIT 1').get();
    if (existing) return;
    const salt = randomBytes(16).toString('hex');
    const hash = hashPassword(process.env.PARINAAM_API_ADMIN_PASSWORD ?? 'adminpass', salt);
    this.handle
      .prepare(
        `INSERT INTO officers (username, pass_salt, pass_hash, display_name, role, created_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run('admin', salt, hash, 'Station House Officer (demo)', 'SENIOR', new Date().toISOString());
  }

  audit(actor: string, action: string, subject: string | null, detail?: string): void {
    this.handle
      .prepare('INSERT INTO server_audit (actor, action, subject, at, detail) VALUES (?,?,?,?,?)')
      .run(actor, action, subject, new Date().toISOString(), detail ?? null);
  }

  close(): void {
    this.handle.close();
  }
}

export function defaultDbPath(): string {
  return process.env.PARINAAM_SERVER_DB ?? join(process.cwd(), 'server', 'data', 'parinaam-server.db');
}

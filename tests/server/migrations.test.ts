import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../server/src/migrations.ts';
import { SqliteStore } from '../../server/src/storage.ts';

const LEGACY_SCHEMA = `
CREATE TABLE officers (id INTEGER PRIMARY KEY, username TEXT UNIQUE, pass_salt TEXT, pass_hash TEXT, display_name TEXT, role TEXT, created_at TEXT);
CREATE TABLE sessions (token TEXT PRIMARY KEY, officer_id INTEGER, created_at TEXT, expires_at TEXT);
CREATE TABLE field_test (record_uuid TEXT PRIMARY KEY, case_ref TEXT, package_no TEXT, operator_id TEXT, outcome TEXT, confidence REAL, created_at TEXT, received_at TEXT, payload_jcs TEXT, record_hash TEXT, prev_hash TEXT, chain_hash TEXT, device_attestation TEXT, image_ref TEXT, image_sha256 TEXT, body TEXT);
CREATE TABLE idempotency (key TEXT PRIMARY KEY, record_uuid TEXT, created_at TEXT);
CREATE TABLE cases (case_ref TEXT PRIMARY KEY, case_status TEXT, first_seen TEXT, last_seen TEXT, panchnama_ref TEXT);
CREATE TABLE case_status_history (id INTEGER PRIMARY KEY, case_ref TEXT, from_status TEXT, to_status TEXT, actor TEXT, at TEXT, note TEXT);
CREATE TABLE server_audit (id INTEGER PRIMARY KEY, actor TEXT, action TEXT, subject TEXT, at TEXT, detail TEXT);
`;

describe('versioned server migrations', () => {
  it('upgrades a legacy SQLite ledger without rewriting sealed bodies and is idempotent', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'parinaam-server-migration-'));
    const path = join(directory, 'legacy.db');
    const raw = new DatabaseSync(path);
    raw.exec(LEGACY_SCHEMA);
    raw.exec(`
      INSERT INTO officers VALUES (1, 'admin', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'System Administrator', 'ADMIN', '2026-01-01T00:00:00.000Z');
      INSERT INTO sessions VALUES ('legacy-token', 1, '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z');
      INSERT INTO field_test VALUES ('00000000-0000-4000-8000-000000000001', 'LEGACY/CASE/1', 'P-1', 'admin', 'CONSISTENT_WITH_REAGENT_POSITIVE', 0.9, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '{}', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', '0000000000000000000000000000000000000000000000000000000000000000', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', NULL, NULL, NULL, '{"seq":1}');
      INSERT INTO idempotency VALUES ('legacy-key', '00000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00.000Z');
      INSERT INTO cases VALUES ('LEGACY/CASE/1', 'REPORTED', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'PAN-1');
      INSERT INTO case_status_history VALUES (1, 'LEGACY/CASE/1', 'REPORTED', 'UNDER_REVIEW', 'admin', '2026-01-01T00:01:00.000Z', 'probe');
      INSERT INTO server_audit VALUES (1, 'admin', 'legacy', 'seed', '2026-01-01T00:01:00.000Z', 'probe');
    `);
    raw.close();

    const store = new SqliteStore(path);
    try {
      const result = await runMigrations(store);
      assert.deepEqual(result, { fromVersion: 0, toVersion: 1, fresh: false });
      const field = await store.get<{ seq: number; body: string }>(
        'SELECT seq, body FROM field_test WHERE record_uuid = ?',
        '00000000-0000-4000-8000-000000000001',
      );
      assert.equal(field?.seq, 1);
      assert.equal(field?.body, '{"seq":1}');
      const head = await store.get<{ seq: number; record_uuid: string }>('SELECT seq, record_uuid FROM ledger_head');
      assert.equal(head?.seq, 1);
      assert.equal(head?.record_uuid, '00000000-0000-4000-8000-000000000001');
      const session = await store.get<{ token_hash: string }>('SELECT token_hash FROM sessions');
      assert.equal(session?.token_hash.length, 64);
      assert.notEqual(session?.token_hash, 'legacy-token');
      const idempotency = await store.get<{ officer_code: string; record_uuid: string }>(
        'SELECT officer_code, record_uuid FROM idempotency',
      );
      assert.equal(idempotency?.officer_code, 'OFFICER-ADMIN');
      assert.equal(idempotency?.record_uuid, '00000000-0000-4000-8000-000000000001');
      assert.throws(
        () => store.run('UPDATE field_test SET outcome = ? WHERE seq = ?', 'INCONCLUSIVE', 1),
        /append-only/,
      );
      const second = await runMigrations(store);
      assert.deepEqual(second, { fromVersion: 1, toVersion: 1, fresh: false });
    } finally {
      await store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

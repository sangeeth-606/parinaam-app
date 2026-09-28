import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATION_APP_V1, MIGRATION_APP_V3 } from '../../src/db/app-migrations.ts';

describe('Database Schema & Append-Only Triggers (field_test and projections)', () => {
  function setupTestDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATION_APP_V1);
    return db;
  }

  function insertDummyRecord(db: DatabaseSync, recordUuid: string, packageNo: string = 'P-1') {
    const insertStmt = db.prepare(`
      INSERT INTO field_test (
        seq, record_uuid, case_ref, package_no, reagent,
        corrected_lab_l, corrected_lab_a, corrected_lab_b,
        delta_e, calib_residual_mean, calib_residual_max, calib_grade,
        outcome, confidence, conformal_set,
        operator_id, is_demo, created_at,
        payload_jcs, payload_sha256, prev_hash, chain_hash, seal_state
      ) VALUES (
        1, ?, 'NCB/DZU/CR-01/2026', ?, 'marquis',
        20.0, 30.0, -10.0,
        1.05, 0.5, 1.2, 'GOOD',
        'CONSISTENT_WITH_REAGENT_POSITIVE', 0.95, '["CONSISTENT_WITH_REAGENT_POSITIVE"]',
        'OFFICER_007', 0, '2026-09-13T03:00:00Z',
        '{}', ?, ?, ?, 'SEALED'
      )
    `);
    insertStmt.run(recordUuid, packageNo, 'a'.repeat(64), '0'.repeat(64), 'b'.repeat(64));
  }

  it('allows inserting valid field test records', () => {
    const db = setupTestDb();
    insertDummyRecord(db, 'rec-100', 'P-1');

    const row = db.prepare('SELECT record_uuid, package_no FROM field_test WHERE record_uuid = ?').get('rec-100') as { record_uuid: string; package_no: string };
    assert.equal(row.record_uuid, 'rec-100');
    assert.equal(row.package_no, 'P-1');
  });

  it('strictly aborts UPDATE operations via SQL trigger field_test_no_update', () => {
    const db = setupTestDb();
    insertDummyRecord(db, 'rec-101', 'P-1');

    assert.throws(
      () => {
        db.prepare("UPDATE field_test SET package_no = 'P-99' WHERE record_uuid = 'rec-101'").run();
      },
      (err: Error) => {
        return /field_test is append-only: UPDATE disallowed/i.test(err.message);
      }
    );
  });

  it('strictly aborts DELETE operations via SQL trigger field_test_no_delete', () => {
    const db = setupTestDb();
    insertDummyRecord(db, 'rec-102', 'P-2');

    assert.throws(
      () => {
        db.prepare("DELETE FROM field_test WHERE record_uuid = 'rec-102'").run();
      },
      (err: Error) => {
        return /field_test is append-only: DELETE disallowed/i.test(err.message);
      }
    );
  });

  it('keeps the camera-engine projection append-only after its v3 migration', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATION_APP_V1);
    db.exec(MIGRATION_APP_V3);
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare(`
      INSERT INTO camera_engine_result
        (record_uuid, schema_version, image_sha256, result_json, result_sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'engine-1',
      'parinaam-camera-engine-v1',
      'a'.repeat(64),
      '{}',
      'b'.repeat(64),
      '2026-09-24T00:00:00.000Z',
    );

    assert.throws(
      () => db.prepare("UPDATE camera_engine_result SET result_json = '{}' WHERE record_uuid = 'engine-1'").run(),
      (err: Error) => /camera_engine_result is append-only: UPDATE disallowed/i.test(err.message),
    );
    assert.throws(
      () => db.prepare("DELETE FROM camera_engine_result WHERE record_uuid = 'engine-1'").run(),
      (err: Error) => /camera_engine_result is append-only: DELETE disallowed/i.test(err.message),
    );
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATION_V1_SQL } from '../../src/db/migrations.ts';

describe('Database Schema & Append-Only Triggers (Acceptance Test 3)', () => {
  function setupTestDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATION_V1_SQL);
    return db;
  }

  function insertDummyRecord(db: DatabaseSync, recordUuid: string, packageNo: string = 'P-1') {
    const insertStmt = db.prepare(`
      INSERT INTO test_record (
        record_uuid, package_no, reagent, kit_entry_method,
        corrected_lab_l, corrected_lab_a, corrected_lab_b,
        calib_residual_mean, calib_residual_max, calib_grade,
        card_version, card_is_self_printed, meas_covariance,
        outcome, confidence, conformal_set,
        operator_id, biometric_ok, device_model, security_level,
        gps_mocked, mock_provider_flag, root_detected, dev_settings_on,
        device_clock_iso, tz_offset_min,
        image_sha256, payload_jcs, payload_sha256, prev_hash, chain_hash,
        device_attestation, created_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      )
    `);

    insertStmt.run(
      recordUuid, packageNo, 'marquis', 'manual',
      20.0, 30.0, -10.0,
      1.05, 1.8, 'GOOD',
      'v1.0', 0, '[[1,0],[0,1]]',
      'CONSISTENT_WITH_REAGENT_POSITIVE', 0.95, '["CONSISTENT_WITH_REAGENT_POSITIVE"]',
      'OFFICER_007', 1, 'Pixel 7', 'TrustedEnvironment',
      0, 0, 0, 0,
      '2026-09-13T03:00:00Z', 330,
      'a'.repeat(64), '{}', 'b'.repeat(64), '0'.repeat(64), 'c'.repeat(64),
      'sig_dummy', '2026-09-13T03:00:00Z'
    );
  }

  it('allows inserting valid test records', () => {
    const db = setupTestDb();
    insertDummyRecord(db, 'rec-100', 'P-1');

    const row = db.prepare('SELECT record_uuid, package_no FROM test_record WHERE record_uuid = ?').get('rec-100') as { record_uuid: string; package_no: string };
    assert.equal(row.record_uuid, 'rec-100');
    assert.equal(row.package_no, 'P-1');
  });

  it('strictly aborts UPDATE operations via SQL trigger test_record_no_update', () => {
    const db = setupTestDb();
    insertDummyRecord(db, 'rec-101', 'P-1');

    // Attempting UPDATE must fail with RAISE(ABORT)
    assert.throws(
      () => {
        db.prepare("UPDATE test_record SET package_no = 'P-99' WHERE record_uuid = 'rec-101'").run();
      },
      (err: Error) => {
        return /test_record table is append-only: UPDATE disallowed/i.test(err.message);
      }
    );
  });

  it('strictly aborts DELETE operations via SQL trigger test_record_no_delete', () => {
    const db = setupTestDb();
    insertDummyRecord(db, 'rec-102', 'P-2');

    // Attempting DELETE must fail with RAISE(ABORT)
    assert.throws(
      () => {
        db.prepare("DELETE FROM test_record WHERE record_uuid = 'rec-102'").run();
      },
      (err: Error) => {
        return /test_record table is append-only: DELETE disallowed/i.test(err.message);
      }
    );
  });
});

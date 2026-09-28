import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATION_APP_V1, MIGRATION_APP_V5 } from '../../src/db/app-migrations.ts';

/**
 * Phase 3.4 — MIGRATION_APP_V5 rebuilds the append-only ledger table to add coordinate bounds.
 *
 * This is the highest-risk change in the phase: the rebuild drops and recreates the table, so a
 * mistake either loses sealed records or silently removes the AGENTS-rule-2 append-only triggers.
 * These tests assert all three properties that matter:
 *
 *   1. every existing row survives the rebuild,
 *   2. the append-only triggers still fire afterwards,
 *   3. the new CHECKs actually reject out-of-range coordinates.
 */

const INSERT = `
  INSERT INTO field_test (
    seq, record_uuid, case_ref, package_no, lot_no, reagent,
    kit_test_name, kit_make, kit_lot_no, kit_expiry,
    corrected_lab_l, corrected_lab_a, corrected_lab_b, delta_e,
    calib_residual_mean, calib_residual_max, calib_grade,
    outcome, confidence, conformal_set, abstention_reason, kinetics,
    gps_lat, gps_lon, gps_accuracy_m, gps_mocked,
    image_ref, image_sha256,
    operator_id, operator_name, officer_role, is_demo, created_at,
    payload_jcs, payload_sha256, prev_hash, chain_hash, device_attestation, seal_state
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

type Row = {
  seq: number;
  uuid: string;
  lat: number | null;
  lon: number | null;
  acc: number | null;
  mocked: number | null;
  payloadSha: string;
  chain: string;
};

function row(n: number, over: Partial<Row> = {}): Row[] {
  return [
    {
      seq: n,
      uuid: `REC-${n}`,
      lat: 19.076,
      lon: 72.8777,
      acc: 6.4,
      mocked: 0,
      payloadSha: `payload${n}`,
      chain: `chain${n}`,
      ...over,
    },
  ];
}

/** Insert a field_test row with only the fields these tests care about varying. */
function insert(db: DatabaseSync, r: Row): void {
  db.prepare(INSERT).run(
    r.seq,
    r.uuid,
    'NCR-2024-0812',
    'PKG-01',
    'LOT-01',
    'duquenois_levine',
    'NS Kit',
    'Anchor Forensic',
    'LOT-2026-NS',
    '2027-12',
    41.9,
    24.5,
    -38.7,
    1.48,
    1.2,
    2.4,
    'DEGRADED',
    'INCONCLUSIVE',
    0.0,
    '[]',
    null,
    null,
    r.lat,
    r.lon,
    r.acc,
    r.mocked,
    null,
    null,
    'OFFICER-ADMIN',
    'IC-9007 Gill',
    'ADMIN',
    0,
    '2026-09-24T10:00:00.000Z',
    '{}',
    r.payloadSha,
    'prev',
    r.chain,
    null,
    'CHAIN_ONLY'
  );
}

/** A V1 database holding `n` sealed records. */
function seededV1(n: number): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION_APP_V1);
  for (let i = 1; i <= n; i += 1) insert(db, row(i)[0]);
  return db;
}

describe('MIGRATION_APP_V5 — coordinate bounds on the append-only ledger', () => {
  it('preserves every existing record through the table rebuild', () => {
    const db = seededV1(3);
    const before = db
      .prepare('SELECT seq, record_uuid, gps_lat, gps_lon, payload_sha256, chain_hash FROM field_test ORDER BY seq')
      .all() as unknown as Row[];

    db.exec(MIGRATION_APP_V5);

    const after = db
      .prepare('SELECT seq, record_uuid, gps_lat, gps_lon, payload_sha256, chain_hash FROM field_test ORDER BY seq')
      .all() as unknown as Row[];

    assert.equal(after.length, 3, 'the rebuild must not drop sealed records');
    assert.deepEqual(after, before, 'every column of every row must survive unchanged');
  });

  it('preserves the hash chain values so verification still passes after migration', () => {
    const db = seededV1(2);
    db.exec(MIGRATION_APP_V5);
    const chains = db.prepare('SELECT chain_hash FROM field_test ORDER BY seq').all() as unknown as { chain_hash: string }[];
    assert.equal(chains[0].chain_hash, 'chain1');
    assert.equal(chains[1].chain_hash, 'chain2');
  });

  // This is the one that protects AGENTS rule 2. The rebuild drops the table, and the triggers
  // live on the table — if V5 failed to re-declare them, the ledger would be silently mutable.
  it('re-declares the append-only UPDATE trigger (AGENTS rule 2)', () => {
    const db = seededV1(1);
    db.exec(MIGRATION_APP_V5);
    assert.throws(
      () => db.exec("UPDATE field_test SET case_ref = 'TAMPERED' WHERE seq = 1"),
      /append-only/i,
      'UPDATE must still be blocked after the rebuild'
    );
  });

  it('re-declares the append-only DELETE trigger (AGENTS rule 2)', () => {
    const db = seededV1(1);
    db.exec(MIGRATION_APP_V5);
    assert.throws(
      () => db.exec("DELETE FROM field_test WHERE seq = 1"),
      /append-only/i,
      'DELETE must still be blocked after the rebuild'
    );
  });

  it('rejects a latitude outside +/-90 degrees', () => {
    const db = seededV1(0);
    db.exec(MIGRATION_APP_V5);
    assert.throws(() => insert(db, row(1, { lat: 900 })[0]), /CHECK constraint failed/i);
  });

  it('rejects a longitude outside +/-180 degrees', () => {
    const db = seededV1(0);
    db.exec(MIGRATION_APP_V5);
    assert.throws(() => insert(db, row(1, { lon: -400 })[0]), /CHECK constraint failed/i);
  });

  it('rejects a negative accuracy radius', () => {
    const db = seededV1(0);
    db.exec(MIGRATION_APP_V5);
    assert.throws(() => insert(db, row(1, { acc: -1 })[0]), /CHECK constraint failed/i);
  });

  it('rejects a non-boolean mocked flag', () => {
    const db = seededV1(0);
    db.exec(MIGRATION_APP_V5);
    assert.throws(() => insert(db, row(1, { mocked: 7 })[0]), /CHECK constraint failed/i);
  });

  // A seizure record with no fix is truthful and must remain writable. A CHECK that forced a
  // non-null coordinate would push officers to invent one.
  it('still accepts a record with no fix at all', () => {
    const db = seededV1(0);
    db.exec(MIGRATION_APP_V5);
    insert(db, row(1, { lat: null, lon: null, acc: null })[0]);
    const got = db.prepare('SELECT gps_lat FROM field_test WHERE seq = 1').get() as unknown as { gps_lat: number | null };
    assert.equal(got.gps_lat, null, 'absence of a fix must remain absence, never defaulted to 0');
  });

  it('still accepts the boundary coordinates', () => {
    const db = seededV1(0);
    db.exec(MIGRATION_APP_V5);
    insert(db, row(1, { lat: 90, lon: 180, acc: 0 })[0]);
    insert(db, row(2, { lat: -90, lon: -180, acc: 0 })[0]);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS n FROM field_test').get() as unknown as { n: number }).n,
      2
    );
  });

  it('recreates the lookup indexes the app queries', () => {
    const db = seededV1(1);
    db.exec(MIGRATION_APP_V5);
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'field_test'")
      .all() as unknown as { name: string }[];
    const has = (n: string) => names.some((r) => r.name === n);
    assert.ok(has('idx_field_test_case'), 'case/package index must be recreated');
    assert.ok(has('idx_field_test_created'), 'created_at index must be recreated');
    assert.ok(has('idx_field_test_outcome'), 'outcome index must be recreated');
    assert.ok(has('idx_field_test_seq'), 'unique seq index must be recreated');
  });

  // The rebuild must not lose the records, and it must not accept a bad one either: an existing
  // device whose data already violates a new CHECK must fail loudly rather than drop rows.
  it('aborts rather than silently dropping a pre-existing out-of-range row', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATION_APP_V1);
    // Latitude 900 cannot come from acquireGeoTag, but a sync path or a hand-edited DB could
    // produce it. Drop the constraint by writing directly before V5 is applied.
    db.exec('DROP TRIGGER IF EXISTS field_test_no_update');
    db.exec('DROP TRIGGER IF EXISTS field_test_no_delete');
    insert(db, row(1, { lat: 900 })[0]);
    assert.throws(
      () => db.exec(MIGRATION_APP_V5),
      /CHECK constraint failed/i,
      'the migration must abort so a human looks at the data, never discard evidence'
    );
    const survived = (db.prepare('SELECT COUNT(*) AS n FROM field_test').get() as unknown as { n: number }).n;
    assert.equal(survived, 1, 'the original table must still be intact after the abort');
  });
});

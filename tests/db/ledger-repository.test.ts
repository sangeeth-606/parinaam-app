/**
 * Phase C tests — real SQLite persistence of the ledger (node:sqlite temp file).
 * Proves: hydrate ⇄ persist byte-exactness, append-only triggers on the live table,
 * queue/synced bookkeeping outside field_test, FTS5/LIKE search, app_state prefs,
 * wizard-draft persistence, and demo-reset file replacement.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

const dbFile = join(tmpdir(), `parinaam-c-${randomBytes(6).toString('hex')}.db`);
process.env.PARINAAM_DB_FILE = dbFile;

const {
  initLedgerDb,
  searchRecordUuids,
  getAppStateDb,
  setAppStateDb,
  pendingCountDb,
  markSyncedDb,
  resetLedgerFile,
  ledgerDbMeta,
} = await import('../../src/db/ledger-repository.ts');
const { useLedgerStore } = await import('../../src/state/ledger-store.ts');
const { MIGRATION_APP_V1 } = await import('../../src/db/app-migrations.ts');

const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms));

describe('v2 persistence — SQLite as the ledger source of truth', () => {
  before(async () => {
    useLedgerStore.setState({ records: [], seeded: false, verification: null });
    await useLedgerStore.getState().seed();
  });

  after(() => {
    // file teardown happens in the LAST suite (demo-reset) so earlier suites share state
  });

  it('first seed hydrates the fixture chain and persists it to the file', async () => {
    const st = useLedgerStore.getState();
    assert.equal(st.records.length, 15);
    assert.ok(st.records.every((r) => r.isDemo));
    assert.ok(st.records.every((r) => r.syncStatus === 'demo-seed'));
    assert.ok(st.verification?.valid);
    assert.equal(st.persistence?.kind, 'node-sqlite');
    assert.equal(ledgerDbMeta()?.pathLabel, dbFile);
    // Fixtures were recorded pre-synced → the queue must be empty.
    assert.equal(await pendingCountDb(), 0);
  });

  it('appendRecord writes through: new row, queued, then synced bookkeeping', async () => {
    const st = useLedgerStore.getState();
    const base = st.records[0];
    const created = await st.appendRecord({
      record_uuid: '00000000-0000-4000-8000-000000000001',
      case_ref: 'NCB/TEST/CR-99/2026',
      package_no: 'P-1',
      reagent: base.reagent,
      lab: { l: 20, a: 5, b: 10 },
      residual: base.residual,
      outcome: base.outcome,
      confidence: 0.9,
      deltaE: 5.5,
      conformalSet: ['POSITIVE'],
      created_at: new Date().toISOString(),
      operator: 'OFFICER-ADMIN',
      operatorName: 'Admin (Demo Officer)',
      officerRole: 'ADMIN',
    });
    assert.equal(created.syncStatus, 'queued');
    assert.equal(created.seq, 16);
    assert.equal(await pendingCountDb(), 1);

    useLedgerStore.getState().markSynced(['00000000-0000-4000-8000-000000000001']);
    await tick(50);
    assert.equal(await pendingCountDb(), 0);
  });

  it('restart simulation: hydrate byte-exact from the same file, chain still valid', async () => {
    const beforeRecords = useLedgerStore.getState().records;
    useLedgerStore.setState({ records: [], seeded: false, verification: null });
    const { records: afterRecords } = await initLedgerDb({ nodeFile: dbFile });
    assert.equal(afterRecords.length, 16);
    for (let i = 0; i < afterRecords.length; i++) {
      assert.equal(afterRecords[i].payloadJcs, beforeRecords[i].payloadJcs);
      assert.equal(afterRecords[i].chainHash, beforeRecords[i].chainHash);
    }
    // appended record came back already SYNCED (synced_record membership, not memory)
    assert.equal(afterRecords[15].syncStatus, 'synced');
    assert.equal(afterRecords[15].operatorName, 'Admin (Demo Officer)');
    useLedgerStore.setState({ records: afterRecords, seeded: true });
    const v = await useLedgerStore.getState().reverify();
    assert.ok(v.valid);
  });

  it('append-only holds on the LIVE app table (UPDATE/DELETE raise ABORT)', async () => {
    const db = new DatabaseSync(dbFile);
    try {
      assert.throws(
        () => db.prepare('UPDATE field_test SET package_no = ? WHERE record_uuid = ?').run('P-66', '00000000-0000-4000-8000-000000000001'),
        /append-only/
      );
      assert.throws(
        () => db.prepare('DELETE FROM field_test WHERE record_uuid = ?').run('00000000-0000-4000-8000-000000000001'),
        /append-only/
      );
    } finally {
      db.close();
    }
  });

  it('search: DB answers (FTS5 when compiled, LIKE otherwise) for case refs and kits', async () => {
    const byCase = await searchRecordUuids('CR-14');
    assert.ok(byCase && byCase.length === 5, 'five CR-14 fixture records findable');
    const byKit = await searchRecordUuids('NARK');
    assert.ok(byKit && byKit.length >= 7, 'kit names findable');
    const none = await searchRecordUuids('ZZZ-NOPE');
    assert.ok(none && none.length === 0);
  });

  it('app_state prefs round-trip', async () => {
    await setAppStateDb('unit-test-key', JSON.stringify({ hello: 'world' }));
    assert.equal(await getAppStateDb('unit-test-key'), '{"hello":"world"}');
  });
});

describe('v2 persistence — wizard draft survives restarts', () => {
  it('typed setup is mirrored to DB and rehydrated (clamped to Capture)', async () => {
    const { attachDraftPersistence, hydrateDraftFromDb, DRAFT_KEY } =
      await import('../../src/state/draft-persistence.ts');
    const { useSessionStore } = await import('../../src/state/session-store.ts');
    attachDraftPersistence();
    useSessionStore.getState().reset();
    useSessionStore.getState().patchSetup({ caseRef: 'NCB/DZU/CR-77/2026', packageNo: 'P-2' });
    useSessionStore.getState().setStep(2);
    await tick(600); // debounce
    const raw = await getAppStateDb(DRAFT_KEY);
    assert.ok(raw && raw.includes('CR-77'));
    const parsed = JSON.parse(raw) as { step: number };
    assert.equal(parsed.step, 1, 'burst/analysis stage is never persisted — step clamped to Capture');

    useSessionStore.getState().reset();
    const hydrated = await hydrateDraftFromDb();
    assert.ok(hydrated);
    const s = useSessionStore.getState();
    assert.equal(s.setup.caseRef, 'NCB/DZU/CR-77/2026');
    assert.equal(s.step, 1);
  });
});

describe('v2 persistence — demo reset replaces the file, never mutates rows', () => {
  it('resetLedgerFile + reseed yields fixtures only, queue clean', async () => {
    await resetLedgerFile();
    useLedgerStore.setState({ records: [], seeded: false, verification: null });
    await useLedgerStore.getState().seed();
    const st = useLedgerStore.getState();
    assert.equal(st.records.length, 15);
    assert.ok(st.records.every((r) => r.isDemo));
    assert.ok(st.records.every((r) => r.syncStatus === 'demo-seed'));
    assert.ok(st.verification?.valid);
    assert.equal(await pendingCountDb(), 0);
    await markSyncedDb('noop'); // must not throw against fresh queue table
  });
});

describe('v2 schema — fresh migration applies cleanly twice (idempotency)', () => {
  it('CREATE IF NOT EXISTS + trigger re-definition is safe', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(MIGRATION_APP_V1);
    db.exec(MIGRATION_APP_V1);
    const row = db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='trigger' AND tbl_name='field_test'").get() as { c: number };
    assert.equal(row.c, 2);
    db.close();
  });
});

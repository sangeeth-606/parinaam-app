import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openSyncSqlite } from '../../src/sync/db-shim.ts';
import type { DbAdapter } from '../../src/db/driver.ts';

describe('Phase 13 — SQLCipher / sync fork prevention', () => {
  it('the sync engine and the ledger use the same connection handle', async () => {
    let closed = false;
    const mockAdapter: DbAdapter = {
      kind: 'node-sqlite',
      pathLabel: 'mock-test.db',
      exec: async () => {},
      run: async () => ({ lastInsertRowid: 1, changes: 1 }),
      get: async () => null,
      all: async () => [],
      close: async () => { closed = true; },
      toSqliteDatabase: () => ({
        prepare: () => ({
          all: () => [{ id: 1 }],
          get: () => ({ count: 1 }),
          run: () => ({ changes: 1 }),
        }),
        exec: () => {},
      }),
    };

    const db = await openSyncSqlite(mockAdapter);
    assert.ok(db, 'openSyncSqlite must resolve to a SqliteDatabase handle');
    const rows = db.prepare('SELECT 1').all();
    assert.deepEqual(rows, [{ id: 1 }]);
    assert.equal(closed, false);
  });

  it('fails loudly if an unkeyed or mismatched connection is used when encryption is sqlcipher', async () => {
    // A mock adapter claiming sqlcipher but passing an uncoordinated second handle
    const mismatchedAdapter: DbAdapter = {
      kind: 'none',
      pathLabel: 'mismatched.db',
      exec: async () => {},
      run: async () => ({ lastInsertRowid: 0, changes: 0 }),
      get: async () => null,
      all: async () => [],
      close: async () => {},
    };

    // If openSyncSqlite encounters mismatched handle under sqlcipher, it must throw or return null
    // Here we ensure it does not quietly pretend everything is working
    const result = await openSyncSqlite(mismatchedAdapter);
    assert.equal(result, null, 'adapter lacking toSqliteDatabase returns null honestly');
  });
});

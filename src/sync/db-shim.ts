/**
 * Sync-sqlite shim (v4 phase 13) — Single connection for both ledger and sync.
 *
 * Previously db-shim opened a second, unkeyed SQLite.openDatabaseSync('parinaam.db') connection.
 * On a SQLCipher build that connection threw SQLITE_NOTADB, so encryption and sync were mutually
 * exclusive. We now reuse the already-keyed handle from openAppDatabase() / getActiveAdapter().
 */

import type { SqliteDatabase } from '../db/case-search.ts';
import { getActiveAdapter, getActiveMeta } from '../db/ledger-repository.ts';
import { openAppDatabase, type DbAdapter } from '../db/driver.ts';

export async function openSyncSqlite(providedAdapter?: DbAdapter): Promise<SqliteDatabase | null> {
  let adapter = providedAdapter ?? getActiveAdapter();
  let encryption = getActiveMeta()?.encryption;

  if (!adapter) {
    const opened = await openAppDatabase();
    adapter = opened.adapter;
    encryption = opened.encryption;
  }

  // Phase 13 startup guard: ensure sync uses the SQLCipher-keyed handle
  if (encryption === 'sqlcipher') {
    const active = getActiveAdapter();
    if (active && active !== adapter) {
      throw new Error('sync connection is not using the SQLCipher-keyed handle — refusing to run');
    }
  }

  if (adapter && typeof adapter.toSqliteDatabase === 'function') {
    return adapter.toSqliteDatabase();
  }

  return null;
}

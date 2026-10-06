/**
 * Sync-sqlite shim (v2 phase E) — the existing OutboxSyncService speaks the SYNCHRONOUS
 * `SqliteDatabase` (prepare().run/get/all) contract from src/db/case-search.ts, while the
 * v2-C driver seam is async. Rather than rewrite a tested engine, this module provides
 * sync handles for both runtimes:
 *   • expo-sqlite: SDK 57's synchronous openDatabaseSync + runSync/getAllSync/getFirstSync
 *   • node:sqlite: DatabaseSync (already synchronous — used by tests/tooling)
 * The handle is a SECOND connection to the same file the async driver opened — SQLite
 * serializes writers; the JS thread's single-threadedness makes interleaving safe.
 */

import type { SqliteDatabase } from '../db/case-search';

const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

export async function openSyncSqlite(): Promise<SqliteDatabase | null> {
  if (isNode) {
    const file = process.env.PARINAAM_DB_FILE ?? 'parinaam.local.db';
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(file);
      return {
        prepare: (sql: string) => ({
          all: (...p: unknown[]) => db.prepare(sql).all(...p),
          get: (...p: unknown[]) => db.prepare(sql).get(...p),
          run: (...p: unknown[]) => db.prepare(sql).run(...p),
        }),
        exec: (sql: string) => db.exec(sql),
      };
    } catch {
      return null;
    }
  }
  try {
    const SQLite = await import('expo-sqlite');
    const db = SQLite.openDatabaseSync('parinaam.db');
    const clean = (p: unknown[]) => p.map((x) => (x === undefined ? null : x));
    return {
      prepare: (sql: string) => ({
        all: (...p: unknown[]) => db.getAllSync(sql, ...(clean(p) as never[])),
        get: (...p: unknown[]) => db.getFirstSync(sql, ...(clean(p) as never[])),
        run: (...p: unknown[]) => db.runSync(sql, ...(clean(p) as never[])),
      }),
      exec: (sql: string) => db.execSync(sql),
    };
  } catch {
    return null;
  }
}

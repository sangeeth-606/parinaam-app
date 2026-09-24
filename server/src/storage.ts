/**
 * Shared asynchronous SQL abstractions and the embedded node:sqlite adapter.
 *
 * Application SQL deliberately uses portable constructs and `?` placeholders.
 * PostgreSQL converts placeholders in pg-store.ts. Both adapters expose one
 * transaction-bound store so compound writes cannot accidentally escape their
 * transaction.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type SqlEngine = 'node:sqlite' | 'postgres';

export interface SqlRunResult {
  /** Number of affected rows. */
  rowCount: number;
  /** Alias used by SQLite callers that think in terms of `changes`. */
  changes: number;
  /** SQLite rowid for the inserted row when one is available. */
  lastInsertRowid: number | null;
}

export interface SqlStore {
  readonly engine: SqlEngine;
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<SqlRunResult>;
  transaction<T>(fn: (store: SqlStore) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function resultFromSqlite(
  sql: string,
  result: { changes: number | bigint; lastInsertRowid: number | bigint },
): SqlRunResult {
  const rowCount = Number(result.changes);
  const command = sql.trimStart().slice(0, 6).toUpperCase();
  const inserted = command === 'INSERT' || command === 'REPLACE';
  return {
    rowCount,
    changes: rowCount,
    lastInsertRowid: inserted ? Number(result.lastInsertRowid) : null,
  };
}

function assertOpen(closed: boolean): void {
  if (closed) throw new Error('SQL store is closed');
}

function assertNotInTransaction(active: boolean): void {
  if (active) {
    throw new Error('SQLite transaction is active; use the transaction-bound store');
  }
}

class SqliteTransactionStore implements SqlStore {
  readonly engine = 'node:sqlite' as const;
  private readonly handle: DatabaseSync;

  constructor(handle: DatabaseSync) {
    this.handle = handle;
  }

  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return Promise.resolve(this.handle.prepare(sql).get(...params) as T | undefined);
  }

  all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return Promise.resolve(this.handle.prepare(sql).all(...params) as T[]);
  }

  run(sql: string, ...params: unknown[]): Promise<SqlRunResult> {
    return Promise.resolve(resultFromSqlite(sql, this.handle.prepare(sql).run(...params)));
  }

  transaction<T>(_fn: (store: SqlStore) => Promise<T>): Promise<T> {
    return Promise.reject(new Error('Nested SQLite transactions are not supported; use the current transaction-bound store'));
  }

  close(): Promise<void> {
    return Promise.reject(new Error('A transaction-bound store cannot be closed independently'));
  }
}

export class SqliteStore implements SqlStore {
  readonly engine = 'node:sqlite' as const;
  private readonly handle: DatabaseSync;
  private closed = false;
  private transactionActive = false;
  private closing = false;
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.handle = new DatabaseSync(path);
    this.handle.exec('PRAGMA busy_timeout = 5000;');
    this.handle.exec('PRAGMA journal_mode = WAL;');
    this.handle.exec('PRAGMA synchronous = NORMAL;');
    this.handle.exec('PRAGMA foreign_keys = ON;');
  }

  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    assertOpen(this.closed);
    assertNotInTransaction(this.transactionActive);
    return Promise.resolve(this.handle.prepare(sql).get(...params) as T | undefined);
  }

  all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    assertOpen(this.closed);
    assertNotInTransaction(this.transactionActive);
    return Promise.resolve(this.handle.prepare(sql).all(...params) as T[]);
  }

  run(sql: string, ...params: unknown[]): Promise<SqlRunResult> {
    assertOpen(this.closed);
    assertNotInTransaction(this.transactionActive);
    return Promise.resolve(resultFromSqlite(sql, this.handle.prepare(sql).run(...params)));
  }

  async transaction<T>(fn: (store: SqlStore) => Promise<T>): Promise<T> {
    assertOpen(this.closed);
    if (this.closing) throw new Error('SQL store is closing');
    let releaseQueue: (() => void) | undefined;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await previous;

    this.transactionActive = true;
    const transactionStore = new SqliteTransactionStore(this.handle);
    try {
      this.handle.exec('BEGIN IMMEDIATE;');
      const result = await fn(transactionStore);
      this.handle.exec('COMMIT;');
      return result;
    } catch (error) {
      try {
        this.handle.exec('ROLLBACK;');
      } catch {
        // Preserve the operation error. A rollback failure is secondary and the
        // caller will still receive a clear failure rather than a false success.
      }
      throw error;
    } finally {
      this.transactionActive = false;
      releaseQueue?.();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closing = true;
    await this.transactionTail;
    this.handle.close();
    this.closed = true;
  }
}

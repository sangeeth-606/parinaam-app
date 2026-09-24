/**
 * PostgreSQL adapter for the shared SqlStore contract.
 *
 * Portable SQL uses `?` placeholders. Rewriting is SQL-aware: question marks in
 * string/identifier literals, dollar-quoted bodies, and comments are preserved.
 * Transactions reserve one pool client and expose a client-bound store.
 */

import { Pool, types } from 'pg';
import type { PoolClient } from 'pg';
import type { SqlRunResult, SqlStore } from './storage.ts';

interface PgQueryResult {
  rows: unknown[];
  rowCount: number | null;
}

interface PgExecutor {
  query(text: string, values?: unknown[]): Promise<PgQueryResult>;
}

function poolExecutor(pool: Pool): PgExecutor {
  return {
    query: async (text, values): Promise<PgQueryResult> => {
      const result = await pool.query(text, values);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

function clientExecutor(client: PoolClient): PgExecutor {
  return {
    query: async (text, values): Promise<PgQueryResult> => {
      const result = await client.query(text, values);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

/**
 * Replace unquoted PostgreSQL placeholders with `$1`, `$2`, … .
 * Exported for deterministic adapter tests.
 */
export function rewritePositionalPlaceholders(sql: string, expectedParameterCount?: number): string {
  let output = '';
  let placeholder = 0;
  let index = 0;
  let state: 'normal' | 'single' | 'double' | 'backtick' | 'line-comment' | 'block-comment' = 'normal';
  let blockDepth = 0;
  let singleBackslashEscapes = false;

  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];

    if (state === 'single') {
      output += character;
      index += 1;
      if (character === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (character === '\\' && singleBackslashEscapes && next !== undefined) {
        output += next;
        index += 1;
      } else if (character === "'") {
        state = 'normal';
        singleBackslashEscapes = false;
      }
      continue;
    }

    if (state === 'double') {
      output += character;
      index += 1;
      if (character === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (character === '"') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'backtick') {
      output += character;
      index += 1;
      if (character === '`' && next === '`') {
        output += next;
        index += 1;
      } else if (character === '`') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'line-comment') {
      output += character;
      index += 1;
      if (character === '\n' || character === '\r') state = 'normal';
      continue;
    }

    if (state === 'block-comment') {
      if (character === '/' && next === '*') {
        output += '/*';
        index += 2;
        blockDepth += 1;
      } else if (character === '*' && next === '/') {
        output += '*/';
        index += 2;
        blockDepth -= 1;
        if (blockDepth === 0) state = 'normal';
      } else {
        output += character;
        index += 1;
      }
      continue;
    }

    if ((character === 'e' || character === 'E') && next === "'") {
      output += `${character}${next}`;
      index += 2;
      state = 'single';
      singleBackslashEscapes = true;
      continue;
    }
    if (character === "'") {
      output += character;
      index += 1;
      state = 'single';
      singleBackslashEscapes = false;
      continue;
    }
    if (character === '"') {
      output += character;
      index += 1;
      state = 'double';
      continue;
    }
    if (character === '`') {
      output += character;
      index += 1;
      state = 'backtick';
      continue;
    }
    if (character === '-' && next === '-') {
      output += '--';
      index += 2;
      state = 'line-comment';
      continue;
    }
    if (character === '/' && next === '*') {
      output += '/*';
      index += 2;
      blockDepth = 1;
      state = 'block-comment';
      continue;
    }
    if (character === '$') {
      const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index));
      if (match) {
        const delimiter = match[0];
        const closing = sql.indexOf(delimiter, index + delimiter.length);
        if (closing < 0) throw new Error('unterminated PostgreSQL dollar-quoted string');
        const end = closing + delimiter.length;
        output += sql.slice(index, end);
        index = end;
        continue;
      }
    }
    if (character === '?') {
      if (next === '|' || next === '&') {
        output += character;
        index += 1;
        continue;
      }
      placeholder += 1;
      output += `$${placeholder}`;
      index += 1;
      continue;
    }

    output += character;
    index += 1;
  }

  if (state === 'single' || state === 'double' || state === 'backtick' || state === 'block-comment') {
    throw new Error('unterminated PostgreSQL quoted text or comment');
  }
  if (expectedParameterCount !== undefined && placeholder !== expectedParameterCount) {
    throw new Error(`SQL parameter count mismatch: expected ${placeholder}, received ${expectedParameterCount}`);
  }
  return output;
}

function assertOpen(closed: boolean): void {
  if (closed) throw new Error('PostgreSQL store is closed');
}

class PgTransactionStore implements SqlStore {
  readonly engine = 'postgres' as const;
  private readonly executor: PgExecutor;

  constructor(executor: PgExecutor) {
    this.executor = executor;
  }

  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const result = await this.executor.query(rewritePositionalPlaceholders(sql, params.length), params);
    return result.rows[0] as T | undefined;
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const result = await this.executor.query(rewritePositionalPlaceholders(sql, params.length), params);
    return result.rows as T[];
  }

  async run(sql: string, ...params: unknown[]): Promise<SqlRunResult> {
    const result = await this.executor.query(rewritePositionalPlaceholders(sql, params.length), params);
    const rowCount = result.rowCount ?? 0;
    return { rowCount, changes: rowCount, lastInsertRowid: null };
  }

  transaction<T>(_fn: (store: SqlStore) => Promise<T>): Promise<T> {
    return Promise.reject(new Error('Nested PostgreSQL transactions are not supported; use the current transaction-bound store'));
  }

  close(): Promise<void> {
    return Promise.reject(new Error('A transaction-bound PostgreSQL store cannot be closed independently'));
  }
}

export class PgStore implements SqlStore {
  readonly engine = 'postgres' as const;
  private readonly pool: Pool;
  private readonly executor: PgExecutor;
  private closed = false;
  private closing = false;

  private constructor(pool: Pool) {
    this.pool = pool;
    this.executor = poolExecutor(pool);
  }

  static async connect(url?: string): Promise<PgStore> {
    const target = url ?? process.env.DATABASE_URL;
    if (!target) {
      throw new Error('PostgreSQL storage requires DATABASE_URL or an explicit PostgreSQL target');
    }

    const configuredMax = Number(process.env.PARINAAM_DB_POOL_MAX ?? '10');
    const max = Number.isSafeInteger(configuredMax) && configuredMax >= 2 && configuredMax <= 50
      ? configuredMax
      : 10;
    const pool = new Pool({
      connectionString: target,
      max,
      min: 0,
      application_name: 'parinaam-server',
      statement_timeout: 30_000,
    });
    // An idle pool error must have a listener or Node emits an unhandled event.
    // Keep details out of logs because driver errors can contain connection metadata.
    pool.on('error', () => undefined);

    types.setTypeParser(20, (value) => Number.parseInt(value, 10));
    const store = new PgStore(pool);
    try {
      const client = await pool.connect();
      client.release();
    } catch {
      await pool.end();
      throw new Error('unable to connect to PostgreSQL');
    }
    return store;
  }

  static positional(sql: string): string {
    return rewritePositionalPlaceholders(sql);
  }

  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    assertOpen(this.closed || this.closing);
    const result = await this.executor.query(rewritePositionalPlaceholders(sql, params.length), params);
    return result.rows[0] as T | undefined;
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    assertOpen(this.closed || this.closing);
    const result = await this.executor.query(rewritePositionalPlaceholders(sql, params.length), params);
    return result.rows as T[];
  }

  async run(sql: string, ...params: unknown[]): Promise<SqlRunResult> {
    assertOpen(this.closed || this.closing);
    const result = await this.executor.query(rewritePositionalPlaceholders(sql, params.length), params);
    const rowCount = result.rowCount ?? 0;
    return { rowCount, changes: rowCount, lastInsertRowid: null };
  }

  async transaction<T>(fn: (store: SqlStore) => Promise<T>): Promise<T> {
    assertOpen(this.closed || this.closing);
    const client = await this.pool.connect();
    const transactionStore = new PgTransactionStore(clientExecutor(client));
    let failed = false;
    try {
      await client.query('BEGIN');
      const result = await fn(transactionStore);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      failed = true;
      try {
        await client.query('ROLLBACK');
      } catch {
        // Releasing a failed client with an error below also destroys it.
      }
      throw error;
    } finally {
      client.release(failed ? true : undefined);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closing = true;
    await this.pool.end();
    this.closed = true;
  }
}

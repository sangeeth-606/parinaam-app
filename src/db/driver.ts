/**
 * DB driver seam — one async adapter interface with three implementations (v2 phase C):
 *
 *  • expo-sqlite  — the device path (Expo Go or dev build; SQLCipher when the native
 *                   crypto build is present — detected, never assumed, see probe below).
 *  • node:sqlite  — the node/tooling/test path (real file, real SQLite).
 *  • in-memory    — last-resort fallback (Map of rows is NOT implemented here; this is a
 *                   no-op adapter that reports itself so the UI can say loudly that
 *                   persistence failed. Silent amnesia is forbidden.)
 *
 * Everything above the driver (repository, stores) is async and driver-agnostic.
 */

export interface DbAdapter {
  readonly kind: 'expo-sqlite' | 'node-sqlite' | 'none';
  readonly pathLabel: string;
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: unknown[]): Promise<{ lastInsertRowid: number; changes: number }>;
  get<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  close(): Promise<void>;
  /** Wipe the underlying store (DEMO RESET only — deletes the DB file, not row UPDATEs). */
  destroy?(): Promise<void>;
}

export interface DbOpenResult {
  adapter: DbAdapter;
  /** 'sqlcipher' only when `PRAGMA cipher_version` answered — never claimed otherwise. */
  encryption: 'sqlcipher' | 'none';
  /** True when FTS5 virtual tables are available in this SQLite build. */
  fts5: boolean;
  error?: string;
}

const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

/** PRAGMA key must run first; value is hex-only from our own key-manager. */
function cipherKeyPragma(keyHex: string | null): string {
  return keyHex ? `PRAGMA key = "x'${keyHex}'";` : '';
}

type ExpoDb = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...p: unknown[]) => Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync: <T>(sql: string, ...p: unknown[]) => Promise<T | null>;
  getAllAsync: <T>(sql: string, ...p: unknown[]) => Promise<T[]>;
  closeAsync: () => Promise<void>;
};

class ExpoAdapter implements DbAdapter {
  readonly kind = 'expo-sqlite' as const;
  readonly pathLabel: string;
  private db: ExpoDb;
  private onDelete?: () => Promise<void>;
  constructor(db: ExpoDb, pathLabel: string, onDelete?: () => Promise<void>) {
    this.db = db;
    this.pathLabel = pathLabel;
    this.onDelete = onDelete;
  }
  exec(sql: string) {
    return this.db.execAsync(sql);
  }
  async run(sql: string, ...params: unknown[]) {
    const r = await this.db.runAsync(sql, ...params);
    return { lastInsertRowid: r.lastInsertRowId, changes: r.changes };
  }
  get<T>(sql: string, ...params: unknown[]) {
    return this.db.getFirstAsync<T>(sql, ...params);
  }
  all<T>(sql: string, ...params: unknown[]) {
    return this.db.getAllAsync<T>(sql, ...params);
  }
  close() {
    return this.db.closeAsync();
  }
  destroy() {
    return this.onDelete ? this.onDelete() : Promise.resolve();
  }
}

type NodeHandle = {
  prepare: (s: string) => {
    get: (...p: unknown[]) => unknown;
    all: (...p: unknown[]) => unknown[];
    run: (...p: unknown[]) => { lastInsertRowid: number | bigint; changes: number | bigint };
  };
  exec: (s: string) => void;
  close: () => void;
};

class NodeAdapter implements DbAdapter {
  readonly kind = 'node-sqlite' as const;
  readonly pathLabel: string;
  private handle: NodeHandle;
  constructor(handle: NodeHandle, pathLabel: string) {
    this.handle = handle;
    this.pathLabel = pathLabel;
  }
  async destroy(): Promise<void> {
    // Close only — file removal lives in ledger-repository.resetLedgerFile() so the
    // Metro-bundled app never references Node builtins (no analyzable 'fs' import here).
    this.handle.close();
  }
  async exec(sql: string) {
    this.handle.exec(sql);
    return undefined;
  }
  async run(sql: string, ...params: unknown[]) {
    const r = this.handle.prepare(sql).run(...params);
    return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
  }
  async get<T>(sql: string, ...params: unknown[]) {
    return (this.handle.prepare(sql).get(...params) as T) ?? null;
  }
  async all<T>(sql: string, ...params: unknown[]) {
    return this.handle.prepare(sql).all(...params) as T[];
  }
  async close() {
    this.handle.close();
  }
}

/** No-op adapter that records it is fake — used only when both real paths failed. */
export class MemoryAdapter implements DbAdapter {
  readonly kind = 'none' as const;
  readonly pathLabel = 'IN-MEMORY (PERSISTENCE FAILED — RECORDS DO NOT SURVIVE RESTART)';
  async exec() {
    /* deliberate no-op */
  }
  async run() {
    return { lastInsertRowid: 0, changes: 0 };
  }
  async get<T>() {
    return null as T | null;
  }
  async all<T>() {
    return [] as T[];
  }
  async close() {
    /* nothing */
  }
}

export interface OpenOptions {
  /** node:sqlite file path (tests/tooling). ':memory:' allowed. */
  nodeFile?: string;
  /** Force a driver (tests). */
  forceDriver?: 'expo' | 'node' | 'memory';
}

export async function openAppDatabase(opts: OpenOptions = {}): Promise<DbOpenResult> {
  if (opts.forceDriver === 'memory') {
    return { adapter: new MemoryAdapter(), encryption: 'none', fts5: false };
  }

  if (isNode && opts.forceDriver !== 'expo') {
    const { DatabaseSync } = await import('node:sqlite');
    const file = opts.nodeFile ?? process.env.PARINAAM_DB_FILE ?? 'parinaam.local.db';
    const handle = new DatabaseSync(file);
    handle.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    const adapter = new NodeAdapter(handle, file);
    return { adapter, encryption: 'none', fts5: await probeFts(adapter) };
  }

  try {
    const SQLite = await import('expo-sqlite');
    let keyHex: string | null = null;
    try {
      const { getOrGenerateDbKey } = await import('./key-manager');
      keyHex = await getOrGenerateDbKey();
    } catch {
      keyHex = null; // key storage unavailable → open unencrypted (probe will report 'none')
    }
    const db = await SQLite.openDatabaseAsync('parinaam.db');
    if (keyHex) await db.execAsync(cipherKeyPragma(keyHex));
    await db.execAsync('PRAGMA foreign_keys = ON;');
    const adapter = new ExpoAdapter(
      db as unknown as ExpoDb,
      'parinaam.db (app-private)',
      async () => {
        await SQLite.deleteDatabaseAsync('parinaam.db');
      }
    );
    let encryption: 'sqlcipher' | 'none' = 'none';
    try {
      const row = await adapter.get<{ cipher_version?: string }>('PRAGMA cipher_version;');
      if (row && row.cipher_version) encryption = 'sqlcipher';
    } catch {
      encryption = 'none';
    }
    return { adapter, encryption, fts5: await probeFts(adapter) };
  } catch (err) {
    return {
      adapter: new MemoryAdapter(),
      encryption: 'none',
      fts5: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeFts(adapter: DbAdapter): Promise<boolean> {
  try {
    const rows = await adapter.all<{ compile_options: string }>('PRAGMA compile_options;');
    return rows.some((r) => String(r.compile_options).includes('ENABLE_FTS5'));
  } catch {
    return false;
  }
}

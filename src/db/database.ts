/**
 * Parinaam — Encrypted SQLite Database Interface
 * Manages SQLCipher AES-256 database connection, encryption pragma, and migration execution.
 */

import * as SQLite from 'expo-sqlite';
import { getOrGenerateDbKey } from './key-manager';
import { MIGRATION_V1_SQL, MIGRATION_FTS_SQL } from './migrations';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function checkFts5Support(db: SQLite.SQLiteDatabase): Promise<boolean> {
  try {
    const rows = await db.getAllAsync<{ compile_options: string }>('PRAGMA compile_options;');
    return rows.some(r => r.compile_options.includes('ENABLE_FTS5'));
  } catch {
    return false;
  }
}

export async function openEncryptedDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const key = await getOrGenerateDbKey();
  const db = await SQLite.openDatabaseAsync('parinaam.db');

  // Enforce SQLCipher encryption key
  await db.execAsync(`PRAGMA key = '${key}';`);

  // Run initial schema & triggers migration
  await db.execAsync(MIGRATION_V1_SQL);

  // Attempt FTS5 virtual table creation if supported
  try {
    await db.execAsync(MIGRATION_FTS_SQL);
  } catch (error) {
    // If FTS5 is not compiled into the current SQLite binary, log warning
    console.warn('FTS5 virtual table initialization skipped:', error);
  }

  dbInstance = db;
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
}

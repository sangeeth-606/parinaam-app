/**
 * Public server database API.
 *
 * Both supported engines are opened here, migrated transactionally, and exposed
 * through the same asynchronous SqlStore contract. Password derivation is async
 * scrypt; bearer/session token storage is handled by auth.ts and migrations.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { runMigrations } from './migrations.ts';
import { SqliteStore } from './storage.ts';
import type { SqlStore } from './storage.ts';

export { MigrationError, LATEST_SCHEMA_VERSION, SCHEMA_MIGRATION_NAME, runMigrations } from './migrations.ts';
export { SqliteStore } from './storage.ts';
export type { SqlEngine, SqlRunResult, SqlStore } from './storage.ts';

export const CASE_STATUSES = ['REPORTED', 'UNDER_REVIEW', 'REVIEWED', 'ESCALATED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

import { OFFICER_ROLES, type OfficerRole } from '../../src/contracts/officer-roles.ts';
export { OFFICER_ROLES, type OfficerRole };

export const OFFICER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const;
export type OfficerStatus = (typeof OFFICER_STATUSES)[number];

export interface OfficerRow {
  id: number;
  officer_code: string;
  username: string;
  display_name: string;
  role: OfficerRole;
  status: OfficerStatus;
  created_at: string;
  approved_at: string | null;
  approved_by: number | null;
  last_login_at: string | null;
}

export interface CreateOfficerInput {
  username: string;
  password: string;
  displayName: string;
  role: OfficerRole;
  officerCode?: string;
  status?: OfficerStatus;
  approvedByOfficerId?: number | null;
  createdAt?: string;
}

export interface PasswordHash {
  salt: string;
  hash: string;
}

const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_SALT_BYTES = 16;
const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;
const OFFICER_CODE_RE = /^[A-Z0-9][A-Z0-9._-]{2,63}$/;

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function requireOfficerRole(role: OfficerRole): OfficerRole {
  if (!(OFFICER_ROLES as readonly string[]).includes(role)) throw new Error(`unsupported officer role: ${role}`);
  return role;
}

function requireOfficerStatus(status: OfficerStatus): OfficerStatus {
  if (!(OFFICER_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`unsupported officer status: ${status}`);
  }
  return status;
}

function requireOfficerCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!OFFICER_CODE_RE.test(normalized)) {
    throw new Error('officerCode must be 3-64 uppercase letters, digits, dots, underscores, or hyphens');
  }
  return normalized;
}

function saltFromHex(saltHex: string): Buffer {
  if (!/^[0-9a-f]{32,128}$/i.test(saltHex)) throw new Error('password salt must be 16-64 bytes of hex');
  return Buffer.from(saltHex, 'hex');
}

function deriveScrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export function newSalt(): string {
  return randomBytes(PASSWORD_SALT_BYTES).toString('hex');
}

export async function hashPassword(password: string): Promise<PasswordHash>;
export async function hashPassword(password: string, saltHex: string): Promise<string>;
export async function hashPassword(password: string, saltHex?: string): Promise<PasswordHash | string> {
  if (saltHex === undefined) {
    const salt = newSalt();
    const hash = (await deriveScrypt(password, Buffer.from(salt, 'hex'))).toString('hex');
    return { salt, hash };
  }
  return (await deriveScrypt(password, saltFromHex(saltHex))).toString('hex');
}

export async function verifyPassword(password: string, saltHex: string, expectedHex: string): Promise<boolean> {
  if (!/^[0-9a-f]{64,256}$/i.test(expectedHex)) return false;
  let actual: Buffer;
  let expected: Buffer;
  try {
    actual = await deriveScrypt(password, saltFromHex(saltHex));
    expected = Buffer.from(expectedHex, 'hex');
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function randomOfficerCode(): string {
  return `OFFICER-${randomBytes(8).toString('hex').toUpperCase()}`;
}

function rowFromDatabase(row: Record<string, unknown>): OfficerRow {
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('database returned an invalid officer id');
  return {
    id,
    officer_code: String(row.officer_code),
    username: String(row.username),
    display_name: String(row.display_name),
    role: String(row.role) as OfficerRole,
    status: String(row.status) as OfficerStatus,
    created_at: String(row.created_at),
    approved_at: row.approved_at === null || row.approved_at === undefined ? null : String(row.approved_at),
    approved_by: row.approved_by === null || row.approved_by === undefined ? null : Number(row.approved_by),
    last_login_at: row.last_login_at === null || row.last_login_at === undefined ? null : String(row.last_login_at),
  };
}

/**
 * Low-level account insert used by the explicit demo seed. Callers supply an
 * already-derived random salt/hash; normal application code should prefer
 * ServerDb.createOfficer so status and approval metadata are derived safely.
 */
export async function insertOfficer(
  db: ServerDb,
  username: string,
  passSalt: string,
  passHash: string,
  displayName: string,
  role: OfficerRole,
  officerCode: string,
  status: OfficerStatus,
): Promise<void> {
  const normalizedUsername = requireNonEmpty(username, 'username');
  const normalizedDisplayName = requireNonEmpty(displayName, 'displayName');
  const normalizedCode = requireOfficerCode(officerCode);
  const normalizedRole = requireOfficerRole(role);
  const normalizedStatus = requireOfficerStatus(status);
  saltFromHex(passSalt);
  if (!/^[0-9a-f]{64,256}$/i.test(passHash)) throw new Error('password hash must be 32-128 bytes of hex');
  const now = new Date().toISOString();
  await db.store.run(
    `INSERT INTO officers
       (officer_code, username, pass_salt, pass_hash, display_name, role, status,
        created_at, approved_at, approved_by, last_login_at)
     VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL)`,
    normalizedCode,
    normalizedUsername,
    passSalt,
    passHash,
    normalizedDisplayName,
    normalizedRole,
    normalizedStatus,
    now,
    normalizedStatus === 'ACTIVE' ? now : null,
  );
}

export class ServerDb {
  readonly store: SqlStore;

  private constructor(store: SqlStore) {
    this.store = store;
  }

  static async open(target?: string): Promise<ServerDb> {
    const postgresTarget = target === 'postgres' || /^postgres(?:ql)?:\/\//i.test(target ?? '');
    const usePostgres = target === undefined
      ? process.env.PARINAAM_DB === 'postgres'
      : postgresTarget;
    let store: SqlStore;
    if (usePostgres) {
      const { PgStore } = await import('./pg-store.ts');
      const explicitUrl = target !== undefined && /^postgres(?:ql)?:\/\//i.test(target) ? target : undefined;
      store = await PgStore.connect(explicitUrl ?? process.env.DATABASE_URL);
    } else {
      store = new SqliteStore(target ?? defaultDbPath());
    }

    try {
      await runMigrations(store);
      const db = new ServerDb(store);
      const explicitBootstrapPassword =
        process.env.PARINAAM_BOOTSTRAP_ADMIN_PASSWORD ??
        process.env.PARINAAM_API_ADMIN_PASSWORD ??
        process.env.PARINAAM_SEED_PASSWORD;
      if (explicitBootstrapPassword) {
        await db.bootstrapAdminIfEmpty(explicitBootstrapPassword);
      }
      return db;
    } catch (error) {
      await store.close();
      throw error;
    }
  }

  get engine(): SqlStore['engine'] {
    return this.store.engine;
  }

  async createOfficer(input: CreateOfficerInput): Promise<OfficerRow> {
    const username = requireNonEmpty(input.username, 'username');
    const displayName = requireNonEmpty(input.displayName, 'displayName');
    const role = requireOfficerRole(input.role);
    const status = requireOfficerStatus(input.status ?? 'PENDING');
    const officerCode = requireOfficerCode(input.officerCode ?? randomOfficerCode());
    const createdAt = input.createdAt ?? new Date().toISOString();
    const credentials = await hashPassword(input.password);
    await this.store.run(
      `INSERT INTO officers
         (officer_code, username, pass_salt, pass_hash, display_name, role, status,
          created_at, approved_at, approved_by, last_login_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`,
      officerCode,
      username,
      credentials.salt,
      credentials.hash,
      displayName,
      role,
      status,
      createdAt,
      status === 'ACTIVE' ? createdAt : null,
      input.approvedByOfficerId ?? null,
    );
    const created = await this.getOfficerByCode(officerCode);
    if (!created) throw new Error('officer insert completed without a readable row');
    return created;
  }

  /** Compatibility helper for existing callers; new account onboarding defaults to PENDING via createOfficer. */
  async insertOfficer(username: string, password: string, displayName: string, role: OfficerRole): Promise<void> {
    await this.createOfficer({ username, password, displayName, role, status: 'ACTIVE' });
  }

  async bootstrapAdminIfEmpty(password: string, displayName = 'System Administrator'): Promise<OfficerRow | null> {
    const existing = await this.store.get<{ id: number | string }>('SELECT id FROM officers ORDER BY id LIMIT 1');
    if (existing) return null;
    return this.bootstrapAdmin(password, displayName);
  }

  async bootstrapAdmin(password: string, displayName = 'System Administrator'): Promise<OfficerRow> {
    const credentials = await hashPassword(password);
    const now = new Date().toISOString();
    const id = await this.store.transaction(async (tx) => {
      const existing = await tx.get<{ id: number | string }>('SELECT id FROM officers ORDER BY id LIMIT 1');
      if (existing) throw new Error('bootstrap refused: the officers table is not empty');
      const result = await tx.run(
        `INSERT INTO officers
           (officer_code, username, pass_salt, pass_hash, display_name, role, status,
            created_at, approved_at, approved_by, last_login_at)
         VALUES ('OFFICER-ADMIN','admin',?,?,?,'ADMIN','ACTIVE',?,?,NULL,NULL)`,
        credentials.salt,
        credentials.hash,
        requireNonEmpty(displayName, 'displayName'),
        now,
        now,
      );
      const row = await tx.get<{ id: number | string }>(
        'SELECT id FROM officers WHERE officer_code = ?',
        'OFFICER-ADMIN',
      );
      if (!row) throw new Error('bootstrap admin insert completed without a readable row');
      await tx.run('UPDATE officers SET approved_by = ? WHERE id = ?', Number(row.id), Number(row.id));
      if (result.rowCount !== 1) throw new Error('bootstrap admin insert affected an unexpected row count');
      return Number(row.id);
    });
    const row = await this.getOfficerById(id);
    if (!row) throw new Error('bootstrap admin completed without a readable row');
    return row;
  }

  async getOfficerById(id: number): Promise<OfficerRow | null> {
    const row = await this.store.get<Record<string, unknown>>('SELECT * FROM officers WHERE id = ?', id);
    return row ? rowFromDatabase(row) : null;
  }

  async getOfficerByUsername(username: string): Promise<OfficerRow | null> {
    const row = await this.store.get<Record<string, unknown>>(
      'SELECT * FROM officers WHERE username = ?',
      requireNonEmpty(username, 'username'),
    );
    return row ? rowFromDatabase(row) : null;
  }

  async getOfficerByCode(officerCode: string): Promise<OfficerRow | null> {
    const row = await this.store.get<Record<string, unknown>>(
      'SELECT * FROM officers WHERE officer_code = ?',
      requireOfficerCode(officerCode),
    );
    return row ? rowFromDatabase(row) : null;
  }

  async listOfficers(): Promise<OfficerRow[]> {
    const rows = await this.store.all<Record<string, unknown>>('SELECT * FROM officers ORDER BY id ASC');
    return rows.map(rowFromDatabase);
  }

  /** @deprecated — not routed by HTTP endpoints; user-service.ts patchAccount handles mutations */
  async approveOfficer(officerId: number, approverId: number, note?: string): Promise<OfficerRow> {
    await this.setOfficerStatus(officerId, 'ACTIVE', approverId, note);
    const row = await this.getOfficerById(officerId);
    if (!row) throw new Error('approved officer not found');
    return row;
  }

  /** @deprecated — not routed by HTTP endpoints; user-service.ts patchAccount handles mutations */
  async suspendOfficer(officerId: number, actorId: number, note?: string): Promise<OfficerRow> {
    await this.setOfficerStatus(officerId, 'SUSPENDED', actorId, note);
    const row = await this.getOfficerById(officerId);
    if (!row) throw new Error('suspended officer not found');
    return row;
  }

  /** @deprecated — not routed by HTTP endpoints; user-service.ts patchAccount handles mutations */
  async setOfficerStatus(
    officerId: number,
    status: OfficerStatus,
    actorOfficerId: number,
    note?: string,
  ): Promise<void> {
    requireOfficerStatus(status);
    const now = new Date().toISOString();
    await this.store.transaction(async (tx) => {
      const target = await tx.get<{ username: string }>('SELECT username FROM officers WHERE id = ?', officerId);
      const actor = await tx.get<{ username: string }>('SELECT username FROM officers WHERE id = ?', actorOfficerId);
      if (!target || !actor) throw new Error('officer or approving actor was not found');
      if (status === 'ACTIVE') {
        await tx.run(
          'UPDATE officers SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?',
          status,
          now,
          actorOfficerId,
          officerId,
        );
      } else {
        await tx.run('UPDATE officers SET status = ? WHERE id = ?', status, officerId);
      }
      if (status !== 'ACTIVE') await tx.run('DELETE FROM sessions WHERE officer_id = ?', officerId);
      await tx.run(
        `INSERT INTO server_audit (officer_code, actor, action, subject, at, detail)
         VALUES ((SELECT officer_code FROM officers WHERE id = ?),?,?,?,?,?)`,
        actorOfficerId,
        actor.username,
        `officer-${status.toLowerCase()}`,
        String(officerId),
        now,
        note ?? null,
      );
    });
  }

  /** @deprecated — not routed by HTTP endpoints; user-service.ts patchAccount handles mutations */
  async setOfficerPassword(officerId: number, password: string, actorOfficerId: number): Promise<void> {
    const credentials = await hashPassword(password);
    const now = new Date().toISOString();
    await this.store.transaction(async (tx) => {
      const target = await tx.get<{ username: string }>('SELECT username FROM officers WHERE id = ?', officerId);
      const actor = await tx.get<{ username: string; officer_code: string }>(
        'SELECT username, officer_code FROM officers WHERE id = ?',
        actorOfficerId,
      );
      if (!target || !actor) throw new Error('officer or password-change actor was not found');
      await tx.run(
        'UPDATE officers SET pass_salt = ?, pass_hash = ? WHERE id = ?',
        credentials.salt,
        credentials.hash,
        officerId,
      );
      await tx.run('DELETE FROM sessions WHERE officer_id = ?', officerId);
      await tx.run(
        `INSERT INTO server_audit (officer_code, actor, action, subject, at, detail)
         VALUES (?,?,?,?,?,?)`,
        actor.officer_code,
        actor.username,
        'officer-password-changed',
        String(officerId),
        now,
        null,
      );
    });
  }

  async audit(actor: string, action: string, subject: string | null, detail?: string): Promise<void> {
    await this.store.run(
      `INSERT INTO server_audit (officer_code, actor, action, subject, at, detail)
       VALUES ((SELECT officer_code FROM officers WHERE username = ?),?,?,?,?,?)`,
      actor,
      actor,
      action,
      subject,
      new Date().toISOString(),
      detail ?? null,
    );
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

export function defaultDbPath(): string {
  return process.env.PARINAAM_SERVER_DB ?? join(process.cwd(), 'server', 'data', 'parinaam-server.db');
}

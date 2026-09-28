import type { OfficerRole, ServerDb } from './db.ts';
import { hashPassword, insertOfficer } from './db.ts';
import type { AuthedOfficer } from './auth.ts';
import { ApiError } from '../../src/contracts/api-errors.ts';
import { requireAdmin } from './case-service.ts';
import { pageMetadata, parsePagination } from './query.ts';

import { OFFICER_ROLES as ROLES } from '../../src/contracts/officer-roles.ts';
const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const;
type AccountStatus = (typeof STATUSES)[number];

interface AccountRow {
  id: number | string;
  officer_code: string;
  username: string;
  display_name: string;
  role: OfficerRole;
  status: AccountStatus;
  created_at: string;
  approved_by: number | null;
  approved_at: string | null;
  last_login_at: string | null;
}

function publicAccount(row: AccountRow): Record<string, unknown> {
  return {
    id: Number(row.id),
    officer_code: row.officer_code,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    last_login_at: row.last_login_at,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_BODY', 'JSON object body required');
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, max: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || (pattern && !pattern.test(value.trim()))) {
    throw new ApiError(400, 'INVALID_ACCOUNT_FIELD', `${field} has an invalid format`);
  }
  return value.trim();
}

function parseRole(value: unknown): OfficerRole {
  if (typeof value !== 'string' || !(ROLES as readonly string[]).includes(value.toUpperCase())) {
    throw new ApiError(400, 'INVALID_ROLE', `role must be one of ${ROLES.join(', ')}`);
  }
  return value.toUpperCase() as OfficerRole;
}

function parseStatus(value: unknown): AccountStatus {
  if (typeof value !== 'string' || !(STATUSES as readonly string[]).includes(value.toUpperCase())) {
    throw new ApiError(400, 'INVALID_ACCOUNT_STATUS', `status must be one of ${STATUSES.join(', ')}`);
  }
  return value.toUpperCase() as AccountStatus;
}

export async function listAccounts(db: ServerDb, actor: AuthedOfficer | null, query: URLSearchParams): Promise<Record<string, unknown>> {
  requireAdmin(actor);
  const pagination = parsePagination(query, 100, 200);
  const count = await db.store.get<{ count: number }>('SELECT COUNT(*) AS count FROM officers');
  const rows = await db.store.all<AccountRow>(
    `SELECT id, officer_code, username, display_name, role, status, created_at,
            approved_by, approved_at, last_login_at
     FROM officers ORDER BY created_at ASC, username ASC LIMIT ? OFFSET ?`,
    pagination.limit,
    pagination.offset
  );
  return { items: rows.map(publicAccount), page: pageMetadata(Number(count?.count ?? 0), pagination) };
}

export async function createAccount(db: ServerDb, actor: AuthedOfficer | null, value: unknown): Promise<Record<string, unknown>> {
  const admin = requireAdmin(actor);
  const input = asObject(value);
  const username = requiredString(input.username, 'username', 80, /^[a-z0-9._-]+$/);
  const displayName = requiredString(input.display_name ?? input.displayName, 'display_name', 120);
  const role = parseRole(input.role);
  const officerCode = requiredString(input.officer_code ?? input.officerCode, 'officer_code', 80, /^[A-Za-z0-9._-]+$/);
  if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256) {
    throw new ApiError(400, 'INVALID_PASSWORD', 'password must be between 12 and 256 characters');
  }
  const credentials = await hashPassword(input.password);
  try {
    await insertOfficer(db, username, credentials.salt, credentials.hash, displayName, role, officerCode, 'PENDING');
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new ApiError(409, 'ACCOUNT_EXISTS', 'username or officer_code is already in use');
    }
    throw error;
  }
  await db.audit(admin.username, 'account-created', username, `role=${role}; status=PENDING`);
  const row = await db.store.get<AccountRow>(
    `SELECT id, officer_code, username, display_name, role, status, created_at,
            approved_by, approved_at, last_login_at
     FROM officers WHERE username = ?`,
    username
  );
  if (!row) throw new ApiError(500, 'ACCOUNT_CREATE_FAILED', 'account could not be read after creation');
  return publicAccount(row);
}

export async function patchAccount(
  db: ServerDb,
  actor: AuthedOfficer | null,
  usernameInput: string,
  value: unknown
): Promise<Record<string, unknown>> {
  const admin = requireAdmin(actor);
  const username = requiredString(usernameInput, 'username', 80, /^[a-z0-9._-]+$/);
  const input = asObject(value);
  const now = new Date().toISOString();
  let credentials: { salt: string; hash: string } | null = null;
  if (input.password !== undefined) {
    if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256) {
      throw new ApiError(400, 'INVALID_PASSWORD', 'password must be between 12 and 256 characters');
    }
    credentials = await hashPassword(input.password);
  }

  const after = await db.store.transaction(async (tx) => {
    // Account mutations are rare. Serializing the small officer table prevents
    // stale-read/lost-update writes and two concurrent patches from each
    // demoting the other "last active admin" without a surviving administrator.
    if (db.engine === 'postgres') {
      await tx.all('SELECT id FROM officers ORDER BY id FOR UPDATE');
    }
    const current = await tx.get<AccountRow>(
      `SELECT id, officer_code, username, display_name, role, status, created_at,
              approved_by, approved_at, last_login_at
       FROM officers WHERE username = ?`,
      username
    );
    if (!current) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'account not found');

    const displayName = input.display_name === undefined
      ? current.display_name
      : requiredString(input.display_name, 'display_name', 120);
    const role = input.role === undefined ? current.role : parseRole(input.role);
    const status = input.status === undefined ? current.status : parseStatus(input.status);
    const becomesApproved = status === 'ACTIVE' && current.status !== 'ACTIVE';
    const approvedBy = becomesApproved ? admin.id : current.approved_by;
    const approvedAt = becomesApproved ? now : current.approved_at;

    if (current.role === 'ADMIN' && current.status === 'ACTIVE' && (role !== 'ADMIN' || status !== 'ACTIVE')) {
      const otherAdmins = await tx.get<{ count: number }>(
        "SELECT COUNT(*) AS count FROM officers WHERE role = 'ADMIN' AND status = 'ACTIVE' AND username <> ?",
        username
      );
      if (Number(otherAdmins?.count ?? 0) === 0) {
        throw new ApiError(409, 'LAST_ACTIVE_ADMIN', 'the last active administrator cannot be demoted or suspended');
      }
    }

    if (credentials) {
      await tx.run('UPDATE officers SET pass_salt = ?, pass_hash = ? WHERE username = ?', credentials.salt, credentials.hash, username);
    }
    await tx.run(
      'UPDATE officers SET display_name = ?, role = ?, status = ?, approved_by = ?, approved_at = ? WHERE username = ?',
      displayName,
      role,
      status,
      approvedBy,
      approvedAt,
      username
    );
    if (status !== 'ACTIVE' || credentials) {
      await tx.run('DELETE FROM sessions WHERE officer_id = ?', current.id);
    }
    await tx.run(
      'INSERT INTO server_audit (actor, action, subject, at, detail) VALUES (?,?,?,?,?)',
      admin.username,
      credentials ? 'account-password-reset-and-updated' : 'account-updated',
      username,
      now,
      `role=${role}; status=${status}${credentials ? '; password reset; sessions revoked' : ''}`
    );
    return tx.get<AccountRow>(
      `SELECT id, officer_code, username, display_name, role, status, created_at,
              approved_by, approved_at, last_login_at
       FROM officers WHERE username = ?`,
      username
    );
  });
  if (!after) throw new ApiError(500, 'ACCOUNT_UPDATE_FAILED', 'account could not be read after update');
  return publicAccount(after);
}

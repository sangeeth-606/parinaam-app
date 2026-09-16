/**
 * Parinaam API — auth layer (v2 phase D).
 * Login mints bearer tokens stored in the sessions table (12 h TTL).
 * Per-IP attempt rate limiting (5 / 60 s) — the same posture as the device gate.
 */

import { randomBytes } from 'node:crypto';
import type { ServerDb, OfficerRole } from './db.ts';
import { verifyPassword } from './db.ts';

export interface AuthedOfficer {
  id: number;
  username: string;
  displayName: string;
  role: OfficerRole;
  token: string;
}

const SESSION_TTL_HOURS = 12;
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  b.count += 1;
  return b.count > MAX_ATTEMPTS;
}

export async function login(db: ServerDb, username: string, password: string, ip: string): Promise<AuthedOfficer | null> {
  if (rateLimited(`login:${ip}`)) return null;
  const row = await db.store.get<{ id: number | string; username: string; pass_salt: string; pass_hash: string; display_name: string; role: OfficerRole }>(
    'SELECT id, username, pass_salt, pass_hash, display_name, role FROM officers WHERE username = ?',
    username
  );
  if (!row || !verifyPassword(password, row.pass_salt, row.pass_hash)) {
    await db.audit('auth', 'login-failed', username, `from ${ip}`);
    return null;
  }
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 3600_000);
  await db.store.run(
    'INSERT INTO sessions (token, officer_id, created_at, expires_at) VALUES (?,?,?,?)',
    token, Number(row.id), now.toISOString(), expires.toISOString()
  );
  await db.audit('auth', 'login', row.username, `from ${ip}`);
  return { id: Number(row.id), username: row.username, displayName: row.display_name, role: row.role, token };
}

export async function authenticate(db: ServerDb, headerValue: string | undefined): Promise<AuthedOfficer | null> {
  const token = headerValue?.startsWith('Bearer ') ? headerValue.slice(7) : null;
  if (!token) return null;
  // "displayName" MUST stay double-quoted: PostgreSQL folds unquoted mixed-case aliases.
  const row = await db.store.get<{ token: string; id: number | string; username: string; displayName: string; role: OfficerRole; expires_at: string }>(
    `SELECT s.token AS token, o.id AS id, o.username AS username, o.display_name AS "displayName", o.role AS role, s.expires_at AS expires_at
     FROM sessions s JOIN officers o ON o.id = s.officer_id WHERE s.token = ?`,
    token
  );
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    await db.store.run('DELETE FROM sessions WHERE token = ?', token);
    return null;
  }
  return { id: Number(row.id), username: row.username, displayName: row.displayName, role: row.role, token: row.token };
}

export async function logout(db: ServerDb, token: string): Promise<void> {
  await db.store.run('DELETE FROM sessions WHERE token = ?', token);
}

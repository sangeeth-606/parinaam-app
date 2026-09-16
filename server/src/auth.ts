/**
 * Parinaam API — auth layer (v2 phase D).
 * Login mints bearer tokens stored in the sessions table (12 h TTL).
 * Per-IP attempt rate limiting (5 / 60 s) — the same posture as the device gate.
 */

import { randomBytes } from 'node:crypto';
import type { ServerDb } from './db.ts';
import { verifyPassword } from './db.ts';

export interface AuthedOfficer {
  id: number;
  username: string;
  displayName: string;
  role: 'JUNIOR' | 'SENIOR';
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

export function login(db: ServerDb, username: string, password: string, ip: string): AuthedOfficer | null {
  if (rateLimited(`login:${ip}`)) return null;
  const row = db.handle
    .prepare('SELECT id, username, pass_salt, pass_hash, display_name, role FROM officers WHERE username = ?')
    .get(username) as
    | { id: number; username: string; pass_salt: string; pass_hash: string; display_name: string; role: 'JUNIOR' | 'SENIOR' }
    | undefined;
  if (!row || !verifyPassword(password, row.pass_salt, row.pass_hash)) {
    db.audit('auth', 'login-failed', row?.username ?? username, `from ${ip}`);
    return null;
  }
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 3600_000);
  db.handle
    .prepare('INSERT INTO sessions (token, officer_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(token, row.id, now.toISOString(), expires.toISOString());
  db.audit('auth', 'login', row.username, `from ${ip}`);
  return { id: row.id, username: row.username, displayName: row.display_name, role: row.role, token };
}

export function authenticate(db: ServerDb, headerValue: string | undefined): AuthedOfficer | null {
  const token = headerValue?.startsWith('Bearer ') ? headerValue.slice(7) : null;
  if (!token) return null;
  const row = db.handle
    .prepare(
      `SELECT s.token AS token, o.id AS id, o.username AS username, o.display_name AS displayName, o.role AS role, s.expires_at AS expires_at
       FROM sessions s JOIN officers o ON o.id = s.officer_id WHERE s.token = ?`
    )
    .get(token) as
    | { token: string; id: number; username: string; displayName: string; role: 'JUNIOR' | 'SENIOR'; expires_at: string }
    | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    db.handle.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, username: row.username, displayName: row.displayName, role: row.role, token: row.token };
}

export function logout(db: ServerDb, token: string): void {
  db.handle.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

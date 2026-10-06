/**
 * Session authentication for the server.
 *
 * Password verification is delegated to async scrypt in db.ts. Random bearer
 * tokens are returned to clients, while only SHA-256 token digests are persisted.
 * Every authenticated read also re-checks that the officer is ACTIVE.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { OfficerRole, OfficerStatus, ServerDb } from './db.ts';
import { verifyPassword } from './db.ts';

export interface AuthedOfficer {
  id: number;
  officerCode: string;
  username: string;
  displayName: string;
  role: OfficerRole;
  status: OfficerStatus;
  token: string;
  expiresAt: string;
}

interface OfficerCredentialRow {
  id: number | string;
  officer_code: string;
  username: string;
  display_name: string;
  role: OfficerRole;
  status: OfficerStatus;
  pass_salt: string;
  pass_hash: string;
  failed_attempts?: number | null;
  locked_until?: string | null;
}

interface SessionOfficerRow {
  id: number | string;
  officer_code: string;
  username: string;
  display_name: string;
  role: OfficerRole;
  status: OfficerStatus;
  expires_at: string;
}

interface RateBucket {
  count: number;
  resetAt: number;
  lastSeen: number;
}

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const LOGIN_WINDOW_MS = 60_000;
export const MAX_LOGIN_ATTEMPTS = 5;
export const MAX_RATE_LIMIT_BUCKETS = 10_000;

const DUMMY_SALT = '00'.repeat(16);
const DUMMY_HASH = '00'.repeat(32);
const buckets = new Map<string, RateBucket>();
let lastSweepAt = 0;

export function hashBearerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function loginRateLimitKey(ip: string, username: string): string {
  return createHash('sha256')
    .update(`${ip}\0${username.trim().toLowerCase()}`, 'utf8')
    .digest('hex');
}

function sweepExpiredBuckets(now: number): void {
  if (now - lastSweepAt < LOGIN_WINDOW_MS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  lastSweepAt = now;
}

function evictIfNecessary(): void {
  if (buckets.size < MAX_RATE_LIMIT_BUCKETS) return;
  const oldest = buckets.keys().next();
  if (!oldest.done) buckets.delete(oldest.value);
}

/** Count one attempt for a caller-supplied bucket key. Compatibility export. */
export function rateLimited(key: string): boolean {
  const now = Date.now();
  sweepExpiredBuckets(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    evictIfNecessary();
    buckets.delete(key);
    buckets.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS, lastSeen: now });
    return false;
  }
  existing.count += 1;
  existing.lastSeen = now;
  buckets.delete(key);
  buckets.set(key, existing);
  return existing.count > MAX_LOGIN_ATTEMPTS;
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

export function clearAllRateLimits(): void {
  buckets.clear();
  lastSweepAt = 0;
}

function bearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const match = /^Bearer[ \t]+([^ \t\r\n]+)[ \t]*$/i.exec(headerValue);
  if (!match) return null;
  const token = match[1];
  if (token.length < 16 || token.length > 512) return null;
  return token;
}

function officerFromRow(row: SessionOfficerRow, token: string): AuthedOfficer | null {
  const id = Number(row.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return {
    id,
    officerCode: row.officer_code,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    token,
    expiresAt: row.expires_at,
  };
}

export async function login(
  db: ServerDb,
  username: string,
  password: string,
  ip: string,
): Promise<AuthedOfficer | null> {
  const normalizedUsername = username.trim();
  const limiterKey = loginRateLimitKey(ip, normalizedUsername);
  if (rateLimited(limiterKey)) {
    await db.audit('auth', 'login-rate-limited', normalizedUsername, `from ${ip}`);
    return null;
  }

  const row = normalizedUsername
    ? await db.store.get<OfficerCredentialRow>(
        `SELECT id, officer_code, username, display_name, role, status, pass_salt, pass_hash, failed_attempts, locked_until
           FROM officers WHERE username = ?`,
        normalizedUsername,
      )
    : undefined;

  const now = new Date();
  if (row?.locked_until) {
    const lockedUntilMs = Date.parse(row.locked_until);
    if (Number.isFinite(lockedUntilMs) && lockedUntilMs > now.getTime()) {
      await db.audit('auth', 'login-locked', normalizedUsername, `locked until ${row.locked_until} (from ${ip})`);
      return null;
    }
  }

  const passwordValid = row
    ? await verifyPassword(password, row.pass_salt, row.pass_hash)
    : await verifyPassword(password, DUMMY_SALT, DUMMY_HASH).then(() => false);
  if (!row || !passwordValid || row.status !== 'ACTIVE') {
    if (row && Number.isSafeInteger(Number(row.id))) {
      const currentFailures = Number(row.failed_attempts ?? 0) + 1;
      if (currentFailures >= MAX_LOGIN_ATTEMPTS) {
        const lockUntil = new Date(now.getTime() + LOGIN_WINDOW_MS).toISOString();
        await db.store.run(
          'UPDATE officers SET failed_attempts = 0, locked_until = ? WHERE id = ?',
          lockUntil,
          row.id,
        );
        await db.audit('auth', 'account-locked', normalizedUsername, `5 failed attempts; locked until ${lockUntil} from ${ip}`);
      } else {
        await db.store.run(
          'UPDATE officers SET failed_attempts = ? WHERE id = ?',
          currentFailures,
          row.id,
        );
      }
    }
    await db.audit('auth', 'login-failed', normalizedUsername, `from ${ip}`);
    return null;
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const officerId = Number(row.id);
  if (!Number.isSafeInteger(officerId) || officerId <= 0) {
    await db.audit('auth', 'login-failed', normalizedUsername, `from ${ip}`);
    return null;
  }

  const sessionCreated = await db.store.transaction(async (tx): Promise<boolean> => {
    const stillActive = await tx.get<{ status: OfficerStatus }>(
      'SELECT status FROM officers WHERE id = ?',
      officerId,
    );
    if (stillActive?.status !== 'ACTIVE') return false;
    const tokenHash = hashBearerToken(token);
    await tx.run(
      'INSERT INTO sessions (token_hash, officer_id, created_at, expires_at) VALUES (?,?,?,?)',
      tokenHash,
      officerId,
      now.toISOString(),
      expiresAt.toISOString(),
    );
    await tx.run(
      'UPDATE officers SET last_login_at = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
      now.toISOString(),
      officerId,
    );
    await tx.run(
      `INSERT INTO server_audit (officer_code, actor, action, subject, at, detail)
       VALUES (?,?,?,?,?,?)`,
      row.officer_code,
      row.username,
      'login',
      row.username,
      now.toISOString(),
      `from ${ip}`,
    );
    return true;
  });
  if (!sessionCreated) {
    await db.audit('auth', 'login-failed', normalizedUsername, `from ${ip}`);
    return null;
  }
  clearRateLimit(limiterKey);
  return {
    id: officerId,
    officerCode: row.officer_code,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function authenticate(
  db: ServerDb,
  headerValue: string | undefined,
  ip = 'unknown',
  requestId = 'unknown',
): Promise<AuthedOfficer | null> {
  const token = bearerToken(headerValue);
  if (!token) {
    if (headerValue) {
      await db.audit('auth', 'auth-failed', 'anonymous', `malformed bearer header from ${ip} (req ${requestId})`);
    }
    return null;
  }
  const tokenHash = hashBearerToken(token);
  const row = await db.store.get<SessionOfficerRow>(
    `SELECT o.id, o.officer_code, o.username, o.display_name, o.role, o.status, s.expires_at
       FROM sessions s JOIN officers o ON o.id = s.officer_id
      WHERE s.token_hash = ?`,
    tokenHash,
  );
  if (!row) {
    await db.audit('auth', 'auth-failed', 'anonymous', `unknown token from ${ip} (req ${requestId})`);
    return null;
  }
  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await db.store.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    await db.audit('auth', 'auth-failed', row.username, `expired token from ${ip} (req ${requestId})`);
    return null;
  }
  if (row.status !== 'ACTIVE') {
    await db.store.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    await db.audit('auth', 'auth-failed', row.username, `inactive officer (${row.status}) from ${ip} (req ${requestId})`);
    return null;
  }
  return officerFromRow(row, token);
}

export async function logout(db: ServerDb, token: string, officer?: AuthedOfficer | null): Promise<void> {
  const tokenHash = hashBearerToken(token);
  if (officer) {
    await db.audit(officer.username, 'logout', officer.officerCode, `session terminated (${officer.officerCode})`);
  }
  await db.store.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
}

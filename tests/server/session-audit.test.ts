/**
 * Phase 12 — Session and auth audit hardening (tests/server/session-audit.test.ts).
 *
 * Verifies:
 *  - POST /api/v1/auth/login returns expires_at
 *  - 5 bad logins trigger database-backed lockout on officers table
 *  - logout writes an audit record in server_audit
 *  - authenticate() failures write auth-failed in server_audit
 *  - 403 authorization denials write permission-denied in server_audit
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApiServer } from '../../server/src/main.ts';
import { seedDemo } from '../../server/src/seed.ts';
import type { ServerDb } from '../../server/src/db.ts';
import type { Server } from 'node:http';

let server: Server;
let db: ServerDb;
let base: string;

async function api(method: string, path: string, options: { body?: unknown; token?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

describe('Phase 12 — Session and auth audit hardening', () => {
  before(async () => {
    process.env.PARINAAM_SEED_PASSWORD = 'Parinaam#2026';
    const s = await createApiServer(':memory:');
    server = s.server;
    db = s.db;
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await seedDemo(db);
  });

  after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.close();
  });

  it('login returns expires_at timestamp matching session TTL', async () => {
    const res = await api('POST', '/api/v1/auth/login', {
      body: { username: 'admin', password: 'Parinaam#2026' },
    });
    assert.equal(res.status, 200);
    assert.ok(typeof res.json.expires_at === 'string');
    const expiry = Date.parse(res.json.expires_at as string);
    assert.ok(Number.isFinite(expiry));
    assert.ok(expiry > Date.now() + 11 * 3600_000);
  });

  it('5 failed logins trigger database-backed lockout on officers table', async () => {
    // Attempt bad password 5 times for officer 'sharma'
    for (let i = 0; i < 5; i++) {
      const fail = await api('POST', '/api/v1/auth/login', {
        body: { username: 'sharma', password: 'wrong-password' },
      });
      assert.equal(fail.status, 401);
    }

    // Check DB row
    const row = await db.store.get<{ locked_until: string | null }>(
      'SELECT locked_until FROM officers WHERE username = ?',
      'sharma'
    );
    assert.ok(row?.locked_until, 'locked_until must be populated on 5th failed attempt');
    const lockedUntil = Date.parse(row.locked_until!);
    assert.ok(lockedUntil > Date.now());

    // 6th attempt with CORRECT password must still be rejected while locked
    const attemptDuringLock = await api('POST', '/api/v1/auth/login', {
      body: { username: 'sharma', password: 'Parinaam#2026' },
    });
    assert.equal(attemptDuringLock.status, 401);

    // Audit entries must include login-failed and account-locked
    const audits = await db.store.all<{ action: string }>(
      "SELECT action FROM server_audit WHERE subject = 'sharma'"
    );
    const actions = audits.map((a) => a.action);
    assert.ok(actions.includes('account-locked'));
    assert.ok(actions.includes('login-locked') || actions.includes('login-rate-limited'));
  });

  it('logout writes an audit record in server_audit', async () => {
    const loginRes = await api('POST', '/api/v1/auth/login', {
      body: { username: 'iyer', password: 'Parinaam#2026' },
    });
    assert.equal(loginRes.status, 200);
    const token = String(loginRes.json.token);

    const logoutRes = await api('POST', '/api/v1/auth/logout', { token });
    assert.equal(logoutRes.status, 200);

    const audit = await db.store.get<{ action: string; actor: string }>(
      "SELECT action, actor FROM server_audit WHERE action = 'logout' AND actor = 'iyer'"
    );
    assert.ok(audit, 'logout must be audited in server_audit');
  });

  it('authenticate() failures write auth-failed in server_audit', async () => {
    const badTokenRes = await api('GET', '/api/v1/records', { token: 'invalid-token-12345' });
    assert.equal(badTokenRes.status, 401);

    const audit = await db.store.get<{ action: string; actor: string }>(
      "SELECT action, actor FROM server_audit WHERE action = 'auth-failed' LIMIT 1"
    );
    assert.ok(audit, 'auth failure must be recorded in server_audit');
  });

  it('403 authorization denials write permission-denied in server_audit', async () => {
    const juniorLogin = await api('POST', '/api/v1/auth/login', {
      body: { username: 'gill', password: 'Parinaam#2026' },
    });
    assert.equal(juniorLogin.status, 200);
    const token = String(juniorLogin.json.token);

    // Junior attempting admin user management endpoint
    const denied = await api('GET', '/api/v1/users', { token });
    assert.equal(denied.status, 403);

    const audit = await db.store.get<{ action: string; actor: string; detail: string }>(
      "SELECT action, actor, detail FROM server_audit WHERE action = 'permission-denied' AND actor = 'gill'"
    );
    assert.ok(audit, 'permission-denied must be recorded in server_audit');
    assert.ok(audit.detail.includes('/api/v1/users'));
  });
});

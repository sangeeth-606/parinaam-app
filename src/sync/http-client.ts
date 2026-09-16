/**
 * HTTP sync client (v2 phase E) — implements the existing RemoteSyncClient contract
 * against the phase-D API. fetch() is injectable for tests; timeouts guard the
 * flight-mode path (a stalled radio must never hang the outbox loop).
 *
 * Error policy:
 *  • 422/409 → the record can never succeed by retrying → error is tagged [permanent]
 *    so the sync service dead-letters it into the audit log instead of looping forever.
 *  • anything else (network, 5xx, 401-after-relogin) → transient → outbox backoff.
 */

import type { RemoteSyncClient } from './outbox';
import type { LedgerRecord } from '../state/ledger-store';
import { toFieldTestRecord } from './field-test-record.ts';

export interface SyncHttpConfig {
  serverUrl: string;
  credentials: { username: string; password: string } | null;
  getRecord: (uuid: string) => LedgerRecord | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SyncSession {
  token: string | null;
  expiresAt: number;
}

export function createHttpSyncClient(cfg: SyncHttpConfig) {
  const doFetch: typeof fetch = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 12_000;
  const session: SyncSession = { token: null, expiresAt: 0 };

  async function request(path: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await doFetch(cfg.serverUrl.replace(/\/$/, '') + path, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async function ensureToken(): Promise<string | null> {
    if (session.token && Date.now() < session.expiresAt - 5_000) return session.token;
    if (!cfg.credentials) return null;
    try {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cfg.credentials),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (!data.token) return null;
      session.token = data.token;
      session.expiresAt = Date.now() + 11 * 3600_000; // refresh before the 12 h server TTL
      return session.token;
    } catch {
      return null;
    }
  }

  const client: RemoteSyncClient = {
    async uploadRecord(recordUuid: string, idempotencyKey: string) {
      const rec = cfg.getRecord(recordUuid);
      if (!rec) throw new Error(`[permanent] record ${recordUuid} vanished from the ledger`);
      let token = await ensureToken();
      if (!token) return { success: false, status: 0 }; // offline / missing creds → transient
      const body = JSON.stringify(toFieldTestRecord(rec));
      let res = await request('/api/v1/records', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
        body,
      });
      if (res.status === 401) {
        session.token = null; // token expired — re-login once, then retry
        token = await ensureToken();
        if (!token) return { success: false, status: 401 };
        res = await request('/api/v1/records', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
          body,
        });
      }
      if (res.status === 422 || res.status === 409) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(`[permanent] server rejected ${recordUuid}: ${detail.error ?? res.status}`);
      }
      if (!res.ok) return { success: false, status: res.status };
      return { success: true, status: res.status };
    },
  };

  return { client, session, ensureToken, currentToken: () => session.token };
}

/** Health probe used by Settings → TEST CONNECTION. */
export async function probeHealth(
  serverUrl: string,
  fetchImpl?: typeof fetch
): Promise<{ ok: boolean; records?: number; error?: string }> {
  const doFetch = fetchImpl ?? fetch;
  try {
    const res = await doFetch(serverUrl.replace(/\/$/, '') + '/api/v1/health');
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { ok?: boolean; records?: number };
    return { ok: !!data.ok, records: data.records };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unreachable' };
  }
}

/** Case review statuses (GET /api/v1/cases) — server facts, never legal conclusions. */
export async function fetchCaseStatuses(
  serverUrl: string,
  token: string | null,
  fetchImpl?: typeof fetch
): Promise<Record<string, { status: string; records: number; lastSeen: string }> | null> {
  if (!token) return null;
  const doFetch = fetchImpl ?? fetch;
  try {
    const res = await doFetch(serverUrl.replace(/\/$/, '') + '/api/v1/cases', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      cases: { case_ref: string; case_status: string; records: number; last_seen: string }[];
    };
    const out: Record<string, { status: string; records: number; lastSeen: string }> = {};
    for (const c of data.cases) out[c.case_ref] = { status: c.case_status, records: c.records, lastSeen: c.last_seen };
    return out;
  } catch {
    return null;
  }
}

/**
 * HTTP sync client (v2 phase E) — implements the existing RemoteSyncClient contract
 * against the phase-D API. fetch() is injectable for tests; timeouts guard the
 * flight-mode path (a stalled radio must never hang the outbox loop).
 *
 * Error policy:
 *  - Structured API error.retryable is authoritative. A missing predecessor (409) is
 *    transient; a UUID/idempotency conflict is permanent.
 *  - HTTP 4xx validation conflicts and exhausted 5xx responses are permanent.
 *  - Network errors, timeouts, 401-after-relogin, and retryable 409/5xx stay queued.
 */

import type { RemoteSyncClient } from './outbox';
import type { LedgerRecord } from '../state/ledger-store';
import { toFieldTestRecord } from './field-test-record.ts';
import { readEvidenceImageBytes } from '../capture/evidence-image.ts';

export interface SyncHttpConfig {
  serverUrl: string;
  credentials: { username: string; password: string } | null;
  getRecord: (uuid: string) => LedgerRecord | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  getEvidenceBytes?: (record: LedgerRecord) => Promise<Uint8Array | null>;
}

export interface SyncSession {
  token: string | null;
  expiresAt: number;
}

export function createHttpSyncClient(cfg: SyncHttpConfig) {
  const doFetch: typeof fetch = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 12_000;
  const getEvidenceBytes = cfg.getEvidenceBytes ?? (async (record: LedgerRecord) => {
    if (!record.imageRef) return null;
    return readEvidenceImageBytes(record.imageRef);
  });
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

  async function fail(res: Response, detail: string): Promise<never> {
    let code = `HTTP_${res.status}`;
    let message = res.statusText;
    let retryable = false;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === 'string') {
        code = body.error;
      } else if (body.error && typeof body.error === 'object') {
        const error = body.error as { code?: unknown; message?: unknown; retryable?: unknown };
        if (typeof error.code === 'string') code = error.code;
        if (typeof error.message === 'string') message = error.message;
        retryable = error.retryable === true;
      }
    } catch {
      /* response was not JSON */
    }
    const permanent = retryable ? false : res.status >= 400 && res.status < 500 && res.status !== 401;
    throw new Error(`[${permanent ? 'permanent' : 'transient'}] ${code}: ${detail}${message ? ` (${message})` : ''}`);
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
      if (res.status >= 400 && res.status < 500 && res.status !== 401) {
        await fail(res, `server rejected ${recordUuid}`);
      }
      if (!res.ok) return { success: false, status: res.status };

      if (toFieldTestRecord(rec).image_sha256) {
        const evidence = await getEvidenceBytes(rec);
        if (!evidence) throw new Error(`[transient] local evidence bytes unavailable for ${recordUuid}`);
        const evidenceInit = (activeToken: string): RequestInit => ({
          method: 'PUT',
          headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${activeToken}` },
          body: new Blob([Uint8Array.from(evidence).buffer], { type: 'image/jpeg' }),
        });
        let evidenceResponse = await request(`/api/v1/records/${encodeURIComponent(recordUuid)}/evidence`, evidenceInit(token));
        if (evidenceResponse.status === 401) {
          session.token = null;
          token = await ensureToken();
          if (!token) return { success: false, status: 401 };
          evidenceResponse = await request(`/api/v1/records/${encodeURIComponent(recordUuid)}/evidence`, evidenceInit(token));
        }
        if (!evidenceResponse.ok) {
          if (evidenceResponse.status >= 400 && evidenceResponse.status < 500 && evidenceResponse.status !== 401) {
            await fail(evidenceResponse, `evidence rejected for ${recordUuid}`);
          }
          return { success: false, status: evidenceResponse.status };
        }
      }
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
      items: { case_ref: string; case_status: string; record_count: number; last_record_at: string | null }[];
    };
    const out: Record<string, { status: string; records: number; lastSeen: string }> = {};
    for (const c of data.items) out[c.case_ref] = { status: c.case_status, records: c.record_count, lastSeen: c.last_record_at ?? '' };
    return out;
  } catch {
    return null;
  }
}

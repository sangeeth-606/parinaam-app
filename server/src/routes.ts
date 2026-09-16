/**
 * Parinaam API — route handlers (v2 phase D). Engine-agnostic SQL only (see db.ts header);
 * every handler is async because the storage layer may be PostgreSQL.
 */

import type { IncomingMessage } from 'node:http';
import type { ServerDb, CaseStatus } from './db.ts';
import { CASE_STATUSES, OFFICER_ROLES } from './db.ts';
import type { AuthedOfficer } from './auth.ts';
import { login, logout, authenticate } from './auth.ts';
import { verifyFieldTestRecord } from './verify.ts';
import { publish } from './bus.ts';

export interface Ctx {
  db: ServerDb;
  officer: AuthedOfficer | null;
  body: Record<string, unknown> | null;
  query: URLSearchParams;
  params: Record<string, string>;
  idempotencyKey?: string;
  ip: string;
}

export interface ApiResponse {
  status: number;
  json: unknown;
}

const badRequest = (reason: string): ApiResponse => ({ status: 400, json: { error: reason } });
const unauthorized = (): ApiResponse => ({ status: 401, json: { error: 'authentication required' } });
const forbidden = (reason: string): ApiResponse => ({ status: 403, json: { error: reason } });
const notFound = (what: string): ApiResponse => ({ status: 404, json: { error: `not-found: ${what}` } });

/**
 * Ingest is read-modify-write over the chain (last chain_hash + seq). Serialise it
 * per process so two concurrent uploads can never fork the chain — the honest
 * single-writer posture of this demo API (documented in server/README.md).
 */
let ingestQueue: Promise<unknown> = Promise.resolve();
function serialiseIngest<T>(task: () => Promise<T>): Promise<T> {
  const next = ingestQueue.then(task, task);
  ingestQueue = next.catch(() => undefined);
  return next;
}

export const routes = {
  'POST /api/v1/auth/login': async (ctx: Ctx): Promise<ApiResponse> => {
    const username = String(ctx.body?.username ?? '');
    const password = String(ctx.body?.password ?? '');
    if (!username || !password) return badRequest('username and password required');
    const officer = await login(ctx.db, username, password, ctx.ip);
    if (!officer) return { status: 401, json: { error: 'invalid credentials (or rate-limited)' } };
    return { status: 200, json: { token: officer.token, officer: { id: officer.id, username: officer.username, display_name: officer.displayName, role: officer.role } } };
  },

  'POST /api/v1/auth/logout': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    await logout(ctx.db, ctx.officer.token);
    return { status: 200, json: { ok: true } };
  },

  'GET /api/v1/auth/me': (ctx: Ctx): ApiResponse => {
    if (!ctx.officer) return unauthorized();
    const o = ctx.officer;
    return { status: 200, json: { id: o.id, username: o.username, display_name: o.displayName, role: o.role } };
  },

  'GET /api/v1/health': async (ctx: Ctx): Promise<ApiResponse> => {
    const row = await ctx.db.store.get<{ c: number }>('SELECT CAST(COUNT(*) AS INTEGER) AS c FROM field_test');
    return { status: 200, json: { ok: true, version: 'v2-0.2', engine: ctx.db.engine, records: Number(row?.c ?? 0) } };
  },

  'POST /api/v1/records': (ctx: Ctx): Promise<ApiResponse> =>
    serialiseIngest(async () => {
      if (!ctx.officer) return unauthorized();
      const body = ctx.body;
      if (!body) return badRequest('JSON body required');
      const uuid = body.record_uuid;
      if (typeof uuid !== 'string' || !uuid) return badRequest('record_uuid required');

      // Idempotency: same key → replay; same uuid, same content → 200; same uuid,
      // different content → 409 (someone is rewriting evidence).
      if (ctx.idempotencyKey) {
        const hit = await ctx.db.store.get<{ record_uuid: string }>('SELECT record_uuid FROM idempotency WHERE key = ?', ctx.idempotencyKey);
        if (hit) return { status: 200, json: { status: 'replayed', record_uuid: hit.record_uuid } };
      }
      const existing = await ctx.db.store.get<{ record_hash: string }>('SELECT record_hash FROM field_test WHERE record_uuid = ?', uuid);
      if (existing) {
        if (existing.record_hash === body.record_hash) {
          if (ctx.idempotencyKey) await ctx.db.store.run('INSERT INTO idempotency (key, record_uuid, created_at) VALUES (?,?,?) ON CONFLICT (key) DO NOTHING', ctx.idempotencyKey, uuid, new Date().toISOString());
          return { status: 200, json: { status: 'already-stored', record_uuid: uuid } };
        }
        await ctx.db.audit(ctx.officer.username, 'record-conflict', uuid, 'same uuid, different hash');
        return { status: 409, json: { error: 'record-conflict', detail: 'a different payload is already stored under this record_uuid' } };
      }

      const last = await ctx.db.store.get<{ chain_hash: string }>('SELECT chain_hash FROM field_test ORDER BY seq DESC LIMIT 1');
      const knownRows = await ctx.db.store.all<{ chain_hash: string }>('SELECT chain_hash FROM field_test');
      const known = new Set(knownRows.map((r) => r.chain_hash));
      const v = await verifyFieldTestRecord(body, { lastChainHash: last?.chain_hash ?? null, knownChainHashes: known });
      if (!v.ok) {
        await ctx.db.audit(ctx.officer.username, 'record-rejected', uuid, v.reason);
        return { status: v.code, json: { error: v.reason, checks: v.checks } };
      }

      await ctx.db.store.run(
        `INSERT INTO field_test (seq, record_uuid, case_ref, package_no, operator_id, outcome, confidence,
            created_at, received_at, payload_jcs, record_hash, prev_hash, chain_hash,
            device_attestation, image_ref, image_sha256, body)
         VALUES ((SELECT COALESCE(MAX(seq), 0) + 1 FROM field_test),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        uuid,
        String(body.case_ref),
        String(body.package_no),
        String(body.operator_id),
        String(body.outcome),
        Number(body.confidence),
        String(body.created_at),
        new Date().toISOString(),
        String(body.payload_jcs),
        String(body.record_hash),
        String(body.prev_hash),
        String(body.chain_hash),
        typeof body.device_attestation === 'string' ? body.device_attestation : null,
        typeof body.image_ref === 'string' ? body.image_ref : null,
        typeof body.image_sha256 === 'string' ? body.image_sha256 : null,
        JSON.stringify(body)
      );
      if (ctx.idempotencyKey) await ctx.db.store.run('INSERT INTO idempotency (key, record_uuid, created_at) VALUES (?,?,?) ON CONFLICT (key) DO NOTHING', ctx.idempotencyKey, uuid, new Date().toISOString());

      const caseRef = String(body.case_ref);
      const panchnamaRef = typeof body.panchnama_ref === 'string' ? body.panchnama_ref : null;
      const now = new Date().toISOString();
      await ctx.db.store.run(
        `INSERT INTO cases (case_ref, case_status, first_seen, last_seen, panchnama_ref) VALUES (?, 'REPORTED', ?, ?, ?)
         ON CONFLICT (case_ref) DO UPDATE SET last_seen = excluded.last_seen,
         panchnama_ref = COALESCE(cases.panchnama_ref, excluded.panchnama_ref)`,
        caseRef, now, now, panchnamaRef
      );
      await ctx.db.audit(ctx.officer.username, 'record-ingested', uuid, `case ${caseRef} / ${String(body.package_no)}`);
      publish('record-ingested', { record_uuid: uuid, case_ref: caseRef, package_no: String(body.package_no), operator_id: String(body.operator_id) });

      return { status: 201, json: { status: 'stored', record_uuid: uuid, case_ref: caseRef, case_status: 'REPORTED', checks: v.checks } };
    }),

  'GET /api/v1/records': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const caseRef = ctx.query.get('case_ref');
    const outcome = ctx.query.get('outcome');
    const operatorId = ctx.query.get('operator_id');
    const search = ctx.query.get('search')?.toLowerCase();
    const limit = Math.min(Number(ctx.query.get('limit') ?? 100) || 100, 500);
    const offset = Number(ctx.query.get('offset') ?? 0) || 0;

    let sql = 'SELECT record_uuid, case_ref, package_no, operator_id, outcome, confidence, created_at, received_at, chain_hash FROM field_test';
    const where: string[] = [];
    const params: unknown[] = [];

    if (caseRef) {
      where.push('case_ref = ?');
      params.push(caseRef);
    }
    if (outcome) {
      where.push('outcome = ?');
      params.push(outcome);
    }
    if (operatorId) {
      where.push('operator_id = ?');
      params.push(operatorId);
    }
    if (search) {
      where.push('(LOWER(case_ref) LIKE ? OR LOWER(package_no) LIKE ? OR LOWER(operator_id) LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (where.length > 0) {
      sql += ' WHERE ' + where.join(' AND ');
    }
    sql += ' ORDER BY seq ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await ctx.db.store.all(sql, ...params);
    return { status: 200, json: { records: rows, limit, offset } };
  },

  'GET /api/v1/records/:uuid': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const row = await ctx.db.store.get<Record<string, unknown>>('SELECT * FROM field_test WHERE record_uuid = ?', ctx.params.uuid);
    if (!row) return notFound('record');
    const cs = await ctx.db.store.get<{ case_status: string; panchnama_ref?: string }>('SELECT case_status, panchnama_ref FROM cases WHERE case_ref = ?', String(row.case_ref));
    const history = await ctx.db.store.all('SELECT from_status, to_status, actor, at, note FROM case_status_history WHERE case_ref = ? ORDER BY id ASC', String(row.case_ref));
    return { status: 200, json: { record: JSON.parse(String(row.body)), stored: { received_at: row.received_at, case_status: cs?.case_status ?? null, panchnama_ref: cs?.panchnama_ref ?? null }, history } };
  },

  'POST /api/v1/records/verify': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const uuid = String(ctx.body?.uuid ?? '');
    const row = await ctx.db.store.get<Record<string, unknown>>('SELECT * FROM field_test WHERE record_uuid = ?', uuid);
    if (!uuid || !row) return notFound('record');
    const body = JSON.parse(String(row.body)) as Record<string, unknown>;
    const knownRows = await ctx.db.store.all<{ chain_hash: string }>('SELECT chain_hash FROM field_test');
    const known = new Set(knownRows.map((r) => r.chain_hash));
    const v = await verifyFieldTestRecord(body, { lastChainHash: null, knownChainHashes: known });
    const attestationStored = row.device_attestation !== null;
    return {
      status: 200,
      json: {
        uuid,
        valid: v.ok,
        checks: [
          ...v.checks,
          attestationStored
            ? 'device_attestation: stored (signature-chain verification NOT performed by this demo API — no claim made)'
            : 'device_attestation: NULL — chain-only record (honest)',
        ],
      },
    };
  },

  'GET /api/v1/cases': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const status = ctx.query.get('status')?.toUpperCase();
    const search = ctx.query.get('search')?.toLowerCase();

    let sql = `SELECT c.case_ref, c.case_status, c.first_seen, c.last_seen, c.panchnama_ref,
              CAST(COUNT(f.record_uuid) AS INTEGER) AS records
       FROM cases c LEFT JOIN field_test f ON f.case_ref = c.case_ref`;
    const where: string[] = [];
    const params: unknown[] = [];

    if (status) {
      where.push('UPPER(c.case_status) = ?');
      params.push(status);
    }
    if (search) {
      where.push('(LOWER(c.case_ref) LIKE ? OR LOWER(COALESCE(c.panchnama_ref, \'\')) LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (where.length > 0) {
      sql += ' WHERE ' + where.join(' AND ');
    }
    sql += ' GROUP BY c.case_ref, c.case_status, c.first_seen, c.last_seen, c.panchnama_ref ORDER BY c.last_seen DESC';

    const rows = await ctx.db.store.all(sql, ...params);
    return { status: 200, json: { cases: rows } };
  },

  'GET /api/v1/cases/:caseRef': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const ref = ctx.params.caseRef;
    const c = await ctx.db.store.get<Record<string, unknown>>('SELECT * FROM cases WHERE case_ref = ?', ref);
    if (!c) return notFound('case');
    const records = await ctx.db.store.all('SELECT record_uuid, package_no, operator_id, outcome, confidence, created_at, chain_hash FROM field_test WHERE case_ref = ? ORDER BY seq ASC', ref);
    const history = await ctx.db.store.all('SELECT from_status, to_status, actor, at, note FROM case_status_history WHERE case_ref = ? ORDER BY id ASC', ref);
    return { status: 200, json: { case: { case_ref: ref, case_status: c.case_status, panchnama_ref: c.panchnama_ref ?? null, first_seen: c.first_seen, last_seen: c.last_seen }, records, history } };
  },

  'POST /api/v1/cases/:caseRef/status': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    if (ctx.officer.role === 'JUNIOR') return forbidden('case review status is set by senior officers only');
    const ref = ctx.params.caseRef;
    const rawTo = String(ctx.body?.status ?? '').toUpperCase();
    if (!(CASE_STATUSES as readonly string[]).includes(rawTo)) return badRequest(`status must be one of ${CASE_STATUSES.join(', ')}`);
    const to = rawTo as CaseStatus;
    const c = await ctx.db.store.get<{ case_status: string }>('SELECT case_status FROM cases WHERE case_ref = ?', ref);
    if (!c) return notFound('case');
    if (c.case_status === to) return badRequest('status unchanged');
    const now = new Date().toISOString();
    await ctx.db.store.run('UPDATE cases SET case_status = ?, last_seen = ? WHERE case_ref = ?', to, now, ref);
    await ctx.db.store.run(
      'INSERT INTO case_status_history (case_ref, from_status, to_status, actor, at, note) VALUES (?,?,?,?,?,?)',
      ref, c.case_status, to, ctx.officer.username, now, ctx.body?.note ? String(ctx.body.note) : null
    );
    await ctx.db.audit(ctx.officer.username, 'case-status', ref, `${c.case_status} → ${to}`);
    publish('case-status', { case_ref: ref, from: c.case_status, to });
    return { status: 200, json: { case_ref: ref, case_status: to, from: c.case_status } };
  },

  'POST /api/v1/cases/:caseRef/panchnama': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const ref = ctx.params.caseRef;
    const panchnamaRef = String(ctx.body?.panchnama_ref ?? ctx.body?.panchnamaRef ?? '').trim();
    if (!panchnamaRef) return badRequest('panchnama_ref required');
    const c = await ctx.db.store.get<{ case_status: string }>('SELECT case_status FROM cases WHERE case_ref = ?', ref);
    if (!c) return notFound('case');
    const now = new Date().toISOString();
    await ctx.db.store.run('UPDATE cases SET panchnama_ref = ?, last_seen = ? WHERE case_ref = ?', panchnamaRef, now, ref);
    await ctx.db.audit(ctx.officer.username, 'case-panchnama', ref, panchnamaRef);
    return { status: 200, json: { case_ref: ref, panchnama_ref: panchnamaRef } };
  },

  'GET /api/v1/users': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const rows = await ctx.db.store.all(
      'SELECT id, username, display_name, role, created_at FROM officers ORDER BY id ASC'
    );
    return { status: 200, json: { users: rows } };
  },

  'POST /api/v1/users': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    if (ctx.officer.role === 'JUNIOR') return forbidden('only senior officers and admins can create accounts');
    const username = String(ctx.body?.username ?? '').trim();
    const password = String(ctx.body?.password ?? '');
    const displayName = String(ctx.body?.display_name ?? ctx.body?.displayName ?? '').trim();
    const role = String(ctx.body?.role ?? 'JUNIOR').toUpperCase();
    if (!username || !password || !displayName) return badRequest('username, password, and display_name required');
    if (!(OFFICER_ROLES as readonly string[]).includes(role)) return badRequest(`role must be one of ${OFFICER_ROLES.join(', ')}`);
    const existing = await ctx.db.store.get('SELECT id FROM officers WHERE username = ?', username);
    if (existing) return { status: 409, json: { error: 'username already exists' } };
    await ctx.db.insertOfficer(username, password, displayName, role as any);
    await ctx.db.audit(ctx.officer.username, 'user-created', username, `role: ${role}`);
    return { status: 201, json: { ok: true, user: { username, display_name: displayName, role } } };
  },

  'GET /api/v1/audit': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const limit = Math.min(Number(ctx.query.get('limit') ?? 50) || 50, 200);
    const offset = Number(ctx.query.get('offset') ?? 0) || 0;
    const rows = await ctx.db.store.all(
      'SELECT id, actor, action, subject, at, detail FROM server_audit ORDER BY id DESC LIMIT ? OFFSET ?',
      limit, offset
    );
    return { status: 200, json: { audit: rows, limit, offset } };
  },

  'GET /api/v1/stats': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const caseCount = await ctx.db.store.get<{ c: number }>('SELECT CAST(COUNT(*) AS INTEGER) AS c FROM cases');
    const recCount = await ctx.db.store.get<{ c: number }>('SELECT CAST(COUNT(*) AS INTEGER) AS c FROM field_test');
    const statusRows = await ctx.db.store.all<{ case_status: string; c: number }>(
      'SELECT case_status, CAST(COUNT(*) AS INTEGER) AS c FROM cases GROUP BY case_status'
    );
    const outcomeRows = await ctx.db.store.all<{ outcome: string; c: number }>(
      'SELECT outcome, CAST(COUNT(*) AS INTEGER) AS c FROM field_test GROUP BY outcome'
    );
    const officerCount = await ctx.db.store.get<{ c: number }>('SELECT CAST(COUNT(*) AS INTEGER) AS c FROM officers');
    const recentAudit = await ctx.db.store.all(
      'SELECT id, actor, action, subject, at, detail FROM server_audit ORDER BY id DESC LIMIT 10'
    );

    const byStatus: Record<string, number> = { REPORTED: 0, UNDER_REVIEW: 0, REVIEWED: 0, ESCALATED: 0 };
    for (const r of statusRows) byStatus[r.case_status] = Number(r.c);

    const byOutcome: Record<string, number> = {};
    for (const r of outcomeRows) byOutcome[r.outcome] = Number(r.c);

    return {
      status: 200,
      json: {
        total_cases: Number(caseCount?.c ?? 0),
        cases_by_status: byStatus,
        total_records: Number(recCount?.c ?? 0),
        records_by_outcome: byOutcome,
        total_officers: Number(officerCount?.c ?? 0),
        recent_activity: recentAudit,
      },
    };
  },
};

export async function authFrom(db: ServerDb, req: IncomingMessage): Promise<AuthedOfficer | null> {
  const header = req.headers.authorization;
  return authenticate(db, Array.isArray(header) ? header[0] : header);
}

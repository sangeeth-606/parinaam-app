/**
 * Parinaam API — route handlers (v2 phase D). Contract: docs/v2-plan/04-phase-d-backend-api.md
 */

import type { IncomingMessage } from 'node:http';
import type { ServerDb, CaseStatus } from './db.ts';
import { CASE_STATUSES } from './db.ts';
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

export const routes = {
  'POST /api/v1/auth/login': (ctx: Ctx): ApiResponse => {
    const username = String(ctx.body?.username ?? '');
    const password = String(ctx.body?.password ?? '');
    if (!username || !password) return badRequest('username and password required');
    const officer = login(ctx.db, username, password, ctx.ip);
    if (!officer) return { status: 401, json: { error: 'invalid credentials (or rate-limited)' } };
    return { status: 200, json: { token: officer.token, officer: { id: officer.id, username: officer.username, display_name: officer.displayName, role: officer.role } } };
  },

  'POST /api/v1/auth/logout': (ctx: Ctx): ApiResponse => {
    if (!ctx.officer) return unauthorized();
    logout(ctx.db, ctx.officer.token);
    return { status: 200, json: { ok: true } };
  },

  'GET /api/v1/auth/me': (ctx: Ctx): ApiResponse => {
    if (!ctx.officer) return unauthorized();
    const o = ctx.officer;
    return { status: 200, json: { id: o.id, username: o.username, display_name: o.displayName, role: o.role } };
  },

  'GET /api/v1/health': (ctx: Ctx): ApiResponse => {
    const row = ctx.db.handle.prepare('SELECT COUNT(*) AS c FROM field_test').get() as { c: number };
    return { status: 200, json: { ok: true, version: 'v2-0.1', engine: 'node:sqlite', records: row.c } };
  },

  'POST /api/v1/records': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const body = ctx.body;
    if (!body) return badRequest('JSON body required');
    const uuid = body.record_uuid;
    if (typeof uuid !== 'string' || !uuid) return badRequest('record_uuid required');

    // Idempotency: same key → replay; same uuid, same content → 200; same uuid,
    // different content → 409 (someone is rewriting evidence).
    if (ctx.idempotencyKey) {
      const hit = ctx.db.handle.prepare('SELECT record_uuid FROM idempotency WHERE key = ?').get(ctx.idempotencyKey) as { record_uuid: string } | undefined;
      if (hit) return { status: 200, json: { status: 'replayed', record_uuid: hit.record_uuid } };
    }
    const existing = ctx.db.handle.prepare('SELECT record_hash FROM field_test WHERE record_uuid = ?').get(uuid) as { record_hash: string } | undefined;
    if (existing) {
      if (existing.record_hash === body.record_hash) {
        if (ctx.idempotencyKey) ctx.db.handle.prepare('INSERT OR IGNORE INTO idempotency (key, record_uuid, created_at) VALUES (?,?,?)').run(ctx.idempotencyKey, uuid, new Date().toISOString());
        return { status: 200, json: { status: 'already-stored', record_uuid: uuid } };
      }
      ctx.db.audit(ctx.officer.username, 'record-conflict', uuid, 'same uuid, different hash');
      return { status: 409, json: { error: 'record-conflict', detail: 'a different payload is already stored under this record_uuid' } };
    }

    const last = ctx.db.handle.prepare('SELECT chain_hash FROM field_test ORDER BY rowid DESC LIMIT 1').get() as { chain_hash: string } | undefined;
    const known = new Set((ctx.db.handle.prepare('SELECT chain_hash FROM field_test').all() as { chain_hash: string }[]).map((r) => r.chain_hash));
    const v = await verifyFieldTestRecord(body, { lastChainHash: last?.chain_hash ?? null, knownChainHashes: known });
    if (!v.ok) {
      ctx.db.audit(ctx.officer.username, 'record-rejected', uuid, v.reason);
      return { status: v.code, json: { error: v.reason, checks: v.checks } };
    }

    ctx.db.handle
      .prepare(
        `INSERT INTO field_test (record_uuid, case_ref, package_no, operator_id, outcome, confidence,
            created_at, received_at, payload_jcs, record_hash, prev_hash, chain_hash,
            device_attestation, image_ref, image_sha256, body)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
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
    if (ctx.idempotencyKey) ctx.db.handle.prepare('INSERT OR IGNORE INTO idempotency (key, record_uuid, created_at) VALUES (?,?,?)').run(ctx.idempotencyKey, uuid, new Date().toISOString());

    const caseRef = String(body.case_ref);
    const now = new Date().toISOString();
    ctx.db.handle
      .prepare(
        `INSERT INTO cases (case_ref, case_status, first_seen, last_seen) VALUES (?, 'REPORTED', ?, ?)
         ON CONFLICT(case_ref) DO UPDATE SET last_seen = excluded.last_seen`
      )
      .run(caseRef, now, now);
    ctx.db.audit(ctx.officer.username, 'record-ingested', uuid, `case ${caseRef} / ${String(body.package_no)}`);
    publish('record-ingested', { record_uuid: uuid, case_ref: caseRef, package_no: String(body.package_no), operator_id: String(body.operator_id) });

    return { status: 201, json: { status: 'stored', record_uuid: uuid, case_ref: caseRef, case_status: 'REPORTED', checks: v.checks } };
  },

  'GET /api/v1/records': (ctx: Ctx): ApiResponse => {
    if (!ctx.officer) return unauthorized();
    const caseRef = ctx.query.get('case_ref');
    const limit = Math.min(Number(ctx.query.get('limit') ?? 100) || 100, 500);
    const offset = Number(ctx.query.get('offset') ?? 0) || 0;
    const rows = caseRef
      ? ctx.db.handle.prepare('SELECT record_uuid, case_ref, package_no, operator_id, outcome, confidence, created_at, received_at, chain_hash FROM field_test WHERE case_ref = ? ORDER BY rowid ASC LIMIT ? OFFSET ?').all(caseRef, limit, offset)
      : ctx.db.handle.prepare('SELECT record_uuid, case_ref, package_no, operator_id, outcome, confidence, created_at, received_at, chain_hash FROM field_test ORDER BY rowid ASC LIMIT ? OFFSET ?').all(limit, offset);
    return { status: 200, json: { records: rows, limit, offset } };
  },

  'GET /api/v1/records/:uuid': (ctx: Ctx): ApiResponse => {
    if (!ctx.officer) return unauthorized();
    const row = ctx.db.handle.prepare('SELECT * FROM field_test WHERE record_uuid = ?').get(ctx.params.uuid) as Record<string, unknown> | undefined;
    if (!row) return notFound('record');
    const cs = ctx.db.handle.prepare('SELECT case_status FROM cases WHERE case_ref = ?').get(String(row.case_ref)) as { case_status: string } | undefined;
    const history = ctx.db.handle.prepare('SELECT from_status, to_status, actor, at, note FROM case_status_history WHERE case_ref = ? ORDER BY id ASC').all(String(row.case_ref));
    return { status: 200, json: { record: JSON.parse(String(row.body)), stored: { received_at: row.received_at, case_status: cs?.case_status ?? null }, history } };
  },

  'POST /api/v1/records/verify': async (ctx: Ctx): Promise<ApiResponse> => {
    if (!ctx.officer) return unauthorized();
    const uuid = String(ctx.body?.uuid ?? '');
    const row = ctx.db.handle.prepare('SELECT * FROM field_test WHERE record_uuid = ?').get(uuid) as Record<string, unknown> | undefined;
    if (!uuid || !row) return notFound('record');
    const body = JSON.parse(String(row.body)) as Record<string, unknown>;
    const known = new Set((ctx.db.handle.prepare('SELECT chain_hash FROM field_test').all() as { chain_hash: string }[]).map((r) => r.chain_hash));
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

  'GET /api/v1/cases': (ctx: Ctx): ApiResponse => {
    if (!ctx.officer) return unauthorized();
    const rows = ctx.db.handle
      .prepare(
        `SELECT c.case_ref, c.case_status, c.first_seen, c.last_seen,
                COUNT(f.record_uuid) AS records
         FROM cases c LEFT JOIN field_test f ON f.case_ref = c.case_ref
         GROUP BY c.case_ref ORDER BY c.last_seen DESC`
      )
      .all();
    return { status: 200, json: { cases: rows } };
  },

  'GET /api/v1/cases/:caseRef': (ctx: Ctx): ApiResponse => {
    if (!ctx.officer) return unauthorized();
    const ref = ctx.params.caseRef;
    const c = ctx.db.handle.prepare('SELECT * FROM cases WHERE case_ref = ?').get(ref) as Record<string, unknown> | undefined;
    if (!c) return notFound('case');
    const records = ctx.db.handle.prepare('SELECT record_uuid, package_no, operator_id, outcome, confidence, created_at, chain_hash FROM field_test WHERE case_ref = ? ORDER BY rowid ASC').all(ref);
    const history = ctx.db.handle.prepare('SELECT from_status, to_status, actor, at, note FROM case_status_history WHERE case_ref = ? ORDER BY id ASC').all(ref);
    return { status: 200, json: { case: { case_ref: ref, case_status: c.case_status, first_seen: c.first_seen, last_seen: c.last_seen }, records, history } };
  },

  'POST /api/v1/cases/:caseRef/status': (ctx: Ctx): ApiResponse => {
    if (!ctx.officer) return unauthorized();
    if (ctx.officer.role !== 'SENIOR') return forbidden('case review status is set by senior officers only');
    const ref = ctx.params.caseRef;
    const to = String(ctx.body?.status ?? '') as CaseStatus;
    if (!(CASE_STATUSES as readonly string[]).includes(to)) return badRequest(`status must be one of ${CASE_STATUSES.join(', ')}`);
    const c = ctx.db.handle.prepare('SELECT case_status FROM cases WHERE case_ref = ?').get(ref) as { case_status: string } | undefined;
    if (!c) return notFound('case');
    if (c.case_status === to) return badRequest('status unchanged');
    const now = new Date().toISOString();
    ctx.db.handle.prepare('UPDATE cases SET case_status = ?, last_seen = ? WHERE case_ref = ?').run(to, now, ref);
    ctx.db.handle
      .prepare('INSERT INTO case_status_history (case_ref, from_status, to_status, actor, at, note) VALUES (?,?,?,?,?,?)')
      .run(ref, c.case_status, to, ctx.officer.username, now, ctx.body?.note ? String(ctx.body.note) : null);
    ctx.db.audit(ctx.officer.username, 'case-status', ref, `${c.case_status} → ${to}`);
    publish('case-status', { case_ref: ref, from: c.case_status, to });
    return { status: 200, json: { case_ref: ref, case_status: to, from: c.case_status } };
  },
};

export function authFrom(db: ServerDb, req: IncomingMessage): AuthedOfficer | null {
  const header = req.headers.authorization;
  return authenticate(db, Array.isArray(header) ? header[0] : header);
}

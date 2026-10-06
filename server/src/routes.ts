/** Thin HTTP handlers over the domain/storage modules. */

import type { ServerDb } from './db.ts';
import type { AuthedOfficer } from './auth.ts';
import { authenticate, login, logout } from './auth.ts';
import { ApiError } from '../../src/contracts/api-errors.ts';
import type { FieldTestRecordV1 } from '../../src/contracts/field-test-record.ts';
import { ingestRecord, getEvidence, storeEvidence } from './record-service.ts';
import { getCaseDetail, getRecordDetail, getStats, listCases, listRecords } from './read-service.ts';
import { updateCaseStatus, updatePanchnama } from './case-mutations.ts';
import { createAccount, listAccounts, patchAccount } from './user-service.ts';
import { listAudit } from './audit-service.ts';
import { buildCaseExport } from './export-service.ts';
import { indexedFieldsFromRecord, verifyFieldTestRecord } from './verify.ts';

export interface Ctx {
  db: ServerDb;
  officer: AuthedOfficer | null;
  body: Record<string, unknown> | null;
  rawBody: Uint8Array | null;
  contentType: string;
  query: URLSearchParams;
  params: Record<string, string>;
  idempotencyKey?: string;
  ip: string;
  requestId: string;
}

export interface ApiResponse {
  status: number;
  json?: unknown;
  binary?: {
    bytes: Uint8Array;
    contentType: string;
    sha256: string;
    size: number;
  };
}

export type RouteHandler = (ctx: Ctx) => Promise<ApiResponse> | ApiResponse;

import type { Permission } from '../../src/contracts/officer-roles.ts';
import { requirePermission } from './rbac.ts';

export const ROUTE_PERMISSIONS: Readonly<Record<string, Permission | null>> = {
  'GET /api/v1/health':                     null,
  'POST /api/v1/auth/login':                null,
  'POST /api/v1/auth/logout':               null,
  'GET /api/v1/auth/me':                    null,
  'POST /api/v1/records':                   'record.ingest',
  'GET /api/v1/records':                    'record.read.own',
  'GET /api/v1/records/:uuid':              'record.read.own',
  'GET /api/v1/records/:uuid/verify':       'record.verify',
  'POST /api/v1/records/verify':            'record.verify',
  'PUT /api/v1/records/:uuid/evidence':     'record.ingest',
  'GET /api/v1/records/:uuid/evidence':     'record.read.own',
  'GET /api/v1/cases':                      'record.read.own',
  'GET /api/v1/cases/:caseRef':             'record.read.own',
  'PATCH /api/v1/cases/:caseRef/status':    'case.review',
  'PATCH /api/v1/cases/:caseRef/panchnama': 'case.review',
  'GET /api/v1/cases/:caseRef/export':      'record.read.own',
  'GET /api/v1/stats':                      'analytics.read',
  'GET /api/v1/users':                      'account.manage',
  'POST /api/v1/users':                     'account.manage',
  'PATCH /api/v1/users/:username':          'account.manage',
  'GET /api/v1/audit':                      'audit.read',
};

export const LEGACY_ROUTE_CODES: Readonly<Record<string, string>> = {
  'POST /api/v1/records':                   'INGEST_ROLE_REQUIRED',
  'PUT /api/v1/records/:uuid/evidence':     'INGEST_ROLE_REQUIRED',
  'PATCH /api/v1/cases/:caseRef/status':    'REVIEW_ROLE_REQUIRED',
  'PATCH /api/v1/cases/:caseRef/panchnama': 'REVIEW_ROLE_REQUIRED',
  'GET /api/v1/users':                      'ADMIN_REQUIRED',
  'POST /api/v1/users':                     'ADMIN_REQUIRED',
  'PATCH /api/v1/users/:username':          'ADMIN_REQUIRED',
  'GET /api/v1/audit':                      'AUDIT_ROLE_REQUIRED',
};

function officer(ctx: Ctx): AuthedOfficer {
  if (!ctx.officer) throw new ApiError(401, 'AUTH_REQUIRED', 'authentication required');
  return ctx.officer;
}

function writer(ctx: Ctx): AuthedOfficer {
  return requirePermission(ctx.officer, 'record.ingest', 'INGEST_ROLE_REQUIRED');
}

async function verifyStoredRecord(
  db: ServerDb,
  authed: AuthedOfficer,
  uuid: string
): Promise<Record<string, unknown>> {
  const row = await db.store.get<Record<string, unknown>>(
    'SELECT body, operator_id, seq, prev_hash, record_hash FROM field_test WHERE record_uuid = ?',
    uuid
  );
  if (!row) throw new ApiError(404, 'RECORD_NOT_FOUND', 'record not found');
  if (authed.role === 'JUNIOR' && authed.officerCode !== String(row.operator_id)) {
    throw new ApiError(403, 'OPERATOR_BINDING_MISMATCH', 'junior officers may only verify their own attributed records');
  }
  const record = JSON.parse(String(row.body)) as FieldTestRecordV1;
  const predecessor = Number(row.seq) === 1
    ? null
    : await db.store.get<{ chain_hash: string }>('SELECT chain_hash FROM field_test WHERE seq = ?', Number(row.seq) - 1);
  const verification = await verifyFieldTestRecord(record, {
    expectedSeq: Number(row.seq),
    expectedPrevHash: predecessor?.chain_hash ?? '0'.repeat(64),
    expectedRecordHash: String(row.record_hash),
    indexed: indexedFieldsFromRecord(record),
  });
  return {
    record_uuid: uuid,
    verified: verification.ok,
    code: verification.code,
    reason: verification.reason,
    retryable: verification.retryable,
    checks: verification.checks,
    device_attestation_status: record.device_attestation
      ? 'UNVERIFIED_NO_TRUSTED_DEVICE_KEY_REGISTRY'
      : 'NOT_PROVIDED',
  };
}

export const routes = {
  'GET /api/v1/health': async (ctx: Ctx): Promise<ApiResponse> => {
    const row = await ctx.db.store.get<{ count: number }>('SELECT COUNT(*) AS count FROM field_test');
    const head = await ctx.db.store.get<{ seq: number; chain_hash: string }>('SELECT seq, chain_hash FROM ledger_head WHERE id = 1');
    return {
      status: 200,
      json: {
        ok: true,
        service: 'parinaam-api',
        api_version: 'v1',
        engine: ctx.db.engine,
        records: Number(row?.count ?? 0),
        ledger_head: head ? { seq: Number(head.seq), chain_hash: head.chain_hash } : null,
      },
    };
  },

  'POST /api/v1/auth/login': async (ctx: Ctx): Promise<ApiResponse> => {
    const username = typeof ctx.body?.username === 'string' ? ctx.body.username.trim().toLowerCase() : '';
    const password = typeof ctx.body?.password === 'string' ? ctx.body.password : '';
    if (!username || !password) throw new ApiError(400, 'LOGIN_FIELDS_REQUIRED', 'username and password are required');
    const authed = await login(ctx.db, username, password, ctx.ip);
    if (!authed) throw new ApiError(401, 'INVALID_CREDENTIALS', 'invalid credentials or temporarily rate-limited', true);
    return {
      status: 200,
      json: {
        token: authed.token,
        expires_at: authed.expiresAt,
        officer: {
          id: authed.id,
          officer_code: authed.officerCode,
          username: authed.username,
          display_name: authed.displayName,
          role: authed.role,
          status: authed.status,
        },
      },
    };
  },

  'POST /api/v1/auth/logout': async (ctx: Ctx): Promise<ApiResponse> => {
    const authed = officer(ctx);
    await logout(ctx.db, authed.token, authed);
    return { status: 200, json: { ok: true } };
  },

  'GET /api/v1/auth/me': (ctx: Ctx): ApiResponse => {
    const authed = officer(ctx);
    return {
      status: 200,
      json: {
        id: authed.id,
        officer_code: authed.officerCode,
        username: authed.username,
        display_name: authed.displayName,
        role: authed.role,
        status: authed.status,
      },
    };
  },

  'POST /api/v1/records': async (ctx: Ctx): Promise<ApiResponse> => {
    const authed = writer(ctx);
    if (!ctx.body) throw new ApiError(400, 'JSON_BODY_REQUIRED', 'JSON object body required');
    const result = await ingestRecord(ctx.db, authed, ctx.body, ctx.idempotencyKey);
    return { status: result.status, json: result.body };
  },

  'GET /api/v1/records': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await listRecords(ctx.db, officer(ctx), ctx.query),
  }),

  'GET /api/v1/records/:uuid': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await getRecordDetail(ctx.db, officer(ctx), ctx.params.uuid),
  }),

  'GET /api/v1/records/:uuid/verify': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await verifyStoredRecord(ctx.db, officer(ctx), ctx.params.uuid),
  }),

  'POST /api/v1/records/verify': async (ctx: Ctx): Promise<ApiResponse> => {
    const uuid = typeof ctx.body?.uuid === 'string'
      ? ctx.body.uuid
      : typeof ctx.body?.record_uuid === 'string'
        ? ctx.body.record_uuid
        : '';
    if (!uuid) throw new ApiError(400, 'RECORD_UUID_REQUIRED', 'uuid is required');
    return { status: 200, json: await verifyStoredRecord(ctx.db, officer(ctx), uuid) };
  },

  'PUT /api/v1/records/:uuid/evidence': async (ctx: Ctx): Promise<ApiResponse> => {
    const authed = writer(ctx);
    if (!ctx.rawBody) throw new ApiError(400, 'EVIDENCE_BODY_REQUIRED', 'raw image bytes required');
    const result = await storeEvidence(ctx.db, authed, ctx.params.uuid, ctx.rawBody, ctx.contentType);
    return { status: result.status, json: result.body };
  },

  'GET /api/v1/records/:uuid/evidence': async (ctx: Ctx): Promise<ApiResponse> => {
    const evidence = await getEvidence(ctx.db, officer(ctx), ctx.params.uuid);
    return {
      status: 200,
      binary: {
        bytes: evidence.bytes,
        contentType: evidence.contentType,
        sha256: evidence.sha256,
        size: evidence.size,
      },
    };
  },

  'GET /api/v1/cases': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await listCases(ctx.db, officer(ctx), ctx.query),
  }),

  'GET /api/v1/cases/:caseRef': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await getCaseDetail(ctx.db, officer(ctx), ctx.params.caseRef),
  }),

  'PATCH /api/v1/cases/:caseRef/status': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await updateCaseStatus(ctx.db, ctx.officer, ctx.params.caseRef, ctx.body),
  }),

  'PATCH /api/v1/cases/:caseRef/panchnama': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await updatePanchnama(ctx.db, ctx.officer, ctx.params.caseRef, ctx.body),
  }),

  'GET /api/v1/cases/:caseRef/export': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await buildCaseExport(ctx.db, officer(ctx), ctx.params.caseRef, ctx.query),
  }),

  'GET /api/v1/stats': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await getStats(ctx.db, officer(ctx), ctx.query),
  }),

  'GET /api/v1/users': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await listAccounts(ctx.db, ctx.officer, ctx.query),
  }),

  'POST /api/v1/users': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 201,
    json: await createAccount(ctx.db, ctx.officer, ctx.body),
  }),

  'PATCH /api/v1/users/:username': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await patchAccount(ctx.db, ctx.officer, ctx.params.username, ctx.body),
  }),

  'GET /api/v1/audit': async (ctx: Ctx): Promise<ApiResponse> => ({
    status: 200,
    json: await listAudit(ctx.db, ctx.officer, ctx.query),
  }),
} satisfies Record<string, RouteHandler>;

export { authenticate };

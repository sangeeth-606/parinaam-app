import type { ServerDb } from './db.ts';
import type { AuthedOfficer } from './auth.ts';
import { ApiError } from '../../src/contracts/api-errors.ts';
import type { FieldTestRecordV1 } from '../../src/contracts/field-test-record.ts';
import { likeContains, optionalQuery, pageMetadata, parsePagination } from './query.ts';
import { CASE_STATUSES } from './case-service.ts';
import { PRESUMPTIVE_OUTCOMES } from '../../src/contracts/field-test-record.ts';

interface SqlClause {
  sql: string;
  params: unknown[];
}

export interface RecordSummary {
  seq: number;
  record_uuid: string;
  case_ref: string;
  case_status: string;
  panchnama_ref: string | null;
  package_no: string;
  reagent: string;
  kit_type: string | null;
  kit_batch: string | null;
  region: string;
  department: string;
  location_label: string;
  operator_id: string;
  operator_name: string | null;
  outcome: string;
  confidence: number;
  created_at: string;
  received_at: string;
  record_hash: string;
  prev_hash: string;
  chain_hash: string;
  image_sha256: string | null;
  evidence_status: 'AVAILABLE' | 'DECLARED_NOT_UPLOADED' | 'NOT_PROVIDED';
  is_demo: boolean;
}

const RECORD_SELECT = `
  SELECT f.seq, f.record_uuid, f.case_ref, c.case_status, c.panchnama_ref,
         f.package_no, f.reagent, f.kit_type, f.kit_batch, c.region, c.department,
         c.location_label, f.operator_id, f.operator_name, f.outcome, f.confidence,
         f.created_at, f.received_at, f.record_hash, f.prev_hash, f.chain_hash,
         f.image_sha256, f.is_demo,
         CASE WHEN e.record_uuid IS NULL THEN 0 ELSE 1 END AS evidence_available
  FROM field_test f
  JOIN cases c ON c.case_ref = f.case_ref
  LEFT JOIN evidence_blobs e ON e.record_uuid = f.record_uuid
`;

function enumFilter(query: URLSearchParams, name: string, allowed: readonly string[]): string | null {
  const value = optionalQuery(query, name, 80);
  if (value === null) return null;
  const normalized = value.toUpperCase();
  if (!allowed.includes(normalized)) {
    throw new ApiError(400, 'INVALID_FILTER', `${name} must be one of ${allowed.join(', ')}`);
  }
  return normalized;
}

function dateBound(query: URLSearchParams, name: string, end: boolean): string | null {
  const value = optionalQuery(query, name, 40);
  if (value === null) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const valid = dateOnly || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
  if (!valid || !Number.isFinite(Date.parse(dateOnly ? `${value}T00:00:00.000Z` : value))) {
    throw new ApiError(400, 'INVALID_FILTER', `${name} must be YYYY-MM-DD or an ISO timestamp`);
  }
  if (dateOnly && end) {
    const next = new Date(Date.parse(`${value}T00:00:00.000Z`) + 86_400_000);
    return next.toISOString();
  }
  return dateOnly ? `${value}T00:00:00.000Z` : value;
}

function recordClauses(officer: AuthedOfficer, query: URLSearchParams): SqlClause {
  const clauses: SqlClause[] = [];
  const add = (sql: string, ...values: unknown[]): void => {
    clauses.push({ sql, params: values });
  };

  if (officer.role === 'JUNIOR') add('f.operator_id = ?', officer.officerCode);
  const from = dateBound(query, 'date_from', false);
  const to = dateBound(query, 'date_to', true);
  if (from) add('f.created_at >= ?', from);
  if (to) add('f.created_at < ?', to);

  const region = optionalQuery(query, 'region', 40);
  const location = optionalQuery(query, 'location', 120);
  const department = optionalQuery(query, 'department', 80);
  const officerId = optionalQuery(query, 'officer', 80);
  const kitType = optionalQuery(query, 'kit_type', 120);
  const kitBatch = optionalQuery(query, 'kit_batch', 80);
  const outcome = enumFilter(query, 'outcome', PRESUMPTIVE_OUTCOMES);
  const status = enumFilter(query, 'status', CASE_STATUSES);
  const caseRef = optionalQuery(query, 'case_ref', 120);
  if (region) add('c.region = ?', region.toUpperCase());
  if (location) add('LOWER(c.location_label) LIKE ?', likeContains(location));
  if (department) add('c.department = ?', department);
  if (officerId) add('f.operator_id = ?', officerId);
  if (kitType) add('f.kit_type = ?', kitType);
  if (kitBatch) add('f.kit_batch = ?', kitBatch);
  if (outcome) add('f.outcome = ?', outcome);
  if (status) add('c.case_status = ?', status);
  if (caseRef) add('f.case_ref = ?', caseRef.toUpperCase());

  const search = optionalQuery(query, 'search', 200);
  if (search) {
    add(
      `(LOWER(f.case_ref) LIKE ? OR LOWER(f.package_no) LIKE ? OR LOWER(f.record_uuid) LIKE ? OR LOWER(COALESCE(f.operator_name, '')) LIKE ? OR LOWER(COALESCE(f.kit_type, '')) LIKE ?)`,
      likeContains(search),
      likeContains(search),
      likeContains(search),
      likeContains(search),
      likeContains(search)
    );
  }
  return { sql: clauses.length ? `WHERE ${clauses.map((clause) => clause.sql).join(' AND ')}` : '', params: clauses.flatMap((clause) => clause.params) };
}

function recordSummary(row: Record<string, unknown>): RecordSummary {
  return {
    seq: Number(row.seq),
    record_uuid: String(row.record_uuid),
    case_ref: String(row.case_ref),
    case_status: String(row.case_status),
    panchnama_ref: row.panchnama_ref === null || row.panchnama_ref === undefined ? null : String(row.panchnama_ref),
    package_no: String(row.package_no),
    reagent: String(row.reagent),
    kit_type: row.kit_type === null || row.kit_type === undefined ? null : String(row.kit_type),
    kit_batch: row.kit_batch === null || row.kit_batch === undefined ? null : String(row.kit_batch),
    region: String(row.region),
    department: String(row.department),
    location_label: String(row.location_label),
    operator_id: String(row.operator_id),
    operator_name: row.operator_name === null || row.operator_name === undefined ? null : String(row.operator_name),
    outcome: String(row.outcome),
    confidence: Number(row.confidence),
    created_at: String(row.created_at),
    received_at: String(row.received_at),
    record_hash: String(row.record_hash),
    prev_hash: String(row.prev_hash),
    chain_hash: String(row.chain_hash),
    image_sha256: row.image_sha256 === null || row.image_sha256 === undefined ? null : String(row.image_sha256),
    evidence_status: row.image_sha256
      ? Number(row.evidence_available) === 1
        ? 'AVAILABLE'
        : 'DECLARED_NOT_UPLOADED'
      : 'NOT_PROVIDED',
    is_demo: row.is_demo === true || Number(row.is_demo) === 1,
  };
}

export async function listRecords(db: ServerDb, officer: AuthedOfficer, query: URLSearchParams): Promise<Record<string, unknown>> {
  const pagination = parsePagination(query);
  const where = recordClauses(officer, query);
  const count = await db.store.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM field_test f JOIN cases c ON c.case_ref = f.case_ref ${where.sql}`,
    ...where.params
  );
  const rows = await db.store.all<Record<string, unknown>>(
    `${RECORD_SELECT} ${where.sql} ORDER BY f.created_at DESC, f.seq DESC LIMIT ? OFFSET ?`,
    ...where.params,
    pagination.limit,
    pagination.offset
  );
  return { items: rows.map(recordSummary), page: pageMetadata(Number(count?.count ?? 0), pagination) };
}

function assertRecordVisible(officer: AuthedOfficer, operatorId: string): void {
  if (officer.role === 'JUNIOR' && officer.officerCode !== operatorId) {
    throw new ApiError(403, 'OPERATOR_BINDING_MISMATCH', 'junior officers may only read their own attributed records');
  }
}

export async function getRecordDetail(db: ServerDb, officer: AuthedOfficer, uuid: string): Promise<Record<string, unknown>> {
  const row = await db.store.get<Record<string, unknown>>(
    `${RECORD_SELECT} WHERE f.record_uuid = ?`,
    uuid
  );
  if (!row) throw new ApiError(404, 'RECORD_NOT_FOUND', 'record not found');
  assertRecordVisible(officer, String(row.operator_id));
  const bodyRow = await db.store.get<{ body: string }>('SELECT body FROM field_test WHERE record_uuid = ?', uuid);
  if (!bodyRow) throw new ApiError(404, 'RECORD_NOT_FOUND', 'record not found');
  let record: FieldTestRecordV1;
  try {
    record = JSON.parse(bodyRow.body) as FieldTestRecordV1;
  } catch {
    throw new ApiError(500, 'CORRUPT_RECORD_BODY', 'stored record body is not valid JSON');
  }
  return {
    record,
    summary: recordSummary(row),
    evidence: {
      status: recordSummary(row).evidence_status,
      sha256: record.image_sha256,
      download_url: record.image_sha256 ? `/api/v1/records/${encodeURIComponent(uuid)}/evidence` : null,
    },
  };
}

function caseClauses(officer: AuthedOfficer, query: URLSearchParams): SqlClause {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (officer.role === 'JUNIOR') {
    clauses.push('EXISTS (SELECT 1 FROM field_test own WHERE own.case_ref = c.case_ref AND own.operator_id = ?)');
    params.push(officer.officerCode);
  }
  const status = enumFilter(query, 'status', CASE_STATUSES);
  const region = optionalQuery(query, 'region', 40);
  const location = optionalQuery(query, 'location', 120);
  const search = optionalQuery(query, 'search', 200);
  if (status) { clauses.push('c.case_status = ?'); params.push(status); }
  if (region) { clauses.push('c.region = ?'); params.push(region.toUpperCase()); }
  if (location) { clauses.push('LOWER(c.location_label) LIKE ?'); params.push(likeContains(location)); }
  if (search) {
    clauses.push('(LOWER(c.case_ref) LIKE ? OR LOWER(COALESCE(c.panchnama_ref, \'\')) LIKE ?)');
    params.push(likeContains(search), likeContains(search));
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function listCases(db: ServerDb, officer: AuthedOfficer, query: URLSearchParams): Promise<Record<string, unknown>> {
  const pagination = parsePagination(query);
  const where = caseClauses(officer, query);
  const recordCountExpression = officer.role === 'JUNIOR'
    ? "COUNT(CASE WHEN f.operator_id = ? THEN f.record_uuid END)"
    : 'COUNT(f.record_uuid)';
  const recordCountParams = officer.role === 'JUNIOR' ? [officer.officerCode] : [];
  const count = await db.store.get<{ count: number }>(
    `SELECT COUNT(DISTINCT c.case_ref) AS count FROM cases c ${where.sql}`,
    ...where.params
  );
  const rows = await db.store.all<Record<string, unknown>>(
    `SELECT c.case_ref, c.case_status, c.panchnama_ref, c.region, c.department, c.location_label,
            c.first_record_at, c.last_record_at, c.created_at, c.updated_at, c.version,
            ${recordCountExpression} AS record_count
     FROM cases c LEFT JOIN field_test f ON f.case_ref = c.case_ref
     ${where.sql}
     GROUP BY c.case_ref, c.case_status, c.panchnama_ref, c.region, c.department, c.location_label,
              c.first_record_at, c.last_record_at, c.created_at, c.updated_at, c.version
     ORDER BY c.last_record_at DESC, c.case_ref DESC LIMIT ? OFFSET ?`,
    ...recordCountParams,
    ...where.params,
    pagination.limit,
    pagination.offset
  );
  return {
    items: rows.map((row) => ({
      case_ref: String(row.case_ref),
      case_status: String(row.case_status),
      panchnama_ref: row.panchnama_ref === null || row.panchnama_ref === undefined ? null : String(row.panchnama_ref),
      region: String(row.region),
      department: String(row.department),
      location_label: String(row.location_label),
      first_record_at: row.first_record_at === null || row.first_record_at === undefined ? null : String(row.first_record_at),
      last_record_at: row.last_record_at === null || row.last_record_at === undefined ? null : String(row.last_record_at),
      created_at: row.created_at === null || row.created_at === undefined ? null : String(row.created_at),
      updated_at: row.updated_at === null || row.updated_at === undefined ? null : String(row.updated_at),
      record_count: Number(row.record_count),
    })),
    page: pageMetadata(Number(count?.count ?? 0), pagination),
  };
}

export async function getCaseDetail(db: ServerDb, officer: AuthedOfficer, caseRef: string): Promise<Record<string, unknown>> {
  const normalized = caseRef.toUpperCase();
  const row = await db.store.get<Record<string, unknown>>(
    `SELECT c.case_ref, c.case_status, c.panchnama_ref, c.region, c.department, c.location_label,
            c.first_record_at, c.last_record_at, c.created_at, c.updated_at, c.version
     FROM cases c WHERE c.case_ref = ?`,
    normalized
  );
  if (!row) throw new ApiError(404, 'CASE_NOT_FOUND', 'case not found');
  if (officer.role === 'JUNIOR') {
    const own = await db.store.get<{ present: number }>(
      'SELECT 1 AS present FROM field_test WHERE case_ref = ? AND operator_id = ? LIMIT 1',
      normalized,
      officer.officerCode
    );
    if (!own) throw new ApiError(403, 'CASE_ACCESS_DENIED', 'junior officers may only read cases containing their own records');
  }
  const recordVisibility = officer.role === 'JUNIOR' ? ' AND f.operator_id = ?' : '';
  const recordParams = officer.role === 'JUNIOR' ? [officer.officerCode] : [];
  const records = await db.store.all<Record<string, unknown>>(
    `${RECORD_SELECT} WHERE f.case_ref = ?${recordVisibility} ORDER BY f.seq ASC`,
    normalized,
    ...recordParams
  );
  const history = await db.store.all<Record<string, unknown>>(
    'SELECT from_status, to_status, actor, at, note FROM case_status_history WHERE case_ref = ? ORDER BY at ASC, id ASC',
    normalized
  );
  return {
    case: {
      case_ref: String(row.case_ref),
      case_status: String(row.case_status),
      panchnama_ref: row.panchnama_ref === null || row.panchnama_ref === undefined ? null : String(row.panchnama_ref),
      region: String(row.region),
      department: String(row.department),
      location_label: String(row.location_label),
      first_record_at: row.first_record_at === null || row.first_record_at === undefined ? null : String(row.first_record_at),
      last_record_at: row.last_record_at === null || row.last_record_at === undefined ? null : String(row.last_record_at),
      created_at: row.created_at === null || row.created_at === undefined ? null : String(row.created_at),
      updated_at: row.updated_at === null || row.updated_at === undefined ? null : String(row.updated_at),
      version: Number(row.version),
    },
    records: records.map(recordSummary),
    status_history: history.map((event) => ({
      from_status: String(event.from_status),
      to_status: String(event.to_status),
      actor: String(event.actor),
      at: String(event.at),
      note: event.note === null || event.note === undefined ? null : String(event.note),
    })),
  };
}

export async function getStats(db: ServerDb, officer: AuthedOfficer, query: URLSearchParams): Promise<Record<string, unknown>> {
  const where = recordClauses(officer, query);
  const totals = await db.store.get<{ records: number; cases: number; evidence: number; demo_records: number }>(
    `SELECT COUNT(DISTINCT f.record_uuid) AS records,
            COUNT(DISTINCT f.case_ref) AS cases,
            COUNT(DISTINCT e.record_uuid) AS evidence,
            COUNT(DISTINCT CASE WHEN CAST(f.is_demo AS TEXT) IN ('1', 'true') THEN f.record_uuid END) AS demo_records
     FROM field_test f JOIN cases c ON c.case_ref = f.case_ref
     LEFT JOIN evidence_blobs e ON e.record_uuid = f.record_uuid ${where.sql}`,
    ...where.params
  );
  const byStatus = await db.store.all<{ case_status: string; count: number }>(
    `SELECT c.case_status, COUNT(DISTINCT c.case_ref) AS count
     FROM cases c JOIN field_test f ON f.case_ref = c.case_ref ${where.sql}
     GROUP BY c.case_status ORDER BY c.case_status`,
    ...where.params
  );
  const byOutcome = await db.store.all<{ outcome: string; count: number }>(
    `SELECT f.outcome, COUNT(*) AS count FROM field_test f JOIN cases c ON c.case_ref = f.case_ref ${where.sql} GROUP BY f.outcome ORDER BY f.outcome`,
    ...where.params
  );
  const byRegion = await db.store.all<{ region: string; case_count: number; count: number }>(
    `SELECT c.region, COUNT(DISTINCT c.case_ref) AS case_count, COUNT(f.record_uuid) AS count
     FROM cases c JOIN field_test f ON f.case_ref = c.case_ref ${where.sql}
     GROUP BY c.region ORDER BY c.region`,
    ...where.params
  );
  const head = await db.store.get<{ seq: number; chain_hash: string; updated_at: string }>(
    'SELECT seq, chain_hash, updated_at FROM ledger_head WHERE id = 1'
  );
  const accountRows = await db.store.all<{ status: string; count: number }>(
    'SELECT status, COUNT(*) AS count FROM officers GROUP BY status'
  );
  const accounts = Object.fromEntries(accountRows.map((row) => [row.status, Number(row.count)]));
  return {
    totals: {
      records: Number(totals?.records ?? 0),
      cases: Number(totals?.cases ?? 0),
      evidence_blobs: Number(totals?.evidence ?? 0),
      demo_records: Number(totals?.demo_records ?? 0),
    },
    cases_by_status: Object.fromEntries(byStatus.map((row) => [row.case_status, Number(row.count)])),
    records_by_outcome: Object.fromEntries(byOutcome.map((row) => [row.outcome, Number(row.count)])),
    cases_by_region: Object.fromEntries(byRegion.map((row) => [row.region, { cases: Number(row.case_count), records: Number(row.count) }])),
    ledger_head: head ? { seq: Number(head.seq), chain_hash: head.chain_hash, updated_at: head.updated_at } : null,
    accounts: {
      active: Number(accounts.ACTIVE ?? 0),
      pending: Number(accounts.PENDING ?? 0),
      suspended: Number(accounts.SUSPENDED ?? 0),
    },
  };
}

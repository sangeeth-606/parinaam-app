import type { ServerDb } from './db.ts';
import type { AuthedOfficer } from './auth.ts';
import { ApiError } from '../../src/contracts/api-errors.ts';
import { assertStatusTransition, parseCaseStatus, requireReviewer } from './case-service.ts';
import { publish } from './bus.ts';

const CASE_REF_RE = /^[A-Z0-9-]+\/[A-Z0-9-]+\/[A-Z0-9-]+\/\d{4}$/;

interface CaseRow {
  case_ref: string;
  case_status: string;
  panchnama_ref: string | null;
  version: number;
}

function requireCaseRef(value: string): string {
  const normalized = value.toUpperCase();
  if (!CASE_REF_RE.test(normalized)) throw new ApiError(400, 'INVALID_CASE_REF', 'case_ref has an invalid format');
  return normalized;
}

function requireNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_REVIEW_NOTE', 'note must be a string or null');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) throw new ApiError(400, 'INVALID_REVIEW_NOTE', 'note must be between 1 and 500 characters');
  return trimmed;
}

export async function updateCaseStatus(
  db: ServerDb,
  actor: AuthedOfficer | null,
  caseRefInput: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const reviewer = requireReviewer(actor);
  const caseRef = requireCaseRef(caseRefInput);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_BODY', 'JSON object body required');
  const input = body as Record<string, unknown>;
  const nextStatus = parseCaseStatus(input.status ?? input.case_status);
  const note = requireNote(input.note);
  const now = new Date().toISOString();

  const result = await db.store.transaction(async (tx) => {
    const current = await tx.get<CaseRow>(
      db.engine === 'postgres'
        ? 'SELECT case_ref, case_status, panchnama_ref, version FROM cases WHERE case_ref = ? FOR UPDATE'
        : 'SELECT case_ref, case_status, panchnama_ref, version FROM cases WHERE case_ref = ?',
      caseRef
    );
    if (!current) throw new ApiError(404, 'CASE_NOT_FOUND', 'case not found');
    const fromStatus = current.case_status as Parameters<typeof assertStatusTransition>[0];
    assertStatusTransition(fromStatus, nextStatus);
    if (fromStatus === nextStatus) {
      return { case_ref: caseRef, case_status: nextStatus, panchnama_ref: current.panchnama_ref, version: current.version, unchanged: true };
    }
    const updated = await tx.get<CaseRow>(
      `SELECT case_ref, case_status, panchnama_ref, version FROM cases
       WHERE case_ref = ? AND version = ?`,
      caseRef,
      current.version
    );
    if (!updated) throw new ApiError(409, 'CASE_VERSION_CONFLICT', 'case changed concurrently; reload and retry', true);
    await tx.run(
      'UPDATE cases SET case_status = ?, version = version + 1, updated_at = ? WHERE case_ref = ? AND version = ?',
      nextStatus,
      now,
      caseRef,
      current.version
    );
    await tx.run(
      'INSERT INTO case_status_history (case_ref, from_status, to_status, actor, at, note) VALUES (?,?,?,?,?,?)',
      caseRef,
      fromStatus,
      nextStatus,
      reviewer.username,
      now,
      note
    );
    await tx.run(
      'INSERT INTO server_audit (actor, action, subject, at, detail) VALUES (?,?,?,?,?)',
      reviewer.username,
      'case-status-changed',
      caseRef,
      now,
      `${fromStatus} -> ${nextStatus}${note ? `: ${note}` : ''}`
    );
    const after = await tx.get<CaseRow>(
      'SELECT case_ref, case_status, panchnama_ref, version FROM cases WHERE case_ref = ?',
      caseRef
    );
    if (!after || Number(after.version) !== Number(current.version) + 1) {
      throw new ApiError(409, 'CASE_VERSION_CONFLICT', 'case update did not commit exactly once', true);
    }
    return { ...after, unchanged: false };
  });

  if (!result.unchanged) publish('case-status', { case_ref: caseRef, case_status: result.case_status, actor: reviewer.username });
  return result;
}

export async function updatePanchnama(
  db: ServerDb,
  actor: AuthedOfficer | null,
  caseRefInput: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const reviewer = requireReviewer(actor);
  const caseRef = requireCaseRef(caseRefInput);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.prototype.hasOwnProperty.call(body, 'panchnama_ref')) {
    throw new ApiError(400, 'INVALID_BODY', 'panchnama_ref is required');
  }
  const raw = (body as Record<string, unknown>).panchnama_ref;
  if (raw !== null && (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 200)) {
    throw new ApiError(400, 'INVALID_PANCHNAMA', 'panchnama_ref must be null or a non-empty string of at most 200 characters');
  }
  const panchnama = typeof raw === 'string' ? raw.trim() : null;
  const now = new Date().toISOString();

  const result = await db.store.transaction(async (tx) => {
    const current = await tx.get<CaseRow>(
      db.engine === 'postgres'
        ? 'SELECT case_ref, case_status, panchnama_ref, version FROM cases WHERE case_ref = ? FOR UPDATE'
        : 'SELECT case_ref, case_status, panchnama_ref, version FROM cases WHERE case_ref = ?',
      caseRef
    );
    if (!current) throw new ApiError(404, 'CASE_NOT_FOUND', 'case not found');
    if (current.panchnama_ref === panchnama) {
      return { case_ref: caseRef, case_status: current.case_status, panchnama_ref: panchnama, version: current.version, unchanged: true };
    }
    await tx.run(
      'UPDATE cases SET panchnama_ref = ?, version = version + 1, updated_at = ? WHERE case_ref = ? AND version = ?',
      panchnama,
      now,
      caseRef,
      current.version
    );
    await tx.run(
      'INSERT INTO server_audit (actor, action, subject, at, detail) VALUES (?,?,?,?,?)',
      reviewer.username,
      'case-panchnama-changed',
      caseRef,
      now,
      panchnama ?? 'cleared'
    );
    const after = await tx.get<CaseRow>(
      'SELECT case_ref, case_status, panchnama_ref, version FROM cases WHERE case_ref = ?',
      caseRef
    );
    if (!after || Number(after.version) !== Number(current.version) + 1) {
      throw new ApiError(409, 'CASE_VERSION_CONFLICT', 'case changed concurrently; reload and retry', true);
    }
    return { ...after, unchanged: false };
  });

  if (!result.unchanged) publish('case-panchnama', { case_ref: caseRef, panchnama_ref: panchnama, actor: reviewer.username });
  return result;
}

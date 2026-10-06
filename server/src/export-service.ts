import type { ServerDb } from './db.ts';
import type { AuthedOfficer } from './auth.ts';
import { ApiError } from '../../src/contracts/api-errors.ts';
import { PRESUMPTIVE_DISCLAIMER } from '../../src/demo/demo-dataset.ts';
import type { FieldTestRecordV1 } from '../../src/contracts/field-test-record.ts';
import { getCaseDetail } from './read-service.ts';
import { verifyFieldTestRecord } from './verify.ts';

const FORMATS = ['pdf', 'docx', 'xlsx'] as const;
type ExportFormat = (typeof FORMATS)[number];

function requestedFormats(query: URLSearchParams): ExportFormat[] {
  const raw = query.get('formats');
  if (raw === null) return [...FORMATS];
  const values = raw.toLowerCase().split(',').map((value) => value.trim()).filter(Boolean);
  if (values.length === 0 || values.some((value) => !(FORMATS as readonly string[]).includes(value))) {
    throw new ApiError(400, 'INVALID_EXPORT_FORMAT', `formats must be a comma-separated subset of ${FORMATS.join(',')}`);
  }
  return [...new Set(values as ExportFormat[])];
}

import { visibilityScope } from './rbac.ts';

export async function buildCaseExport(
  db: ServerDb,
  officer: AuthedOfficer,
  caseRef: string,
  query: URLSearchParams
): Promise<Record<string, unknown>> {
  const detail = await getCaseDetail(db, officer, caseRef);
  const normalized = caseRef.toUpperCase();
  const scope = visibilityScope(officer);
  const recordVisibility = scope.sql ? ` AND ${scope.sql}` : '';
  const recordParams = scope.params;
  const bodyRows = await db.store.all<{ body: string; record_uuid: string; image_sha256: string | null }>(
    `SELECT f.body, f.record_uuid, f.image_sha256
     FROM field_test f WHERE f.case_ref = ?${recordVisibility} ORDER BY f.seq ASC`,
    normalized,
    ...recordParams
  );
  const evidenceRows = await db.store.all<{ record_uuid: string; sha256: string; content_type: string; byte_size: number; created_at: string }>(
    `SELECT e.record_uuid, e.sha256, e.content_type, e.byte_size, e.created_at
     FROM evidence_blobs e JOIN field_test f ON f.record_uuid = e.record_uuid
     WHERE f.case_ref = ?${recordVisibility}
     ORDER BY e.record_uuid ASC`,
    normalized,
    ...recordParams
  );
  const evidence = new Map(evidenceRows.map((row) => [row.record_uuid, row]));
  const records: Array<Record<string, unknown>> = [];
  for (const row of bodyRows) {
    const record = JSON.parse(row.body) as FieldTestRecordV1;
    const integrity = await verifyFieldTestRecord(record);
    records.push({
      record,
      integrity: {
        verified: integrity.ok,
        code: integrity.code,
        checks: integrity.checks,
        device_attestation_status: 'UNVERIFIED_NO_TRUSTED_DEVICE_KEY_REGISTRY',
      },
      evidence: evidence.get(row.record_uuid)
        ? {
            status: 'AVAILABLE',
            sha256: evidence.get(row.record_uuid)?.sha256 ?? null,
            content_type: evidence.get(row.record_uuid)?.content_type ?? null,
            byte_size: Number(evidence.get(row.record_uuid)?.byte_size ?? 0),
          }
        : { status: record.image_sha256 ? 'DECLARED_NOT_UPLOADED' : 'NOT_PROVIDED', sha256: record.image_sha256 },
    });
  }
  return {
    manifest_version: 'parinaam-export-v1',
    generated_at: new Date().toISOString(),
    generated_by: { username: officer.username, officer_code: officer.officerCode, role: officer.role },
    requested_formats: requestedFormats(query),
    rendering: 'The separate web client must render deterministic PDF, DOCX, and XLSX files from this JSON manifest.',
    disclaimer: PRESUMPTIVE_DISCLAIMER,
    legal_scope: 'Workflow and integrity metadata only; no laboratory confirmation, substance identity, statutory key-signature, or disposal conclusion is asserted.',
    case: detail.case,
    status_history: detail.status_history,
    records,
  };
}

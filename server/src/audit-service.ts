import type { ServerDb } from './db.ts';
import type { AuthedOfficer } from './auth.ts';
import { requirePermission } from './rbac.ts';
import { likeContains, optionalQuery, pageMetadata, parsePagination } from './query.ts';

function requireAuditRole(officer: AuthedOfficer | null): AuthedOfficer {
  return requirePermission(officer, 'audit.read', 'AUDIT_ROLE_REQUIRED');
}

export async function listAudit(
  db: ServerDb,
  officer: AuthedOfficer | null,
  query: URLSearchParams
): Promise<Record<string, unknown>> {
  requireAuditRole(officer);
  const pagination = parsePagination(query);
  const clauses: string[] = [];
  const params: unknown[] = [];
  const actor = optionalQuery(query, 'actor', 80);
  const action = optionalQuery(query, 'action', 80);
  const subject = optionalQuery(query, 'subject', 160);
  const search = optionalQuery(query, 'search', 200);
  if (actor) { clauses.push('actor = ?'); params.push(actor); }
  if (action) { clauses.push('action = ?'); params.push(action); }
  if (subject) { clauses.push('LOWER(subject) LIKE ?'); params.push(likeContains(subject)); }
  if (search) {
    clauses.push('(LOWER(actor) LIKE ? OR LOWER(action) LIKE ? OR LOWER(COALESCE(subject, \'\')) LIKE ? OR LOWER(COALESCE(detail, \'\')) LIKE ?)');
    params.push(likeContains(search), likeContains(search), likeContains(search), likeContains(search));
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const count = await db.store.get<{ count: number }>(`SELECT COUNT(*) AS count FROM server_audit ${where}`, ...params);
  const rows = await db.store.all<Record<string, unknown>>(
    `SELECT id, actor, action, subject, at, detail FROM server_audit ${where}
     ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`,
    ...params,
    pagination.limit,
    pagination.offset
  );
  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      actor: String(row.actor),
      action: String(row.action),
      subject: row.subject === null || row.subject === undefined ? null : String(row.subject),
      at: String(row.at),
      detail: row.detail === null || row.detail === undefined ? null : String(row.detail),
    })),
    page: pageMetadata(Number(count?.count ?? 0), pagination),
  };
}

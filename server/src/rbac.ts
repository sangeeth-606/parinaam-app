import type { AuthedOfficer } from './auth.ts';
import { can, type Permission } from '../../src/contracts/officer-roles.ts';
import { ApiError } from '../../src/contracts/api-errors.ts';

export function requirePermission(
  officer: AuthedOfficer | null,
  permission: Permission,
  legacyCode?: string,
): AuthedOfficer {
  if (!officer) throw new ApiError(401, 'AUTH_REQUIRED', 'authentication required');
  const allowed =
    can(officer.role, permission) ||
    (permission === 'record.read.own' && can(officer.role, 'record.read.all'));
  if (!allowed) {
    throw new ApiError(
      403,
      legacyCode ?? 'PERMISSION_DENIED',
      `this action requires ${permission}`,
      false,
      { permission, legacy_code: legacyCode },
    );
  }
  return officer;
}

/** Row-level visibility. ONE place decides what a role can see. */
export function visibilityScope(officer: AuthedOfficer): { sql: string; params: unknown[] } {
  return can(officer.role, 'record.read.all')
    ? { sql: '', params: [] }
    : { sql: 'f.operator_id = ?', params: [officer.officerCode] };
}

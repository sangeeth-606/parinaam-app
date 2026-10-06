/**
 * Single source of truth for officer roles, permissions, and role-based access control.
 *
 * Rules:
 *   - 5 standard roles: JUNIOR, SENIOR, ADMIN, SUPERVISOR, JUDICIARY.
 *   - Pure permission queries via `can(role, permission)`.
 */

export const OFFICER_ROLES = ['JUNIOR', 'SENIOR', 'ADMIN', 'SUPERVISOR', 'JUDICIARY'] as const;
export type OfficerRole = (typeof OFFICER_ROLES)[number];

export const PERMISSIONS = [
  'record.ingest',
  'record.read.own',
  'record.read.all',
  'record.verify',
  'case.review',
  'case.export',
  'analytics.read',
  'audit.read',
  'account.manage',
  'event.stream',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<OfficerRole, readonly Permission[]>> = {
  JUNIOR: ['record.ingest', 'record.read.own', 'record.verify', 'analytics.read'],
  SENIOR: [
    'record.ingest',
    'record.read.all',
    'record.verify',
    'case.review',
    'case.export',
    'analytics.read',
    'event.stream',
  ],
  SUPERVISOR: [
    'record.read.all',
    'record.verify',
    'case.review',
    'case.export',
    'analytics.read',
    'audit.read',
    'event.stream',
  ],
  ADMIN: [...PERMISSIONS],
  JUDICIARY: ['record.read.all', 'record.verify', 'case.export', 'analytics.read', 'event.stream'],
};

export function can(role: OfficerRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission);
}

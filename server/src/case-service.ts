import type { OfficerRole } from './db.ts';
import type { AuthedOfficer } from './auth.ts';
import { ApiError } from '../../src/contracts/api-errors.ts';

import { requirePermission } from './rbac.ts';

export const REVIEW_ROLES = ['ADMIN', 'SUPERVISOR', 'SENIOR'] as const satisfies readonly OfficerRole[];
export type CaseStatus = 'REPORTED' | 'UNDER_REVIEW' | 'REVIEWED' | 'ESCALATED';
export const CASE_STATUSES = ['REPORTED', 'UNDER_REVIEW', 'REVIEWED', 'ESCALATED'] as const;

const transitions: Record<CaseStatus, readonly CaseStatus[]> = {
  REPORTED: ['UNDER_REVIEW', 'ESCALATED'],
  UNDER_REVIEW: ['REVIEWED', 'ESCALATED'],
  ESCALATED: ['REVIEWED'],
  REVIEWED: [],
};

export function requireReviewer(officer: AuthedOfficer | null): AuthedOfficer {
  return requirePermission(officer, 'case.review', 'REVIEW_ROLE_REQUIRED');
}

export function requireAdmin(officer: AuthedOfficer | null): AuthedOfficer {
  return requirePermission(officer, 'account.manage', 'ADMIN_REQUIRED');
}

export function assertStatusTransition(from: CaseStatus, to: CaseStatus): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `cannot transition a case from ${from} to ${to}`, false, {
      allowed: transitions[from],
    });
  }
}

export function parseCaseStatus(value: unknown): CaseStatus {
  if (typeof value !== 'string' || !(CASE_STATUSES as readonly string[]).includes(value.toUpperCase())) {
    throw new ApiError(400, 'INVALID_CASE_STATUS', `status must be one of ${CASE_STATUSES.join(', ')}`);
  }
  return value.toUpperCase() as CaseStatus;
}

import { can } from '../../src/contracts/officer-roles.ts';

export function canReadOfficerRecord(officer: AuthedOfficer, operatorId: string): boolean {
  return can(officer.role, 'record.read.all') || officer.officerCode === operatorId;
}

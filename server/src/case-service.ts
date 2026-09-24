import type { OfficerRole } from './db.ts';
import type { AuthedOfficer } from './auth.ts';
import { ApiError } from '../../src/contracts/api-errors.ts';

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
  if (!officer) throw new ApiError(401, 'AUTH_REQUIRED', 'authentication required');
  if (!(REVIEW_ROLES as readonly string[]).includes(officer.role)) {
    throw new ApiError(403, 'REVIEW_ROLE_REQUIRED', 'case review is restricted to senior, supervisor, and admin roles');
  }
  return officer;
}

export function requireAdmin(officer: AuthedOfficer | null): AuthedOfficer {
  if (!officer) throw new ApiError(401, 'AUTH_REQUIRED', 'authentication required');
  if (officer.role !== 'ADMIN') throw new ApiError(403, 'ADMIN_REQUIRED', 'administrator role required');
  return officer;
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

export function canReadOfficerRecord(officer: AuthedOfficer, operatorId: string): boolean {
  return officer.role !== 'JUNIOR' || officer.officerCode === operatorId;
}

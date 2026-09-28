import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routes, ROUTE_PERMISSIONS } from '../../server/src/routes.ts';
import { requirePermission, visibilityScope } from '../../server/src/rbac.ts';
import { OFFICER_ROLES, can, type Permission } from '../../src/contracts/officer-roles.ts';
import type { AuthedOfficer } from '../../server/src/auth.ts';

const PUBLIC_ROUTES = new Set(['GET /api/v1/health', 'POST /api/v1/auth/login']);

function mockOfficer(role: (typeof OFFICER_ROLES)[number], officerCode = 'OFFICER-1'): AuthedOfficer {
  return {
    id: 1,
    officerCode,
    username: 'test',
    displayName: 'Test Officer',
    role,
    status: 'ACTIVE',
    token: 'tok-1',
  };
}

describe('Phase 10 — Consolidate role guards (rbac.ts)', () => {
  it('every authenticated route declares a permission in ROUTE_PERMISSIONS', () => {
    for (const key of Object.keys(routes)) {
      if (PUBLIC_ROUTES.has(key)) continue;
      assert.ok(
        key in ROUTE_PERMISSIONS,
        `route ${key} has no declared permission — add it or it ships unguarded`
      );
    }
  });

  it('requirePermission enforces authentication (401)', () => {
    assert.throws(
      () => requirePermission(null, 'record.read.own'),
      (err: { status?: number; code?: string }) => err.status === 401 && err.code === 'AUTH_REQUIRED'
    );
  });

  it('requirePermission enforces authorization (403) with legacy code fallback', () => {
    const junior = mockOfficer('JUNIOR');
    assert.throws(
      () => requirePermission(junior, 'case.review', 'REVIEW_ROLE_REQUIRED'),
      (err: { status?: number; code?: string }) => err.status === 403 && err.code === 'REVIEW_ROLE_REQUIRED'
    );

    assert.throws(
      () => requirePermission(junior, 'account.manage'),
      (err: { status?: number; code?: string }) => err.status === 403 && err.code === 'PERMISSION_DENIED'
    );

    const admin = mockOfficer('ADMIN');
    assert.equal(requirePermission(admin, 'account.manage'), admin);
  });

  it('visibilityScope scopes JUNIOR to operator_id and allows full access to other roles', () => {
    const junior = mockOfficer('JUNIOR', 'IC-9007');
    assert.deepEqual(visibilityScope(junior), {
      sql: 'f.operator_id = ?',
      params: ['IC-9007'],
    });

    for (const role of ['SENIOR', 'SUPERVISOR', 'ADMIN', 'JUDICIARY'] as const) {
      assert.deepEqual(visibilityScope(mockOfficer(role)), {
        sql: '',
        params: [],
      });
    }
  });

  it('verifies the RBAC matrix across all roles and permissions', () => {
    const permissions: Permission[] = [
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
    ];

    for (const role of OFFICER_ROLES) {
      for (const perm of permissions) {
        const expected = can(role, perm) || (perm === 'record.read.own' && can(role, 'record.read.all'));
        const officer = mockOfficer(role);
        if (expected) {
          assert.equal(requirePermission(officer, perm), officer);
        } else {
          assert.throws(
            () => requirePermission(officer, perm),
            (err: { status?: number }) => err.status === 403
          );
        }
      }
    }
  });
});

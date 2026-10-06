import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OFFICER_ROLES, ROLE_PERMISSIONS, can } from '../../src/contracts/officer-roles.ts';

describe('Officer Roles & RBAC contracts (Phase 7)', () => {
  it('the Postgres and SQLite CHECK constraints list every role, and nothing else', () => {
    const src = readFileSync('server/src/migrations.ts', 'utf8');
    const checks = [...src.matchAll(/role IN \(([^)]*)\)/g)].map((m) => m[1]);
    assert.ok(checks.length >= 2, 'both the SQLite and Postgres variants must be present');
    for (const list of checks) {
      const inSql = list.split(',').map((s) => s.trim().replace(/'/g, ''));
      assert.deepEqual([...inSql].sort(), [...OFFICER_ROLES].sort());
    }
  });

  it('every role declares its permissions in ROLE_PERMISSIONS', () => {
    for (const role of OFFICER_ROLES) {
      assert.ok(Array.isArray(ROLE_PERMISSIONS[role]), `${role} has no permission list`);
      assert.ok(ROLE_PERMISSIONS[role].length > 0, `${role} has empty permissions`);
    }
  });

  it('can() correctly evaluates permissions', () => {
    assert.equal(can('ADMIN', 'account.manage'), true);
    assert.equal(can('JUNIOR', 'account.manage'), false);
    assert.equal(can('JUNIOR', 'record.ingest'), true);
    assert.equal(can('JUDICIARY', 'record.ingest'), false);
    assert.equal(can('JUDICIARY', 'case.export'), true);
  });
});

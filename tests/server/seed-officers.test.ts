import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OFFICER_ROSTER } from '../../src/demo/officer-roster.ts';
import { seedOfficers, getSeedPassword } from '../../server/src/seed-officers.ts';
import { ServerDb } from '../../server/src/db.ts';

describe('Phase 9 — Realistic seed and credential hygiene', () => {
  it('OFFICER_ROSTER has 10 entries with identity only and required demo codes', () => {
    assert.equal(OFFICER_ROSTER.length, 10);
    const codes = new Set(OFFICER_ROSTER.map((o) => o.officer_code));
    // The four frozen codes for demo dataset attribution
    assert.ok(codes.has('HC-4412'), 'HC-4412 must be present');
    assert.ok(codes.has('IC-9007'), 'IC-9007 must be present');
    assert.ok(codes.has('SI-5521'), 'SI-5521 must be present');
    assert.ok(codes.has('INSP-1044'), 'INSP-1044 must be present');

    // No entry has a password property
    for (const entry of OFFICER_ROSTER) {
      assert.equal('password' in entry, false, `${entry.username} must not carry a password property`);
      assert.ok(entry.rank.length > 0);
      assert.ok(entry.department.length > 0);
      assert.ok(entry.unit.length > 0);
      assert.ok(entry.region_code.length > 0);
    }
  });

  it('seedOfficers seeds all 10 officers without NULLs in the profile columns', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'parinaam-seed-officers-'));
    const dbPath = join(dir, 'seed-test.db');
    const oldSeedPass = process.env.PARINAAM_SEED_PASSWORD;
    process.env.PARINAAM_SEED_PASSWORD = 'TestPassword#2026';

    try {
      const db = await ServerDb.open(dbPath);
      const seededCount = await seedOfficers(db);
      assert.ok(seededCount >= 9);

      const rows = await db.store.all<{
        username: string;
        officer_code: string;
        rank: string | null;
        department: string | null;
        unit: string | null;
        region_code: string | null;
      }>('SELECT username, officer_code, rank, department, unit, region_code FROM officers ORDER BY id');

      assert.equal(rows.length, 10);
      for (const row of rows) {
        assert.ok(row.rank !== null, `rank must not be null for ${row.username}`);
        assert.ok(row.department !== null, `department must not be null for ${row.username}`);
        assert.ok(row.unit !== null, `unit must not be null for ${row.username}`);
        assert.ok(row.region_code !== null, `region_code must not be null for ${row.username}`);
      }

      await db.close();
    } finally {
      if (oldSeedPass !== undefined) {
        process.env.PARINAAM_SEED_PASSWORD = oldSeedPass;
      } else {
        delete process.env.PARINAAM_SEED_PASSWORD;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('getSeedPassword rejects passwords shorter than 12 characters', () => {
    const old = process.env.PARINAAM_SEED_PASSWORD;
    try {
      process.env.PARINAAM_SEED_PASSWORD = 'short';
      delete process.env.PARINAAM_API_ADMIN_PASSWORD;
      assert.throws(() => getSeedPassword(), /at least 12 characters/);
    } finally {
      if (old !== undefined) process.env.PARINAAM_SEED_PASSWORD = old;
      else delete process.env.PARINAAM_SEED_PASSWORD;
    }
  });
});

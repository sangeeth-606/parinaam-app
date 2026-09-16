/**
 * G1 — case-context logic: package-number bump, tested-package rollup, kit carry-over,
 * prefill merge, and persistence round-trip through the real app_state table.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const dbFile = join(tmpdir(), `parinaam-g-${randomBytes(4).toString('hex')}.db`);
process.env.PARINAAM_DB_FILE = dbFile;

const ctx = await import('../../src/state/case-context.ts');
const { useLedgerStore } = await import('../../src/state/ledger-store.ts');

function rec(caseRef: string, packageNo: string): never {
  return { case_ref: caseRef, package_no: packageNo } as never;
}

describe('phase G — case-context (G-D1)', () => {
  before(async () => {
    await useLedgerStore.getState().seed();
    await ctx.useCaseContext.getState().init();
  });
  after(() => {
    const fs = process.getBuiltinModule('fs');
    for (const s of ['', '-wal', '-shm']) {
      try { fs.rmSync(dbFile + s); } catch { /* gone */ }
    }
  });

  it('suggestNextPackageFor bumps past the max sealed P-n for the case only', () => {
    const recs = [rec('CR-1/A', 'P-1'), rec('CR-1/A', 'P-3'), rec('CR-2/B', 'P-9')];
    assert.equal(ctx.suggestNextPackageFor(recs, 'CR-1/A'), 'P-4');
    assert.equal(ctx.suggestNextPackageFor([], 'CR-1/A'), 'P-1');
    assert.equal(ctx.suggestNextPackageFor([rec('CR-1/A', 'LOTX')], 'CR-1/A'), 'P-1'); // non P-n ignored
  });

  it('testedPackagesFor returns distinct packages in first-seen order', () => {
    const recs = [rec('C', 'P-1'), rec('C', 'P-1'), rec('C', 'P-2')];
    assert.deepEqual(ctx.testedPackagesFor(recs, 'C'), ['P-1', 'P-2']);
    assert.deepEqual(ctx.testedPackagesFor(recs, 'D'), []);
  });

  it('prefillForNextLap merges active case + kit + ledger; null without an active case', () => {
    const active = { caseRef: 'CR-9', panchnamaRef: 'PN-9', openedAt: 'now' };
    const kit = { reagent: 'marquis' as never, kitMake: 'Sirchie', kitTestName: 'NARK II', kitLotNo: 'L1' };
    const pre = ctx.prefillForNextLap(active, kit, [rec('CR-9', 'P-2')]);
    assert.ok(pre);
    assert.equal(pre.caseRef, 'CR-9');
    assert.equal(pre.panchnamaRef, 'PN-9');
    assert.equal(pre.packageNo, 'P-3', 'auto-bump for the next lap');
    assert.equal(pre.kitLotNo, 'L1', 'kit carries over');
    assert.equal(ctx.prefillForNextLap(null, kit, []), null);
  });

  it('openCase + rememberKit persist; a fresh init() (app restart) restores them', async () => {
    await ctx.useCaseContext.getState().openCase('CR-PERSIST/2026', 'PN-7');
    await ctx.useCaseContext.getState().rememberKit({ reagent: 'mecke' as never, kit_make: 'Acro', kit_test_name: 'M', kit_lot_no: 'LOT-9' });
    assert.equal(ctx.useCaseContext.getState().activeCase?.caseRef, 'CR-PERSIST/2026');

    // simulate restart: wipe in-memory, re-init from the DB file
    ctx.useCaseContext.setState({ activeCase: null, lastKit: { reagent: null, kitMake: '', kitTestName: '', kitLotNo: '' }, loaded: false });
    await ctx.useCaseContext.getState().init();
    assert.equal(ctx.useCaseContext.getState().activeCase?.caseRef, 'CR-PERSIST/2026');
    assert.equal(ctx.useCaseContext.getState().activeCase?.panchnamaRef, 'PN-7');
    assert.equal(ctx.useCaseContext.getState().lastKit.kitLotNo, 'LOT-9');
    assert.equal(ctx.useCaseContext.getState().lastKit.reagent, 'mecke');
  });

  it('clearCase drops the active case but keeps the kit (new seizure, same bench)', async () => {
    await ctx.useCaseContext.getState().clearCase();
    assert.equal(ctx.useCaseContext.getState().activeCase, null);
    assert.equal(ctx.useCaseContext.getState().lastKit.kitLotNo, 'LOT-9');
    await ctx.useCaseContext.getState().init();
    assert.equal(ctx.useCaseContext.getState().activeCase, null, 'persisted clear survives restart');
  });
});

/**
 * v2 phase H — the acceptance MATRIX, permanently executable (H3):
 * 3 sealed records across 2 cases → real sync → server rollups → senior flips one case
 * to ESCALATED → the app's pill source (caseStatus map) matches → tamper paths both
 * ways (file UPDATE aborts; in-session chain corruption is detected at the right index).
 * Everything runs on the REAL stack: node:sqlite files, outbox engine, http client, API.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';

const dbFile = join(tmpdir(), `parinaam-h-${randomBytes(4).toString('hex')}.db`);
process.env.PARINAAM_DB_FILE = dbFile;

const { DatabaseSync } = await import('node:sqlite');
const { useLedgerStore } = await import('../../src/state/ledger-store.ts');
const { useSyncStore } = await import('../../src/state/sync-store.ts');
const { rememberServerCredentials } = await import('../../src/sync/server-credentials.ts');
const { createApiServer } = await import('../../server/src/main.ts');

const { server, db: apiDb } = await createApiServer(':memory:');
let base = '';
let adminToken = '';

async function serverApi(method: string, path: string, body?: unknown, auth = true) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth && adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('v2 H3 — end-to-end acceptance matrix vs live API', () => {
  before(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const login = await serverApi('POST', '/api/v1/auth/login', { username: 'admin', password: 'adminpass' }, false);
    adminToken = String(login.json.token);
    await useLedgerStore.getState().seed();
    await rememberServerCredentials({ username: 'admin', password: 'adminpass' });
    await useSyncStore.getState().init();
    await useSyncStore.getState().setServerUrl(base);
  });

  after(() => {
    server.close();
    apiDb.close();
    const fs = process.getBuiltinModule('fs');
    for (const s of ['', '-wal', '-shm']) {
      try {
        fs.rmSync(dbFile + s);
      } catch {
        /* gone */
      }
    }
  });

  it('syncs the 9 seeded fixtures FIRST (predecessors must reach the server before successors link)', async () => {
    // Honest v2 scenario: the demo fixtures were pre-synced to no server, so chain
    // successors can only link after the whole chain is uploaded from genesis.
    // Out-of-order upload is handled by backoff/retry per phase-D design.
    const { queueForSync, pendingCountDb } = await import('../../src/db/ledger-repository.ts');
    for (const r of useLedgerStore.getState().records) {
      await queueForSync(r.record_uuid, r.record_uuid);
    }
    assert.equal((await pendingCountDb()), 9);
    const sum = await useSyncStore.getState().syncNow();
    assert.equal(sum.failed, 0, JSON.stringify(sum));
    assert.equal(sum.synced, 9, JSON.stringify(sum));
  });

  it('seals 3 records across 2 cases (chains #10-#12 over the 9 fixtures)', async () => {
    const seal = (caseRef: string, pkg: string, v: number, outcome: string) =>
      useLedgerStore.getState().appendRecord({
        record_uuid: `H-MATRIX-${caseRef}-${pkg}`,
        case_ref: caseRef,
        package_no: pkg,
        reagent: 'marquis',
        lab: { l: 50 + v, a: v, b: -v },
        residual: { meanDeltaE: 0.4, maxDeltaE: 1.1, grade: 'GOOD' },
        outcome: outcome as never,
        confidence: 0.8,
        deltaE: 1.2,
        conformalSet: ['PROXY-A'],
        created_at: new Date().toISOString(),
        operator: 'OFFICER-ADMIN',
        sealPayload: { matrix: v },
      });
    await seal('H-CASE-A/2026', 'P-1', 1, 'CONSISTENT_WITH_REAGENT_POSITIVE');
    await seal('H-CASE-A/2026', 'P-2', 2, 'CONSISTENT_WITH_REAGENT_POSITIVE');
    await seal('H-CASE-B/2026', 'P-1', 3, 'INCONCLUSIVE');
    assert.equal(useLedgerStore.getState().records.length, 12);
  });

  it('the three new seals sync cleanly; the server accepted every hash + link', async () => {
    const sum = await useSyncStore.getState().syncNow();
    assert.equal(sum.failed, 0, JSON.stringify(sum));
    assert.equal(sum.synced, 3, JSON.stringify(sum));
    const health = await serverApi('GET', '/api/v1/health', undefined, false);
    assert.ok((health.json.records as number) >= 12);
    const cases = await serverApi('GET', '/api/v1/cases');
    const roll = (cases.json.cases as { case_ref: string; records: number; case_status: string }[])
      .find((c) => c.case_ref === 'H-CASE-A/2026');
    assert.equal(roll?.records, 2);
    const rollB = (cases.json.cases as { case_ref: string; records: number }[]).find((c) => c.case_ref === 'H-CASE-B/2026');
    assert.equal(rollB?.records, 1);
  });

  it('senior flips H-CASE-B to ESCALATED; the APP pill source reflects the server fact', async () => {
    const flip = await serverApi('POST', '/api/v1/cases/H-CASE-B%2F2026/status', { status: 'ESCALATED', note: 'forward to FSL' });
    assert.equal(flip.status, 200);
    await useSyncStore.getState().refreshCases();
    const cs = useSyncStore.getState().caseStatus;
    assert.equal(cs['H-CASE-B/2026'].status, 'ESCALATED');
    assert.equal(cs['H-CASE-A/2026'].status, 'REPORTED');
    // history audited:
    const detail = await serverApi('GET', '/api/v1/cases/H-CASE-B%2F2026');
    const hist = detail.json.history as { from_status: string; to_status: string; actor: string }[];
    assert.deepEqual([hist[0].from_status, hist[0].to_status, hist[0].actor], ['REPORTED', 'ESCALATED', 'admin']);
  });

  it('tamper BOTH ways: file-level UPDATE aborts (append-only); in-session corruption is detected at the exact index', async () => {
    // (a) the immutable file: any UPDATE on field_test aborts.
    const raw = new DatabaseSync(dbFile);
    assert.throws(
      () => raw.prepare('UPDATE field_test SET outcome = ? WHERE record_uuid = ?').run('CONSISTENT_WITH_REAGENT_NEGATIVE', 'H-MATRIX-H-CASE-A/2026-P-1'),
      /append-only/
    );
    raw.close();

    // (b) honest detection path: corrupt the in-session chain view, reverify flags the
    // EXACT broken record, and the sealed records on disk are untouched.
    const idx = useLedgerStore.getState().records.findIndex((r) => r.record_uuid === 'H-MATRIX-H-CASE-A/2026-P-2');
    const res = await useLedgerStore.getState().simulateTamper(idx);
    assert.equal(res.valid, false);
    assert.equal(res.brokenIndex, idx);
    await useLedgerStore.getState().resetDemo();
    const ok = await useLedgerStore.getState().reverify();
    assert.equal(ok.valid, true);
  });
});

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
const { seedDemo } = await import('../../server/src/seed.ts');

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
    process.env.PARINAAM_SEED_PASSWORD = 'Parinaam#2026';
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await seedDemo(apiDb);
    const login = await serverApi('POST', '/api/v1/auth/login', { username: 'admin', password: 'Parinaam#2026' }, false);
    adminToken = String(login.json.token);
    await useLedgerStore.getState().seed();
    await rememberServerCredentials({ username: 'admin', password: 'Parinaam#2026' });
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

  it('loads the identical 15-record demo chain locally and on the API without queueing demo seeds', async () => {
    const { pendingCountDb } = await import('../../src/db/ledger-repository.ts');
    assert.equal(useLedgerStore.getState().records.length, 15);
    assert.ok(useLedgerStore.getState().records.every((record) => record.syncStatus === 'demo-seed'));
    assert.equal(await pendingCountDb(), 0);
    const health = await serverApi('GET', '/api/v1/health');
    assert.equal(health.json.records, 15);
  });

  it('seals 3 live records across 2 cases (chain #16-#18 over the shared demo chain)', async () => {
    let recordNumber = 16;
    const seal = (caseRef: string, pkg: string, value: number, outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE' | 'INCONCLUSIVE') =>
      useLedgerStore.getState().appendRecord({
        record_uuid: `00000000-0000-4000-8000-${String(recordNumber++).padStart(12, '0')}`,
        case_ref: caseRef,
        package_no: pkg,
        reagent: 'marquis',
        lab: { l: 50 + value, a: value, b: -value },
        residual: { meanDeltaE: 0.4, maxDeltaE: 1.1, grade: 'GOOD' },
        outcome,
        confidence: outcome === 'INCONCLUSIVE' ? 0.54 : 0.8,
        deltaE: 1.2,
        conformalSet: outcome === 'INCONCLUSIVE' ? ['POSITIVE', 'NEGATIVE'] : ['POSITIVE'],
        abstentionReason: outcome === 'INCONCLUSIVE' ? 'low_margin' : null,
        created_at: new Date().toISOString(),
        operator: 'OFFICER-ADMIN',
        operatorName: 'System Administrator',
        officerRole: 'ADMIN',
        isDemo: false,
      });
    await seal('H/CASE-A/CR/2026', 'P-1', 1, 'CONSISTENT_WITH_REAGENT_POSITIVE');
    await seal('H/CASE-A/CR/2026', 'P-2', 2, 'CONSISTENT_WITH_REAGENT_POSITIVE');
    await seal('H/CASE-B/CR/2026', 'P-1', 3, 'INCONCLUSIVE');
    assert.equal(useLedgerStore.getState().records.length, 18);
  });

  it('the three new seals sync cleanly; the server accepted every hash + link', async () => {
    const sum = await useSyncStore.getState().syncNow();
    assert.equal(sum.failed, 0, JSON.stringify(sum));
    assert.equal(sum.synced, 3, JSON.stringify(sum));
    const health = await serverApi('GET', '/api/v1/health', undefined, false);
    assert.ok((health.json.records as number) >= 18);
    const cases = await serverApi('GET', '/api/v1/cases');
    const roll = (cases.json.items as { case_ref: string; record_count: number; case_status: string }[])
      .find((c) => c.case_ref === 'H/CASE-A/CR/2026');
    assert.equal(roll?.record_count, 2);
    const rollB = (cases.json.items as { case_ref: string; record_count: number }[]).find((c) => c.case_ref === 'H/CASE-B/CR/2026');
    assert.equal(rollB?.record_count, 1);
  });

  it('admin escalates H/CASE-B; the app status source reflects the server fact', async () => {
    const flip = await serverApi('PATCH', '/api/v1/cases/H%2FCASE-B%2FCR%2F2026/status', { status: 'ESCALATED', note: 'Synthetic workflow escalation marker for local demonstration.' });
    assert.equal(flip.status, 200);
    await useSyncStore.getState().refreshCases();
    const cs = useSyncStore.getState().caseStatus;
    assert.equal(cs['H/CASE-B/CR/2026'].status, 'ESCALATED');
    assert.equal(cs['H/CASE-A/CR/2026'].status, 'REPORTED');
    const detail = await serverApi('GET', '/api/v1/cases/H%2FCASE-B%2FCR%2F2026');
    const history = detail.json.status_history as { from_status: string; to_status: string; actor: string }[];
    assert.deepEqual([history[0].from_status, history[0].to_status, history[0].actor], ['REPORTED', 'ESCALATED', 'admin']);
  });

  it('tamper BOTH ways: file-level UPDATE aborts (append-only); in-session corruption is detected at the exact index', async () => {
    // (a) the immutable file: any UPDATE on field_test aborts.
    const raw = new DatabaseSync(dbFile);
    assert.throws(
      () => raw.prepare('UPDATE field_test SET outcome = ? WHERE record_uuid = ?').run('CONSISTENT_WITH_REAGENT_NEGATIVE', '00000000-0000-4000-8000-000000000016'),
      /append-only/
    );
    raw.close();

    // (b) honest detection path: corrupt the in-session chain view, reverify flags the
    // EXACT broken record, and the sealed records on disk are untouched.
    const idx = useLedgerStore.getState().records.findIndex((r) => r.record_uuid === '00000000-0000-4000-8000-000000000017');
    const res = await useLedgerStore.getState().simulateTamper(idx);
    assert.equal(res.valid, false);
    assert.equal(res.brokenIndex, idx);
    await useLedgerStore.getState().resetDemo();
    const ok = await useLedgerStore.getState().reverify();
    assert.equal(ok.valid, true);
  });
});

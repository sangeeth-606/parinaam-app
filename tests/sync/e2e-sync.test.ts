/**
 * Phase E end-to-end sync test — the FULL production path with zero mocks of the
 * transport stack: app SQLite file (node:sqlite) → sync-store glue → outbox engine →
 * http-client (global fetch) → live phase-D API server (in-memory, ephemeral port).
 *
 * Proves v2's core promise: sealed records leave the queue only after a real server
 * recomputes their hash and stores them (GAP-4 closed for good).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';

const dbFile = join(tmpdir(), `parinaam-e-${randomBytes(4).toString('hex')}.db`);
process.env.PARINAAM_DB_FILE = dbFile;

const repo = await import('../../src/db/ledger-repository.ts');
const { useLedgerStore } = await import('../../src/state/ledger-store.ts');
const { useSyncStore } = await import('../../src/state/sync-store.ts');
const { rememberServerCredentials } = await import('../../src/sync/server-credentials.ts');
const { createApiServer } = await import('../../server/src/main.ts');
const { seedDemo } = await import('../../server/src/seed.ts');

const { server, db: apiDb } = await createApiServer(':memory:');
let base = '';

let liveUuid = '';

describe('Phase E — real sync (device outbox ⇄ API server)', () => {
  before(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await seedDemo(apiDb);
    await useLedgerStore.getState().seed();
    await rememberServerCredentials({ username: 'admin', password: 'adminpass' });
    await useSyncStore.getState().init();
    await useSyncStore.getState().setServerUrl(base);
  });

  after(() => {
    server.close();
    apiDb.close();
    const fs = process.getBuiltinModule('fs');
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.rmSync(dbFile + suffix);
      } catch {
        /* gone */
      }
    }
  });

  it('seeds the identical 15-record demo chain as local-only demo seeds', async () => {
    const rec = useLedgerStore.getState();
    assert.equal(rec.records.length, 15);
    assert.ok(rec.records.every((record) => record.syncStatus === 'demo-seed'));
    assert.equal(await repo.pendingCountDb(), 0);
  });

  it('creates one real admin-attributed record after the shared demo chain', async () => {
    const created = await useLedgerStore.getState().appendRecord({
      record_uuid: '00000000-0000-4000-8000-000000000101',
      case_ref: 'LIVE/E2E/CR-01/2026',
      package_no: 'P-1',
      reagent: 'marquis',
      lab: { l: 21.2, a: 4.4, b: -2.2 },
      residual: { meanDeltaE: 0.4, maxDeltaE: 1.1, grade: 'GOOD' },
      outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      confidence: 0.9,
      deltaE: 1.2,
      conformalSet: ['POSITIVE'],
      abstentionReason: null,
      created_at: new Date().toISOString(),
      operator: 'OFFICER-ADMIN',
      operatorName: 'System Administrator',
      officerRole: 'ADMIN',
      isDemo: false,
    });
    liveUuid = created.record_uuid;
    assert.equal(created.seq, 16);
    assert.equal(await repo.pendingCountDb(), 1);
  });

  it('skips a pass while the backoff window is still open (honest schedule)', async () => {
    const uuid = liveUuid;
    await repo.queueForSync(uuid, uuid);
    const entries = await repo.pendingEntriesDb();
    await repo.noteQueueFailureDb(entries[0].id, 1, new Date(Date.now() + 60_000).toISOString(), 'forced backoff');
    const sum = await useSyncStore.getState().syncNow();
    assert.equal(sum.skippedBackoff, true);
    assert.equal((await repo.pendingCountDb()), 1); // intact
  });

  it('when the window opens, the record really uploads and the server recomputes its hash', async () => {
    const uuid = liveUuid;
    const entries = await repo.pendingEntriesDb();
    await repo.noteQueueFailureDb(entries[0].id, 1, new Date(Date.now() - 1000).toISOString(), 'forced backoff');
    const sum = await useSyncStore.getState().syncNow();
    assert.equal(sum.synced, 1, JSON.stringify(sum));
    assert.equal(await repo.pendingCountDb(), 0);
    assert.equal(useLedgerStore.getState().records.find((record) => record.record_uuid === uuid)?.syncStatus, 'synced');
    // server-side fact, not app memory:
    const res = await fetch(base + '/api/v1/records', { headers: { authorization: `Bearer ${await token()}` } });
    const data = (await res.json()) as { items: { record_uuid: string }[] };
    assert.equal(data.items.length, 16);
    assert.ok(data.items.some((record) => record.record_uuid === uuid));
    const v = await (await fetch(base + '/api/v1/records/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ uuid }),
    })).json() as { verified: boolean; checks: string[] };
    assert.equal(v.verified, true, JSON.stringify(v));
    assert.ok(v.checks.some((c) => c.includes('record_hash')));
  });

  it('case statuses come back as SERVER facts after refresh', async () => {
    await useSyncStore.getState().refreshCases();
    const cs = useSyncStore.getState().caseStatus;
    const ref = 'LIVE/E2E/CR-01/2026';
    assert.ok(cs[ref], 'case present');
    assert.equal(cs[ref].status, 'REPORTED');
    assert.ok(useSyncStore.getState().statusFetchedAt);
  });

  it('a record that vanished from the ledger is dead-lettered, not retried forever', async () => {
    await repo.queueForSync('ghost-record-uuid', 'ghost-record-uuid');
    const sum = await useSyncStore.getState().syncNow();
    assert.equal(sum.deadLettered, 1);
    assert.equal(await repo.pendingCountDb(), 0);
    assert.ok((await repo.auditCountDb()) > 0);
    assert.ok(sum.failed <= 1);
  });

  it('without cached credentials, sync reports needsLogin instead of looping', async () => {
    const { setPref } = await import('../../src/auth/session-token.ts');
    await setPref('server_credentials', ''); // force real absence via the pref layer
    const sum = await useSyncStore.getState().syncNow();
    assert.match(sum.error ?? '', /sign-in required/i);
    assert.equal(useSyncStore.getState().needsLogin, true);
  });
});

let cachedToken = '';
async function token(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await fetch(base + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'adminpass' }),
  });
  const data = (await res.json()) as { token: string };
  cachedToken = data.token;
  return cachedToken;
}

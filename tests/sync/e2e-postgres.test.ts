/**
 * Optional live PostgreSQL integration test.
 *
 * Run explicitly against an isolated self-hosted database:
 *   PARINAAM_TEST_DATABASE_URL=postgres://... node --experimental-strip-types --test tests/sync/e2e-postgres.test.ts
 *
 * It is skipped by the normal hermetic test command so contributors do not need
 * Docker just to run unit tests.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createFieldTestRecord } from '../../src/contracts/field-test-record.ts';
import { sha256HexBytes } from '../../src/crypto/sha256-bytes.ts';

const databaseUrl = process.env.PARINAAM_TEST_DATABASE_URL;
const dbFile = join(tmpdir(), `parinaam-pg-e2e-${randomBytes(5).toString('hex')}.db`);
process.env.PARINAAM_DB_FILE = dbFile;

const repo = await import('../../src/db/ledger-repository.ts');
const { useLedgerStore } = await import('../../src/state/ledger-store.ts');
const { useSyncStore } = await import('../../src/state/sync-store.ts');
const { rememberServerCredentials } = await import('../../src/sync/server-credentials.ts');
const { createApiServer } = await import('../../server/src/main.ts');

const integration = Boolean(databaseUrl);
const suite = integration ? describe : describe.skip;
let apiServer: Awaited<ReturnType<typeof createApiServer>> | null = null;
let base = '';

before(async () => {
  if (!databaseUrl) return;
  process.env.DATABASE_URL = databaseUrl;
  process.env.PARINAAM_DB = 'postgres';
  process.env.PARINAAM_SEED_PASSWORD = 'Parinaam#2026';
  process.env.PARINAAM_API_ADMIN_PASSWORD = 'Parinaam#2026';
  delete process.env.PARINAAM_SEED;
  apiServer = await createApiServer();
  await new Promise<void>((resolve) => apiServer?.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(apiServer?.server.address() as AddressInfo).port}`;
  const response = await fetch(`${base}/api/v1/health`);
  assert.equal(response.status, 200);
  const health = (await response.json()) as { engine: string; records: number };
  assert.equal(health.engine, 'postgres');
  assert.equal(health.records, 15);
  await useLedgerStore.getState().seed();
  await rememberServerCredentials({ username: 'admin', password: 'Parinaam#2026' });
  await useSyncStore.getState().init();
  await useSyncStore.getState().setServerUrl(base);
});

after(async () => {
  if (apiServer) {
    await new Promise<void>((resolve) => apiServer?.server.close(() => resolve()));
    await apiServer.db.close();
  }
  const fs = process.getBuiltinModule('fs');
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbFile + suffix);
    } catch {
      // best effort
    }
  }
});

suite('optional app SQLite → PostgreSQL live sync', () => {
  it('uploads a new sealed record and reads PostgreSQL case facts back', async () => {
    const created = await useLedgerStore.getState().appendRecord({
      record_uuid: '00000000-0000-4000-8000-00000000f016',
      case_ref: 'LIVE/PG-E2E/CR-01/2026',
      package_no: 'P-1',
      reagent: 'marquis',
      lab: { l: 21.2, a: 4.4, b: -2.2 },
      residual: { meanDeltaE: 0.4, maxDeltaE: 1.1, grade: 'GOOD' },
      outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      confidence: 0.9,
      deltaE: 1.2,
      conformalSet: ['POSITIVE'],
      abstentionReason: null,
      created_at: '2026-09-20T10:16:00.000Z',
      operator: 'OFFICER-ADMIN',
      operatorName: 'System Administrator',
      officerRole: 'ADMIN',
      isDemo: false,
    });
    assert.equal(created.seq, 16);
    assert.equal(await repo.pendingCountDb(), 1);
    const result = await useSyncStore.getState().syncNow();
    assert.equal(result.synced, 1, JSON.stringify(result));
    assert.equal(await repo.pendingCountDb(), 0);
    await useSyncStore.getState().refreshCases();
    assert.equal(useSyncStore.getState().caseStatus['LIVE/PG-E2E/CR-01/2026']?.status, 'REPORTED');

    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const imageSha256 = await sha256HexBytes(bytes);
    const localHead = useLedgerStore.getState().records.find((record) => record.seq === 16);
    assert.ok(localHead);
    const imageRecord = await createFieldTestRecord({
      seq: 17,
      record_uuid: '00000000-0000-4000-8000-00000000f017',
      case_ref: 'LIVE/PG-E2E/CR-02/2026',
      package_no: 'P-1',
      lot_no: null,
      reagent: 'marquis',
      kit: { make: 'Sirchie', test_name: 'NARK II', lot_no: 'MK-24B-118', expiry: '2027-04-30' },
      corrected_lab: { l: 21.2, a: 4.4, b: -2.2 },
      delta_e_00: 1.2,
      calibration_residual: { mean: 0.4, max: 1.1, grade: 'GOOD' },
      outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      confidence: 0.9,
      conformal_set: ['POSITIVE'],
      abstention_reason: null,
      kinetics: null,
      gps: { lat: 28.5562, lon: 77.0999, accuracy_m: 5, mocked: false },
      image_sha256: imageSha256,
      operator_id: 'OFFICER-ADMIN',
      operator_name: 'System Administrator',
      officer_role: 'ADMIN',
      created_at: '2026-09-20T10:17:00.000Z',
      is_demo: false,
      device_attestation: null,
    }, localHead.chainHash);
    const loginResponse = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Parinaam#2026' }),
    });
    const login = (await loginResponse.json()) as { token: string };
    assert.equal(loginResponse.status, 200);
    const ingested = await fetch(`${base}/api/v1/records`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${login.token}`,
        'content-type': 'application/json',
        'idempotency-key': 'pg-evidence-record-17',
      },
      body: JSON.stringify(imageRecord),
    });
    assert.equal(ingested.status, 201);
    const uploaded = await fetch(`${base}/api/v1/records/${imageRecord.record_uuid}/evidence`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${login.token}`, 'content-type': 'image/jpeg' },
      body: Buffer.from(bytes),
    });
    assert.equal(uploaded.status, 201);
    const downloaded = await fetch(`${base}/api/v1/records/${imageRecord.record_uuid}/evidence`, {
      headers: { authorization: `Bearer ${login.token}` },
    });
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('x-content-sha256'), imageSha256);
    assert.deepEqual([...new Uint8Array(await downloaded.arrayBuffer())], [...bytes]);
    if (!apiServer) throw new Error('PostgreSQL test server was not initialized');
    await assert.rejects(
      apiServer.db.store.run('UPDATE field_test SET outcome = ? WHERE seq = ?', 'INCONCLUSIVE', 1),
      /append-only/,
    );
    await assert.rejects(
      apiServer.db.store.run('DELETE FROM evidence_blobs WHERE record_uuid = ?', imageRecord.record_uuid),
      /append-only/,
    );
  });
});

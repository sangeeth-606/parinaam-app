/**
 * http-client unit tests with an injected fake fetch (E2) — the paths the live e2e
 * cannot force deterministically: 401 → re-login → single retry, hard timeout,
 * permanent-error tagging, and the adapter's hash identity against the server contract.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { createHttpSyncClient } = await import('../../src/sync/http-client.ts');
const { toFieldTestRecord } = await import('../../src/sync/field-test-record.ts');
const { GENESIS_PREV_HASH } = await import('../../src/crypto/hash-chain.ts');
const { seedLedgerRecords } = {
  seedLedgerRecords: (await import('../../src/repo/fixtures.ts')).seedLedgerRecords,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// One REAL sealed fixture record shared by all transport tests.
const [SEALED] = await seedLedgerRecords();

describe('Phase E http-client — transport edges', () => {
  it('uploads a real app-sealed record whose record_hash equals sha256(payload_jcs)', async () => {
    const rec = SEALED;
    const wire = toFieldTestRecord(rec as never);
    const { sha256Hex } = await import('../../src/crypto/sha256.ts');
    assert.equal(await sha256Hex(wire.payload_jcs), wire.record_hash, 'server-recomputable identity holds through the adapter');
    assert.equal(wire.prev_hash, GENESIS_PREV_HASH);
    assert.match(wire.outcome, /^CONSISTENT_WITH_REAGENT_|^INCONCLUSIVE$/);

    const calls: { path: string; headers: Record<string, string>; body: string }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ path: String(url), headers, body: String(init?.body ?? '') });
      if (String(url).endsWith('/auth/login')) return jsonResponse(200, { token: 'tk-1' });
      return jsonResponse(201, { status: 'stored' });
    }) as unknown as typeof fetch;

    const { client } = createHttpSyncClient({
      serverUrl: 'http://test.local',
      credentials: { username: 'admin', password: 'adminpass' },
      getRecord: () => rec as never,
      fetchImpl: fakeFetch,
    });
    const res = await client.uploadRecord(wire.record_uuid, 'idem-1');
    assert.equal(res.success, true);
    assert.equal(res.status, 201);
    assert.equal(calls.length, 2); // login then upload
    assert.equal(calls[1].headers['idempotency-key'], 'idem-1');
    const sent = JSON.parse(calls[1].body) as Record<string, unknown>;
    assert.equal(sent.payload_jcs, wire.payload_jcs); // the hashed bytes go verbatim
    assert.equal(sent.record_hash, wire.record_hash);
  });

  it('401 clears the session, re-logs in once, and retries the upload', async () => {
    let uploadCount = 0;
    let tokenRound = 0;
    const fakeFetch = (async (url: string) => {
      if (String(url).endsWith('/auth/login')) {
        tokenRound += 1;
        return jsonResponse(200, { token: `tk-${tokenRound}` });
      }
      uploadCount += 1;
      const first = uploadCount === 1;
      return first ? jsonResponse(401, { error: 'expired' }) : jsonResponse(200, { status: 'already-stored' });
    }) as unknown as typeof fetch;
    const { client } = createHttpSyncClient({
      serverUrl: 'http://test.local',
      credentials: { username: 'a', password: 'b' },
      getRecord: () => SEALED,
      fetchImpl: fakeFetch,
    });
    const res = await client.uploadRecord('x', 'k');
    assert.equal(res.success, true);
    assert.equal(uploadCount, 2);
    assert.equal(tokenRound, 2);
  });

  it('422 is tagged [permanent] so the service can dead-letter it', async () => {
    const fakeFetch = (async (url: string) => {
      if (String(url).endsWith('/auth/login')) return jsonResponse(200, { token: 'tk' });
      return jsonResponse(422, { error: 'hash-mismatch' });
    }) as unknown as typeof fetch;
    const { client } = createHttpSyncClient({
      serverUrl: 'http://test.local',
      credentials: { username: 'a', password: 'b' },
      getRecord: () => SEALED,
      fetchImpl: fakeFetch,
    });
    await assert.rejects(() => client.uploadRecord('x', 'k'), /\[permanent\].*hash-mismatch/);
  });

  it('network hang → abort at timeout → transient failure (stays queued)', async () => {
    const fakeFetch = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const { client } = createHttpSyncClient({
      serverUrl: 'http://test.local',
      credentials: { username: 'a', password: 'b' },
      getRecord: () => ({ record_uuid: 'x' } as never),
      fetchImpl: fakeFetch as unknown as typeof fetch,
      timeoutMs: 60,
    });
    const res = await client.uploadRecord('x', 'k');
    assert.equal(res.success, false);
    assert.equal(res.status, 0);
  });

  it('missing credentials → never attempts, transient result', async () => {
    let hit = 0;
    const { client } = createHttpSyncClient({
      serverUrl: 'http://test.local',
      credentials: null,
      getRecord: () => ({ record_uuid: 'x' } as never),
      fetchImpl: (async () => {
        hit += 1;
        return jsonResponse(200, {});
      }) as unknown as typeof fetch,
    });
    const res = await client.uploadRecord('x', 'k');
    assert.equal(res.success, false);
    assert.equal(hit, 0);
  });
});

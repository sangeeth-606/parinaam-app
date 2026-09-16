/**
 * Phase D API tests — real HTTP round-trips against an ephemeral in-memory server.
 * Proves: auth (admin/adminpass seeding), record ingest with REAL hash recomputation
 * (fixture records sealed by the app pipeline itself), rejection of tampered payloads,
 * idempotency, conflict wall, case rollups, caseStatus lifecycle + RBAC, verify endpoint.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

const { createApiServer } = await import('../../server/src/main.ts');
const { seedLedgerRecords } = await import('../../src/repo/fixtures.ts');
const { buildSealedRecord } = await import('../../src/services/analysis-pipeline.ts');
const { GENESIS_PREV_HASH } = await import('../../src/crypto/hash-chain.ts');

interface SealedLike {
  record_uuid: string;
  case_ref: string;
  panchnama_ref?: string;
  package_no: string;
  lot_no?: string;
  reagent: string;
  outcome: string;
  confidence: number;
  deltaE: number;
  lab: { l: number; a: number; b: number };
  residual: { meanDeltaE: number; maxDeltaE: number; grade: string };
  conformalSet: string[];
  abstentionReason?: string | null;
  created_at: string;
  operator: string;
  payloadJcs: string;
  payloadSha256: string;
  prevHash: string;
  chainHash: string;
  deviceAttestation: string | null;
}

function wireRecord(r: SealedLike): Record<string, unknown> {
  return {
    record_uuid: r.record_uuid,
    case_ref: r.case_ref,
    panchnama_ref: r.panchnama_ref ?? null,
    package_no: r.package_no,
    lot_no: r.lot_no ?? null,
    reagent: r.reagent,
    kit: { make: 'Sirchie', test_name: 'NARK II', lot_no: 'MK-24B-118', expiry: null },
    corrected_lab: r.lab,
    delta_e_00: r.deltaE,
    calibration_residual: { mean: r.residual.meanDeltaE, max: r.residual.maxDeltaE, grade: r.residual.grade },
    outcome: r.outcome,
    confidence: r.confidence,
    conformal_set: r.conformalSet,
    abstention_reason: r.abstentionReason ?? null,
    kinetics: null,
    gps: null,
    image_ref: null,
    image_sha256: null,
    operator_id: r.operator,
    operator_name: 'Admin (Demo Officer)',
    officer_role: 'SENIOR',
    created_at: r.created_at,
    payload_jcs: r.payloadJcs,
    record_hash: r.payloadSha256,
    prev_hash: r.prevHash,
    chain_hash: r.chainHash,
    device_attestation: r.deviceAttestation,
  };
}

const { server, db } = await createApiServer(':memory:');
let base = '';
let token = '';

async function api(
  method: string,
  path: string,
  opts: { body?: unknown; auth?: boolean; idem?: string } = {}
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.auth ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.idem ? { 'idempotency-key': opts.idem } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('Parinaam API — v2 phase D', () => {
  const sealed: SealedLike[] = [];

  before(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Seal the first two fixture records exactly like the app does (real chain).
    let prev = GENESIS_PREV_HASH;
    for (const d of (await seedLedgerRecords()).slice(0, 2)) {
      const { sealPayload, ...core } = d;
      const { seal } = await buildSealedRecord(sealPayload, prev, d.record_uuid);
      sealed.push({ ...core, ...seal, prevHash: prev } as unknown as SealedLike);
      prev = seal.chainHash;
    }
    const loginRes = await api('POST', '/api/v1/auth/login', { body: { username: 'admin', password: 'adminpass' } });
    assert.equal(loginRes.status, 200);
    token = String((loginRes.json as { token: string }).token);
  });

  after(() => {
    server.close();
    db.close();
  });

  it('health is open and reports the engine', async () => {
    const r = await api('GET', '/api/v1/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.engine, 'node:sqlite');
  });

  it('rejects bad credentials and unauthenticated writes', async () => {
    const r = await api('POST', '/api/v1/auth/login', { body: { username: 'admin', password: 'wrongpass' } });
    assert.equal(r.status, 401);
    const w = await api('POST', '/api/v1/records', { body: wireRecord(sealed[0]) });
    assert.equal(w.status, 401);
  });

  it('auth/me identifies the seeded SENIOR officer', async () => {
    const r = await api('GET', '/api/v1/auth/me', { auth: true });
    assert.equal(r.status, 200);
    assert.equal(r.json.username, 'admin');
    assert.equal(r.json.role, 'SENIOR');
  });

  it('ingests an app-sealed record — server recomputes the hash', async () => {
    const r = await api('POST', '/api/v1/records', { body: wireRecord(sealed[0]), auth: true, idem: 'k-1' });
    assert.equal(r.status, 201);
    assert.equal(r.json.status, 'stored');
    const checks = r.json.checks as string[];
    assert.ok(checks.some((c) => c.startsWith('record_hash')));
    // case auto-created at REPORTED
    const c = await api('GET', '/api/v1/cases', { auth: true });
    const cases = c.json.cases as { case_ref: string; case_status: string; records: number }[];
    assert.equal(cases[0].case_ref, sealed[0].case_ref);
    assert.equal(cases[0].case_status, 'REPORTED');
    assert.equal(cases[0].records, 1);
  });

  it('idempotent replay (same key) returns 200 without re-inserting', async () => {
    const r = await api('POST', '/api/v1/records', { body: wireRecord(sealed[0]), auth: true, idem: 'k-1' });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'replayed');
    const c = await api('GET', '/api/v1/cases', { auth: true });
    assert.equal((c.json.cases as { records: number }[])[0].records, 1);
  });

  it('rejects tampered payload: hash-mismatch and non-canonical JCS', async () => {
    const tampered = { ...wireRecord(sealed[1]), payload_jcs: (sealed[1].payloadJcs as string).replace('"P-2"', '"P-9"') };
    const r = await api('POST', '/api/v1/records', { body: tampered, auth: true });
    assert.equal(r.status, 422);
    assert.match(String(r.json.error), /hash-mismatch|canonical/);
  });

  it('same uuid + different content hits the conflict wall (409)', async () => {
    const diff = { ...wireRecord(sealed[0]), record_hash: 'beef'.repeat(16) };
    const r = await api('POST', '/api/v1/records', { body: diff, auth: true });
    assert.equal(r.status, 409);
  });

  it('second record links via prev_hash; out-of-order is acceptable but reported', async () => {
    const r = await api('POST', '/api/v1/records', { body: wireRecord(sealed[1]), auth: true });
    assert.equal(r.status, 201);
    assert.ok((r.json.checks as string[]).some((c) => c.includes('in sequence')));
  });

  it('verify endpoint re-checks a stored record honestly', async () => {
    const r = await api('POST', '/api/v1/records/verify', { body: { uuid: sealed[0].record_uuid }, auth: true });
    assert.equal(r.status, 200);
    assert.equal(r.json.valid, true);
    const checks = r.json.checks as string[];
    assert.ok(checks.some((c) => c.startsWith('device_attestation')));
  });

  it('caseStatus lifecycle with RBAC: SENIOR moves it, JUNIOR may not', async () => {
    const ref = sealed[0].case_ref;
    const ok = await api('POST', `/api/v1/cases/${encodeURIComponent(ref)}/status`, { body: { status: 'UNDER_REVIEW', note: 'desk check' }, auth: true });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.from, 'REPORTED');

    await db.insertOfficer('jun', 'juniorpw', 'Junior Officer', 'JUNIOR');
    const juniorToken = token;
    const jr = await api('POST', '/api/v1/auth/login', { body: { username: 'jun', password: 'juniorpw' } });
    assert.equal(jr.status, 200);
    token = String(jr.json.token);
    const denied = await api('POST', `/api/v1/cases/${encodeURIComponent(ref)}/status`, { body: { status: 'REVIEWED' }, auth: true });
    assert.equal(denied.status, 403);
    token = juniorToken; // back to admin for the remaining assertions
    const detail = await api('GET', `/api/v1/cases/${encodeURIComponent(ref)}`, { auth: true });
    assert.equal((detail.json.case as { case_status: string }).case_status, 'UNDER_REVIEW');
    const bad = await api('POST', `/api/v1/cases/${encodeURIComponent('NOPE/XX/CR-9/2026')}/status`, { body: { status: 'REVIEWED' }, auth: true });
    assert.equal(bad.status, 404);
    const illegal = await api('POST', `/api/v1/cases/${encodeURIComponent(ref)}/status`, { body: { status: 'BOGUS' }, auth: true });
    assert.equal(illegal.status, 400);
  });

  it('records list/detail round-trip by case', async () => {
    const l = await api('GET', `/api/v1/records?case_ref=${encodeURIComponent(sealed[0].case_ref)}`, { auth: true });
    assert.equal((l.json.records as unknown[]).length, 2);
    const d = await api('GET', `/api/v1/records/${sealed[1].record_uuid}`, { auth: true });
    assert.equal((d.json.record as { package_no: string }).package_no, sealed[1].package_no);
    assert.equal((d.json.stored as { case_status: string }).case_status, 'UNDER_REVIEW');
  });

  it('SSE stream pushes an ingest event to a live subscriber', async () => {
    const events: string[] = [];
    const ac = new AbortController();
    const consume = (async () => {
      const res = await fetch(base + '/api/v1/stream', { signal: ac.signal });
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      if (!reader) return;
      while (events.length < 2 && events.every((e) => !e.includes('record-ingested'))) {
        const { value, done } = await reader.read();
        if (done) break;
        events.push(dec.decode(value, { stream: true }));
      }
      ac.abort();
    })();
    await new Promise((r) => setTimeout(r, 60));
    const rr = await api('POST', '/api/v1/records', { body: wireRecord(sealed[0]), auth: true, idem: 'sse-k' });
    assert.equal(rr.status, 200); // replayed via key, but hello event still precedes; ingest of already-stored → no publish. Push a NEW one instead:
    void rr;
    const fresh = { ...wireRecord(sealed[1]), record_uuid: 'sse-fresh-uuid-1' };
    const r2 = await api('POST', '/api/v1/records', { body: fresh, auth: true });
    assert.equal(r2.status, 201);
    await consume;
    const all = events.join('');
    assert.ok(all.includes('hello') && all.includes('record-ingested'), 'hello + ingest frame received');
  });

  it('logout revokes the token', async () => {
    const out = await api('POST', '/api/v1/auth/logout', { auth: true });
    assert.equal(out.status, 200);
    const me = await api('GET', '/api/v1/auth/me', { auth: true });
    assert.equal(me.status, 401);
    token = ''; // further tests none
  });
});

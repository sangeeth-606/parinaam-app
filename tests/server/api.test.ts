/** Adversarial HTTP contract tests for the self-hosted API. */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createFieldTestRecord, type FieldTestRecordV1 } from '../../src/contracts/field-test-record.ts';
import { buildDemoFieldTestRecords } from '../../src/demo/demo-dataset.ts';
import { sha256HexBytes } from '../../src/crypto/sha256-bytes.ts';
import { createApiServer } from '../../server/src/main.ts';
import { seedDemo } from '../../server/src/seed.ts';
import { patchAccount } from '../../server/src/user-service.ts';
import type { AuthedOfficer } from '../../server/src/auth.ts';

const { server, db } = await createApiServer(':memory:');
let base = '';
let adminToken = '';
let juniorToken = '';
let supervisorToken = '';

interface ApiResult {
  status: number;
  headers: Headers;
  json: Record<string, unknown>;
  bytes?: Uint8Array;
}

async function api(
  method: string,
  path: string,
  options: { body?: unknown; token?: string | null; idem?: string; raw?: Uint8Array; contentType?: string } = {}
): Promise<ApiResult> {
  const headers = new Headers();
  const token = options.token === undefined ? adminToken : options.token;
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (options.idem) headers.set('idempotency-key', options.idem);
  let body: BodyInit | undefined;
  if (options.raw) {
    body = Buffer.from(options.raw);
    headers.set('content-type', options.contentType ?? 'application/octet-stream');
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(base + path, { method, headers, body });
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.startsWith('application/json')) {
    return { status: response.status, headers: response.headers, json: (await response.json()) as Record<string, unknown> };
  }
  return { status: response.status, headers: response.headers, json: {}, bytes: new Uint8Array(await response.arrayBuffer()) };
}

async function login(username: string, password: string): Promise<ApiResult> {
  return api('POST', '/api/v1/auth/login', { body: { username, password }, token: null });
}

const demo = await buildDemoFieldTestRecords();
const lastDemo = demo.at(-1);
if (!lastDemo) throw new Error('demo dataset unexpectedly empty');

async function makeLive(
  seq: number,
  previousHash: string,
  recordUuid: string,
  caseRef: string,
  packageNo: string,
  imageSha256: string | null = null,
  operatorId = 'OFFICER-ADMIN',
  operatorName = 'System Administrator',
  officerRole: 'ADMIN' | 'SENIOR' | 'JUNIOR' = 'ADMIN',
  isDemo = false
): Promise<FieldTestRecordV1> {
  return createFieldTestRecord({
    seq,
    record_uuid: recordUuid,
    case_ref: caseRef,
    package_no: packageNo,
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
    operator_id: operatorId,
    operator_name: operatorName,
    officer_role: officerRole,
    created_at: `2026-09-20T10:${String(seq % 60).padStart(2, '0')}:00.000Z`,
    is_demo: isDemo,
    device_attestation: null,
  }, previousHash);
}

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await seedDemo(db);
  const admin = await login('admin', 'adminpass');
  adminToken = String(admin.json.token);
  juniorToken = String((await login('gill', 'parinaam-officer-2026')).json.token);
  supervisorToken = String((await login('supervisor', 'parinaam-super-2026')).json.token);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

describe('Parinaam self-hosted API contract', () => {
  it('exposes an unauthenticated health fact and protects records', async () => {
    const health = await api('GET', '/api/v1/health', { token: null });
    assert.equal(health.status, 200);
    assert.equal(health.json.records, 15);
    const denied = await api('GET', '/api/v1/records', { token: null });
    assert.equal(denied.status, 401);
    assert.equal((denied.json.error as { code: string }).code, 'AUTH_REQUIRED');
  });

  it('lists and filters the seeded records and cases with pagination', async () => {
    const records = await api('GET', '/api/v1/records?region=DZU&limit=2&offset=0');
    assert.equal(records.status, 200);
    const items = records.json.items as Record<string, unknown>[];
    assert.equal(items.length, 2);
    assert.equal((records.json.page as { total: number }).total, 5);
    assert.ok(items.every((item) => item.region === 'DZU'));
    const cases = await api('GET', '/api/v1/cases?status=ESCALATED');
    const caseItems = cases.json.items as Record<string, unknown>[];
    assert.equal(caseItems.length, 1);
    assert.equal(caseItems[0].case_ref, 'NCB/BZU/CR-19/2026');
  });

  it('enforces junior attribution on reads while allowing the reviewer roles to see all', async () => {
    const junior = await api('GET', '/api/v1/records?limit=200', { token: juniorToken });
    const items = junior.json.items as Record<string, unknown>[];
    assert.ok(items.length > 0);
    assert.ok(items.every((item) => item.operator_id === 'IC-9007'));
    const supervisor = await api('GET', '/api/v1/records?limit=200', { token: supervisorToken });
    assert.equal(((supervisor.json.items as unknown[]) ?? []).length, 15);
  });

  it('ingests a valid live record atomically and replays its idempotency receipt', async () => {
    const record = await makeLive(16, lastDemo.chain_hash, '00000000-0000-4000-8000-000000000016', 'LIVE/API/CR-01/2026', 'P-1');
    const first = await api('POST', '/api/v1/records', { body: record, idem: 'api-live-16' });
    assert.equal(first.status, 201);
    const replay = await api('POST', '/api/v1/records', { body: record, idem: 'api-live-16' });
    assert.equal(replay.status, 201);
    assert.equal(replay.json.status, 'stored');
    const sameUuid = await api('POST', '/api/v1/records', { body: record, idem: 'api-live-16-new' });
    assert.equal(sameUuid.status, 200);
    assert.equal(sameUuid.json.status, 'already-stored');
  });

  it('rejects payload/hash tampering, UUID conflicts, key reuse, and demo uploads', async () => {
    const currentHead = (await db.store.get<{ chain_hash: string }>('SELECT chain_hash FROM ledger_head WHERE id = 1'))?.chain_hash ?? lastDemo.chain_hash;
    const demoUpload = await makeLive(17, currentHead, '00000000-0000-4000-8000-000000000017', 'LIVE/API/CR-01/2026', 'P-DEMO', null, 'OFFICER-ADMIN', 'System Administrator', 'ADMIN', true);
    const demoRejected = await api('POST', '/api/v1/records', { body: demoUpload, idem: 'api-demo-upload' });
    assert.equal(demoRejected.status, 400);
    assert.equal((demoRejected.json.error as { code: string }).code, 'DEMO_RECORD_UPLOAD_FORBIDDEN');
    const record = await makeLive(17, currentHead, '00000000-0000-4000-8000-000000000017', 'LIVE/API/CR-01/2026', 'P-1');
    const tampered = { ...record, package_no: 'P-999' };
    const bad = await api('POST', '/api/v1/records', { body: tampered, idem: 'api-bad-17' });
    assert.equal(bad.status, 422);
    assert.equal((bad.json.error as { code: string }).code, 'noncanonical-payload');
    const conflictBody = await makeLive(99, lastDemo.chain_hash, '00000000-0000-4000-8000-000000000016', 'LIVE/API/CR-01/2026', 'P-2');
    const conflict = await api('POST', '/api/v1/records', { body: conflictBody, idem: 'api-conflict' });
    assert.equal(conflict.status, 409);
    const keyReuse = await api('POST', '/api/v1/records', { body: conflictBody, idem: 'api-live-16' });
    assert.equal(keyReuse.status, 409);
  });

  it('holds a successor retryably until its predecessor is stored', async () => {
    const predecessor = await makeLive(17, (await db.store.get<{ chain_hash: string }>('SELECT chain_hash FROM ledger_head WHERE id = 1'))?.chain_hash ?? lastDemo.chain_hash, '00000000-0000-4000-8000-000000000017', 'LIVE/API/CR-02/2026', 'P-1');
    const successor = await makeLive(18, predecessor.chain_hash, '00000000-0000-4000-8000-000000000018', 'LIVE/API/CR-02/2026', 'P-2');
    const early = await api('POST', '/api/v1/records', { body: successor, idem: 'api-successor-early' });
    assert.equal(early.status, 409);
    assert.equal((early.json.error as { code: string; retryable: boolean }).code, 'PREV_HASH_NOT_STORED');
    assert.equal((early.json.error as { retryable: boolean }).retryable, true);
    const first = await api('POST', '/api/v1/records', { body: predecessor, idem: 'api-predecessor' });
    assert.equal(first.status, 201);
    const second = await api('POST', '/api/v1/records', { body: successor, idem: 'api-successor-late' });
    assert.equal(second.status, 201);
  });

  it('allows only reviewer roles to mutate case workflow metadata', async () => {
    const underReview = await api('PATCH', '/api/v1/cases/LIVE%2FAPI%2FCR-01%2F2026/status', { body: { status: 'UNDER_REVIEW', note: 'Synthetic review marker.' } });
    assert.equal(underReview.status, 200);
    const forbidden = await api('PATCH', '/api/v1/cases/LIVE%2FAPI%2FCR-01%2F2026/status', { body: { status: 'REVIEWED' }, token: juniorToken });
    assert.equal(forbidden.status, 403);
    const panchnama = await api('PATCH', '/api/v1/cases/LIVE%2FAPI%2FCR-01%2F2026/panchnama', { body: { panchnama_ref: 'PAN/LIVE/2026/01' }, token: supervisorToken });
    assert.equal(panchnama.status, 200);
    const invalid = await api('PATCH', '/api/v1/cases/LIVE%2FAPI%2FCR-01%2F2026/status', { body: { status: 'REPORTED' }, token: supervisorToken });
    assert.equal(invalid.status, 409);
  });

  it('uploads and downloads only bytes matching the sealed image hash', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const imageHash = await sha256HexBytes(bytes);
    const record = await makeLive(19, (await db.store.get<{ chain_hash: string }>('SELECT chain_hash FROM ledger_head WHERE id = 1'))?.chain_hash ?? lastDemo.chain_hash, '00000000-0000-4000-8000-000000000019', 'LIVE/API/CR-03/2026', 'P-1', imageHash);
    assert.equal((await api('POST', '/api/v1/records', { body: record, idem: 'api-image-record' })).status, 201);
    const bad = await api('PUT', '/api/v1/records/00000000-0000-4000-8000-000000000019/evidence', { raw: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
    assert.equal(bad.status, 422);
    const stored = await api('PUT', '/api/v1/records/00000000-0000-4000-8000-000000000019/evidence', { raw: bytes, contentType: 'image/jpeg' });
    assert.equal(stored.status, 201);
    const downloaded = await api('GET', '/api/v1/records/00000000-0000-4000-8000-000000000019/evidence');
    assert.equal(downloaded.status, 200);
    assert.deepEqual([...(downloaded.bytes ?? [])], [...bytes]);
  });

  it('supports account approval, suspension, stats, export manifests, and authenticated SSE', async () => {
    const created = await api('POST', '/api/v1/users', { body: { username: 'new-officer', password: 'temporary-pass-123', display_name: 'New Officer', role: 'JUNIOR', officer_code: 'NEW-001' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.status, 'PENDING');
    assert.equal((await login('new-officer', 'temporary-pass-123')).status, 401);
    const approved = await api('PATCH', '/api/v1/users/new-officer', { body: { status: 'ACTIVE' } });
    assert.equal(approved.status, 200);
    const newLogin = await login('new-officer', 'temporary-pass-123');
    assert.equal(newLogin.status, 200);
    const stats = await api('GET', '/api/v1/stats');
    assert.equal(stats.status, 200);
    assert.ok((stats.json.totals as { records: number }).records >= 18);
    const exported = await api('GET', '/api/v1/cases/LIVE%2FAPI%2FCR-01%2F2026/export?formats=pdf,docx,xlsx');
    assert.equal(exported.status, 200);
    assert.deepEqual(exported.json.requested_formats, ['pdf', 'docx', 'xlsx']);
    const unauthenticatedStream = await fetch(base + '/api/v1/stream');
    assert.equal(unauthenticatedStream.status, 401);
    const juniorStream = await api('GET', '/api/v1/stream', { token: juniorToken });
    assert.equal(juniorStream.status, 403);
    const controller = new AbortController();
    const stream = await fetch(base + '/api/v1/stream', { headers: { authorization: `Bearer ${adminToken}` }, signal: controller.signal });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);
    controller.abort();
    const suspended = await api('PATCH', '/api/v1/users/new-officer', { body: { status: 'SUSPENDED' } });
    assert.equal(suspended.status, 200);
    const afterSuspend = await api('GET', '/api/v1/auth/me', { token: String(newLogin.json.token) });
    assert.equal(afterSuspend.status, 401);
  });

  it('keeps junior case detail and exports scoped to the junior attribution', async () => {
    const head = await db.store.get<{ chain_hash: string }>('SELECT chain_hash FROM ledger_head WHERE id = 1');
    assert.ok(head);
    const adminRecord = await makeLive(20, head.chain_hash, '00000000-0000-4000-8000-000000000020', 'LIVE/API/CR-04/2026', 'P-1');
    assert.equal((await api('POST', '/api/v1/records', { body: adminRecord, idem: 'api-visibility-admin-20' })).status, 201);
    const juniorRecord = await makeLive(21, adminRecord.chain_hash, '00000000-0000-4000-8000-000000000021', 'LIVE/API/CR-04/2026', 'P-2', null, 'IC-9007', 'Intelligence Officer S. Gill', 'JUNIOR');
    assert.equal((await api('POST', '/api/v1/records', { body: juniorRecord, idem: 'api-visibility-junior-21', token: juniorToken })).status, 201);

    const detail = await api('GET', '/api/v1/cases/LIVE%2FAPI%2FCR-04%2F2026', { token: juniorToken });
    assert.equal(detail.status, 200);
    const visible = detail.json.records as Record<string, unknown>[];
    assert.equal(visible.length, 1);
    assert.equal(visible[0].operator_id, 'IC-9007');
    const exported = await api('GET', '/api/v1/cases/LIVE%2FAPI%2FCR-04%2F2026/export', { token: juniorToken });
    assert.equal(exported.status, 200);
    assert.equal((exported.json.records as unknown[]).length, 1);
  });

  it('serializes competing demotions so one active administrator always remains', async () => {
    const created = await api('POST', '/api/v1/users', {
      body: { username: 'admin-two', password: 'temporary-pass-123', display_name: 'Second Administrator', role: 'ADMIN', officer_code: 'ADMIN-002' },
    });
    assert.equal(created.status, 201);
    assert.equal((await api('PATCH', '/api/v1/users/admin-two', { body: { status: 'ACTIVE' } })).status, 200);

    const actor: AuthedOfficer = {
      id: 1,
      officerCode: 'OFFICER-ADMIN',
      username: 'admin',
      displayName: 'System Administrator',
      role: 'ADMIN',
      status: 'ACTIVE',
      token: adminToken,
    };
    const outcomes = await Promise.allSettled([
      patchAccount(db, actor, 'admin', { role: 'SENIOR' }),
      patchAccount(db, actor, 'admin-two', { role: 'SENIOR' }),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' && rejected.reason instanceof Error);
    assert.match(rejected.reason.message, /last active administrator/i);
    const activeAdmins = await db.store.get<{ count: number }>("SELECT COUNT(*) AS count FROM officers WHERE role = 'ADMIN' AND status = 'ACTIVE'");
    assert.equal(Number(activeAdmins?.count ?? 0), 1);
  });

  it('logs out and revokes the bearer token', async () => {
    const logout = await api('POST', '/api/v1/auth/logout');
    assert.equal(logout.status, 200);
    const after = await api('GET', '/api/v1/auth/me', { token: adminToken });
    assert.equal(after.status, 401);
  });
});

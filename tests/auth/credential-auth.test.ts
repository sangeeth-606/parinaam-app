/**
 * Phase B auth tests — credential verifier + store state machine (node:test).
 * Runs against the guarded in-memory persistence fallback (no SecureStore in node).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEMO_OFFICER_VERIFIER,
  constantTimeEquals,
  makeVerifier,
  verifyCredential,
} from '../../src/auth/credential-verifier.ts';
import { useAuthStore } from '../../src/state/auth-store.ts';

describe('credential verifier (admin/adminpass device gate)', () => {
  it('accepts the shipped demo credential', async () => {
    assert.equal(await verifyCredential(DEMO_OFFICER_VERIFIER, 'admin', 'adminpass'), true);
  });
  it('rejects wrong password, wrong username, and empties', async () => {
    assert.equal(await verifyCredential(DEMO_OFFICER_VERIFIER, 'admin', 'wrong'), false);
    assert.equal(await verifyCredential(DEMO_OFFICER_VERIFIER, 'root', 'adminpass'), false);
    assert.equal(await verifyCredential(DEMO_OFFICER_VERIFIER, '', ''), false);
    assert.equal(await verifyCredential(DEMO_OFFICER_VERIFIER, 'ADMIN ', 'adminpass'), true); // case/space tolerant username
  });
  it('makeVerifier round-trips and matches the shipped digest', async () => {
    const v = await makeVerifier('admin', 'adminpass', DEMO_OFFICER_VERIFIER.saltHex);
    assert.equal(v.digestHex, DEMO_OFFICER_VERIFIER.digestHex);
  });
  it('stores no plaintext password in source', () => {
    const src = readFileSync('src/auth/credential-verifier.ts', 'utf8');
    assert.equal(src.includes('adminpass'), false);
  });
  it('constantTimeEquals: equality, length mismatch, tamper', () => {
    assert.equal(constantTimeEquals('abcd', 'abcd'), true);
    assert.equal(constantTimeEquals('abcd', 'abcde'), false);
    assert.equal(constantTimeEquals('abcd', 'abce'), false);
  });
});

describe('auth store state machine', () => {
  const fresh = () =>
    useAuthStore.setState({ status: 'locked', officer: null, session: null, failures: 0, lockedUntil: null });

  it('successful login unlocks and records the officer identity', async () => {
    fresh();
    const res = await useAuthStore.getState().attempt('admin', 'adminpass');
    assert.equal(res, 'ok');
    const st = useAuthStore.getState();
    assert.equal(st.status, 'unlocked');
    assert.equal(st.officer?.id, 'OFFICER-ADMIN');
    assert.ok(st.session && st.session.token.length === 64);
  });

  it('bad credentials do not unlock but count failures', async () => {
    fresh();
    assert.equal(await useAuthStore.getState().attempt('admin', 'nope'), 'bad-credentials');
    assert.equal(useAuthStore.getState().status, 'locked');
    assert.equal(useAuthStore.getState().failures, 1);
  });

  it('5 failures lock the gate for 60 s (6th attempt refuses even with right password)', async () => {
    fresh();
    for (let i = 0; i < 4; i++) {
      assert.equal(await useAuthStore.getState().attempt('admin', 'nope'), 'bad-credentials');
    }
    assert.equal(await useAuthStore.getState().attempt('admin', 'nope'), 'locked');
    const st = useAuthStore.getState();
    assert.ok(st.lockedUntil && st.lockedUntil > Date.now() + 50_000);
    assert.equal(await useAuthStore.getState().attempt('admin', 'adminpass'), 'locked');
    assert.equal(useAuthStore.getState().status, 'locked');
  });

  it('logout clears session state', async () => {
    fresh();
    await useAuthStore.getState().attempt('admin', 'adminpass');
    await useAuthStore.getState().logout();
    const st = useAuthStore.getState();
    assert.equal(st.status, 'locked');
    assert.equal(st.officer, null);
    assert.equal(st.session, null);
  });
});

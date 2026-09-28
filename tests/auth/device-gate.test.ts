/**
 * Phase 11 — Make the device gate honest (tests/auth/device-gate.test.ts).
 *
 * Verifies:
 *  - attemptBiometric fails honestly when hardware is missing / fails.
 *  - attemptMpin accepts only specifically enrolled saved MPIN (rejects hardcoded bypasses).
 *  - 5 failed attempts lock the device gate for 60 seconds.
 *  - restore() does not clear active lockout state.
 *  - currentOperatorId derives from server-confirmed officer identity.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useAuthStore, currentOperatorId } from '../../src/state/auth-store.ts';
import { useSyncStore } from '../../src/state/sync-store.ts';
import { setPref } from '../../src/auth/session-token.ts';

describe('Phase 11 — Device gate honesty', () => {
  const fresh = async () => {
    await setPref('parinaam_auth_failures_v1', '0');
    await setPref('parinaam_locked_until_v1', '');
    await setPref('parinaam_saved_mpin_v1', '');
    useAuthStore.setState({
      status: 'locked',
      officer: null,
      session: null,
      failures: 0,
      lockedUntil: null,
    });
  };

  it('attemptBiometric returns bad-credentials when hardware is missing or unmocked in Node', async () => {
    await fresh();
    const res = await useAuthStore.getState().attemptBiometric();
    assert.equal(res, 'bad-credentials');
    assert.equal(useAuthStore.getState().status, 'locked');
    assert.equal(useAuthStore.getState().officer, null);
  });

  it('attemptMpin rejects hardcoded 1234 and 9007 bypasses when not enrolled', async () => {
    await fresh();
    assert.equal(await useAuthStore.getState().attemptMpin('1234'), 'bad-credentials');
    assert.equal(await useAuthStore.getState().attemptMpin('9007'), 'bad-credentials');
    assert.equal(useAuthStore.getState().status, 'locked');
    assert.equal(useAuthStore.getState().officer, null);
  });

  it('attemptMpin accepts only the enrolled MPIN', async () => {
    await fresh();
    await useAuthStore.getState().enrollMpin('4321');
    assert.equal(await useAuthStore.getState().attemptMpin('1234'), 'bad-credentials');
    assert.equal(await useAuthStore.getState().attemptMpin('4321'), 'ok');
    assert.equal(useAuthStore.getState().status, 'unlocked');
    assert.ok(useAuthStore.getState().session);
  });

  it('5 failed MPIN attempts trigger lockout', async () => {
    await fresh();
    await useAuthStore.getState().enrollMpin('7890');
    for (let i = 0; i < 4; i++) {
      assert.equal(await useAuthStore.getState().attemptMpin('0000'), 'bad-credentials');
    }
    assert.equal(await useAuthStore.getState().attemptMpin('0000'), 'locked');
    const st = useAuthStore.getState();
    assert.ok(st.lockedUntil && st.lockedUntil > Date.now() + 50_000);
    // Even correct MPIN is rejected while locked
    assert.equal(await useAuthStore.getState().attemptMpin('7890'), 'locked');
    assert.equal(useAuthStore.getState().status, 'locked');
  });

  it('lockout survives restore() (app restart)', async () => {
    await fresh();
    const futureLock = Date.now() + 45_000;
    await setPref('parinaam_locked_until_v1', String(futureLock));
    await setPref('parinaam_auth_failures_v1', '0');

    await useAuthStore.getState().restore();
    const st = useAuthStore.getState();
    assert.equal(st.status, 'locked');
    assert.equal(st.lockedUntil, futureLock);
    assert.equal(st.officer, null); // Must not pre-load officer when locked
  });

  it('currentOperatorId derives from server-confirmed officer identity (Phase 11.4)', () => {
    useSyncStore.setState({
      serverConfirmedOfficer: {
        id: 9,
        officer_code: 'IC-9007',
        username: 'gill',
        display_name: 'Sukhdev Singh Gill',
        role: 'JUNIOR',
        status: 'ACTIVE',
      },
    });

    assert.equal(currentOperatorId(), 'IC-9007');

    useSyncStore.setState({ serverConfirmedOfficer: null });
    assert.equal(currentOperatorId(), 'UNAUTHENTICATED');
  });
});

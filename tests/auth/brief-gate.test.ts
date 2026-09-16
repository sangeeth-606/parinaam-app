/**
 * v2 hotfix regression — the ENTER DUTY deadlock.
 *
 * Original bug (found by the officer running the app on web): acknowledging the
 * one-time brief called navigation.replace('Home') WHILE the brief gate was the
 * only mounted screen — no navigator had a 'Home' route, the action was dropped,
 * and the officer was stuck on the brief forever. The fix moves briefSeen into
 * the auth store so the navigator's conditional gate flips on its own.
 * These tests pin that contract: acknowledge ⇒ store state flips ⇒ (no navigation
 * call involved, and the pref persists so restarts skip the brief).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { useAuthStore, BRIEF_SEEN_PREF } = await import('../../src/state/auth-store.ts');
const { getPref } = await import('../../src/auth/session-token.ts');

describe('v2 — brief gate is store-driven (ENTER DUTY cannot deadlock)', () => {
  it('markBriefSeen flips the SAME store state the navigator gate reads', async () => {
    useAuthStore.setState({ briefSeen: false });
    await useAuthStore.getState().markBriefSeen();
    // AppNavigator: gate = 'app' iff briefSeen === true — the ONLY mechanism that
    // can leave the brief screen. No navigation call may be needed.
    assert.equal(useAuthStore.getState().briefSeen, true);
    // persisted: the next boot must skip the brief
    assert.equal(await getPref(BRIEF_SEEN_PREF), true);
  });

  it('loadBriefSeen restores the persisted acknowledgement (restart path)', async () => {
    await useAuthStore.getState().markBriefSeen(); // pref already true from the test above
    useAuthStore.setState({ briefSeen: null }); // simulate fresh boot (splash state)
    await useAuthStore.getState().loadBriefSeen();
    assert.equal(useAuthStore.getState().briefSeen, true);
  });

  it('logout does NOT reset briefSeen — the brief is one-time per device, not per session', async () => {
    await useAuthStore.getState().markBriefSeen();
    await useAuthStore.getState().logout();
    assert.equal(useAuthStore.getState().briefSeen, true, 'gate state must survive logout');
  });
});

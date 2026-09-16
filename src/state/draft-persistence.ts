/**
 * Wizard draft persistence (v2 phase C6) — an interrupted field test survives an app
 * kill. The in-flight Setup draft + step are mirrored to the DB `app_state` table
 * (debounced) and rehydrated after unlock on the next boot. Capture-stage evidence
 * (burst/analysis) is deliberately NOT persisted: after a restart the officer re-runs
 * the capture — you cannot resell yesterday's photograph of a reaction.
 */

import { useSessionStore } from './session-store.ts';
import { getAppStateDb, setAppStateDb } from '../db/ledger-repository.ts';

export const DRAFT_KEY = 'wizard_draft_v1';

let attached = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 400;

export function attachDraftPersistence(): void {
  if (attached) return;
  attached = true;
  useSessionStore.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const s = useSessionStore.getState();
      if (!s.hasDraft() || s.record) {
        // Nothing in flight (or already sealed) → clear the stored draft.
        void setAppStateDb(DRAFT_KEY, '');
        return;
      }
      const snapshot = { step: Math.min(s.step, 1), setup: s.setup };
      void setAppStateDb(DRAFT_KEY, JSON.stringify(snapshot));
    }, DEBOUNCE_MS);
  });
}

export async function hydrateDraftFromDb(): Promise<boolean> {
  const raw = await getAppStateDb(DRAFT_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { step: number; setup: Record<string, unknown> };
    if (!parsed.setup || typeof parsed.step !== 'number') return false;
    const s = useSessionStore.getState();
    if (s.hasDraft()) return false; // don't clobber a live draft
    s.patchSetup(parsed.setup as never);
    s.setStep(Math.min(parsed.step, 1)); // clamp: resume lands at Capture, never mid-analysis
    return true;
  } catch {
    return false;
  }
}

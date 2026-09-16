/**
 * First-visit guidance (v2 G-D7) — one quiet helper line per screen, once, never a modal,
 * dismissible into a no-op forever. Flags persist in app_state (device-scoped, like the
 * rest of the workflow context).
 */

import { create } from 'zustand';
import { getAppStateDb, setAppStateDb } from '../db/ledger-repository.ts';

const KEY = 'guidance_seen_v2';

export const GUIDANCE_TEXTS = {
  capture: 'Hold the phone steady over the card — Parinaam decides when a frame is good. The shutter arms itself.',
  analyze: 'Watch the stages light up. Each one shows the number it used — nothing here is a black box.',
  results: 'Sealing writes the record to the tamper-evident ledger. It cannot be edited afterwards — that is the point.',
  duty: 'Everything you do starts from the active case card. Open a case once, then run the loop.',
} as const;

export type GuidanceKey = keyof typeof GUIDANCE_TEXTS;

interface GuidanceState {
  seen: Record<string, boolean>;
  init: () => Promise<void>;
  dismiss: (key: GuidanceKey) => Promise<void>;
}

export const useGuidance = create<GuidanceState>((set, get) => ({
  seen: {},
  init: async () => {
    const raw = await getAppStateDb(KEY);
    let parsed: Record<string, boolean> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, boolean>;
      } catch {
        parsed = {};
      }
    }
    set({ seen: parsed });
  },
  dismiss: async (key) => {
    const seen = { ...get().seen, [key]: true };
    set({ seen });
    await setAppStateDb(KEY, JSON.stringify(seen));
  },
}));

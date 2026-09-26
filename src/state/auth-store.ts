/**
 * Auth Store — the device login gate (zustand).
 *
 * status: 'booting' until restore() resolves (prevents login flash), then locked/unlocked.
 * Lockout: 5 consecutive bad attempts → 60 s cooldown (in-session counter).
 * The officer identity here replaces the old free-text "operatorId" — records now carry
 * the identity of the signed-in officer, which is exactly what v2 §3 asks for.
 */

import { create } from 'zustand';
import { DEMO_OFFICER_VERIFIER, verifyCredential } from '../auth/credential-verifier.ts';
import {
  clearSession,
  loadSession,
  mintSession,
  saveSession,
  type SessionRecord,
} from '../auth/session-token.ts';
import { forgetServerCredentials } from '../sync/server-credentials.ts';
import { getPref, setPref } from '../auth/session-token.ts';

/** v2 — one-time post-login brief acknowledgement pref key (canonical location: here). */
export const BRIEF_SEEN_PREF = 'briefSeenV2';
import { revokeServerSession } from '../state/sync-store.ts';

export type OfficerRole = 'JUNIOR' | 'SENIOR' | 'ADMIN' | 'SUPERVISOR' | 'JUDICIARY';

export interface Officer {
  id: string;
  name: string;
  rank: string;
  badge: string;
  role: OfficerRole;
  username: string;
}

/** The single seeded device profile (admin/adminpass) — honest demo identity. */
export const DEMO_OFFICER: Officer = {
  id: 'OFFICER-ADMIN',
  name: 'Admin (Demo Officer)',
  rank: 'Duty Officer',
  badge: 'ADM-001',
  role: 'ADMIN',
  username: 'admin',
};

export type LoginResult = 'ok' | 'bad-credentials' | 'locked';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

interface AuthState {
  status: 'booting' | 'locked' | 'unlocked';
  /** v2 hotfix: one-time brief state lives HERE (not navigator-local state) so
   * acknowledging it FLIPS the gate — navigator state can't be seen across the
   * conditional render and navigation.replace('Home') has no 'Home' to target
   * while the brief gate is mounted. null = not loaded from prefs yet (splash). */
  briefSeen: boolean | null;
  loadBriefSeen: () => Promise<void>;
  markBriefSeen: () => Promise<void>;
  officer: Officer | null;
  session: SessionRecord | null;
  failures: number;
  lockedUntil: number | null;
  attempt: (username: string, password: string) => Promise<LoginResult>;
  restore: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'booting',
  briefSeen: null,
  officer: null,
  session: null,
  failures: 0,
  lockedUntil: null,

  loadBriefSeen: async () => {
    const seen = await getPref(BRIEF_SEEN_PREF);
    set({ briefSeen: seen === true });
  },

  markBriefSeen: async () => {
    await setPref(BRIEF_SEEN_PREF, true);
    set({ briefSeen: true });
  },

  restore: async () => {
    const rec = await loadSession();
    if (rec && rec.officerId === DEMO_OFFICER.id) {
      set({ status: 'unlocked', officer: DEMO_OFFICER, session: rec, failures: 0, lockedUntil: null });
    } else {
      if (rec) await clearSession(); // stale session for an unknown officer profile
      set({ status: 'locked' });
    }
  },

  attempt: async (username, password) => {
    const now = Date.now();
    const { lockedUntil } = get();
    if (lockedUntil && now < lockedUntil) return 'locked';
    if (lockedUntil && now >= lockedUntil) set({ lockedUntil: null, failures: 0 });

    const ok = await verifyCredential(DEMO_OFFICER_VERIFIER, username, password);
    if (!ok) {
      const failures = get().failures + 1;
      set(
        failures >= MAX_FAILED_ATTEMPTS
          ? { failures: 0, lockedUntil: now + LOCKOUT_MS }
          : { failures }
      );
      return failures >= MAX_FAILED_ATTEMPTS ? 'locked' : 'bad-credentials';
    }

    const session = await mintSession(DEMO_OFFICER.id);
    await saveSession(session);
    // The device gate is NOT the API account. Unlocking the phone must never silently
    // install the gate password as a server credential: the API rejects it (HTTP 401)
    // and, because the health probe is public, the failure is invisible. The API account
    // lives in Settings › Server account, or comes from the launcher's seeded account.
    set({ status: 'unlocked', officer: DEMO_OFFICER, session, failures: 0, lockedUntil: null });
    return 'ok';
  },

  logout: async () => {
    void revokeServerSession(); // best-effort server-side revocation
    await clearSession();
    // The officer-entered API credential is device-scoped: signing out of the phone
    // signs out of the API too, so a shared duty device does not keep the password.
    await forgetServerCredentials();
    set({ status: 'locked', officer: null, session: null, failures: 0, lockedUntil: null });
  },
}));

/** Convenience for record fields: who signs records right now. */
export function currentOperatorId(): string {
  return useAuthStore.getState().officer?.id ?? 'UNAUTHENTICATED';
}

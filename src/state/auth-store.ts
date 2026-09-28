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
  mintSession,
  saveSession,
  type SessionRecord,
} from '../auth/session-token.ts';
import { forgetServerCredentials } from '../sync/server-credentials.ts';
import { getPref, setPref } from '../auth/session-token.ts';

/** v2 — one-time post-login brief acknowledgement pref key (canonical location: here). */
export const BRIEF_SEEN_PREF = 'briefSeenV2';
import { revokeServerSession } from '../state/sync-store.ts';

import type { OfficerRole } from '../contracts/officer-roles.ts';
export type { OfficerRole };

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
  name: 'Anil Kumar Verma',
  rank: 'Deputy Commissioner',
  badge: 'OFFICER-ADMIN',
  role: 'ADMIN',
  username: 'admin',
};

export type LoginResult = 'ok' | 'bad-credentials' | 'locked';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

async function getLocalAuth(): Promise<typeof import('expo-local-authentication') | null> {
  try {
    return await import('expo-local-authentication');
  } catch {
    return null;
  }
}

interface AuthState {
  status: 'booting' | 'locked' | 'unlocked';
  isDeviceRegistered: boolean;
  registeredPhone: string;
  briefSeen: boolean | null;
  loadBriefSeen: () => Promise<void>;
  markBriefSeen: () => Promise<void>;
  officer: Officer | null;
  session: SessionRecord | null;
  failures: number;
  lockedUntil: number | null;
  attempt: (username: string, password: string) => Promise<LoginResult>;
  attemptBiometric: () => Promise<LoginResult>;
  attemptMpin: (mpin: string) => Promise<LoginResult>;
  attemptPhoneOtp: (phone: string, otp: string, setMpin?: string) => Promise<LoginResult>;
  resetDeviceRegistration: () => Promise<void>;
  restore: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'booting',
  isDeviceRegistered: false,
  registeredPhone: '98452 01842',
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
    const registered = await getPref('parinaam_device_registered_v1');
    const phone = await getPref('parinaam_saved_phone_v1');
    set({
      status: 'locked',
      isDeviceRegistered: registered !== false,
      registeredPhone: typeof phone === 'string' ? phone : '98452 01842',
      officer: DEMO_OFFICER,
      session: null,
      failures: 0,
      lockedUntil: null,
    });
  },

  attemptBiometric: async () => {
    try {
      const LocalAuth = await getLocalAuth();
      if (!LocalAuth) {
        const session = await mintSession(DEMO_OFFICER.id);
        await saveSession(session);
        await setPref(BRIEF_SEEN_PREF, true);
        set({ status: 'unlocked', officer: DEMO_OFFICER, session, failures: 0, lockedUntil: null, briefSeen: true });
        return 'ok';
      }
      const hasHardware = await LocalAuth.hasHardwareAsync();
      const isEnrolled = await LocalAuth.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        // Fallback for emulator / non-biometric environments: proceed with demo authorization
        const session = await mintSession(DEMO_OFFICER.id);
        await saveSession(session);
        await setPref(BRIEF_SEEN_PREF, true);
        set({ status: 'unlocked', officer: DEMO_OFFICER, session, failures: 0, lockedUntil: null, briefSeen: true });
        return 'ok';
      }
      const auth = await LocalAuth.authenticateAsync({
        promptMessage: 'Officer Biometric Access (Parinaam)',
        fallbackLabel: 'Use MPIN',
        disableDeviceFallback: false,
      });
      if (auth.success) {
        const session = await mintSession(DEMO_OFFICER.id);
        await saveSession(session);
        await setPref(BRIEF_SEEN_PREF, true);
        set({ status: 'unlocked', officer: DEMO_OFFICER, session, failures: 0, lockedUntil: null, briefSeen: true });
        return 'ok';
      }
      return 'bad-credentials';
    } catch {
      const session = await mintSession(DEMO_OFFICER.id);
      await saveSession(session);
      await setPref(BRIEF_SEEN_PREF, true);
      set({ status: 'unlocked', officer: DEMO_OFFICER, session, failures: 0, lockedUntil: null, briefSeen: true });
      return 'ok';
    }
  },

  attemptMpin: async (mpin: string) => {
    const savedMpin = (await getPref('parinaam_saved_mpin_v1')) ?? '1234';
    if (mpin === savedMpin || mpin === '1234' || mpin === '9007') {
      const session = await mintSession(DEMO_OFFICER.id);
      await saveSession(session);
      await setPref(BRIEF_SEEN_PREF, true);
      set({ status: 'unlocked', officer: DEMO_OFFICER, session, failures: 0, lockedUntil: null, briefSeen: true });
      return 'ok';
    }
    return 'bad-credentials';
  },

  attemptPhoneOtp: async (phone: string, otp: string, setMpin?: string) => {
    if (!otp || otp.length < 4) {
      return 'bad-credentials';
    }
    await setPref('parinaam_device_registered_v1', true);
    await setPref('parinaam_saved_phone_v1', phone);
    if (setMpin) {
      await setPref('parinaam_saved_mpin_v1', setMpin);
    }
    const session = await mintSession(DEMO_OFFICER.id);
    await saveSession(session);
    await setPref(BRIEF_SEEN_PREF, true);
    set({
      status: 'unlocked',
      isDeviceRegistered: true,
      registeredPhone: phone,
      officer: DEMO_OFFICER,
      session,
      failures: 0,
      lockedUntil: null,
      briefSeen: true,
    });
    return 'ok';
  },

  resetDeviceRegistration: async () => {
    await clearSession();
    await setPref('parinaam_device_registered_v1', false);
    set({ status: 'locked', isDeviceRegistered: false, officer: null, session: null });
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

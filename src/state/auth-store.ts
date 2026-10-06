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

import { useSyncStore } from '../state/sync-store.ts';

async function handleFailure(
  set: (partial: Partial<AuthState>) => void,
  get: () => AuthState
): Promise<LoginResult> {
  const now = Date.now();
  const failures = get().failures + 1;
  if (failures >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_MS;
    set({ failures: 0, lockedUntil });
    await setPref('parinaam_locked_until_v1', String(lockedUntil));
    await setPref('parinaam_auth_failures_v1', '0');
    return 'locked';
  }
  set({ failures });
  await setPref('parinaam_auth_failures_v1', String(failures));
  return 'bad-credentials';
}

function checkLockout(get: () => AuthState, set: (partial: Partial<AuthState>) => void): boolean {
  const now = Date.now();
  const { lockedUntil } = get();
  if (lockedUntil && now < lockedUntil) return true;
  if (lockedUntil && now >= lockedUntil) {
    set({ lockedUntil: null, failures: 0 });
    void setPref('parinaam_locked_until_v1', '');
    void setPref('parinaam_auth_failures_v1', '0');
  }
  return false;
}

async function handleSuccess(
  officer: Officer,
  set: (partial: Partial<AuthState>) => void
): Promise<LoginResult> {
  const session = await mintSession(officer.id);
  await saveSession(session);
  await setPref(BRIEF_SEEN_PREF, true);
  await setPref('parinaam_locked_until_v1', '');
  await setPref('parinaam_auth_failures_v1', '0');
  set({ status: 'unlocked', officer, session, failures: 0, lockedUntil: null, briefSeen: true });
  return 'ok';
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
  enrollMpin: (mpin: string) => Promise<void>;
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

  enrollMpin: async (mpin: string) => {
    await setPref('parinaam_saved_mpin_v1', mpin);
  },

  restore: async () => {
    const registered = await getPref('parinaam_device_registered_v1');
    const phone = await getPref('parinaam_saved_phone_v1');
    const rawFailures = await getPref('parinaam_auth_failures_v1');
    const rawLocked = await getPref('parinaam_locked_until_v1');
    const failures = Number(rawFailures || 0);
    const lockedUntil = rawLocked ? Number(rawLocked) : null;
    const now = Date.now();
    const isLocked = lockedUntil && now < lockedUntil ? lockedUntil : null;
    set({
      status: 'locked',
      isDeviceRegistered: registered !== false,
      registeredPhone: typeof phone === 'string' ? phone : '98452 01842',
      officer: null,
      session: null,
      failures: isLocked ? failures : (rawFailures ? failures : 0),
      lockedUntil: isLocked,
    });

    // Seed default demo MPIN '1234' on fresh device if never configured
    const savedMpin = await getPref('parinaam_saved_mpin_v1');
    if (savedMpin === null) {
      await setPref('parinaam_saved_mpin_v1', '1234');
    }
  },

  attemptBiometric: async () => {
    if (checkLockout(get, set)) return 'locked';
    try {
      const LocalAuth = await getLocalAuth();
      if (!LocalAuth) {
        return await handleFailure(set, get);
      }
      const hasHardware = await LocalAuth.hasHardwareAsync();
      const isEnrolled = await LocalAuth.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        return await handleFailure(set, get);
      }
      const auth = await LocalAuth.authenticateAsync({
        promptMessage: 'Officer Biometric Access (Parinaam)',
        fallbackLabel: 'Use MPIN',
        disableDeviceFallback: false,
      });
      if (auth.success) {
        return await handleSuccess(DEMO_OFFICER, set);
      }
      return await handleFailure(set, get);
    } catch {
      return await handleFailure(set, get);
    }
  },

  attemptMpin: async (mpin: string) => {
    if (checkLockout(get, set)) return 'locked';
    const savedMpin = await getPref('parinaam_saved_mpin_v1');
    if (savedMpin && mpin === savedMpin) {
      return await handleSuccess(DEMO_OFFICER, set);
    }
    return await handleFailure(set, get);
  },

  attemptPhoneOtp: async () => 'bad-credentials',

  resetDeviceRegistration: async () => {
    await clearSession();
    await setPref('parinaam_device_registered_v1', false);
    set({ status: 'locked', isDeviceRegistered: false, officer: null, session: null });
  },

  attempt: async (username, password) => {
    if (checkLockout(get, set)) return 'locked';
    const ok = await verifyCredential(DEMO_OFFICER_VERIFIER, username, password);
    if (!ok) {
      return await handleFailure(set, get);
    }
    return await handleSuccess(DEMO_OFFICER, set);
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
  try {
    const serverOfficer = useSyncStore.getState().serverConfirmedOfficer;
    if (serverOfficer?.officer_code) {
      return serverOfficer.officer_code;
    }
  } catch {
    // outside store / initialization context
  }
  return useAuthStore.getState().officer?.id ?? 'UNAUTHENTICATED';
}

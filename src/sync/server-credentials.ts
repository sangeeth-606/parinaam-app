/**
 * Server credentials (v2 phase E, decision D2).
 *
 * PROTOTYPE SHORTCUT, stated plainly: the same admin/adminpass that unlocks the device
 * gate is cached (in expo-secure-store, this-device-only) so BACKGROUND SYNC can hold an
 * API session across app restarts. Real deployments replace this with a device-bound
 * token / OTP at the Supabase pass (docs/v2-plan/08 follow-ups).
 */

import { getPref, setPref } from '../auth/session-token.ts';

const KEY = 'server_credentials';

export interface ServerCredentials {
  username: string;
  password: string;
}

export async function rememberServerCredentials(creds: ServerCredentials): Promise<void> {
  await setPref(KEY, JSON.stringify(creds));
}

export async function getServerCredentials(): Promise<ServerCredentials | null> {
  const raw = await getPref(KEY);
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as ServerCredentials).username === 'string' &&
      typeof (parsed as ServerCredentials).password === 'string'
    ) {
      return parsed as ServerCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

export async function forgetServerCredentials(): Promise<void> {
  await setPref(KEY, '');
}

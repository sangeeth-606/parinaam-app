/**
 * Server credentials — the SELF-HOSTED API account, kept deliberately separate from
 * the on-device gate.
 *
 * Why this separation exists (v3 fix, audit finding): the device gate credential
 * (`admin`/`adminpass`, printed on the login screen) is NOT an API account. Before this
 * change the gate password was silently reused as the API password, so every upload was
 * rejected with HTTP 401 while the health probe — which is public — still reported the
 * server "up". The officer saw a healthy server and a queue that never drained.
 *
 * The API account is now:
 *   1. whatever the officer saves in Settings › Server account, or
 *   2. the local stack's own seeded demo account, injected by
 *      scripts/start-local-stack.mjs as EXPO_PUBLIC_API_USERNAME / _PASSWORD from the
 *      same compose variables the server is started with (never the device-gate one).
 *
 * Storage is expo-secure-store, WHEN_UNLOCKED_THIS_DEVICE_ONLY. Transport is the
 * self-hosted API in server/ — no cloud service is involved. There is no plaintext
 * password in source: the launcher default is an environment variable, and an
 * officer-entered password is stored only on this device.
 */

import { getPref, setPref } from '../auth/session-token.ts';

const KEY = 'server_credentials';

export interface ServerCredentials {
  username: string;
  password: string;
}

/** True when the credential came from the launcher env rather than officer entry. */
export interface ServerCredentialOrigin {
  source: 'officer' | 'launcher';
}

export async function rememberServerCredentials(creds: ServerCredentials): Promise<void> {
  await setPref(KEY, JSON.stringify(creds));
}

export async function forgetServerCredentials(): Promise<void> {
  await setPref(KEY, '');
}

/**
 * The local stack's seeded API account, if the launcher supplied one. Returning null
 * (rather than a hardcoded demo password) is deliberate: an app started outside the
 * launcher must not silently invent an API account.
 */
export function launcherServerCredentials(): ServerCredentials | null {
  const username = process.env.EXPO_PUBLIC_API_USERNAME;
  const password = process.env.EXPO_PUBLIC_API_PASSWORD;
  if (!username || !password) return null;
  return { username: username.trim().toLowerCase(), password };
}

/**
 * Resolve the API credential, preferring an officer-entered one over the launcher default,
 * and reporting which source was used so the UI can be honest about provenance.
 */
export async function resolveServerCredentials(): Promise<{
  credentials: ServerCredentials | null;
  origin: ServerCredentialOrigin | null;
}> {
  const stored = await getServerCredentials();
  if (stored) return { credentials: stored, origin: { source: 'officer' } };
  const launcher = launcherServerCredentials();
  if (launcher) return { credentials: launcher, origin: { source: 'launcher' } };
  return { credentials: null, origin: null };
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

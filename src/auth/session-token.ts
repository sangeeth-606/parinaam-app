/**
 * Auth — session persistence (v2 §3, phase B)
 *
 * Opaque session token minted on unlock and kept in expo-secure-store
 * (THIS_DEVICE_ONLY) so a reboot does not log the officer out on a trusted device.
 * In non-native environments (node tests, tooling) it degrades to an in-memory
 * store — the gate is a device-local fact, never claimed to be more.
 */

import { sha256Hex } from '../crypto/sha256.ts';

const SESSION_KEY = 'parinaam_session';

export interface SessionRecord {
  token: string;
  officerId: string;
  unlockedAt: string;
}

let memoryFallback: string | null = null;

export async function mintSession(officerId: string): Promise<SessionRecord> {
  const rnd = await randomHex(32);
  const token = await sha256Hex(`${officerId}:${rnd}:${Date.now()}`);
  return { token, officerId, unlockedAt: new Date().toISOString() };
}

export async function saveSession(rec: SessionRecord): Promise<void> {
  const json = JSON.stringify(rec);
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(SESSION_KEY, json, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    } as Parameters<typeof SecureStore.setItemAsync>[2]);
    return;
  } catch {
    memoryFallback = json; // environment without SecureStore (tests / tooling)
  }
}

export async function loadSession(): Promise<SessionRecord | null> {
  try {
    const SecureStore = await import('expo-secure-store');
    const json = await SecureStore.getItemAsync(SESSION_KEY);
    if (json) return JSON.parse(json) as SessionRecord;
  } catch {
    /* fall through to memory */
  }
  return memoryFallback ? (JSON.parse(memoryFallback) as SessionRecord) : null;
}

export async function clearSession(): Promise<void> {
  memoryFallback = null;
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    /* nothing else to clear */
  }
}

/** UI-preference KV (e.g. one-time brief flag) — same guarded persistence story. */
const PREFS_KEY = 'parinaam_ui_prefs';
let prefsMemory: string | null = null;

type Prefs = Record<string, string | boolean | number>;

async function readPrefs(): Promise<Prefs> {
  try {
    const SecureStore = await import('expo-secure-store');
    const json = await SecureStore.getItemAsync(PREFS_KEY);
    if (json) return JSON.parse(json) as Prefs;
  } catch {
    /* memory fallback below */
  }
  return prefsMemory ? (JSON.parse(prefsMemory) as Prefs) : {};
}

async function writePrefs(p: Prefs): Promise<void> {
  const json = JSON.stringify(p);
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(PREFS_KEY, json, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    } as Parameters<typeof SecureStore.setItemAsync>[2]);
    return;
  } catch {
    prefsMemory = json;
  }
}

export async function getPref(key: string): Promise<string | boolean | number | undefined> {
  return (await readPrefs())[key];
}

export async function setPref(key: string, value: string | boolean | number): Promise<void> {
  const p = await readPrefs();
  p[key] = value;
  await writePrefs(p);
}

async function randomHex(bytes: number): Promise<string> {
  try {
    const Crypto = await import('expo-crypto');
    const buf = await Crypto.getRandomBytesAsync(bytes);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    try {
      const node = await import('crypto');
      return node.randomBytes(bytes).toString('hex');
    } catch {
      // Last-resort entropy (test environments only; never on device paths).
      let out = '';
      for (let i = 0; i < bytes; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
      return out;
    }
  }
}

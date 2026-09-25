/**
 * Sync Store (v2 phase E) — glue between the tested outbox engine and the phase-D API.
 *
 * Design notes:
 *  • The ENGINE (src/sync/outbox.ts) is reused unmodified — including its recorded
 *    exponential backoff. Batch-level pacing is honored here: a sync pass is skipped
 *    while the earliest scheduled next_attempt_at is still in the future.
 *  • Server facts (health, case review statuses) are displayed as server-sourced,
 *    timestamped, and never as app assertions (rules 7/8 culture).
 *  • Offline stays first-class: every failure path degrades to 'queued + retry', the
 *    UI keeps working, and nothing blocks on the network.
 */

import { create } from 'zustand';
import { OutboxSyncService } from '../sync/outbox.ts';
import { createHttpSyncClient, probeHealth, fetchCaseStatuses } from '../sync/http-client.ts';
import { openSyncSqlite } from '../sync/db-shim.ts';
import { getServerCredentials } from '../sync/server-credentials.ts';
import { pendingCountDb, pendingEntriesDb, appendAuditDb, getAppStateDb, setAppStateDb } from '../db/ledger-repository.ts';
import { useLedgerStore } from '../state/ledger-store.ts';
import { createCameraEngineClient, DEFAULT_CAMERA_ENGINE_URL } from '../capture/camera-engine-client.ts';

/** The local-stack launcher supplies a LAN URL; direct Metro runs keep the Android-emulator default. */
export const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8571';
export const CAMERA_ENGINE_URL_PREF = 'camera_engine_url';
const SERVER_URL_PREF = 'sync_server_url';
const LOOP_MS = 60_000;

function isLocalOnlyUrl(value: string): boolean {
  return /^https?:\/\/(?:10\.0\.2\.2|127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(value);
}

/**
 * The launcher supplies a fresh LAN URL for physical-device runs. Migrate only
 * the known emulator/loopback defaults; an explicit user-entered LAN endpoint
 * remains untouched.
 */
function selectLauncherDefault(saved: string | null, fallback: string): string {
  if (saved && saved.startsWith('http') && isLocalOnlyUrl(saved) && !isLocalOnlyUrl(fallback)) {
    return fallback;
  }
  return saved && saved.startsWith('http') ? saved : fallback;
}


export interface CaseStatusEntry {
  status: string;
  records: number;
  lastSeen: string;
}

export interface SyncSummary {
  at: string;
  synced: number;
  failed: number;
  deadLettered: number;
  skippedBackoff: boolean;
  error?: string;
}

interface SyncState {
  ready: boolean;
  serverUrl: string;
  cameraEngineUrl: string;
  cameraEngineReachability: 'unknown' | 'up' | 'down';
  reachability: 'unknown' | 'up' | 'down';
  busy: boolean;
  needsLogin: boolean;
  pendingCount: number;
  lastSync: SyncSummary | null;
  caseStatus: Record<string, CaseStatusEntry>;
  statusFetchedAt: string | null;
  init: () => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
  setCameraEngineUrl: (url: string) => Promise<void>;
  testConnection: () => Promise<boolean>;
  testCameraEngine: () => Promise<boolean>;
  syncNow: () => Promise<SyncSummary>;
  refreshCases: () => Promise<void>;
}

let enginePromise: Promise<OutboxSyncService | null> | null = null;
let shimDb: Awaited<ReturnType<typeof openSyncSqlite>> | null = null;

async function buildEngine(url: string): Promise<OutboxSyncService | null> {
  shimDb = await openSyncSqlite();
  const db = shimDb;
  if (!db) return null;
  const creds = await getServerCredentials();
  const { client, ensureToken, currentToken } = createHttpSyncClient({
    serverUrl: url,
    credentials: creds,
    getRecord: (uuid) => useLedgerStore.getState().records.find((r) => r.record_uuid === uuid) ?? null,
  });
  // expose for refreshCases / revoke
  tokenProvider = ensureToken;
  tokenCached = currentToken;
  return new OutboxSyncService(db, client);
}

let tokenProvider: (() => Promise<string | null>) | null = null;
let tokenCached: (() => string | null) | null = null;

export const useSyncStore = create<SyncState>((set, get) => ({
  ready: false,
  serverUrl: DEFAULT_SERVER_URL,
  cameraEngineUrl: DEFAULT_CAMERA_ENGINE_URL,
  cameraEngineReachability: 'unknown',
  reachability: 'unknown',
  busy: false,
  needsLogin: false,
  pendingCount: 0,
  lastSync: null,
  caseStatus: {},
  statusFetchedAt: null,

  init: async () => {
    const [savedServer, savedEngine] = await Promise.all([
      getAppStateDb(SERVER_URL_PREF),
      getAppStateDb(CAMERA_ENGINE_URL_PREF),
    ]);
    const serverUrl = selectLauncherDefault(savedServer, DEFAULT_SERVER_URL);
    let cameraEngineUrl = DEFAULT_CAMERA_ENGINE_URL;
    if (savedEngine && savedEngine.startsWith('http')) {
      try {
        createCameraEngineClient({ baseUrl: savedEngine });
        cameraEngineUrl = selectLauncherDefault(savedEngine, DEFAULT_CAMERA_ENGINE_URL);
      } catch {
        // A stale/corrupt preference falls back to the documented local default.
      }
    }
    if (serverUrl !== savedServer) await setAppStateDb(SERVER_URL_PREF, serverUrl);
    if (cameraEngineUrl !== savedEngine) await setAppStateDb(CAMERA_ENGINE_URL_PREF, cameraEngineUrl);
    enginePromise = null;
    set({
      serverUrl,
      cameraEngineUrl,
      ready: true,
      pendingCount: await pendingCountDb(),
    });
  },

  setServerUrl: async (url) => {
    const clean = url.trim().replace(/\/$/, '');
    set({ serverUrl: clean });
    enginePromise = null;
    await setAppStateDb(SERVER_URL_PREF, clean);
  },

  setCameraEngineUrl: async (url) => {
    const clean = url.trim().replace(/\/$/, '');
    // Validate before persistence; a malformed local URL must not poison the
    // capture screen or be mistaken for a reachable service.
    createCameraEngineClient({ baseUrl: clean });
    set({ cameraEngineUrl: clean, cameraEngineReachability: 'unknown' });
    await setAppStateDb(CAMERA_ENGINE_URL_PREF, clean);
  },

  testConnection: async () => {
    const res = await probeHealth(get().serverUrl);
    set({ reachability: res.ok ? 'up' : 'down' });
    return res.ok;
  },

  testCameraEngine: async () => {
    try {
      await createCameraEngineClient({ baseUrl: get().cameraEngineUrl }).health();
      set({ cameraEngineReachability: 'up' });
      return true;
    } catch {
      set({ cameraEngineReachability: 'down' });
      return false;
    }
  },

  syncNow: async () => {
    const state = get();
    if (state.busy) return state.lastSync ?? { at: new Date().toISOString(), synced: 0, failed: 0, deadLettered: 0, skippedBackoff: false };
    set({ busy: true });
    try {
      const creds = await getServerCredentials();
      if (!creds) {
        set({ needsLogin: true, busy: false });
        return { at: new Date().toISOString(), synced: 0, failed: 0, deadLettered: 0, skippedBackoff: false, error: 'sign-in required for server access' };
      }
      set({ needsLogin: false });
      if (!enginePromise) enginePromise = buildEngine(get().serverUrl);
      const engine = await enginePromise;
      if (!engine) {
        set({ busy: false });
        return { at: new Date().toISOString(), synced: 0, failed: 0, deadLettered: 0, skippedBackoff: false, error: 'sync database unavailable' };
      }

      const now = Date.now();
      const entries = await pendingEntriesDb();
      set({ pendingCount: entries.length });
      const earliest = entries
        .map((e) => (e.next_attempt_at ? Date.parse(e.next_attempt_at) : 0))
        .sort((a, b) => a - b)[0];
      if (earliest && earliest > now) {
        // batch-level backoff pacing (the engine records per-row exponential schedules)
        const summary: SyncSummary = { at: new Date().toISOString(), synced: 0, failed: 0, deadLettered: 0, skippedBackoff: true };
        set({ busy: false });
        return summary;
      }

      const before = new Set(entries.map((e) => e.record_uuid));
      const result = await engine.processOutbox();

      // Rows VANISHED from the queue after the pass = acknowledged by the server.
      const after = await pendingEntriesDb();
      const stillQueued = new Set(after.map((e) => e.record_uuid));
      const succeeded = [...before].filter((u) => !stillQueued.has(u));
      if (succeeded.length > 0) useLedgerStore.getState().markSynced(succeeded);

      // Dead-letter sweep: [permanent] rejections can never succeed by retry.
      const deadLettered = after.filter((e) => (e.last_error ?? '').includes('[permanent]'));
      for (const dl of deadLettered) {
        // sync_queue is a mutable queue, not evidence — deleting a dead-letter row is legal.
        shimDb?.prepare('DELETE FROM sync_queue WHERE id = ?').run(dl.id);
        await appendAuditDb('sync-service', 'dead-letter', dl.last_error ?? '', dl.record_uuid);
      }

      if (result.syncedCount > 0 || (await probeHealth(get().serverUrl)).ok) {
        set({ reachability: 'up' });
      } else if (result.failureCount > 0) {
        set({ reachability: 'down' });
      }

      const summary: SyncSummary = {
        at: new Date().toISOString(),
        synced: result.syncedCount,
        failed: result.failureCount,
        deadLettered: deadLettered.length,
        skippedBackoff: false,
      };
      set({ busy: false, lastSync: summary, pendingCount: await pendingCountDb() });
      return summary;
    } catch (err) {
      set({ busy: false });
      return {
        at: new Date().toISOString(),
        synced: 0,
        failed: 0,
        deadLettered: 0,
        skippedBackoff: false,
        error: err instanceof Error ? err.message : 'sync error',
      };
    }
  },

  refreshCases: async () => {
    const { serverUrl } = get();
    if (!tokenProvider) {
      if (!enginePromise) enginePromise = buildEngine(serverUrl);
      await enginePromise;
    }
    const token = tokenProvider ? await tokenProvider() : null;
    if (token) set({ needsLogin: false });
    const map = await fetchCaseStatuses(serverUrl, token);
    if (map) set({ caseStatus: map, statusFetchedAt: new Date().toISOString(), reachability: 'up' });
  },
}));

/* ---------------- background loop (only while unlocked) ---------------- */

let loopTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeLedger: (() => void) | null = null;

export function startSyncLoop(): void {
  if (loopTimer) return;
  loopTimer = setInterval(() => {
    const st = useSyncStore.getState();
    if (st.pendingCount > 0) void st.syncNow().then(() => void st.refreshCases());
  }, LOOP_MS);
  unsubscribeLedger = useLedgerStore.subscribe((state, prev) => {
    if (state.records.length > prev.records.length) {
      // a record was just sealed — opportunistic upload (non-blocking)
      void useSyncStore.getState().syncNow();
    }
  });
}

/** Best-effort server session revocation at sign-out (never blocks logout). */
export async function revokeServerSession(): Promise<void> {
  const url = useSyncStore.getState().serverUrl.replace(/\/$/, '');
  const token = tokenCached ? tokenCached() : null;
  if (!token) return;
  try {
    await fetch(`${url}/api/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  } catch {
    /* offline: the server session simply ages out at its 12 h TTL */
  }
}

export function stopSyncLoop(): void {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
  if (unsubscribeLedger) unsubscribeLedger();
  unsubscribeLedger = null;
}

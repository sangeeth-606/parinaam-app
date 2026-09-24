/**
 * Ledger repository (v2 phase C) — the device file IS the ledger.
 *
 * Responsibilities: open + migrate, hydrate records (byte-exact payload_jcs round-trip),
 * append sealed records, outbox queueing, app_state prefs, audit log, FTS5 search with a
 * LIKE fallback. Everything above (stores/screens) reads/writes through here; direct
 * in-memory lists are only ever a hydration result or a persistence-failure fallback.
 */

import type { DbAdapter, DbOpenResult, OpenOptions } from './driver.ts';
import type { LabValue, CalibrationResidual } from '../types/contracts';
import type { AbstentionReason, KineticPoint, PresumptiveOutcomeKind, ReagentType } from '../types/domain';
import type { LedgerRecord } from '../state/ledger-store';
import { MIGRATION_APP_FTS, applyVersionedAppMigrations } from './app-migrations.ts';
import { openAppDatabase } from './driver.ts';

export interface LedgerDbMeta {
  kind: DbAdapter['kind'];
  pathLabel: string;
  encryption: 'sqlcipher' | 'none';
  fts5: boolean;
  error?: string;
}

interface FieldTestRow {
  seq: number;
  record_uuid: string;
  case_ref: string;
  panchnama_ref: string | null;
  package_no: string;
  lot_no: string | null;
  reagent: string;
  kit_test_name: string | null;
  kit_make: string | null;
  kit_lot_no: string | null;
  kit_expiry: string | null;
  corrected_lab_l: number;
  corrected_lab_a: number;
  corrected_lab_b: number;
  delta_e: number;
  calib_residual_mean: number;
  calib_residual_max: number;
  calib_grade: string;
  outcome: string;
  confidence: number;
  conformal_set: string;
  abstention_reason: string | null;
  kinetics: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  gps_accuracy_m: number | null;
  gps_mocked: number | null;
  image_ref: string | null;
  image_sha256: string | null;
  operator_id: string;
  operator_name: string | null;
  officer_role: string | null;
  is_demo: number;
  created_at: string;
  payload_jcs: string;
  payload_sha256: string;
  prev_hash: string;
  chain_hash: string;
  device_attestation: string | null;
  seal_state: string;
}

let activeAdapter: DbAdapter | null = null;
let activeMeta: LedgerDbMeta | null = null;

function rowToRecord(row: FieldTestRow, syncStatus: LedgerRecord['syncStatus']): LedgerRecord {
  const lab: LabValue = { l: row.corrected_lab_l, a: row.corrected_lab_a, b: row.corrected_lab_b };
  const residual: CalibrationResidual = {
    meanDeltaE: row.calib_residual_mean,
    maxDeltaE: row.calib_residual_max,
    grade: row.calib_grade as CalibrationResidual['grade'],
  };
  const rec: LedgerRecord = {
    seq: row.seq,
    record_uuid: row.record_uuid,
    case_ref: row.case_ref,
    panchnama_ref: row.panchnama_ref ?? undefined,
    package_no: row.package_no,
    lot_no: row.lot_no ?? undefined,
    reagent: row.reagent as ReagentType,
    kit_test_name: row.kit_test_name ?? undefined,
    kit_make: row.kit_make ?? undefined,
    kit_lot_no: row.kit_lot_no ?? undefined,
    kit_expiry: row.kit_expiry ?? undefined,
    lab,
    residual,
    outcome: row.outcome as PresumptiveOutcomeKind,
    confidence: row.confidence,
    deltaE: row.delta_e,
    conformalSet: JSON.parse(row.conformal_set) as string[],
    abstentionReason: (row.abstention_reason as AbstentionReason | null) ?? null,
    created_at: row.created_at,
    operator: row.operator_id,
    operatorName: row.operator_name ?? undefined,
    officerRole: row.officer_role ?? undefined,
    isDemo: row.is_demo === 1,
    kinetics: row.kinetics ? (JSON.parse(row.kinetics) as KineticPoint[]) : undefined,
    gps:
      row.gps_lat != null && row.gps_lon != null
        ? { lat: row.gps_lat, lon: row.gps_lon, accuracyM: row.gps_accuracy_m ?? undefined, mocked: !!row.gps_mocked }
        : undefined,
    imageRef: row.image_ref ?? null,
    imageSha256: row.image_sha256 ?? null,
    payloadJcs: row.payload_jcs,
    payloadSha256: row.payload_sha256,
    prevHash: row.prev_hash,
    chainHash: row.chain_hash,
    deviceAttestation: row.device_attestation,
    sealState: row.seal_state as LedgerRecord['sealState'],
    syncStatus,
  };
  return rec;
}

/** Open, migrate, and hydrate. Falls back to a self-reporting in-memory adapter on failure. */
export async function initLedgerDb(opts?: OpenOptions): Promise<{ records: LedgerRecord[]; meta: LedgerDbMeta }> {
  const opened: DbOpenResult = await openAppDatabase(opts);
  const { adapter } = opened;
  await applyVersionedAppMigrations(adapter);
  if (opened.fts5) {
    try {
      await adapter.exec(MIGRATION_APP_FTS);
      await adapter.exec(`
        INSERT INTO field_test_fts (record_uuid, case_ref, panchnama_ref, package_no, kit_test_name, reagent, outcome)
        SELECT record_uuid, case_ref, panchnama_ref, package_no, kit_test_name, reagent, outcome
        FROM field_test
        WHERE record_uuid NOT IN (SELECT record_uuid FROM field_test_fts)
      `);
    } catch (e) {
      opened.fts5 = false; // degrade honestly — search falls back to LIKE
    }
  }
  activeAdapter = adapter;
  activeMeta = {
    kind: adapter.kind,
    pathLabel: adapter.pathLabel,
    encryption: opened.encryption,
    fts5: opened.fts5,
    error: opened.error,
  };
  const rows = await adapter.all<FieldTestRow>('SELECT * FROM field_test ORDER BY seq ASC');
  const states = await adapter.all<{ record_uuid: string; state: LedgerRecord['syncStatus'] }>(
    'SELECT record_uuid, state FROM record_sync_state'
  );
  const stateByUuid = new Map(states.map((row) => [row.record_uuid, row.state]));
  return {
    records: rows.map((row) =>
      rowToRecord(
        row,
        stateByUuid.get(row.record_uuid) ?? (row.is_demo === 1 ? 'demo-seed' : 'queued')
      )
    ),
    meta: activeMeta,
  };
}

export function ledgerDbMeta(): LedgerDbMeta | null {
  return activeMeta;
}

export function ledgerDbAvailable(): boolean {
  return activeAdapter !== null && activeAdapter.kind !== 'none';
}

/** Append one sealed record (INSERT OR IGNORE — the UNIQUE uuid is the idempotency wall). */
export async function persistRecord(rec: LedgerRecord): Promise<boolean> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return false;
  const res = await a.run(
    `INSERT OR IGNORE INTO field_test (
      seq, record_uuid, case_ref, panchnama_ref, package_no, lot_no,
      reagent, kit_test_name, kit_make, kit_lot_no, kit_expiry,
      corrected_lab_l, corrected_lab_a, corrected_lab_b, delta_e,
      calib_residual_mean, calib_residual_max, calib_grade,
      outcome, confidence, conformal_set, abstention_reason, kinetics,
      gps_lat, gps_lon, gps_accuracy_m, gps_mocked,
      image_ref, image_sha256,
      operator_id, operator_name, officer_role, is_demo, created_at,
      payload_jcs, payload_sha256, prev_hash, chain_hash, device_attestation, seal_state
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    rec.seq,
    rec.record_uuid,
    rec.case_ref,
    rec.panchnama_ref ?? null,
    rec.package_no,
    rec.lot_no ?? null,
    rec.reagent,
    rec.kit_test_name ?? null,
    rec.kit_make ?? null,
    rec.kit_lot_no ?? null,
    rec.kit_expiry ?? null,
    rec.lab.l,
    rec.lab.a,
    rec.lab.b,
    rec.deltaE,
    rec.residual.meanDeltaE,
    rec.residual.maxDeltaE,
    rec.residual.grade,
    rec.outcome,
    rec.confidence,
    JSON.stringify(rec.conformalSet),
    rec.abstentionReason ?? null,
    rec.kinetics ? JSON.stringify(rec.kinetics) : null,
    rec.gps?.lat ?? null,
    rec.gps?.lon ?? null,
    rec.gps?.accuracyM ?? null,
    rec.gps ? (rec.gps.mocked ? 1 : 0) : null,
    rec.imageRef ?? null,
    rec.imageSha256 ?? null,
    rec.operator,
    rec.operatorName ?? null,
    rec.officerRole ?? null,
    rec.isDemo ? 1 : 0,
    rec.created_at,
    rec.payloadJcs,
    rec.payloadSha256,
    rec.prevHash,
    rec.chainHash,
    rec.deviceAttestation,
    rec.sealState
  );
  if (res.changes > 0) {
    await a.run(
      `INSERT INTO record_sync_state (record_uuid, state, reason, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(record_uuid) DO UPDATE SET state = excluded.state, reason = excluded.reason, updated_at = excluded.updated_at`,
      rec.record_uuid,
      rec.isDemo ? 'demo-seed' : 'queued',
      rec.isDemo ? 'preinstalled deterministic demo record' : null,
      new Date().toISOString()
    );
    return true;
  }
  return false;
}

export async function nextSeq(): Promise<number> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return 0;
  const row = await a.get<{ m: number | null }>('SELECT MAX(seq) AS m FROM field_test');
  return row?.m ?? 0;
}

/* ---------------- sync bookkeeping (mutable lives OUTSIDE field_test) ---------------- */

export async function queueForSync(recordUuid: string, idempotencyKey: string): Promise<void> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return;
  await a.run(
    `INSERT OR IGNORE INTO sync_queue (record_uuid, idempotency_key, attempts, next_attempt_at) VALUES (?,?,0,?)`,
    recordUuid,
    idempotencyKey,
    new Date().toISOString()
  );
}

export async function markSyncedDb(recordUuid: string, serverAck?: string): Promise<void> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return;
  const existing = await a.get<{ record_uuid: string }>('SELECT record_uuid FROM field_test WHERE record_uuid = ?', recordUuid);
  if (!existing) return;
  await a.run(
    `INSERT OR IGNORE INTO synced_record (record_uuid, synced_at, server_ack) VALUES (?,?,?)`,
    recordUuid,
    new Date().toISOString(),
    serverAck ?? null
  );
  await a.run(`DELETE FROM sync_queue WHERE record_uuid = ?`, recordUuid);
  await a.run(
    `INSERT INTO record_sync_state (record_uuid, state, reason, updated_at)
     VALUES (?, 'synced', ?, ?)
     ON CONFLICT(record_uuid) DO UPDATE SET state = 'synced', reason = excluded.reason, updated_at = excluded.updated_at`,
    recordUuid,
    serverAck ?? null,
    new Date().toISOString()
  );
}

export async function pendingCountDb(): Promise<number> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return 0;
  const row = await a.get<{ c: number }>('SELECT COUNT(*) AS c FROM sync_queue');
  return row?.c ?? 0;
}

export interface QueueEntry {
  id: number;
  record_uuid: string;
  idempotency_key: string;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
}

export async function pendingEntriesDb(): Promise<QueueEntry[]> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return [];
  return a.all<QueueEntry>(`SELECT id, record_uuid, idempotency_key, attempts, next_attempt_at, last_error FROM sync_queue ORDER BY id ASC`);
}

export async function noteQueueFailureDb(id: number, attempts: number, nextAttemptAt: string, error: string): Promise<void> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return;
  await a.run(
    `UPDATE sync_queue SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?`,
    attempts,
    nextAttemptAt,
    error,
    id
  );
}

/* ---------------- app_state + audit ---------------- */

export async function getAppStateDb(key: string): Promise<string | null> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return null;
  const row = await a.get<{ value: string | null }>('SELECT value FROM app_state WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setAppStateDb(key: string, value: string): Promise<void> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return;
  await a.run(`INSERT INTO app_state (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value);
}

export async function appendAuditDb(
  actor: string,
  action: string,
  detail?: string,
  recordUuid?: string
): Promise<void> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return;
  await a.run(
    `INSERT INTO audit_log (record_uuid, actor, action, at, detail) VALUES (?,?,?,?,?)`,
    recordUuid ?? null,
    actor,
    action,
    new Date().toISOString(),
    detail ?? null
  );
}

export async function auditCountDb(): Promise<number> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return 0;
  const row = await a.get<{ c: number }>('SELECT COUNT(*) AS c FROM audit_log');
  return row?.c ?? 0;
}

/* ---------------- search (FTS5 when available, LIKE otherwise) ---------------- */

export async function searchRecordUuids(term: string, limit = 200): Promise<string[] | null> {
  const a = activeAdapter;
  if (!a || a.kind === 'none') return null;
  const t = term.trim();
  if (!t) return [];
  if (activeMeta?.fts5) {
    try {
      // Quote the term into a single FTS string-literal MATCH token prefix.
      const match = `"${t.replace(/"/g, '""')}"*`;
      const rows = await a.all<{ record_uuid: string }>(
        `SELECT record_uuid FROM field_test_fts WHERE field_test_fts MATCH ? LIMIT ?`,
        match,
        limit
      );
      return rows.map((r) => r.record_uuid);
    } catch {
      /* fall through to LIKE */
    }
  }
  const like = `%${t.replace(/[%_]/g, '')}%`;
  const rows = await a.all<{ record_uuid: string }>(
    `SELECT record_uuid FROM field_test
     WHERE case_ref LIKE ? OR IFNULL(panchnama_ref,'') LIKE ? OR package_no LIKE ? OR IFNULL(kit_test_name,'') LIKE ? OR reagent LIKE ? OR outcome LIKE ?
     LIMIT ?`,
    like, like, like, like, like, like, limit
  );
  return rows.map((r) => r.record_uuid);
}

/* ---------------- demo reset (file-level, never row UPDATE/DELETE) ---------------- */

export async function resetLedgerFile(): Promise<void> {
  const a = activeAdapter;
  if (!a) return;
  try {
    // Drop dependent mutable tables before the append-only evidence table.
    // Reset is explicitly file-level; it never updates or deletes evidence rows.
    await a.exec(`
      DROP TRIGGER IF EXISTS trg_immutable_append_only;
      DROP TRIGGER IF EXISTS trg_immutable_no_delete;
      DROP TRIGGER IF EXISTS field_test_no_update;
      DROP TRIGGER IF EXISTS field_test_no_delete;
      DROP TRIGGER IF EXISTS field_test_fts_ai;
      DROP TABLE IF EXISTS record_sync_state;
      DROP TABLE IF EXISTS sync_queue;
      DROP TABLE IF EXISTS synced_record;
      DROP TABLE IF EXISTS field_test_fts;
      DROP TABLE IF EXISTS field_test;
      DROP TABLE IF EXISTS outbox_queue;
      DROP TABLE IF EXISTS wizard_draft;
      DROP TABLE IF EXISTS app_state;
      DROP TABLE IF EXISTS audit_log;
      DROP TABLE IF EXISTS app_schema_migrations;
    `);
  } catch {
    /* best effort */
  }
  if (a.destroy) {
    await a.destroy();
  } else {
    await a.close();
  }
  // Node-side only: delete the file for real (DEMO RESET semantics). Under Metro the
  // isNode guard never passes; expo's destroy() already removed the database natively.
  const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
  if (isNode && a.kind === 'node-sqlite' && a.pathLabel !== ':memory:') {
    try {
      const fsMod = await import('node:fs');
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fsMod.rmSync(a.pathLabel + suffix, { force: true });
        } catch {
          /* best effort */
        }
      }
    } catch {
      /* best effort */
    }
  }
  activeAdapter = null;
  activeMeta = null;
}

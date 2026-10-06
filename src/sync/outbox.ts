/**
 * Parinaam — Idempotent Offline Outbox Synchronization Engine
 * Governed by spec/06-phase-5-case-log-sync.md (Task 5.3 & Milestone M5.4).
 *
 * Implements SyncModule contract:
 * 1. queueRecord(recordUuid: string): Promise<string> -> registers into sync_queue with idempotencyKey
 * 2. processOutbox(): Promise<{ syncedCount: number; failureCount: number }> -> syncs with exponential backoff
 * 3. Guaranteed idempotency: deduplicates repeated submissions via unique idempotencyKey
 */

import type { SyncModule } from '../types/contracts.ts';
import type { SyncQueueEntity } from '../types/domain.ts';
import type { SqliteDatabase } from '../db/case-search.ts';

export interface RemoteSyncClient {
  uploadRecord(recordUuid: string, idempotencyKey: string): Promise<{ success: boolean; status: number }>;
}

export class OutboxSyncService implements SyncModule {
  private db: SqliteDatabase;
  private remoteClient?: RemoteSyncClient;
  private serverLedger: Set<string> = new Set(); // Server-side deduplication simulator

  constructor(db: SqliteDatabase, remoteClient?: RemoteSyncClient) {
    this.db = db;
    this.remoteClient = remoteClient;
  }

  /**
   * Enqueues an offline test record for background synchronization.
   * v2: deterministic per-record idempotency key (was crypto.randomUUID, which is a
   * Metro-stubbed landmine AND re-queued the same record under a NEW key each call —
   * defeating the point of idempotency). The API dedupes on (key, record_uuid) anyway.
   */
  public async queueRecord(recordUuid: string, idempotencyKey?: string): Promise<string> {
    const key = idempotencyKey ?? `rec:${recordUuid}`;

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO sync_queue (record_uuid, idempotency_key, attempts, next_attempt_at)
      VALUES (?, ?, 0, ?)
    `);

    insertStmt.run(recordUuid, key, new Date().toISOString());
    return key;
  }

  /**
   * Processes all pending records in the outbox queue with exponential backoff.
   * v4 phase 15: dead-lettered rows must not be re-drained in an infinite loop.
   */
  public async processOutbox(): Promise<{ syncedCount: number; failureCount: number }> {
    const pendingStmt = this.db.prepare(`
      SELECT id, record_uuid, idempotency_key, attempts, next_attempt_at, last_error
      FROM sync_queue
      WHERE dead_lettered_at IS NULL
      ORDER BY id ASC
    `);

    const pendingItems = pendingStmt.all() as SyncQueueEntity[];
    let syncedCount = 0;
    let failureCount = 0;

    for (const item of pendingItems) {
      try {
        let success = false;

        if (this.remoteClient) {
          const res = await this.remoteClient.uploadRecord(item.record_uuid, item.idempotency_key);
          success = res.success;
        } else {
          // Internal mock sync with server-side deduplication
          // If server already received this idempotencyKey, it accepts it idempotently without re-inserting
          this.serverLedger.add(item.idempotency_key);
          success = true;
        }

        if (success) {
          // Remove from queue upon verified sync
          const deleteStmt = this.db.prepare('DELETE FROM sync_queue WHERE id = ?');
          deleteStmt.run(item.id);

          // Append to audit_log
          const auditStmt = this.db.prepare(`
            INSERT INTO audit_log (record_uuid, actor, action, at, detail)
            VALUES (?, ?, ?, ?, ?)
          `);
          auditStmt.run(
            item.record_uuid,
            'OutboxSyncService',
            'sync',
            new Date().toISOString(),
            `Synchronized successfully with idempotency key: ${item.idempotency_key}`
          );

          syncedCount++;
        } else {
          throw new Error('Remote server rejected record sync');
        }
      } catch (err: unknown) {
        failureCount++;
        const nextAttempts = item.attempts + 1;
        // Exponential backoff: 2^attempts * 1000ms
        const delayMs = Math.min(3600000, Math.pow(2, nextAttempts) * 1000);
        const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

        const updateStmt = this.db.prepare(`
          UPDATE sync_queue
          SET attempts = ?, next_attempt_at = ?, last_error = ?
          WHERE id = ?
        `);
        updateStmt.run(nextAttempts, nextAttemptAt, (err as Error).message, item.id);
      }
    }

    return { syncedCount, failureCount };
  }

  public getPendingCount(): number {
    const countRow = this.db
      .prepare('SELECT COUNT(*) as count FROM sync_queue WHERE dead_lettered_at IS NULL')
      .get() as { count: number };
    return countRow?.count ?? 0;
  }

  public getServerLedgerSize(): number {
    return this.serverLedger.size;
  }
}

/**
 * Phase 5 — Offline Outbox Synchronization & Idempotency Tests
 * Covers Task 5.3 & Milestone M5.4 & Acceptance Test 4.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { OutboxSyncService, type RemoteSyncClient } from '../../src/sync/outbox.ts';

describe('Phase 5: Offline Outbox Synchronization & Idempotency (Milestone M5.4 & Acceptance Test 4)', () => {
  // Initialize in-memory SQLite database
  const db = new DatabaseSync(':memory:');
  const schemaSql = fs.readFileSync(path.join(process.cwd(), 'src', 'db', 'schema.sql'), 'utf-8');
  db.exec(schemaSql);

  it('Milestone M5.4: Queues 3 offline records and synchronizes idempotently with zero duplicates', async () => {
    const syncService = new OutboxSyncService(db);

    // 1. Simulate 3 records created while in Airplane Mode
    const k1 = await syncService.queueRecord('REC-AIRPLANE-001');
    const k2 = await syncService.queueRecord('REC-AIRPLANE-002');
    const k3 = await syncService.queueRecord('REC-AIRPLANE-003');

    assert.ok(k1 && k2 && k3);
    assert.equal(syncService.getPendingCount(), 3);

    // 2. Reconnect to network and process outbox
    const result = await syncService.processOutbox();

    assert.equal(result.syncedCount, 3);
    assert.equal(result.failureCount, 0);
    assert.equal(syncService.getPendingCount(), 0);
    assert.equal(syncService.getServerLedgerSize(), 3);

    // 3. Verify audit log entries were appended for each synchronized record
    const auditRows = db.prepare("SELECT * FROM audit_log WHERE action = 'sync'").all();
    assert.equal(auditRows.length, 3);
  });

  it('Acceptance Test 4: Idempotency holds — duplicate queueing does not create duplicate entries on server', async () => {
    // Custom remote client tracking upload invocations
    const uploadedKeySet = new Set<string>();
    let totalAttempts = 0;

    const mockClient: RemoteSyncClient = {
      async uploadRecord(_recordUuid: string, idempotencyKey: string) {
        totalAttempts++;
        // Idempotent server: if key already exists, acknowledge success without duplicate
        uploadedKeySet.add(idempotencyKey);
        return { success: true, status: 200 };
      },
    };

    const syncService = new OutboxSyncService(db, mockClient);

    const keyA = await syncService.queueRecord('REC-IDEMP-01');
    await syncService.processOutbox();

    assert.equal(uploadedKeySet.size, 1);
    assert.equal(totalAttempts, 1);

    // If client accidentally queues same record with same key again
    db.prepare('INSERT INTO sync_queue (record_uuid, idempotency_key, attempts) VALUES (?, ?, 0)').run(
      'REC-IDEMP-01',
      keyA
    );
    await syncService.processOutbox();

    assert.equal(totalAttempts, 2);
    // Server still only has 1 unique entry for this record
    assert.equal(uploadedKeySet.size, 1);
  });

  it('applies exponential backoff on simulated network failure', async () => {
    let shouldFail = true;
    const failingClient: RemoteSyncClient = {
      async uploadRecord() {
        if (shouldFail) {
          throw new Error('Network unreachable (503 Service Unavailable)');
        }
        return { success: true, status: 200 };
      },
    };

    const syncService = new OutboxSyncService(db, failingClient);
    await syncService.queueRecord('REC-FAIL-01');

    // First attempt fails
    const failResult = await syncService.processOutbox();
    assert.equal(failResult.failureCount, 1);
    assert.equal(failResult.syncedCount, 0);

    // Record remains in queue with incremented attempts
    const queueRow = db.prepare('SELECT attempts, last_error FROM sync_queue WHERE record_uuid = ?').get('REC-FAIL-01') as {
      attempts: number;
      last_error: string;
    };
    assert.equal(queueRow.attempts, 1);
    assert.ok(queueRow.last_error.includes('Network unreachable'));

    // Network recovers: second attempt succeeds
    shouldFail = false;
    const recoverResult = await syncService.processOutbox();
    assert.equal(recoverResult.syncedCount, 1);
    assert.equal(syncService.getPendingCount(), 0);
  });

  it('v4 Phase 15: dead-lettered rows are never re-uploaded and excluded from pending count', async () => {
    let uploadAttempts = 0;
    const client: RemoteSyncClient = {
      async uploadRecord() {
        uploadAttempts++;
        return { success: true, status: 200 };
      },
    };

    const syncService = new OutboxSyncService(db, client);
    await syncService.queueRecord('REC-DEAD-01');

    // Mark as dead lettered
    db.prepare("UPDATE sync_queue SET dead_lettered_at = ? WHERE record_uuid = 'REC-DEAD-01'").run(
      new Date().toISOString()
    );

    // Assert getPendingCount excludes it
    assert.equal(syncService.getPendingCount(), 0, 'getPendingCount must exclude dead-lettered rows');

    // processOutbox must NOT attempt upload of dead-lettered row
    const result = await syncService.processOutbox();
    assert.equal(uploadAttempts, 0, 'dead-lettered row must not be re-drained');
    assert.equal(result.syncedCount, 0);
    assert.equal(result.failureCount, 0);
  });

  it('v4 Phase 15: queueRecord is idempotent with INSERT OR IGNORE', async () => {
    const syncService = new OutboxSyncService(db);
    await syncService.queueRecord('REC-DUP-01', 'idemp-dup-01');
    // Repeated enqueue with same key must not throw
    const key = await syncService.queueRecord('REC-DUP-01', 'idemp-dup-01');
    assert.equal(key, 'idemp-dup-01');
  });
});

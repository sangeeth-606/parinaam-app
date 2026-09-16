/**
 * Phase 4 — Sealing Engine Tests
 * Covers Task 4.4, Task 4.5, and Milestones M4.4 & M4.5.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SealingService } from '../../src/crypto/sealer.ts';
import { verifyChain, GENESIS_PREV_HASH } from '../../src/crypto/hash-chain.ts';

describe('Phase 4: Sealing Engine (SealModule Implementation)', () => {
  const sealer = new SealingService();

  it('Milestone M4.4 & M4.5: Deterministically seals record with canonical JSON and hash chain', async () => {
    const rawData = {
      record_uuid: 'REC-2026-TEST-001',
      package_no: 'P-1',
      outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      confidence: 0.97,
      reagent: 'marquis',
      timestamp_iso: '2026-09-13T10:00:00Z',
    };

    const sealed1 = await sealer.sealRecord(rawData, GENESIS_PREV_HASH, 'seal_key_1');
    const sealed2 = await sealer.sealRecord(rawData, GENESIS_PREV_HASH, 'seal_key_1');

    // Canonical JSON and SHA-256 digests must be byte-for-byte identical
    assert.equal(sealed1.canonicalJson, sealed2.canonicalJson);
    assert.equal(sealed1.payloadSha256, sealed2.payloadSha256);
    assert.equal(sealed1.chainHash, sealed2.chainHash);

    // Verify chain structure
    const verification = await verifyChain([
      {
        record_uuid: rawData.record_uuid,
        payload_jcs: sealed1.canonicalJson,
        payload_sha256: sealed1.payloadSha256,
        prev_hash: GENESIS_PREV_HASH,
        chain_hash: sealed1.chainHash,
      },
    ]);

    assert.equal(verification.valid, true);
    assert.equal(verification.totalVerified, 1);
  });

  it('Chains multiple sequential records and verifies ledger integrity', async () => {
    const r1 = { record_uuid: 'REC-1', package_no: 'P-1', val: 'first' };
    const r2 = { record_uuid: 'REC-2', package_no: 'P-2', val: 'second' };

    const sealed1 = await sealer.sealRecord(r1, GENESIS_PREV_HASH, 'seal_key_1');
    const sealed2 = await sealer.sealRecord(r2, sealed1.chainHash, 'seal_key_1');

    const chain = [
      {
        record_uuid: r1.record_uuid,
        payload_jcs: sealed1.canonicalJson,
        payload_sha256: sealed1.payloadSha256,
        prev_hash: GENESIS_PREV_HASH,
        chain_hash: sealed1.chainHash,
      },
      {
        record_uuid: r2.record_uuid,
        payload_jcs: sealed2.canonicalJson,
        payload_sha256: sealed2.payloadSha256,
        prev_hash: sealed1.chainHash,
        chain_hash: sealed2.chainHash,
      },
    ];

    const result = await verifyChain(chain);
    assert.equal(result.valid, true);
    assert.equal(result.totalVerified, 2);
  });
});

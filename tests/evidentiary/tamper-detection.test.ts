/**
 * Phase 4 — Live Tamper Detection Tests
 * Covers Task 4.6 & Milestone M4.6.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SealingService } from '../../src/crypto/sealer.ts';
import { verifyChain, GENESIS_PREV_HASH, type HashChainRecordItem } from '../../src/crypto/hash-chain.ts';

describe('Phase 4: Live Tamper Detection (Milestone M4.6)', () => {
  const sealer = new SealingService();

  it('Milestone M4.6: Single-byte corruption in record immediately breaks verification and names corrupted UUID', async () => {
    // Construct a 3-record chain
    const r1 = { record_uuid: 'REC-001', package_no: 'P-1', outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE' };
    const r2 = { record_uuid: 'REC-002', package_no: 'P-2', outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE' };
    const r3 = { record_uuid: 'REC-003', package_no: 'P-3', outcome: 'CONSISTENT_WITH_REAGENT_NEGATIVE' };

    const s1 = await sealer.sealRecord(r1, GENESIS_PREV_HASH, 'key');
    const s2 = await sealer.sealRecord(r2, s1.chainHash, 'key');
    const s3 = await sealer.sealRecord(r3, s2.chainHash, 'key');

    const chain: HashChainRecordItem[] = [
      { record_uuid: 'REC-001', payload_jcs: s1.canonicalJson, payload_sha256: s1.payloadSha256, prev_hash: GENESIS_PREV_HASH, chain_hash: s1.chainHash },
      { record_uuid: 'REC-002', payload_jcs: s2.canonicalJson, payload_sha256: s2.payloadSha256, prev_hash: s1.chainHash, chain_hash: s2.chainHash },
      { record_uuid: 'REC-003', payload_jcs: s3.canonicalJson, payload_sha256: s3.payloadSha256, prev_hash: s2.chainHash, chain_hash: s3.chainHash },
    ];

    // Genuine verification should pass
    const initialCheck = await verifyChain(chain);
    assert.equal(initialCheck.valid, true);

    // Tamper attack: modify single character in payload of record 2 (e.g. 'P-2' to 'P-9')
    const tamperedChain = [...chain];
    tamperedChain[1] = {
      ...tamperedChain[1],
      payload_jcs: tamperedChain[1].payload_jcs.replace('"P-2"', '"P-9"'),
    };

    const tamperedCheck = await verifyChain(tamperedChain);

    assert.equal(tamperedCheck.valid, false);
    assert.equal(tamperedCheck.brokenIndex, 1);
    assert.equal(tamperedCheck.recordUuid, 'REC-002');
    assert.ok(tamperedCheck.reason?.includes('Tampered payload'));
  });
});

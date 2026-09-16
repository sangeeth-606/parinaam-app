import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateChainHash,
  verifyChain,
  GENESIS_PREV_HASH,
} from '../../src/crypto/hash-chain.ts';
import type { HashChainRecordItem } from '../../src/crypto/hash-chain.ts';
import { canonicalizeJson } from '../../src/crypto/canonical-json.ts';

describe('Cryptographic Hash Chain Ledger', () => {
  it('calculates chain hash for genesis record', async () => {
    const payload = canonicalizeJson({
      record_uuid: 'rec-001',
      package_no: 'P-1',
      reagent: 'marquis',
      outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    });

    const result = await calculateChainHash(GENESIS_PREV_HASH, payload);
    assert.match(result.payloadSha256, /^[0-9a-f]{64}$/);
    assert.match(result.chainHash, /^[0-9a-f]{64}$/);
  });

  it('verifies an unbroken sequential chain of 3 records', async () => {
    const dummyRecords: HashChainRecordItem[] = [];
    let prevHash = GENESIS_PREV_HASH;

    for (let i = 1; i <= 3; i++) {
      const payloadObj = {
        record_uuid: `rec-00${i}`,
        package_no: `P-${i}`,
        reagent: 'marquis',
        outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      };
      const payloadJcs = canonicalizeJson(payloadObj);
      const { payloadSha256, chainHash } = await calculateChainHash(prevHash, payloadJcs);

      dummyRecords.push({
        seq: i,
        record_uuid: `rec-00${i}`,
        payload_jcs: payloadJcs,
        payload_sha256: payloadSha256,
        prev_hash: prevHash,
        chain_hash: chainHash,
      });

      prevHash = chainHash;
    }

    const verification = await verifyChain(dummyRecords);
    assert.equal(verification.valid, true);
    assert.equal(verification.totalVerified, 3);
  });

  it('detects broken linkage when a record prev_hash is altered', async () => {
    const records: HashChainRecordItem[] = [];
    let prevHash = GENESIS_PREV_HASH;

    for (let i = 1; i <= 3; i++) {
      const payloadJcs = canonicalizeJson({ seq: i, uuid: `id-${i}` });
      const { payloadSha256, chainHash } = await calculateChainHash(prevHash, payloadJcs);

      records.push({
        seq: i,
        record_uuid: `id-${i}`,
        payload_jcs: payloadJcs,
        payload_sha256: payloadSha256,
        prev_hash: prevHash,
        chain_hash: chainHash,
      });
      prevHash = chainHash;
    }

    // Tamper with linkage of record 2 (index 1)
    records[1].prev_hash = '1'.repeat(64);

    const verification = await verifyChain(records);
    assert.equal(verification.valid, false);
    assert.equal(verification.brokenIndex, 1);
    assert.equal(verification.recordUuid, 'id-2');
    assert.match(verification.reason || '', /Broken chain link/);
  });

  it('detects tampered payload when payload content is modified', async () => {
    const records: HashChainRecordItem[] = [];
    let prevHash = GENESIS_PREV_HASH;

    for (let i = 1; i <= 3; i++) {
      const payloadJcs = canonicalizeJson({ seq: i, uuid: `id-${i}` });
      const { payloadSha256, chainHash } = await calculateChainHash(prevHash, payloadJcs);

      records.push({
        seq: i,
        record_uuid: `id-${i}`,
        payload_jcs: payloadJcs,
        payload_sha256: payloadSha256,
        prev_hash: prevHash,
        chain_hash: chainHash,
      });
      prevHash = chainHash;
    }

    // Tamper with payload_jcs of record 3 (index 2) without updating payload_sha256
    records[2].payload_jcs = canonicalizeJson({ seq: 3, uuid: 'id-3', tampered: true });

    const verification = await verifyChain(records);
    assert.equal(verification.valid, false);
    assert.equal(verification.brokenIndex, 2);
    assert.equal(verification.recordUuid, 'id-3');
    assert.match(verification.reason || '', /Tampered payload/);
  });
});

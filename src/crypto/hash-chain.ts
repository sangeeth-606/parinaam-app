/**
 * Parinaam — Cryptographic Hash Chain Ledger
 * Conforms to spec/data-model.md Section 4 and spec/01-phase-0-foundation.md Task 0.5.
 */

import { sha256Hex } from './sha256.ts';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export interface ChainHashResult {
  payloadSha256: string;
  chainHash: string;
}

export interface HashChainRecordItem {
  seq?: number;
  record_uuid: string;
  payload_jcs: string;
  payload_sha256: string;
  prev_hash: string;
  chain_hash: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalVerified: number;
  brokenIndex?: number;
  recordUuid?: string;
  reason?: string;
}

/**
 * Calculates SHA-256 payload digest and the cumulative chain hash:
 * payload_sha256 = SHA256(payloadCanonicalJson)
 * chain_hash     = SHA256(prev_hash + payload_sha256)
 */
export async function calculateChainHash(
  prevHash: string,
  payloadCanonicalJson: string
): Promise<ChainHashResult> {
  const payloadSha256 = await sha256Hex(payloadCanonicalJson);
  const combined = `${prevHash}${payloadSha256}`;
  const chainHash = await sha256Hex(combined);
  return { payloadSha256, chainHash };
}

/**
 * Traverses a sequential list of records, verifying:
 * 1. payload_sha256 matches SHA256(payload_jcs)
 * 2. chain_hash matches SHA256(prev_hash + payload_sha256)
 * 3. Each record's prev_hash links to the preceding record's chain_hash
 */
export async function verifyChain(
  records: HashChainRecordItem[]
): Promise<ChainVerificationResult> {
  if (records.length === 0) {
    return { valid: true, totalVerified: 0 };
  }

  let expectedPrevHash = records[0].prev_hash;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // 1. Linkage verification (for records after genesis/start)
    if (i > 0 && record.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        totalVerified: i,
        brokenIndex: i,
        recordUuid: record.record_uuid,
        reason: `Broken chain link at index ${i}: prev_hash (${record.prev_hash}) does not match expected previous chain_hash (${expectedPrevHash})`,
      };
    }

    // 2. Payload digest verification
    const expectedPayloadSha256 = await sha256Hex(record.payload_jcs);
    if (expectedPayloadSha256 !== record.payload_sha256) {
      return {
        valid: false,
        totalVerified: i,
        brokenIndex: i,
        recordUuid: record.record_uuid,
        reason: `Tampered payload at index ${i}: stored payload_sha256 does not match SHA256(payload_jcs)`,
      };
    }

    // 3. Chain hash verification
    const expectedChainHash = await sha256Hex(`${record.prev_hash}${record.payload_sha256}`);
    if (expectedChainHash !== record.chain_hash) {
      return {
        valid: false,
        totalVerified: i,
        brokenIndex: i,
        recordUuid: record.record_uuid,
        reason: `Corrupted chain hash at index ${i}: stored chain_hash does not match SHA256(prev_hash + payload_sha256)`,
      };
    }

    expectedPrevHash = record.chain_hash;
  }

  return { valid: true, totalVerified: records.length };
}

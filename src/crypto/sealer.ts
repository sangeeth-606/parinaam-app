/**
 * Parinaam — Sealing Engine (SealModule Implementation)
 * Governed by spec/05-phase-4-evidentiary.md (Task 4.5) & spec/legal-constraints.md.
 *
 * Implements:
 * 1. RFC 8785 JSON Canonicalization Scheme (canonicalJson)
 * 2. SHA-256 payload digest (payloadSha256)
 * 3. Hash chain linking: chainHash = SHA256(prevHash + payloadSha256)
 * 4. Hardware key integrity seal: deviceAttestation = ECDSA_Sign(chainHash)
 */

import type { SealModule, SealedRecordPayload } from '../types/contracts.ts';
import { canonicalizeJson } from './canonical-json.ts';
import { calculateChainHash } from './hash-chain.ts';
import { HardwareKeyManager } from './hardware-key.ts';

export class SealingService implements SealModule {
  private keyManager: HardwareKeyManager;

  constructor(keyManager?: HardwareKeyManager) {
    this.keyManager = keyManager ?? new HardwareKeyManager();
  }

  /**
   * Seals a record payload into an immutable, tamper-evident sealed record.
   *
   * @param recordData Arbitrary plain object representing the test record fields
   * @param prevHash The previous record's chain_hash (or 64 zeros for genesis)
   * @param keyAlias Keystore alias of the hardware signing key
   */
  public async sealRecord(
    recordData: Record<string, unknown>,
    prevHash: string,
    keyAlias: string = 'parinaam_integrity_seal_v1'
  ): Promise<SealedRecordPayload> {
    // 1. Strict RFC 8785 canonical JSON serialization
    const canonicalJson = canonicalizeJson(recordData);

    // 2. Hash chain calculation: payload_sha256 & sequential chain_hash
    const { payloadSha256, chainHash } = await calculateChainHash(prevHash, canonicalJson);

    // 3. Hardware key integrity seal (ECDSA-SHA256 signature in DER format)
    const attestationSeal = await this.keyManager.signChainHash(chainHash, keyAlias);

    return {
      canonicalJson,
      payloadSha256,
      chainHash,
      deviceAttestation: attestationSeal.derSignatureHex,
    };
  }

  public getKeyManager(): HardwareKeyManager {
    return this.keyManager;
  }
}

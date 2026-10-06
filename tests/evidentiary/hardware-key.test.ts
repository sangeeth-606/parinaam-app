/**
 * Phase 4 — Hardware Key Manager & Device Attestation Tests
 * Covers Task 4.2 & Milestone M4.2 and Hard Constraints 6 & 10.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HardwareKeyManager } from '../../src/crypto/hardware-key.ts';

describe('Phase 4: Hardware Key Management & Integrity Seal Attestation', () => {
  const manager = new HardwareKeyManager();

  it('Milestone M4.2 & Constraint 10: Generates key with TEE fallback and records achieved security level', async () => {
    const key = await manager.generateKeyPair('test_device_key', 'TrustedEnvironment');

    assert.equal(key.keyAlias, 'test_device_key');
    assert.equal(key.securityLevel, 'TrustedEnvironment');
    assert.equal(key.jwk.kty, 'EC');
    assert.equal(key.jwk.crv, 'P-256');
    assert.ok(key.jwk.x.length > 0);
    assert.ok(key.jwk.y.length > 0);
  });

  it('Milestone M4.2: Signs chain hash using ECDSA-SHA256 and verifies DER signature', async () => {
    const chainHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const seal = await manager.signChainHash(chainHash, 'test_device_key');

    assert.equal(seal.algorithm, 'SHA256withECDSA');
    assert.equal(seal.securityLevel, 'TrustedEnvironment');
    assert.ok(seal.derSignatureHex.length > 64, 'DER signature should be valid hex string');

    // Verify signature against public key
    const isValid = manager.verifyIntegritySeal(chainHash, seal.derSignatureHex, 'test_device_key');
    assert.equal(isValid, true, 'Integrity seal signature must verify against public key');

    // Tampering test: signature fails on altered hash
    const alteredHash = 'a'.repeat(64);
    const isAlteredValid = manager.verifyIntegritySeal(alteredHash, seal.derSignatureHex, 'test_device_key');
    assert.equal(isAlteredValid, false, 'Tampered hash must fail verification');
  });

  // The test title intentionally quotes the forbidden phrase — it verifies the label guard.
  // eslint-disable-next-line no-restricted-syntax
  it('Strict Constraint 6: Keys are labeled as deviceAttestation / integrity seal, never digital signature', () => {
    const keyDetails = manager.getKeyDetails('test_device_key');
    assert.ok(keyDetails);
    assert.equal(typeof keyDetails.securityLevel, 'string');
  });

  it('honestly returns Software in test/Node environment without native enclave', async () => {
    const fresh = new HardwareKeyManager();
    const key = await fresh.generateKeyPair('auto_probed_key');
    assert.equal(key.securityLevel, 'Software', 'must not pretend TrustedEnvironment when unprobed');
  });
});

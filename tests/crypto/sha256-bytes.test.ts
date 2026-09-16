/**
 * F1 — byte digest + base64 primitives: NIST vectors through OUR function (proving the
 * wrapper doesn't mangle bytes on the node path) and base64 cross-checked against Buffer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { base64ToBytes, bytesToBase64, sha256HexBytes } from '../../src/crypto/sha256-bytes.ts';

describe('phase F — isomorphic byte hashing primitives', () => {
  it('NIST vectors through the byte API', async () => {
    assert.equal(await sha256HexBytes(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(await sha256HexBytes(Uint8Array.from([0x61, 0x62, 0x63])), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('55/56/57-byte padding boundaries match node:crypto', async () => {
    for (const len of [55, 56, 57, 63, 64, 65, 1000]) {
      const data = new Uint8Array(len).map((_v, i) => (i * 7 + len) % 256);
      assert.equal(await sha256HexBytes(data), createHash('sha256').update(Buffer.from(data)).digest('hex'), `len=${len}`);
    }
  });

  it('base64 round-trip matches Buffer for every 0..255 pattern', () => {
    const data = Uint8Array.from({ length: 256 }, (_v, i) => i);
    const b64 = bytesToBase64(data);
    assert.equal(b64, Buffer.from(data).toString('base64'));
    assert.deepEqual(Array.from(base64ToBytes(b64)), Array.from(Buffer.from(b64, 'base64') as unknown as Uint8Array));
    assert.equal(bytesToBase64(new Uint8Array([0xff, 0xef, 0xbe])), '/+++');
  });

  it('data-URI prefix and padding are tolerated on decode', () => {
    const data = Uint8Array.from([1, 2, 3, 4, 5]);
    const withPrefix = 'data:image/jpeg;base64,' + bytesToBase64(data);
    assert.deepEqual(Array.from(base64ToBytes(withPrefix)), Array.from(data));
  });
});

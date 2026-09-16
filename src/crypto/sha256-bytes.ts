/**
 * Parinaam — isomorphic SHA-256 over raw BYTES (v2 phase F).
 *
 * The existing sha256.ts digests strings. Camera evidence is bytes, and the value stored
 * as `image_sha256` must mean the same thing on the device (expo-crypto), in Node tests
 * (node:crypto), and under Web Crypto — so we delegate to the vetted implementation each
 * runtime already provides, rather than hand-rolling the FIPS table. Same environment-
 * detection discipline as sha256.ts; `base64ToBytes`/`bytesToBase64` are the only
 * hand-written primitives here, and both are unit-tested for round-trip correctness.
 */

const B64CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64CHARS[b0 >> 2];
    out += B64CHARS[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64CHARS[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64CHARS[b2 & 63];
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  let s = b64;
  const comma = s.indexOf(',');
  if (s.startsWith('data:') && comma >= 0) s = s.slice(comma + 1); // strip data-URI prefix
  s = s.replace(/[^A-Za-z0-9+/=]/g, '');
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64IDX[clean.charCodeAt(i)];
    const c1 = B64IDX[clean.charCodeAt(i + 1)];
    const c2 = i + 2 < clean.length ? B64IDX[clean.charCodeAt(i + 2)] : 0;
    const c3 = i + 3 < clean.length ? B64IDX[clean.charCodeAt(i + 3)] : 0;
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (p < out.length) out[p++] = (n >> 16) & 255;
    if (p < out.length) out[p++] = (n >> 8) & 255;
    if (p < out.length) out[p++] = n & 255;
  }
  return out.subarray(0, p);
}

const B64IDX = new Int16Array(128);
for (let i = 0; i < 64; i++) B64IDX[B64CHARS.charCodeAt(i)] = i;

/** sha256 of raw bytes → lowercase hex. Isomorphic: node / Web Crypto / expo-crypto. */
export async function sha256HexBytes(data: Uint8Array): Promise<string> {
  if (typeof process !== 'undefined' && process.versions != null && process.versions.node != null) {
    try {
      const nodeCrypto = await import('crypto');
      return nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
    } catch {
      /* fall through */
    }
  }
  const g = globalThis as { crypto?: { subtle?: { digest(alg: string, data: Uint8Array): Promise<ArrayBufferLike> } } };
  if (g.crypto?.subtle) {
    try {
      const buf = await g.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      /* fall through */
    }
  }
  try {
    const ExpoCrypto = await import('expo-crypto');
    const b64 = bytesToBase64(data);
    return await ExpoCrypto.digestStringAsync(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256,
      b64,
      { encoding: ExpoCrypto.CryptoEncoding.BASE64 }
    );
  } catch {
    throw new Error('No byte-capable SHA-256 implementation in this environment');
  }
}

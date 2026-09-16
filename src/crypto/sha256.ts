/**
 * Parinaam — Cryptographic SHA-256 Digest Helper
 * Isomorphic: works across Node.js (tests), Web Crypto, and Expo Crypto.
 */

export async function sha256Hex(data: string): Promise<string> {
  // 1. If running in Node.js (unit test environment)
  if (typeof process !== 'undefined' && process.versions != null && process.versions.node != null) {
    try {
      // Dynamic require or import of node:crypto to avoid bundling errors in RN
      const nodeCrypto = await import('crypto');
      return nodeCrypto.createHash('sha256').update(data, 'utf8').digest('hex');
    } catch {
      // Fall through to browser/expo crypto
    }
  }

  // 2. If running with Expo Crypto in React Native
  try {
    const ExpoCrypto = await import('expo-crypto');
    if (ExpoCrypto && typeof ExpoCrypto.digestStringAsync === 'function') {
      return await ExpoCrypto.digestStringAsync(
        ExpoCrypto.CryptoDigestAlgorithm.SHA256,
        data,
        { encoding: ExpoCrypto.CryptoEncoding.HEX }
      );
    }
  } catch {
    // Fall through to standard Web Crypto API
  }

  // 3. Web Crypto API (standard in modern JS runtimes)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('No cryptographic SHA-256 implementation available in this environment');
}

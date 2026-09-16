/**
 * Parinaam — Database Key Management
 * Stores and retrieves the 32-byte AES-256 database key using hardware-backed SecureStore.
 */

const DB_KEY_ALIAS = 'parinaam_sqlcipher_key';

export async function getOrGenerateDbKey(): Promise<string> {
  // 1. In React Native / Expo environment
  try {
    const SecureStore = await import('expo-secure-store');
    const Crypto = await import('expo-crypto');

    let key = await SecureStore.getItemAsync(DB_KEY_ALIAS);
    if (!key) {
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      key = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      await SecureStore.setItemAsync(DB_KEY_ALIAS, key, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }
    return key;
  } catch {
    // 2. Fallback for Node.js / Jest unit test environment
    if (typeof process !== 'undefined' && process.versions?.node) {
      const crypto = await import('crypto');
      return crypto.randomBytes(32).toString('hex');
    }
    throw new Error('SecureStore is unavailable in this environment');
  }
}

/**
 * Metro alias for `crypto` / `node:crypto` in the React Native bundle.
 *
 * Why: engine modules (crypto/sha256.ts guarded dynamic import; crypto/hardware-key.ts
 * static import) reference Node's crypto for the test/runtime-Node path. Metro resolves
 * every literal import at build time, so the specifier must exist — but NOTHING may ever
 * execute here: sha256.ts only calls it under `process.versions.node`, and
 * HardwareKeyManager failures are caught by src/services/analysis-pipeline.ts, which
 * records an honest degraded attestation state instead.
 */

function unavailable(name) {
  return function () {
    throw new Error(
      'node:' + name + ' is not available in the React Native runtime; this path must not execute'
    );
  };
}

module.exports = {
  __unavailable: true,
  createHash: unavailable('createHash'),
  randomUUID: unavailable('randomUUID'),
  generateKeyPairSync: unavailable('generateKeyPairSync'),
  sign: unavailable('sign'),
  verify: unavailable('verify'),
  createSign: unavailable('createSign'),
  createVerify: unavailable('createVerify'),
  createPublicKey: unavailable('createPublicKey'),
  createPrivateKey: unavailable('createPrivateKey'),
  default: {
    createHash: unavailable('createHash'),
    randomUUID: unavailable('randomUUID'),
    generateKeyPairSync: unavailable('generateKeyPairSync'),
    sign: unavailable('sign'),
    verify: unavailable('verify'),
  },
};

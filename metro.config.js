const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');
// v2 hotfix: expo-sqlite's WEB worker imports ./wa-sqlite/wa-sqlite.wasm — Metro must
// treat .wasm as an asset (URL) or every web boot dies on a red bundling screen.
config.resolver.assetExts.push('wasm');

const polyfillStubPath = path.resolve(__dirname, 'scripts/rn-get-polyfills.js');
// Alias Node's core `crypto` specifiers to a runtime-throwing stub so engine modules
// (hash-chain → sha256 guarded dynamic import; hardware-key → static import) bundle for
// Web/native without Node polyfills. Nothing may execute in it at runtime. See stub.
const nodeCryptoStubPath = path.resolve(__dirname, 'scripts/node-crypto-stub.js');

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName && moduleName.includes('rn-get-polyfills')) {
    return {
      filePath: polyfillStubPath,
      type: 'sourceFile',
    };
  }
  if (moduleName === 'crypto' || moduleName === 'node:crypto') {
    return {
      filePath: nodeCryptoStubPath,
      type: 'sourceFile',
    };
  }
  // v2 phase C: node:sqlite is the Node side of the DB driver seam; the RN bundle
  // must never resolve it (runtime-throwing stub, same policy as node:crypto above).
  if (moduleName === 'node:sqlite') {
    return {
      filePath: path.resolve(__dirname, 'scripts/node-sqlite-stub.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

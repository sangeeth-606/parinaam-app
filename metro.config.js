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

const http = require('http');

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => {
    return (req, res, next) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url && (req.url === '/engine-proxy' || req.url.startsWith('/engine-proxy/') || req.url.startsWith('/engine-proxy?'))) {
        const targetPath = req.url.replace(/^\/engine-proxy/, '') || '/';
        console.log(`[Metro Proxy Engine] Forwarding ${req.method} ${targetPath} -> http://127.0.0.1:8572`);
        const headers = { ...req.headers };
        headers.host = '127.0.0.1:8572';
        delete headers['connection'];

        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: 8572,
            path: targetPath,
            method: req.method,
            headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );

        proxyReq.on('error', (err) => {
          console.error('[Metro Proxy Engine Error]', err.message);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message, code: 'ENGINE_PROXY_FAILED' }));
          }
        });

        req.pipe(proxyReq);
        return;
      }

      if (req.url && (req.url === '/api-proxy' || req.url.startsWith('/api-proxy/') || req.url.startsWith('/api-proxy?'))) {
        const targetPath = req.url.replace(/^\/api-proxy/, '') || '/';
        console.log(`[Metro Proxy API] Forwarding ${req.method} ${targetPath} -> http://127.0.0.1:8571`);
        const headers = { ...req.headers };
        headers.host = '127.0.0.1:8571';
        delete headers['connection'];

        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: 8571,
            path: targetPath,
            method: req.method,
            headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );

        proxyReq.on('error', (err) => {
          console.error('[Metro Proxy API Error]', err.message);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message, code: 'API_PROXY_FAILED' }));
          }
        });

        req.pipe(proxyReq);
        return;
      }

      return metroMiddleware(req, res, next);
    };
  },
};

module.exports = config;


#!/usr/bin/env node

/**
 * Parinaam LAN Bridge — Windows Firewall Bypass for Mobile Devices
 *
 * Docker Desktop on Windows runs WSL2 which does not receive inbound LAN traffic
 * on Wi-Fi without manual elevated firewall rules.
 * Because `node.exe` is already permitted in Windows Firewall, this lightweight
 * bridge forwards incoming Wi-Fi traffic from physical devices directly to Docker services:
 *   - 0.0.0.0:8581 -> 127.0.0.1:8571 (API Server)
 *   - 0.0.0.0:8582 -> 127.0.0.1:8572 (Camera Engine)
 */

import http from 'node:http';

function createProxy(targetPort, label) {
  const server = http.createServer((req, res) => {
    console.log(`[LAN Bridge ${label}] Incoming: ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
    // Enable CORS for Expo / web
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const options = {
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${targetPort}`,
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`[LAN Bridge ${label}] Error forwarding to :${targetPort}:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Bridge could not reach ${label} on port ${targetPort}: ${err.message}` }));
      }
    });

    req.pipe(proxyReq);
  });

  return server;
}

const apiBridge = createProxy(8571, 'API-Server');
const engineBridge = createProxy(8572, 'Camera-Engine');

apiBridge.listen(8581, '0.0.0.0', () => {
  console.log('[LAN Bridge] API Server bridge listening on 0.0.0.0:8581 -> 127.0.0.1:8571');
});

engineBridge.listen(8582, '0.0.0.0', () => {
  console.log('[LAN Bridge] Camera Engine bridge listening on 0.0.0.0:8582 -> 127.0.0.1:8572');
});

#!/usr/bin/env node

/**
 * Start the self-hosted Parinaam stack and the Expo development client from
 * one command.
 *
 * The iOS/Android app cannot start a Linux Docker daemon. This launcher is the
 * correct single-user boundary: Docker owns the colour engine, while Expo owns
 * the mobile UI. Both are started and health-checked before Metro is launched.
 *
 * Usage:
 *   node scripts/start-local-stack.mjs --lan
 *   node scripts/start-local-stack.mjs --lan --go
 *   node scripts/start-local-stack.mjs --tunnel
 *
 * The launcher starts the API server and camera-engine. The database is the
 * Supabase-hosted PostgreSQL named by DATABASE_URL in .env, shared with
 * parinaam-web — no local `db` container is started or managed here.
 * It removes only services
 * that it started itself when Metro exits; the PostgreSQL volume is preserved.
 */

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = {
  lan: args.includes('--lan'),
  go: args.includes('--go'),
  tunnel: args.includes('--tunnel'),
  dryRun: args.includes('--dry-run'),
  help: args.includes('--help') || args.includes('-h'),
  keepServices: args.includes('--keep-services'),
};

if (flags.help) {
  console.log(`Usage: node scripts/start-local-stack.mjs [options]

Options:
  --lan             Use the host LAN address (physical phone/emulator on Wi-Fi)
  --go              Start Expo Go instead of the custom development client
  --tunnel          Use Expo's ngrok tunnel (requires valid ngrok credentials)
  --keep-services   Leave newly started Docker services running after Metro exits
  --dry-run         Print the commands without starting anything
  --port <port>     Pass a Metro port through to Expo
`);
  process.exit(0);
}

if (flags.lan && flags.tunnel) {
  throw new Error('Choose either --lan or --tunnel, not both.');
}

function valueFromArg(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

const metroPort = valueFromArg('--port');
const rootEnv = readDotEnv(path.join(ROOT, '.env'));
const enginePort = nonEmpty(process.env.ENGINE_PORT, rootEnv.ENGINE_PORT) ?? '8572';
const apiPort = nonEmpty(process.env.API_PORT, rootEnv.API_PORT) ?? '8571';
const lanIp = nonEmpty(process.env.PARINAAM_LAN_IP) ?? findLanIp();
const lan = flags.lan;
const hostForApp = lan ? lanIp : '127.0.0.1';
const engineUrl = `http://${hostForApp}:${enginePort}`;
const apiUrl = `http://${hostForApp}:${apiPort}`;
// Metro proxy URLs ─ what the Expo app on the phone actually calls.
// Docker ports 8571/8572 are blocked by Windows Firewall on LAN.
// The Metro dev-server (port 8081) is already open, so we route through it.
const metroPortNum = metroPort ?? '8081';
const metroHost = lan ? lanIp : '127.0.0.1';
const appApiUrl = `http://${metroHost}:${metroPortNum}/api-proxy`;
const appEngineUrl = `http://${metroHost}:${metroPortNum}/engine-proxy`;

if (lan && !lanIp) {
  throw new Error(
    'Could not detect a LAN IPv4 address. Set PARINAAM_LAN_IP to the laptop address and retry.',
  );
}

const composeEnv = {
  ...process.env,
  // The database remains loopback-only. API and engine are exposed only for an
  // explicit LAN run, which is needed by a physical phone.
  API_BIND: lan ? '0.0.0.0' : '127.0.0.1',
  ENGINE_BIND: lan ? '0.0.0.0' : '127.0.0.1',
};

const expoEnv = {
  ...process.env,
  // Route through the Metro dev-server proxy so the phone never needs to
  // reach Docker ports directly (Windows Firewall blocks 8571/8572 on LAN).
  EXPO_PUBLIC_API_URL: appApiUrl,               // http://<lan>:8081/api-proxy
  EXPO_PUBLIC_CAMERA_ENGINE_URL: appEngineUrl,  // http://<lan>:8081/engine-proxy
  // The API account is the SERVER's own seeded account — never the device-gate
  // credential (admin/adminpass), which the API rejects. Sourced from the same
  // compose variables the server starts with, so the two always agree.
  EXPO_PUBLIC_API_USERNAME: process.env.PARINAAM_API_ADMIN_USER ?? 'admin',
  EXPO_PUBLIC_API_PASSWORD: process.env.PARINAAM_SEED_PASSWORD ?? process.env.PARINAAM_API_ADMIN_PASSWORD ?? 'Parinaam#2026',
};
if (flags.go) expoEnv.EXPO_NO_REDIRECT_PAGE = '1';

const composeArgs = ['compose', 'up', '-d', 'server', 'camera-engine'];
const expoArgs = ['start'];
if (flags.tunnel) expoArgs.push('--tunnel');
else if (flags.lan) expoArgs.push('--lan');
if (flags.go) expoArgs.push('--go');
else expoArgs.push('--dev-client');
if (metroPort) expoArgs.push('--port', metroPort);

if (flags.dryRun) {
  console.log('[Parinaam] Dry run — no Docker or Expo process will be started.');
  console.log(`[Parinaam] Docker: docker ${composeArgs.join(' ')}`);
  console.log(`[Parinaam] API URL (direct):       ${apiUrl}`);
  console.log(`[Parinaam] Camera-engine (direct): ${engineUrl}`);
  console.log(`[Parinaam] App API URL (proxy):    ${appApiUrl}`);
  console.log(`[Parinaam] App engine URL (proxy): ${appEngineUrl}`);
  console.log(`[Parinaam] Expo: ${expoBinary()} ${expoArgs.join(' ')}`);
  process.exit(0);
}

const alreadyRunning = new Set(
  ['server', 'camera-engine'].filter((service) => runningServiceIds(service).length > 0),
);
let stackStarted = false;
let child = null;
let forwardedSignal = false;
let shutdownRequested = false;

process.on('SIGINT', () => requestShutdown('SIGINT'));
process.on('SIGTERM', () => requestShutdown('SIGTERM'));

try {
  // Preflight: the API and camera-engine bind fixed host ports. If something
  // outside this stack already holds one (most often a bare `npm run server`
  // left running in another terminal), `docker compose up` fails deep inside
  // the daemon with an opaque "address already in use" and the launcher then
  // tears down the services it just started. Detect it up front and explain
  // exactly what to stop instead.
  assertPortsAvailable([
    { port: Number(apiPort), label: 'API', hint: 'npm run server' },
    { port: Number(enginePort), label: 'camera-engine', hint: 'docker compose stop camera-engine' },
  ]);

  console.log('[Parinaam] Starting the stack (Supabase database, API, camera-engine)…');
  stackStarted = true;
  run('docker', composeArgs, composeEnv);

  await waitForHttp(`http://127.0.0.1:${apiPort}/api/v1/health`, 90_000, 'API');
  await waitForHttp(`http://127.0.0.1:${enginePort}/readyz`, 90_000, 'camera-engine');
  if (lan) {
    await waitForHttp(`${apiUrl}/api/v1/health`, 10_000, 'LAN API');
    await waitForHttp(`${engineUrl}/readyz`, 10_000, 'LAN camera-engine');
  }

  console.log(`[Parinaam] API ready (docker direct): ${apiUrl}`);
  console.log(`[Parinaam] Camera-engine ready (docker direct): ${engineUrl}`);
  if (lan) {
    console.log('[Parinaam] Physical-device mode: the phone uses the Metro proxy (port 8081).');
    console.log(`[Parinaam]   App API URL:    ${appApiUrl}`);
    console.log(`[Parinaam]   App engine URL: ${appEngineUrl}`);
    console.log('[Parinaam] No extra firewall rules needed — only Metro port 8081 must be reachable from the phone.');
  }

  child = spawn(expoBinary(), expoArgs, {
    cwd: ROOT,
    env: expoEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (typeof code === 'number') resolve(code);
      else resolve(signal && forwardedSignal ? 0 : 1);
    });
  });
  process.exitCode = exitCode;
} catch (error) {
  console.error(`[Parinaam] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  cleanupStartedServices();
}

function requestShutdown(signal) {
  if (shutdownRequested) {
    cleanupStartedServices();
    process.exit(signal === 'SIGINT' ? 0 : 1);
  }
  shutdownRequested = true;
  if (child && !child.killed) {
    forwardedSignal = true;
    child.kill(signal);
    return;
  }
  // A signal can arrive while Docker or the health checks are still starting,
  // before Expo exists. Clean synchronously and exit instead of leaving a
  // half-started stack behind.
  cleanupStartedServices();
  process.exit(signal === 'SIGINT' ? 0 : 1);
}

function cleanupStartedServices() {
  if (!stackStarted || flags.keepServices) return;
  const startedByLauncher = ['camera-engine', 'server'].filter(
    (service) => !alreadyRunning.has(service),
  );
  for (const service of startedByLauncher) {
    runQuiet('docker', ['compose', 'rm', '-f', '--stop', service], composeEnv);
  }
  if (startedByLauncher.length > 0) {
    console.log('[Parinaam] Stopped the Docker services started by this launcher (volumes preserved).');
  }
}

function nonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readDotEnv(filePath) {
  const values = {};
  if (!filePath) return values;
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return values;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function findLanIp() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address || address.internal) continue;
      if (address.family !== 'IPv4' && address.family !== 4) continue;
      candidates.push({ name, address: address.address });
    }
  }
  const preferred = candidates.find(({ name }) => /^(wl|en|eth)/i.test(name));
  const fallback = candidates.find(({ address }) => !address.startsWith('172.17.'));
  return (preferred ?? fallback ?? candidates[0])?.address ?? null;
}

/**
 * Refuse to start when a required host port is already held by a process this
 * launcher does not own. A port held by one of our own already-running compose
 * services is fine — `docker compose up` will simply reuse it.
 */
function assertPortsAvailable(targets) {
  const ownedPorts = new Set(
    ['server', 'camera-engine'].flatMap((service) =>
      runningServiceIds(service).map((id) => composePublishedPort(service, id)),
    ),
  );

  const conflicts = targets
    .filter((t) => Number.isInteger(t.port) && t.port > 0)
    .filter((t) => !ownedPorts.has(t.port))
    .filter((t) => isPortListening(t.port));

  if (conflicts.length === 0) return;

  const lines = conflicts.map(
    ({ port, label, hint }) => `  • port ${port} (${label}) is already in use — stop it with: ${hint}`,
  );
  throw new Error(
    [
      'Cannot start the local stack — required ports are already in use:',
      ...lines,
      '',
      'This launcher starts the API and camera-engine itself, so it must be the',
      'only thing binding those ports. The usual cause is a standalone',
      "'npm run server' left running in another terminal — press Ctrl+C there first.",
      '',
      'Already-running containers of this stack are reused and need no action.',
      `To see what holds a port: lsof -i :${conflicts[0].port}`,
    ].join('\n'),
  );
}

/** True when something is accepting connections on `port` on the loopback. */
function isPortListening(port) {
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      `const net=require('net');const s=net.connect(${port},'127.0.0.1');` +
        `s.on('connect',()=>{s.destroy();process.exit(0)});` +
        `s.on('error',()=>process.exit(1));` +
        `setTimeout(()=>process.exit(1),1500);`,
    ],
    { stdio: 'ignore', timeout: 5_000 },
  );
  return probe.status === 0;
}

/**
 * The host port a running compose service publishes, or null when unknown.
 * Used so we don't report a conflict against our own containers.
 *
 * `NetworkSettings.Ports` has the shape
 *   {"8572/tcp":[{"HostIp":"0.0.0.0","HostPort":"8572"}]}
 * so the published HOST port is the `HostPort` field — not the container port
 * that forms the object key (those differ whenever a host mapping is remapped).
 */
function composePublishedPort(service, containerId) {
  const result = spawnSync(
    'docker',
    ['inspect', '-f', '{{json .NetworkSettings.Ports}}', containerId],
    { cwd: ROOT, env: composeEnv, encoding: 'utf8' },
  );
  if (result.error || result.status !== 0 || !result.stdout.trim()) return null;
  try {
    const ports = JSON.parse(result.stdout.trim());
    const hostPorts = Object.values(ports ?? {})
      .flat()
      .map((binding) => Number(binding?.HostPort))
      .filter((port) => Number.isInteger(port) && port > 0);
    return hostPorts.length > 0 ? hostPorts[0] : null;
  } catch {
    return null;
  }
}

function expoBinary() {
  const binary = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
  return binary;
}

function runningServiceIds(service) {
  const result = spawnSync('docker', ['compose', 'ps', '-q', service], {
    cwd: ROOT,
    env: composeEnv,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) return [];
  return result.stdout.trim() ? result.stdout.trim().split(/\s+/) : [];
}

function run(command, commandArgs, env) {
  const result = spawnSync(command, commandArgs, { cwd: ROOT, env, stdio: 'inherit' });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} exited with status ${result.status}.`);
}

function runQuiet(command, commandArgs, env) {
  spawnSync(command, commandArgs, { cwd: ROOT, env, stdio: 'ignore' });
}

async function waitForHttp(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = 'not reachable';
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      clearTimeout(timer);
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${label} did not become ready at ${url}: ${last}`);
}

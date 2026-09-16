/**
 * Parinaam API — HTTP front door (v2 phase D).
 * node:http only. CORS is wide-open for GET reads by design: the separate web-repo
 * dashboard (and the officer app) must consume the same API. Tighten with an allow-list
 * before this API ever leaves the LAN.
 *
 * Run:  npm run server            (port: PARINAAM_API_PORT, default 8571)
 * Engine: PARINAAM_DB=postgres + DATABASE_URL → PostgreSQL (docker compose service
 * `db`); otherwise the embedded node:sqlite file (default), or ':memory:' in tests,
 * which boot `await createApiServer(':memory:')` on an ephemeral port.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ServerDb, defaultDbPath } from './db.ts';
import { authenticate, login } from './auth.ts';
import type { Ctx } from './routes.ts';
import { routes } from './routes.ts';
import { subscribe } from './bus.ts';

const MAX_BODY_BYTES = 1_000_000;

type RouteMatch = { handler: (ctx: Ctx) => unknown; params: Record<string, string> };

function matchRoute(method: string, pathname: string): RouteMatch | null {
  for (const [key, handler] of Object.entries(routes)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const pp = pattern.split('/');
    const sp = pathname.split('/');
    if (pp.length !== sp.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
      else if (pp[i] !== sp[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler, params };
  }
  return null;
}

export async function createApiServer(target?: string): Promise<{
  server: http.Server;
  db: ServerDb;
}> {
  const db = await ServerDb.open(target ?? defaultDbPath());

  const server = http.createServer((req, res) => {
    const send = (status: number, json: unknown): void => {
      const body = JSON.stringify(json);
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
      });
      res.end(body);
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://parinaam.local');

    // SSE live feed (open): every ingest/status change is pushed as an event.
    if (req.method === 'GET' && url.pathname === '/api/v1/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`retry: 3000\n\ndata: ${JSON.stringify({ type: 'hello', at: new Date().toISOString() })}\n\n`);
      const off = subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(ping);
        off();
      });
      return;
    }

    const m = matchRoute(req.method ?? 'GET', url.pathname);
    if (!m) {
      send(404, { error: 'no-such-route', hint: 'see server/README.md for /api/v1 routes' });
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        aborted = true;
        send(413, { error: 'body too large (limit 1 MB)' });
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      if (aborted) return;
      void (async () => {
        let body: Record<string, unknown> | null = null;
        if (chunks.length > 0) {
          try {
            const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
              send(400, { error: 'body must be a JSON object' });
              return;
            }
            body = parsed as Record<string, unknown>;
          } catch {
            send(400, { error: 'invalid JSON body' });
            return;
          }
        }
        const header = req.headers.authorization;
        const authHeader = Array.isArray(header) ? header[0] : header;
        const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ?? req.socket.remoteAddress ?? 'unknown';
        const ctx: Ctx = {
          db,
          officer: await authenticate(db, authHeader),
          body,
          query: url.searchParams,
          params: m.params,
          idempotencyKey: (req.headers['idempotency-key'] as string | undefined) ?? undefined,
          ip,
        };
        try {
          const out = await m.handler(ctx);
          send((out as { status: number }).status ?? 500, (out as { json: unknown }).json);
        } catch (err) {
          void db.audit('server', 'internal-error', null, err instanceof Error ? err.message : String(err));
          send(500, { error: 'internal', detail: err instanceof Error ? err.message : 'unknown' });
        }
      })();
    });
  });

  return { server, db };
}

// Direct execution (npm run server) — not when imported by tests.
const executedDirect =
  typeof process !== 'undefined' && process.argv[1] !== undefined && process.argv[1].endsWith('main.ts');
if (executedDirect) {
  const port = Number(process.env.PARINAAM_API_PORT ?? 8571);
  void (async () => {
    let created: { server: http.Server; db: ServerDb };
    try {
      created = await createApiServer();
    } catch (err) {
      process.stderr.write(`Parinaam API could not open its database: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
    const { server, db } = created;
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        process.stderr.write(`Parinaam API cannot bind :${port} — port in use. Set PARINAAM_API_PORT to another port.\n`);
        process.exit(1);
      }
      throw err;
    });
    if (process.env.PARINAAM_SEED === '1') {
      try {
        const { seedDemoData } = await import('./seed.ts');
        await seedDemoData(db);
        process.stdout.write('Auto-seeded demo accounts and cases (PARINAAM_SEED=1)\n');
      } catch (e) {
        process.stderr.write(`Auto-seeding skipped/failed: ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }
    server.listen(port, () => {
      const addr = server.address() as AddressInfo;
      const where = db.engine === 'postgres' ? (process.env.DATABASE_URL ?? 'postgres') : defaultDbPath();
      process.stdout.write(`Parinaam API v2 listening on :${addr.port} (engine: ${db.engine}, db: ${where})\n`);
      process.stdout.write('Seeded officer: admin / <PARINAAM_API_ADMIN_PASSWORD ?? adminpass> · role SENIOR\n');
    });
    const shutdown = (): void => {
      server.close();
      void db.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })();
}

export { login };

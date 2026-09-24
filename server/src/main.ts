/** Self-hosted HTTP front door for the Parinaam API. */

import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { ServerDb, hashPassword, insertOfficer } from './db.ts';
import { authenticate } from './auth.ts';
import { routes, type ApiResponse, type Ctx } from './routes.ts';
import { subscribe, subscriberCount } from './bus.ts';
import { seedDemo } from './seed.ts';
import { ApiError, apiErrorBody } from '../../src/contracts/api-errors.ts';
import { MAX_EVIDENCE_BYTES } from '../../src/contracts/field-test-record.ts';

const JSON_BODY_LIMIT = 1_000_000;
const MAX_SSE_CLIENTS = 100;
const PUBLIC_ROUTES = new Set(['GET /api/v1/health', 'POST /api/v1/auth/login']);

type RouteMatch = { handler: (ctx: Ctx) => Promise<ApiResponse> | ApiResponse; params: Record<string, string> };

function matchRoute(method: string, pathname: string): RouteMatch | null {
  const routeTable: Record<string, (ctx: Ctx) => Promise<ApiResponse> | ApiResponse> = routes;
  for (const [key, handler] of Object.entries(routeTable)) {
    const separator = key.indexOf(' ');
    const routeMethod = key.slice(0, separator);
    const pattern = key.slice(separator + 1);
    if (routeMethod !== method) continue;
    const patternParts = pattern.split('/');
    const pathParts = pathname.split('/');
    if (patternParts.length !== pathParts.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < patternParts.length; index += 1) {
      const part = patternParts[index];
      if (part.startsWith(':')) {
        try {
          params[part.slice(1)] = decodeURIComponent(pathParts[index]);
        } catch {
          return null;
        }
      } else if (part !== pathParts[index]) {
        matched = false;
        break;
      }
    }
    if (matched) return { handler, params };
  }
  return null;
}

function allowedOrigin(requestOrigin: string | undefined): string | null {
  if (!requestOrigin) return null;
  const configured = (process.env.PARINAAM_CORS_ORIGINS ?? 'http://localhost:8081,http://127.0.0.1:8081')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);
  if (configured.includes('*')) return requestOrigin;
  return configured.includes(requestOrigin) ? requestOrigin : null;
}

function baseHeaders(origin: string | null): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Origin',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, Last-Event-ID',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type, ETag, X-Content-SHA256, X-Request-ID',
    'Access-Control-Max-Age': '600',
  };
}

function trustedClientIp(request: IncomingMessage): string {
  if (process.env.PARINAAM_TRUST_PROXY === 'true') {
    const forwarded = request.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    if (first?.trim()) return first.trim().slice(0, 128);
  }
  return request.socket.remoteAddress ?? 'unknown';
}

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > limit) throw new ApiError(413, 'REQUEST_BODY_TOO_LARGE', `request body exceeds ${limit} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

function parseJsonBody(bytes: Buffer): Record<string, unknown> {
  if (bytes.byteLength === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'request body must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(400, 'JSON_OBJECT_REQUIRED', 'request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function sendJson(
  response: ServerResponse,
  requestId: string,
  origin: string | null,
  status: number,
  body: unknown
): void {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    ...baseHeaders(origin),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': encoded.byteLength,
    'Cache-Control': 'no-store',
    'X-Request-ID': requestId,
  });
  response.end(encoded);
}

function sendApiResponse(
  response: ServerResponse,
  requestId: string,
  origin: string | null,
  result: ApiResponse
): void {
  if (result.binary) {
    response.writeHead(result.status, {
      ...baseHeaders(origin),
      'Content-Type': result.binary.contentType,
      'Content-Length': result.binary.bytes.byteLength,
      'Cache-Control': 'no-store',
      ETag: `"sha256:${result.binary.sha256}"`,
      'X-Content-SHA256': result.binary.sha256,
      'X-Request-ID': requestId,
    });
    response.end(Buffer.from(result.binary.bytes));
    return;
  }
  sendJson(response, requestId, origin, result.status, result.json ?? {});
}

function openSse(
  request: IncomingMessage,
  response: ServerResponse,
  requestId: string,
  origin: string | null,
  officerCode: string
): void {
  if (subscriberCount() >= MAX_SSE_CLIENTS) {
    throw new ApiError(503, 'TOO_MANY_STREAM_CLIENTS', 'live stream client limit reached', true);
  }
  response.writeHead(200, {
    ...baseHeaders(origin),
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Request-ID': requestId,
  });
  response.write(`retry: 3000\n\n`);
  response.write(`event: hello\ndata: ${JSON.stringify({ request_id: requestId, officer_code: officerCode, at: new Date().toISOString() })}\n\n`);
  const off = subscribe((event) => {
    if (response.destroyed) {
      off();
      return;
    }
    if (response.writableLength > 1_048_576) {
      response.end();
      off();
      return;
    }
    response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  const ping = setInterval(() => {
    if (!response.destroyed) response.write(': ping\n\n');
  }, 25_000);
  request.on('close', () => {
    clearInterval(ping);
    off();
  });
}

async function bootstrapAdmin(db: ServerDb): Promise<void> {
  const password = process.env.PARINAAM_API_ADMIN_PASSWORD;
  if (!password) return;
  if (password.length < 10) throw new Error('PARINAAM_API_ADMIN_PASSWORD must be at least 10 characters');
  const existing = await db.store.get<{ id: number | string }>('SELECT id FROM officers WHERE username = ?', 'admin');
  if (existing) return;
  const credentials = await hashPassword(password);
  await insertOfficer(db, 'admin', credentials.salt, credentials.hash, 'System Administrator', 'ADMIN', 'OFFICER-ADMIN', 'ACTIVE');
  await db.audit('system', 'bootstrap-admin', 'admin', 'created from explicit PARINAAM_API_ADMIN_PASSWORD');
}

export async function createApiServer(target?: string): Promise<{
  server: http.Server;
  db: ServerDb;
}> {
  const db = await ServerDb.open(target);
  await bootstrapAdmin(db);
  if (process.env.PARINAAM_SEED === '1') await seedDemo(db);

  const server = http.createServer((request, response) => {
    void (async () => {
      const requestId = randomUUID();
      let origin: string | null = null;
      try {
        origin = allowedOrigin(request.headers.origin);
        if (request.method === 'OPTIONS') {
          response.writeHead(origin ? 204 : 403, baseHeaders(origin));
          response.end();
          return;
        }

        let url: URL;
        try {
          url = new URL(request.url ?? '/', 'http://parinaam.local');
        } catch {
          throw new ApiError(400, 'INVALID_URL', 'request URL is invalid');
        }
        const method = request.method ?? 'GET';
        const routeKey = `${method} ${url.pathname}`;
        const stream = method === 'GET' && url.pathname === '/api/v1/stream';
        const matched = stream ? null : matchRoute(method, url.pathname);
        if (!stream && !matched) throw new ApiError(404, 'ROUTE_NOT_FOUND', 'API route not found');

        const authed = PUBLIC_ROUTES.has(routeKey) ? null : await authenticate(db, request.headers.authorization);
        if (!PUBLIC_ROUTES.has(routeKey) && !authed) throw new ApiError(401, 'AUTH_REQUIRED', 'authentication required');

        if (stream && authed) {
          if (authed.role === 'JUNIOR') {
            throw new ApiError(403, 'STREAM_ROLE_REQUIRED', 'the live stream is restricted to reviewer roles', false);
          }
          openSse(request, response, requestId, origin, authed.officerCode);
          return;
        }
        if (!matched) throw new ApiError(404, 'ROUTE_NOT_FOUND', 'API route not found');

        let body: Record<string, unknown> | null = null;
        let rawBody: Uint8Array | null = null;
        const contentType = (request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
        if (method === 'PUT' && matched.params.uuid && url.pathname.endsWith('/evidence')) {
          if (!['image/jpeg', 'image/png'].includes(contentType)) {
            throw new ApiError(415, 'UNSUPPORTED_IMAGE_TYPE', 'Content-Type must be image/jpeg or image/png');
          }
          rawBody = await readBody(request, MAX_EVIDENCE_BYTES);
        } else if (method === 'POST' || method === 'PATCH') {
          const bytes = await readBody(request, JSON_BODY_LIMIT);
          body = parseJsonBody(bytes);
        } else if (request.headers['content-length'] && request.headers['content-length'] !== '0') {
          throw new ApiError(400, 'UNEXPECTED_BODY', 'request body is not allowed for this method');
        }

        const ctx: Ctx = {
          db,
          officer: authed,
          body,
          rawBody,
          contentType,
          query: url.searchParams,
          params: matched.params,
          ...(typeof request.headers['idempotency-key'] === 'string'
            ? { idempotencyKey: request.headers['idempotency-key'] }
            : {}),
          ip: trustedClientIp(request),
          requestId,
        };
        const result = await Promise.resolve(matched.handler(ctx));
        sendApiResponse(response, requestId, origin, result);
      } catch (error) {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        if (error instanceof ApiError) {
          sendJson(response, requestId, origin, error.status, apiErrorBody(error, requestId));
          return;
        }
        process.stderr.write(`[${requestId}] ${error instanceof Error ? error.name : 'Error'}: ${error instanceof Error ? error.message : 'unknown failure'}\n`);
        const internal = new ApiError(500, 'INTERNAL_ERROR', 'internal server error', true);
        sendJson(response, requestId, origin, 500, apiErrorBody(internal, requestId));
      }
    })();
  });

  return { server, db };
}

async function runtime(): Promise<void> {
  const port = Number(process.env.PARINAAM_API_PORT ?? 8571);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('PARINAAM_API_PORT must be a valid TCP port');
  const { server, db } = await createApiServer();
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const address = server.address() as AddressInfo;
  process.stdout.write(`Parinaam self-hosted API listening on port ${address.port} (${db.engine})\n`);

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    process.stdout.write(`Received ${signal}; shutting down\n`);
    server.close(() => {
      void db.close().finally(() => process.exit(0));
    });
    const forceTimer = setTimeout(() => process.exit(1), 10_000) as unknown as { unref(): void };
    forceTimer.unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (process.argv[1]?.endsWith('/server/src/main.ts') || process.argv[1] === 'server/src/main.ts') {
  runtime().catch((error: unknown) => {
    process.stderr.write(`Parinaam API failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

export { login } from './auth.ts';

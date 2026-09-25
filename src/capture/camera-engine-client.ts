/**
 * Bounded client for the local/self-hosted camera-engine Docker service.
 *
 * The caller supplies a camera-produced URI only. There is no gallery/file
 * picker path here. The service URL is deliberately separate from the Parinaam
 * API/sync URL.
 */

import {
  CAMERA_ENGINE_SCHEMA_VERSION,
  parseCameraEngineResult,
  type CameraEngineResult,
} from './camera-engine-contract.ts';

export const DEFAULT_CAMERA_ENGINE_URL = process.env.EXPO_PUBLIC_CAMERA_ENGINE_URL ?? 'http://10.0.2.2:8572';
export const CAMERA_ENGINE_REQUEST_TIMEOUT_MS = 20_000;
export const CAMERA_ENGINE_HEALTH_TIMEOUT_MS = 4_000;
export const CAMERA_ENGINE_MAX_ATTEMPTS = 2;

export interface CameraEngineImageInput {
  uri: string;
  mimeType: 'image/jpeg' | 'image/png';
  reagent: string;
}

export interface CameraEngineClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  healthTimeoutMs?: number;
  maxAttempts?: number;
}

export type CameraEngineErrorKind =
  | 'invalid_url'
  | 'network'
  | 'timeout'
  | 'http'
  | 'invalid_response';

export class CameraEngineClientError extends Error {
  readonly kind: CameraEngineErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly body: unknown;

  constructor(
    message: string,
    kind: CameraEngineErrorKind,
    options: { status?: number | null; retryable?: boolean; body?: unknown } = {},
  ) {
    super(message);
    this.name = 'CameraEngineClientError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.body = options.body;
  }
}

export interface CameraEngineClient {
  analyzeImage(input: CameraEngineImageInput): Promise<CameraEngineResult>;
  health(): Promise<Record<string, unknown>>;
}

function validateBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new CameraEngineClientError('Camera-engine URL is not a valid URL', 'invalid_url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CameraEngineClientError('Camera-engine URL must use HTTP or HTTPS', 'invalid_url');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new CameraEngineClientError('Camera-engine URL cannot contain credentials, query, or fragment', 'invalid_url');
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${path}`;
}

function responseBody(response: Response): Promise<unknown> {
  return response.text().then((text) => {
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  });
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function isRetryableError(error: unknown): boolean {
  return error instanceof CameraEngineClientError && (error.kind === 'network' || error.kind === 'timeout' || (error.kind === 'http' && error.retryable));
}

function makeMultipart(input: CameraEngineImageInput): FormData {
  const body = new FormData();
  // React Native's FormData accepts this private URI-part shape. The cast is
  // confined to the native transport seam; no untyped value enters the app.
  const part = {
    uri: input.uri,
    name: input.mimeType === 'image/png' ? 'capture.png' : 'capture.jpg',
    type: input.mimeType,
  } as unknown as Blob;
  body.append('image', part);
  body.append('reagent', input.reagent);
  return body;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || controller.signal.aborted)) {
      throw new CameraEngineClientError('Camera-engine request timed out', 'timeout', { retryable: true });
    }
    throw new CameraEngineClientError(
      error instanceof Error ? error.message : 'Camera-engine network request failed',
      'network',
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Create the one small interface the capture flow needs. */
export function createCameraEngineClient(options: CameraEngineClientOptions = {}): CameraEngineClient {
  const baseUrl = validateBaseUrl(options.baseUrl ?? DEFAULT_CAMERA_ENGINE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? CAMERA_ENGINE_REQUEST_TIMEOUT_MS;
  const healthTimeoutMs = options.healthTimeoutMs ?? CAMERA_ENGINE_HEALTH_TIMEOUT_MS;
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? CAMERA_ENGINE_MAX_ATTEMPTS, CAMERA_ENGINE_MAX_ATTEMPTS));

  const analyzeImage = async (input: CameraEngineImageInput): Promise<CameraEngineResult> => {
    if (!input.uri.trim() || !input.mimeType || !input.reagent.trim()) {
      throw new CameraEngineClientError('Camera-engine image input is incomplete', 'invalid_response');
    }
    let lastError: CameraEngineClientError | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(
          fetchImpl,
          `${baseUrl}/v1/analyze`,
          {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: makeMultipart(input),
          },
          requestTimeoutMs,
        );
        const body = await responseBody(response);
        if (!response.ok) {
          const message =
            isRecordWithError(body) && typeof body.error === 'string'
              ? body.error
              : `Camera-engine returned HTTP ${response.status}`;
          throw new CameraEngineClientError(message, 'http', {
            status: response.status,
            retryable: isRetryableHttpStatus(response.status),
            body,
          });
        }
        try {
          return parseCameraEngineResult(body);
        } catch (error) {
          throw new CameraEngineClientError(
            error instanceof Error ? error.message : 'Camera-engine returned an invalid result',
            'invalid_response',
            { status: response.status, body },
          );
        }
      } catch (error) {
        const clientError =
          error instanceof CameraEngineClientError
            ? error
            : new CameraEngineClientError(
                error instanceof Error ? error.message : 'Camera-engine request failed',
                'network',
                { retryable: true },
              );
        lastError = clientError;
        if (attempt + 1 >= maxAttempts || !isRetryableError(clientError)) throw clientError;
      }
    }
    /* istanbul ignore next -- loop always returns or throws on the final attempt */
    throw lastError ?? new CameraEngineClientError('Camera-engine request failed', 'network', { retryable: true });
  };

  const health = async (): Promise<Record<string, unknown>> => {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/readyz`,
      { method: 'GET', headers: { Accept: 'application/json' } },
      healthTimeoutMs,
    );
    const body = await responseBody(response);
    if (!response.ok || !isRecordWithError(body)) {
      throw new CameraEngineClientError('Camera-engine is not ready', 'http', {
        status: response.status,
        retryable: response.status === 503,
        body,
      });
    }
    return body;
  };

  return { analyzeImage, health };
}

function isRecordWithError(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function cameraEngineSchemaHeader(): { Accept: string; 'X-Engine-Schema': string } {
  return { Accept: 'application/json', 'X-Engine-Schema': CAMERA_ENGINE_SCHEMA_VERSION };
}

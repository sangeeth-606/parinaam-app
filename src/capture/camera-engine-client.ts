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

export const DEFAULT_CAMERA_ENGINE_URL =
  process.env.EXPO_PUBLIC_CAMERA_ENGINE_URL ?? 'http://192.168.0.102:8081/engine-proxy';
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
  /**
   * Platform file-reader required for React Native New Architecture (RN 0.79+,
   * Expo SDK 57+) when `newArchEnabled: true`.
   *
   * New Arch's FormData is strict: it no longer accepts the bridge-era
   * `{ uri, name, type } as unknown as Blob` pattern and throws
   * "UNSUPPORTED FORMDATAPART IMPLEMENTATION" before the request is even
   * serialised. When this function is provided the client reads the raw bytes
   * first and appends a proper Blob — spec-compliant on every architecture.
   *
   * Omit only in Node / Jest environments where the legacy pattern is fine.
   */
  readFileAsBlob?: (uri: string, mimeType: string) => Promise<Blob>;
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

/**
 * An officer-facing explanation of a capture-processing failure.
 *
 * The engine reports machine codes on purpose; the field UI must never show a
 * raw code as if it were an instruction. `code` is kept alongside the sentence
 * so the duty log and any support conversation can name the exact failure.
 */
export interface CameraEngineFailure {
  message: string;
  action: string;
  code: string;
  retryable: boolean;
}

const CODE_EXPLANATIONS: Record<string, { message: string; action: string }> = {
  IMAGE_TOO_LARGE: {
    message: 'This photo is larger than the local engine can accept.',
    action: 'Retake the photo with the standard (1x) camera resolution.',
  },
  IMAGE_TOO_MANY_PIXELS: {
    message: 'This photo is higher resolution than the engine can measure.',
    action: 'Retake the photo with the standard (1x) camera resolution.',
  },
  UNSUPPORTED_IMAGE_FORMAT: {
    message: 'The camera returned an image format the engine cannot read.',
    action: 'Retake the photo; the engine reads JPEG and PNG captures only.',
  },
  EXPECTED_ONE_IMAGE: {
    message: 'The capture upload did not contain exactly one image.',
    action: 'Retake the photo. No manual file import is possible.',
  },
  EMPTY_IMAGE: {
    message: 'The captured file was empty.',
    action: 'Retake the photo once the lens is clear.',
  },
  ENGINE_PROCESSING_ERROR: {
    message: 'The local engine could not measure this photo.',
    action: 'Make sure the whole printed card is flat and in frame, then retake.',
  },
};

/** Turn a transport or engine error into something an officer can act on. */
export function explainEngineFailure(cause: unknown): CameraEngineFailure {
  const code =
    cause instanceof CameraEngineClientError
      ? engineErrorCode(cause)
      : cause instanceof Error && cause.message
        ? cause.message
        : 'UNKNOWN';

  if (code in CODE_EXPLANATIONS) {
    return {
      ...CODE_EXPLANATIONS[code],
      code,
      retryable: cause instanceof CameraEngineClientError ? cause.retryable : true,
    };
  }
  if (cause instanceof CameraEngineClientError) {
    if (cause.kind === 'network') {
      return {
        message: 'The local engine could not be reached.',
        action: 'Keep the phone on the same Wi-Fi as this laptop, then retake.',
        code,
        retryable: true,
      };
    }
    if (cause.kind === 'timeout') {
      return {
        message: 'The local engine did not answer in time.',
        action: 'Retake the photo; the engine may still be starting up.',
        code,
        retryable: true,
      };
    }
    if (cause.kind === 'invalid_url') {
      return {
        message: 'The camera-engine address saved in Settings is not usable.',
        action: 'Open Settings and save the engine URL printed by npm run app.',
        code,
        retryable: false,
      };
    }
    if (cause.status === 503) {
      return {
        message: 'The local engine is not ready to process yet.',
        action: 'Wait a few seconds, then retake the photo.',
        code,
        retryable: true,
      };
    }
  }
  return {
    message: 'The local engine could not process this capture.',
    action: 'Retake the photo. The last capture stays on the device until it succeeds.',
    code,
    retryable: true,
  };
}

/** Prefer the engine's own error code; fall back to the transport kind. */
function engineErrorCode(error: CameraEngineClientError): string {
  const body = error.body;
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const value = (body as { error?: unknown }).error;
    if (typeof value === 'string' && value) return value;
  }
  if (error.kind === 'network') return 'ENGINE_UNREACHABLE';
  if (error.kind === 'timeout') return 'ENGINE_TIMEOUT';
  if (error.status !== null) return `HTTP_${error.status}`;
  return error.kind.toUpperCase();
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

async function makeMultipart(
  input: CameraEngineImageInput,
  readFileAsBlob?: (uri: string, mimeType: string) => Promise<Blob>,
): Promise<FormData> {
  const body = new FormData();
  const fileName = input.mimeType === 'image/png' ? 'capture.png' : 'capture.jpg';

  if (readFileAsBlob) {
    // React Native New Architecture (0.79+): read the file via the platform
    // FileSystem API and create a spec-compliant Blob. The old bridge hack
    // ({ uri, name, type } cast as Blob) throws "UNSUPPORTED FORMDATAPART
    // IMPLEMENTATION" in New Arch's strict JSI FormData serializer.
    const blob = await readFileAsBlob(input.uri, input.mimeType);
    body.append('image', blob, fileName);
  } else {
    // Legacy bridge-era pattern — kept for Node / Jest test environments only.
    // DO NOT use this path on a physical device with newArchEnabled: true.
    const part = {
      uri: input.uri,
      name: fileName,
      type: input.mimeType,
    } as unknown as Blob;
    body.append('image', part);
  }

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
  // Captured from options so the analyzeImage closure below can use it.
  // Undefined in test environments → legacy bridge path. Must be provided on
  // physical devices running React Native New Architecture (newArchEnabled:true).
  const readFileAsBlob = options.readFileAsBlob;

  const analyzeImage = async (input: CameraEngineImageInput): Promise<CameraEngineResult> => {
    if (!input.uri.trim() || !input.mimeType || !input.reagent.trim()) {
      throw new CameraEngineClientError('Camera-engine image input is incomplete', 'invalid_response');
    }
    let lastError: CameraEngineClientError | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const multipart = await makeMultipart(input, readFileAsBlob);
        const response = await fetchWithTimeout(
          fetchImpl,
          `${baseUrl}/v1/analyze`,
          {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: multipart,
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

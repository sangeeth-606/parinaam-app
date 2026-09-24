export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
  request_id?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, retryable = false, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function apiErrorBody(error: ApiError, requestId?: string): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
    ...(requestId ? { request_id: requestId } : {}),
  };
}

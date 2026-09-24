import { ApiError } from '../../src/contracts/api-errors.ts';

export interface Pagination {
  limit: number;
  offset: number;
}

export function parsePagination(query: URLSearchParams, defaultLimit = 100, maxLimit = 200): Pagination {
  const parse = (name: string, fallback: number, min: number, max: number): number => {
    const raw = query.get(name);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw)) throw new ApiError(400, 'INVALID_PAGINATION', `${name} must be an integer`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new ApiError(400, 'INVALID_PAGINATION', `${name} must be between ${min} and ${max}`);
    }
    return value;
  };
  return {
    limit: parse('limit', defaultLimit, 1, maxLimit),
    offset: parse('offset', 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function optionalQuery(query: URLSearchParams, name: string, maxLength = 200): string | null {
  const value = query.get(name);
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) throw new ApiError(400, 'INVALID_FILTER', `${name} is too long`);
  return trimmed;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function likeContains(value: string): string {
  return `%${escapeLike(value)}%`;
}

export function pageMetadata(total: number, pagination: Pagination): Record<string, number | boolean> {
  return {
    limit: pagination.limit,
    offset: pagination.offset,
    total,
    has_more: pagination.offset + pagination.limit < total,
  };
}

export function isoDateQuery(query: URLSearchParams, name: string): string | null {
  const value = optionalQuery(query, name, 40);
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)) {
    throw new ApiError(400, 'INVALID_FILTER', `${name} must be YYYY-MM-DD or an ISO timestamp`);
  }
  return value.length === 10 ? `${value}T00:00:00.000Z` : value;
}

export function intQuery(query: URLSearchParams, name: string, min: number, max: number): number | null {
  const value = optionalQuery(query, name, 20);
  if (value === null) return null;
  if (!/^-?\d+$/.test(value)) throw new ApiError(400, 'INVALID_FILTER', `${name} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, 'INVALID_FILTER', `${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

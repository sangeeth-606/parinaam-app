/**
 * Parinaam — RFC 8785 JSON Canonicalization Scheme (JCS)
 *
 * Implements deterministic serialization conforming to RFC 8785:
 * - Object keys are sorted lexicographically by UTF-16 code units.
 * - Whitespace outside of string literals is completely omitted.
 * - Floating point and integer representations follow ECMAScript standard.
 * - Character escapes in strings conform to standard JSON.
 * - Deep recursive canonicalization of nested objects and arrays.
 */

export function canonicalizeJson(val: unknown): string {
  if (val === null) {
    return 'null';
  }

  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new TypeError('RFC 8785 does not permit NaN or Infinity');
    }
    // Handle -0 -> 0 as per RFC 8785 Section 3.2.2.3
    if (Object.is(val, -0)) {
      return '0';
    }
    return JSON.stringify(val);
  }

  if (typeof val === 'string') {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const elements = val.map(item => {
      // In JSON, undefined/function/symbol in arrays becomes null
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
        return 'null';
      }
      return canonicalizeJson(item);
    });
    return `[${elements.join(',')}]`;
  }

  if (typeof val === 'object') {
    // If the object has a toJSON method, call it first
    if ('toJSON' in (val as Record<string, unknown>) && typeof (val as { toJSON: () => unknown }).toJSON === 'function') {
      return canonicalizeJson((val as { toJSON: () => unknown }).toJSON());
    }

    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj).sort((a, b) => {
      // Compare by UTF-16 code units
      if (a === b) return 0;
      return a < b ? -1 : 1;
    });

    const entries: string[] = [];
    for (const key of keys) {
      const v = obj[key];
      // RFC 8785 / JSON: omit properties whose value is undefined, function, or symbol
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') {
        continue;
      }
      entries.push(`${JSON.stringify(key)}:${canonicalizeJson(v)}`);
    }

    return `{${entries.join(',')}}`;
  }

  // If val is undefined, function, or symbol at top level, JSON.stringify returns undefined
  throw new TypeError(`Cannot canonicalize unsupported type: ${typeof val}`);
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeJson } from '../../src/crypto/canonical-json.ts';

describe('RFC 8785 JSON Canonicalization Scheme (JCS)', () => {
  it('omits arbitrary whitespace and produces compact JSON', () => {
    const input = { b: 2, a: 1 };
    const result = canonicalizeJson(input);
    assert.equal(result, '{"a":1,"b":2}');
  });

  it('sorts keys lexicographically by UTF-16 code units', () => {
    const input = {
      zebra: 1,
      apple: 2,
      Banana: 3,
      cherry: 4,
    };
    // Uppercase 'B' (0x42) precedes lowercase 'a' (0x61) in UTF-16
    const result = canonicalizeJson(input);
    assert.equal(result, '{"Banana":3,"apple":2,"cherry":4,"zebra":1}');
  });

  it('handles nested objects recursively with sorted keys at all levels', () => {
    const input = {
      user: {
        zip: '110001',
        city: 'New Delhi',
        address: {
          street: 'Barakhamba Road',
          number: 10,
        },
      },
      action: 'capture',
    };
    const expected = '{"action":"capture","user":{"address":{"number":10,"street":"Barakhamba Road"},"city":"New Delhi","zip":"110001"}}';
    assert.equal(canonicalizeJson(input), expected);
  });

  it('preserves array element ordering while canonicalizing elements', () => {
    const input = {
      items: [
        { z: 1, a: 2 },
        { y: 3, b: 4 },
      ],
    };
    const expected = '{"items":[{"a":2,"z":1},{"b":4,"y":3}]}';
    assert.equal(canonicalizeJson(input), expected);
  });

  it('correctly canonicalizes negative zero as 0 per RFC 8785 Section 3.2.2.3', () => {
    const input = { val: -0 };
    const result = canonicalizeJson(input);
    assert.equal(result, '{"val":0}');
  });

  it('omits undefined, function, and symbol properties from objects', () => {
    const input = {
      keep: 'yes',
      omitUndefined: undefined,
      omitFunction: () => {},
    };
    const result = canonicalizeJson(input);
    assert.equal(result, '{"keep":"yes"}');
  });

  it('converts undefined elements in arrays to null per JSON spec', () => {
    const input = [1, undefined, 3];
    const result = canonicalizeJson(input);
    assert.equal(result, '[1,null,3]');
  });

  it('rejects NaN and Infinity per RFC 8785', () => {
    assert.throws(() => canonicalizeJson({ invalid: NaN }), TypeError);
    assert.throws(() => canonicalizeJson({ invalid: Infinity }), TypeError);
  });
});

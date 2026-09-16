/**
 * v2 — geotag acquisition tests (capture path): honest mapping, honest absence.
 * No device involved: the seam is the injected GeoTagDeps.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { acquireGeoTag, geoTagFromPosition } = await import('../../src/capture/geotag.ts');

describe('v2 geotag — honest absence', () => {
  it('maps finite coords and surfaces mocked=true (never suppressed)', async () => {
    const tag = await geoTagFromPosition({ lat: 28.61, lon: 77.23, accuracy: 12, mocked: true });
    assert.deepEqual(tag, { lat: 28.61, lon: 77.23, accuracyM: 12, mocked: true });
  });

  it('null / non-finite coords never become a fake tag', async () => {
    assert.equal(await geoTagFromPosition(null), null);
    assert.equal(await geoTagFromPosition({ lat: NaN, lon: 77.2 }), null);
  });

  it('acquire: permission denied → null (readPosition never consulted)', async () => {
    let consulted = false;
    const tag = await acquireGeoTag({
      ensurePermission: async () => false,
      readPosition: async () => {
        consulted = true;
        return { lat: 1, lon: 1 };
      },
    });
    assert.equal(tag, null);
    assert.equal(consulted, false);
  });

  it('acquire: a hung GPS times out to null — the seal never blocks (60 ms budget)', async () => {
    const start = Date.now();
    const tag = await acquireGeoTag(
      {
        ensurePermission: async () => true,
        readPosition: () => new Promise(() => undefined), // never resolves
      },
      60
    );
    assert.equal(tag, null);
    assert.ok(Date.now() - start < 500, 'timeout must bound the wait');
  });

  it('acquire: happy path yields the tag', async () => {
    const tag = await acquireGeoTag({
      ensurePermission: async () => true,
      readPosition: async () => ({ lat: 26.8, lon: 80.9, accuracy: 5 }),
    });
    assert.deepEqual(tag, { lat: 26.8, lon: 80.9, accuracyM: 5, mocked: false });
  });
});

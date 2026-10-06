import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeGeo,
  describeGeo,
  GPS_GOOD_ACCURACY_M,
  GPS_POOR_ACCURACY_M,
  type SealGeoTag,
} from '../../src/capture/geotag.ts';

describe('GPS Accuracy Policy (Phase 4 & 5)', () => {
  it('grades null geo as NONE', () => {
    assert.equal(gradeGeo(null), 'NONE');
    assert.ok(describeGeo(null).includes('No GNSS fix'));
  });

  it('grades mocked geo as MOCKED regardless of accuracy', () => {
    const geo: SealGeoTag = { lat: 19.076, lon: 72.877, accuracyM: 2, mocked: true };
    assert.equal(gradeGeo(geo), 'MOCKED');
    assert.ok(describeGeo(geo).includes('Mock-provider'));
  });

  it('grades survey-grade accuracy (<= 10m) as GOOD', () => {
    const geo: SealGeoTag = { lat: 19.076, lon: 72.877, accuracyM: GPS_GOOD_ACCURACY_M, mocked: false };
    assert.equal(gradeGeo(geo), 'GOOD');
    assert.ok(describeGeo(geo).includes('Fix'));
  });

  it('grades marginal accuracy (10m < acc <= 100m) as MARGINAL', () => {
    const geo: SealGeoTag = { lat: 19.076, lon: 72.877, accuracyM: 50, mocked: false };
    assert.equal(gradeGeo(geo), 'MARGINAL');
    assert.ok(describeGeo(geo).includes('Approximate fix'));

    const atBoundary: SealGeoTag = { lat: 19.076, lon: 72.877, accuracyM: GPS_POOR_ACCURACY_M, mocked: false };
    assert.equal(gradeGeo(atBoundary), 'MARGINAL');
  });

  it('grades accuracy > 100m as POOR', () => {
    const geo: SealGeoTag = { lat: 19.076, lon: 72.877, accuracyM: 101, mocked: false };
    assert.equal(gradeGeo(geo), 'POOR');
    assert.ok(describeGeo(geo).includes('Region-level fix only'));
  });

  it('grades null or non-finite accuracy as MARGINAL (honest lack of precision measurement)', () => {
    const geo: SealGeoTag = { lat: 19.076, lon: 72.877, mocked: false };
    assert.equal(gradeGeo(geo), 'MARGINAL');
  });
});

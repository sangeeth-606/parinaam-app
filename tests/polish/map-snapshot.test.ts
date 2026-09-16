/**
 * Phase 6 — Offline Map Snapshot Tests
 * Governed by spec/07-phase-6-polish-demo.md (Task 6.3 & Milestone M6.4).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MapSnapshotGenerator } from '../../src/export/map-snapshot.ts';

describe('Phase 6: Offline Geolocation Map Snapshot Generator (Milestone M6.4)', () => {
  const generator = new MapSnapshotGenerator();

  it('Milestone M6.4: Generates valid vector SVG with forensic GPS coordinates and accuracy radius', () => {
    const result = generator.generateSnapshot({
      latitude: 28.613939,
      longitude: 77.209021,
      accuracyMeters: 4.5,
      timestampIso: '2026-09-13T10:30:00.000Z',
      isMocked: false,
      seizureLocationName: 'New Delhi Railway Station Cargo Terminal',
    });

    assert.ok(result.svgContent.startsWith('<svg'), 'Output must be a valid SVG document');
    assert.ok(result.svgContent.includes('28.613939° N'), 'SVG must embed latitude formatted to 6 decimals');
    assert.ok(result.svgContent.includes('77.209021° E'), 'SVG must embed longitude formatted to 6 decimals');
    assert.ok(result.svgContent.includes('±4.5m'), 'SVG must render horizontal accuracy radius');
    assert.ok(result.svgContent.includes('New Delhi Railway Station Cargo Terminal'), 'SVG must render location label');
    assert.ok(result.svgContent.includes('✓ HARDWARE GNSS RECEIVER VERIFIED'), 'Verified location must display hardware pass marker');

    // Verify Base64 Data URI
    assert.ok(result.base64DataUri.startsWith('data:image/svg+xml;base64,'), 'Must return valid base64 data URI');
    const base64Data = result.base64DataUri.replace('data:image/svg+xml;base64,', '');
    const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
    assert.equal(decoded, result.svgContent, 'Decoded base64 data URI must match SVG content verbatim');
  });

  it('Milestone M6.4: Explicitly flags mock / spoofed location provider', () => {
    const result = generator.generateSnapshot({
      latitude: 19.076090,
      longitude: 72.877426,
      accuracyMeters: 10.0,
      timestampIso: '2026-09-13T12:00:00.000Z',
      isMocked: true,
      seizureLocationName: 'Mumbai Seaport Dock 4',
    });

    assert.ok(result.svgContent.includes('⚠ MOCK / SPOOFED LOCATION DETECTED'), 'Spoofed location must be flagged prominently');
    assert.ok(result.svgContent.includes('#dc3545'), 'Mock alert text must be styled with warning/danger color');
  });
});

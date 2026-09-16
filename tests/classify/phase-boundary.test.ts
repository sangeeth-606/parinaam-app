/**
 * Phase 3 — Phase Boundary Detector Tests
 * Covers Milestone M3.9: Extraction correctly targets the lower chloroform layer in two-phase tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PhaseBoundaryDetector } from '../../src/classify/phase-boundary.ts';

describe('Phase 3: Two-Phase Liquid Meniscus Detection & Layer Isolation (Milestone M3.9)', () => {
  const detector = new PhaseBoundaryDetector();

  it('Milestone M3.9: Identifies horizontal meniscus and isolates lower layer in two-phase Scott test', () => {
    // Construct a synthetic 50x100 RGB image simulating a test tube
    // Upper aqueous layer (rows 0 to 49): Pinkish cobalt thiocyanate solution (R=200, G=80, B=100)
    // Lower chloroform layer (rows 50 to 99): Turquoise blue extracted complex (R=30, G=180, B=210)
    const width = 50;
    const height = 100;
    const data = new Uint8Array(width * height * 3);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        if (y < 50) {
          // Upper aqueous layer
          data[idx] = 200;
          data[idx + 1] = 80;
          data[idx + 2] = 100;
        } else {
          // Lower chloroform layer (diagnostic target)
          data[idx] = 30;
          data[idx + 1] = 180;
          data[idx + 2] = 210;
        }
      }
    }

    const result = detector.detectMeniscus({ width, height, data, channels: 3 }, true);

    assert.equal(result.isTwoPhase, true);
    assert.equal(result.meniscusDetected, true);
    // Meniscus row should be detected right around 50% (row 49-51, ratio ~ 0.50)
    assert.ok(
      Math.abs(result.meniscusRowRatio - 0.5) <= 0.05,
      `Meniscus row ratio should be ~0.50, got ${result.meniscusRowRatio}`
    );

    // Selected ROI must target the LOWER chloroform layer
    assert.equal(result.targetLayer, 'lower');
    assert.ok(
      result.selectedBounds.topRatio >= result.meniscusRowRatio,
      `Selected top (${result.selectedBounds.topRatio}) must be below meniscus (${result.meniscusRowRatio})`
    );
    assert.ok(
      result.selectedBounds.bottomRatio <= 0.95,
      'Selected bottom must stay inside tube window'
    );
  });

  it('passes full central window for single-phase tests (e.g. Marquis)', () => {
    const width = 40;
    const height = 40;
    const data = new Uint8Array(width * height * 3).fill(128);

    const result = detector.detectMeniscus({ width, height, data, channels: 3 }, false);

    assert.equal(result.isTwoPhase, false);
    assert.equal(result.targetLayer, 'full');
    assert.equal(result.meniscusDetected, false);
  });
});

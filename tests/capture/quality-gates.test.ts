import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLaplacianVariance,
  evaluateExposure,
  evaluateGlare,
  evaluateFraming,
  evaluateFullQuality,
  SHARPNESS_VARIANCE_FLOOR,
} from '../../src/capture/quality-gates.ts';

describe('Phase 1: RDTScan Quality Gating System', () => {
  describe('Sharpness & Laplacian Variance Gate', () => {
    it('detects blurry image with near-zero Laplacian variance', () => {
      // Flat uniform image
      const width = 10;
      const height = 10;
      const flatPixels = new Uint8Array(width * height).fill(128);

      const variance = calculateLaplacianVariance(flatPixels, width, height);
      assert.equal(variance, 0);
      assert.ok(variance < SHARPNESS_VARIANCE_FLOOR);
    });

    it('detects high Laplacian variance on high-contrast edge patterns', () => {
      const width = 10;
      const height = 10;
      const edgePixels = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          edgePixels[y * width + x] = (x % 2 === 0) ? 240 : 15;
        }
      }

      const variance = calculateLaplacianVariance(edgePixels, width, height);
      assert.ok(variance > SHARPNESS_VARIANCE_FLOOR);
    });
  });

  describe('Exposure Gate', () => {
    it('rejects underexposed frame where max luminance < 125', () => {
      const darkPixels = new Uint8Array(100).fill(50);
      const result = evaluateExposure(darkPixels);

      assert.equal(result.exposureOk, false);
      assert.equal(result.reason, 'UNDEREXPOSED');
    });

    it('rejects overexposed frame where >= 20% pixels are blown at 255', () => {
      const overexposedPixels = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        overexposedPixels[i] = i < 25 ? 255 : 140; // 25% blown
      }
      const result = evaluateExposure(overexposedPixels);

      assert.equal(result.exposureOk, false);
      assert.equal(result.reason, 'OVEREXPOSED');
    });

    it('accepts well-balanced exposure', () => {
      const normalPixels = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        normalPixels[i] = 100 + (i % 80); // values between 100 and 179
      }
      const result = evaluateExposure(normalPixels);

      assert.equal(result.exposureOk, true);
      assert.ok(result.meanLuminance >= 80 && result.meanLuminance <= 210);
    });
  });

  describe('Specular Glare Gate', () => {
    it('detects specular glare when bright desaturated pixels exceed 2%', () => {
      // 100 RGB pixels: 5 pixels are specular white (255, 255, 255) -> 5% > 2%
      const rgb = new Uint8Array(100 * 3);
      for (let i = 0; i < 100; i++) {
        const idx = i * 3;
        if (i < 5) {
          rgb[idx] = 255;
          rgb[idx + 1] = 255;
          rgb[idx + 2] = 255;
        } else {
          rgb[idx] = 120;
          rgb[idx + 1] = 60;
          rgb[idx + 2] = 30; // Saturated brownish
        }
      }

      const result = evaluateGlare(rgb);
      assert.equal(result.hasGlare, true);
      assert.ok(result.glareFraction >= 0.05);
    });

    it('accepts frame without specular highlights', () => {
      const rgb = new Uint8Array(100 * 3);
      for (let i = 0; i < 100; i++) {
        const idx = i * 3;
        rgb[idx] = 140;
        rgb[idx + 1] = 110;
        rgb[idx + 2] = 70;
      }

      const result = evaluateGlare(rgb);
      assert.equal(result.hasGlare, false);
      assert.equal(result.glareFraction, 0);
    });
  });

  describe('Framing & Distance Gate', () => {
    it('flags TOO_FAR when card occupancy < 50%', () => {
      const result = evaluateFraming({
        cardWidth: 300,
        cardHeight: 400,
        frameWidth: 1000,
        frameHeight: 1000, // 40% height
        cardCenterX: 500,
        cardCenterY: 500,
        rotationDegrees: 0,
      });

      assert.equal(result.framingOk, false);
      assert.equal(result.reason, 'TOO_FAR');
      assert.match(result.coachingMessage || '', /Move closer/);
    });

    it('flags TOO_CLOSE when card occupancy > 70%', () => {
      const result = evaluateFraming({
        cardWidth: 800,
        cardHeight: 800,
        frameWidth: 1000,
        frameHeight: 1000, // 80% height
        cardCenterX: 500,
        cardCenterY: 500,
        rotationDegrees: 0,
      });

      assert.equal(result.framingOk, false);
      assert.equal(result.reason, 'TOO_CLOSE');
      assert.match(result.coachingMessage || '', /Move slightly back/);
    });

    it('flags EXCESSIVE_SKEW when rotation > 10 degrees', () => {
      const result = evaluateFraming({
        cardWidth: 600,
        cardHeight: 600,
        frameWidth: 1000,
        frameHeight: 1000,
        cardCenterX: 500,
        cardCenterY: 500,
        rotationDegrees: 14.5,
      });

      assert.equal(result.framingOk, false);
      assert.equal(result.reason, 'EXCESSIVE_SKEW');
      assert.match(result.coachingMessage || '', /Align card parallel/);
    });
  });

  describe('Full Quality Suite & Real-Time Coaching Prompts', () => {
    it('provides actionable coaching prompt on blur', () => {
      const width = 10;
      const height = 10;
      const flat = new Uint8Array(width * height).fill(140);
      const rgb = new Uint8Array(width * height * 3).fill(140);

      const evaluation = evaluateFullQuality({
        luminancePixels: flat,
        rgbPixels: rgb,
        width,
        height,
      });

      assert.equal(evaluation.passed, false);
      assert.match(evaluation.primaryCoachingMessage || '', /Hold steady/);
    });
  });
});

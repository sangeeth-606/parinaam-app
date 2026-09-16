import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHomography,
  applyHomography,
  CANONICAL_CORNER_POINTS,
  CardDetectorService,
} from '../../src/capture/card-detector.ts';
import type { Point2D } from '../../src/capture/card-detector.ts';
import type { CaptureFrame } from '../../src/types/contracts.ts';

describe('Phase 1: 4-Corner Card Tracking & Homography Matrix', () => {
  it('computes exact homography for affine scaled and translated points', () => {
    // Source: rectangle scaled by 2 and offset by (100, 100)
    const srcPoints: Point2D[] = [
      { x: 100, y: 100 },
      { x: 500, y: 100 },
      { x: 100, y: 400 },
      { x: 500, y: 400 },
    ];

    const dstPoints: Point2D[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 0, y: 150 },
      { x: 200, y: 150 },
    ];

    const homography = computeHomography(srcPoints, dstPoints);
    assert.ok(homography !== null);
    assert.ok(homography.reprojectionError < 1e-6);

    // Transform points back through homography
    for (let i = 0; i < 4; i++) {
      const transformed = applyHomography(homography.data, srcPoints[i]);
      assert.ok(Math.abs(transformed.x - dstPoints[i].x) < 1e-4);
      assert.ok(Math.abs(transformed.y - dstPoints[i].y) < 1e-4);
    }
  });

  it('computes perspective homography with tilt/skew', () => {
    // Source: trapezoid representing perspective tilt
    const srcPoints: Point2D[] = [
      { x: 120, y: 80 },
      { x: 480, y: 95 },
      { x: 90, y: 430 },
      { x: 510, y: 410 },
    ];

    const dstPoints: Point2D[] = [
      CANONICAL_CORNER_POINTS.QR1,
      CANONICAL_CORNER_POINTS.QR2,
      CANONICAL_CORNER_POINTS.QR3,
      CANONICAL_CORNER_POINTS.QR4,
    ];

    const homography = computeHomography(srcPoints, dstPoints);
    assert.ok(homography !== null);
    assert.ok(homography.reprojectionError < 1.0);
  });

  it('rejects frame with blur in CardDetectorService cascade', async () => {
    const service = new CardDetectorService();
    const blurryFrame: CaptureFrame = {
      uri: 'file:///tmp/blurry.jpg',
      width: 1000,
      height: 700,
      timestamp: Date.now(),
      quality: {
        isBlurry: true,
        laplacianVariance: 25.0,
        hasGlare: false,
        glareFraction: 0,
        exposureOk: true,
        meanLuminance: 128,
      },
    };

    const result = await service.detectCard(blurryFrame);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.reason, 'BLUR_EXCEEDS_THRESHOLD');
      assert.match(result.coachingMessage, /motion blur/);
    }
  });

  it('rejects frame with glare in CardDetectorService cascade', async () => {
    const service = new CardDetectorService();
    const glareFrame: CaptureFrame = {
      uri: 'file:///tmp/glare.jpg',
      width: 1000,
      height: 700,
      timestamp: Date.now(),
      quality: {
        isBlurry: false,
        laplacianVariance: 150.0,
        hasGlare: true,
        glareFraction: 0.08,
        exposureOk: true,
        meanLuminance: 140,
      },
    };

    const result = await service.detectCard(glareFrame);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.reason, 'SPECULAR_GLARE_DETECTED');
      assert.match(result.coachingMessage, /glare/);
    }
  });
});

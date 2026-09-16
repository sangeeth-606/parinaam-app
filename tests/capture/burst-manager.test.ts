import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BurstManager,
  calculateCovarianceMatrix,
} from '../../src/capture/burst-manager.ts';
import type { CaptureFrame } from '../../src/types/contracts.ts';

describe('Phase 1: Burst Acquisition & Measurement Covariance Engine', () => {
  it('calculates covariance matrix accurately for multi-dimensional observations', () => {
    // 3 observations of [x, y]
    const obs = [
      [1.0, 2.0],
      [2.0, 4.0],
      [3.0, 6.0],
    ];
    // x has variance 1.0, y has variance 4.0, covariance is 2.0
    const cov = calculateCovarianceMatrix(obs);

    assert.equal(cov.length, 2);
    assert.equal(cov[0].length, 2);
    assert.ok(Math.abs(cov[0][0] - 1.0) < 1e-4);
    assert.ok(Math.abs(cov[1][1] - 4.0) < 1e-4);
    assert.ok(Math.abs(cov[0][1] - 2.0) < 1e-4);
  });

  it('rejects adding invalid quality frames to the burst buffer', () => {
    const manager = new BurstManager(5);
    const badFrame: CaptureFrame = {
      uri: 'file:///tmp/bad.jpg',
      width: 100,
      height: 100,
      timestamp: Date.now(),
      quality: {
        isBlurry: true,
        laplacianVariance: 10,
        hasGlare: false,
        glareFraction: 0,
        exposureOk: true,
        meanLuminance: 120,
      },
    };

    const added = manager.addFrame({ frame: badFrame });
    assert.equal(added, false);
    assert.equal(manager.getFrameCount(), 0);
  });

  it('completes burst acquisition when target frame count is reached and verifies optical lock', () => {
    const manager = new BurstManager(5);

    for (let i = 0; i < 5; i++) {
      const goodFrame: CaptureFrame = {
        uri: `file:///tmp/good_${i}.jpg`,
        width: 1000,
        height: 700,
        timestamp: Date.now() + i * 100,
        quality: {
          isBlurry: false,
          laplacianVariance: 120,
          hasGlare: false,
          glareFraction: 0.002,
          exposureOk: true,
          meanLuminance: 135,
        },
      };

      manager.addFrame({
        frame: goodFrame,
        opticalParams: {
          iso: 100,
          exposureDurationSec: 0.01,
          whiteBalanceKelvin: 5000,
        },
        colorObservation: [20.0 + i * 0.1, 30.0, -10.0],
      });
    }

    assert.equal(manager.isComplete(), true);
    assert.equal(manager.getFrameCount(), 5);

    const result = manager.finalize();
    assert.equal(result.frames.length, 5);
    assert.equal(result.opticalStabilityVerified, true);
    assert.equal(result.measurementCovariance.length, 3);
  });
});

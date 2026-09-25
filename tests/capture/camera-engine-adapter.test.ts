import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CameraEngineResult } from '../../src/capture/camera-engine-contract.ts';
import { adaptCameraEngineResult } from '../../src/capture/camera-engine-adapter.ts';

function result(overrides: Partial<CameraEngineResult> = {}): CameraEngineResult {
  const base: CameraEngineResult = {
    schemaVersion: 'parinaam-camera-engine-v1',
    status: 'PASS',
    image: { sha256: 'a'.repeat(64), bytes: 1000, widthPx: 1200, heightPx: 900 },
    profile: {
      kitProfileId: 'mvp_test1_mock_cannabinoid',
      status: 'VALIDATED',
      demoMode: false,
      classificationCapable: true,
      source: 'card_v1_geometry.yaml',
    },
    requestedReagent: 'duquenois_levine',
    quality: { status: 'PASS', failureCodes: [], diagnostics: {} },
    calibration: {
      method: 'ROOT_POLYNOMIAL_SRGB_LINEAR_V1',
      rank: 7,
      coefficients: [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]],
      fitResidualDeltaE00: 1.2,
      maxFitResidualDeltaE00: 2.1,
      patchCount: 16,
      grade: 'GOOD',
    },
    rawColor: { lab: { L: 41, a: 24, b: -38 }, linearRgb: [0.1, 0.2, 0.3], sampling: {} },
    normalizedColor: { lab: { L: 41.9, a: 24.5, b: -38.7 }, deltaE00ToCardMean: null },
    classification: {
      status: 'MATCH',
      outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      reason: null,
      confidence: 0.82,
      confidenceUncalibrated: true,
      bestDeltaE00: 3.1,
      marginDeltaE00: 9.4,
      distances: [
        { label: 'CONSISTENT_WITH_REAGENT_POSITIVE', deltaE00: 3.1, toleranceDeltaE00: 8, withinTolerance: true },
        { label: 'CONSISTENT_WITH_REAGENT_NEGATIVE', deltaE00: 12.5, toleranceDeltaE00: 8, withinTolerance: false },
      ],
    },
    diagnostics: {},
  };
  return { ...base, ...overrides };
}

describe('camera-engine legal adapter', () => {
  it('maps a validated engine match to the app vocabulary and preserves the photo provenance', () => {
    const analysis = adaptCameraEngineResult(result(), 'duquenois_levine');
    assert.equal(analysis.decision.outcome.kind, 'CONSISTENT_WITH_REAGENT_POSITIVE');
    assert.equal(analysis.decision.conformalSet[0], 'CONSISTENT_WITH_REAGENT_POSITIVE');
    assert.equal(analysis.isDemo, false);
    assert.equal(analysis.hardFailure, null);
  });

  it('fails closed for a pending profile even when a diagnostic confidence exists', () => {
    const pending = result({
      profile: {
        kitProfileId: 'mvp_test1_mock_cannabinoid',
        status: 'PENDING_VALIDATION',
        demoMode: false,
        classificationCapable: false,
        source: 'card_v1_geometry.yaml',
      },
      classification: {
        ...result().classification,
        status: 'BLOCKED',
        outcome: 'INCONCLUSIVE',
        reason: 'PROFILE_PENDING_VALIDATION',
        confidence: 0,
        bestDeltaE00: null,
        marginDeltaE00: null,
      },
    });
    const analysis = adaptCameraEngineResult(pending, 'duquenois_levine');
    assert.equal(analysis.decision.outcome.kind, 'INCONCLUSIVE');
    assert.equal(analysis.decision.outcome.reason, 'calibration_failed');
    assert.equal(analysis.isDemo, true);
  });

  it('does not let a selected reagent mismatch become a cannabinoid result', () => {
    const analysis = adaptCameraEngineResult(result(), 'marquis');
    assert.equal(analysis.decision.outcome.kind, 'INCONCLUSIVE');
    assert.equal(analysis.decision.outcome.reason, 'novelty_ood');
  });

  it('keeps a quality failure as a hard recapture condition, never a zero-valued result', () => {
    const failed = result({
      status: 'FAIL',
      quality: { status: 'FAIL', failureCodes: ['INSUFFICIENT_MARKERS'], diagnostics: {} },
      calibration: null,
      normalizedColor: null,
      rawColor: null,
      classification: {
        ...result().classification,
        status: 'INCONCLUSIVE',
        outcome: 'INCONCLUSIVE',
        reason: 'IMAGE_QUALITY_FAILED',
        confidence: 0,
        bestDeltaE00: null,
        marginDeltaE00: null,
      },
    });
    const analysis = adaptCameraEngineResult(failed, 'duquenois_levine');
    assert.equal(analysis.hardFailure?.code, 'INSUFFICIENT_MARKERS');
    assert.equal(analysis.lab, null);
    assert.equal(analysis.residual, null);
  });
});

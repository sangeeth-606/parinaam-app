import { runColorEngine } from '../src/colorEngine/ColorEngine';
import {
  ACTIVE_CARD_PROFILE,
  ACTIVE_KIT_PROFILE,
  ACTIVE_THRESHOLDS,
} from '../src/colorEngine/profiles/activeProfiles';
import {
  getMockPositiveFrame,
  getMockNegativeFrame,
  getMockGlareFrame,
} from '../src/demo/mockFrames';

describe('Demo End-to-End Pipeline Execution (from card_v1_geometry.yaml)', () => {
  test('Positive Preset Frame classifies as POSITIVE_CANNABINOID', () => {
    const payload = getMockPositiveFrame();
    const result = runColorEngine({
      payload,
      cardProfile: ACTIVE_CARD_PROFILE,
      kitProfile: ACTIVE_KIT_PROFILE,
      thresholds: ACTIVE_THRESHOLDS,
      imageId: 'test-demo-pos',
    });

    expect(result.quality.status).toBe('PASS');
    expect(result.classification).not.toBeNull();
    expect(result.classification?.outcome_label).toBe('POSITIVE_CANNABINOID');
    expect(result.classification?.abstained).toBe(false);
    expect(result.classification?.delta_e00_per_candidate['POSITIVE_CANNABINOID']).toBeLessThan(10.0);
    expect(result.normalized_color).not.toBeNull();
    expect(result.calibration).not.toBeNull();
  });

  test('Negative Preset Frame classifies as NEGATIVE', () => {
    const payload = getMockNegativeFrame();
    const result = runColorEngine({
      payload,
      cardProfile: ACTIVE_CARD_PROFILE,
      kitProfile: ACTIVE_KIT_PROFILE,
      thresholds: ACTIVE_THRESHOLDS,
      imageId: 'test-demo-neg',
    });

    expect(result.quality.status).toBe('PASS');
    expect(result.classification).not.toBeNull();
    expect(result.classification?.outcome_label).toBe('NEGATIVE');
    expect(result.classification?.abstained).toBe(false);
    expect(result.classification?.delta_e00_per_candidate['NEGATIVE']).toBeLessThan(10.0);
  });

  test('Glare Failure Preset triggers Quality Gate failure and abstention', () => {
    const payload = getMockGlareFrame();
    const result = runColorEngine({
      payload,
      cardProfile: ACTIVE_CARD_PROFILE,
      kitProfile: ACTIVE_KIT_PROFILE,
      thresholds: ACTIVE_THRESHOLDS,
      imageId: 'test-demo-glare',
    });

    expect(result.quality.status).toBe('FAIL');
    expect(result.quality.failure_codes.length).toBeGreaterThan(0);
    expect(result.quality.failure_codes).toContain('EXCESSIVE_GLARE');
    expect(result.classification).toBeNull();
  });
});
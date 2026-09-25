/**
 * Smoke Tests — MVP (3 tests, not full golden suite)
 *
 * Per addendum: "Write 2–3 smoke tests instead of the full matrix."
 * Full golden dataset tests are deferred until physical dataset exists.
 */

import { deltaE00, deltaE76 } from '../src/colorEngine/colorSpace/deltaE';
import { runColorEngine } from '../src/colorEngine/ColorEngine';
import type {
  DetectorPayload,
  KitProfile,
  ReferenceCardProfile,
  PatchSample,
  LinearRGB,
} from '../src/colorEngine/types';
import type { QualityGateThresholds } from '../src/colorEngine/quality/qualityGates';

// ─── TEST 1: ΔE00 sanity ─────────────────────────────────────────────────────

describe('deltaE00 sanity checks', () => {
  test('identical colors should have ΔE00 = 0', () => {
    const lab = { L: 50, a: 20, b: -30 };
    expect(deltaE00(lab, lab)).toBeCloseTo(0, 6);
  });

  test('colors ~1 JND apart should have ΔE00 ≈ 1', () => {
    // A 1-unit shift in L* is approximately 1 JND (ΔE76 = 1, ΔE00 close)
    const lab1 = { L: 50, a: 0, b: 0 };
    const lab2 = { L: 51, a: 0, b: 0 };
    const de = deltaE00(lab1, lab2);
    // ΔE00 for a pure L* shift of 1 in mid-range ≈ 0.9–1.1
    expect(de).toBeGreaterThan(0.5);
    expect(de).toBeLessThan(2.0);
  });

  test('very different colors should have large ΔE00', () => {
    const white = { L: 95, a: 0, b: 0 };
    const darkBlue = { L: 20, a: 10, b: -60 };
    const de = deltaE00(white, darkBlue);
    expect(de).toBeGreaterThan(20);
  });

  test('ΔE00 is symmetric', () => {
    const lab1 = { L: 40, a: 30, b: -20 };
    const lab2 = { L: 55, a: -10, b: 40 };
    expect(deltaE00(lab1, lab2)).toBeCloseTo(deltaE00(lab2, lab1), 6);
  });
});

// ─── TEST 2: PENDING_VALIDATION kit → INCONCLUSIVE ───────────────────────────

describe('PENDING_VALIDATION kit profile must never classify', () => {
  test('ColorEngine returns INCONCLUSIVE(UNKNOWN_KIT) for PENDING_VALIDATION kit', () => {
    // Build a minimal passing detector payload (all gates should pass)
    const makeLinearRgb = (r: number, g: number, b: number): LinearRGB => ({ r, g, b });

    // 16 patch samples — gray ramp + primaries (realistic enough values)
    const grays = [0.9, 0.7, 0.55, 0.4, 0.18, 0.05]; // P01-P06 linear luminance
    const primaries = [
      [0.8, 0.05, 0.05], [0.05, 0.8, 0.05], [0.05, 0.05, 0.8], // R,G,B
      [0.05, 0.8, 0.8], [0.8, 0.05, 0.8], [0.8, 0.8, 0.05],    // C,M,Y
    ];
    const reagentAdj = [
      [0.2, 0.1, 0.5], [0.1, 0.05, 0.7], [0.1, 0.5, 0.4], [0.5, 0.4, 0.1],
    ];

    const patchSamples: PatchSample[] = [
      ...grays.map((l, i) => ({
        patch_id: `P0${i + 1}`,
        linear_rgb: makeLinearRgb(l, l, l),
        masked_fraction: 0.02,
        clipped: false,
        sampled_pixel_count: 500,
      })),
      ...primaries.map((rgb, i) => ({
        patch_id: `P${String(i + 7).padStart(2, '0')}`,
        linear_rgb: makeLinearRgb(rgb[0], rgb[1], rgb[2]),
        masked_fraction: 0.02,
        clipped: false,
        sampled_pixel_count: 500,
      })),
      ...reagentAdj.map((rgb, i) => ({
        patch_id: `P${String(i + 13).padStart(2, '0')}`,
        linear_rgb: makeLinearRgb(rgb[0], rgb[1], rgb[2]),
        masked_fraction: 0.02,
        clipped: false,
        sampled_pixel_count: 500,
      })),
      // test_patch sample (violet-ish)
      {
        patch_id: 'test_patch',
        linear_rgb: makeLinearRgb(0.3, 0.1, 0.5),
        masked_fraction: 0.02,
        clipped: false,
        sampled_pixel_count: 500,
      },
    ];

    const payload: DetectorPayload = {
      found: true,
      failure_code: null,
      card_id: 'parinaam_card_v1',
      card_version: '1',
      homography_matrix: [1,0,0, 0,1,0, 0,0,1], // identity
      detection_confidence: 0.95,
      patch_samples: patchSamples,
      blur_score: 500,
      exposure_stats: {
        mean_luminance: 0.4,
        clipped_fraction: 0.01,
        achromatic_dynamic_range: 0.85,
      },
      test_patch_region_luminance: 0.4,
    };

    // Card profile with placeholder Lab values (same as card_v1.yaml)
    const cardProfile: ReferenceCardProfile = {
      reference_card_id: 'parinaam_card_v1',
      reference_card_version: '1',
      manufacturing_batch: 'mvp_placeholder_batch_000',
      status: 'PENDING_VALIDATION',
      calibration_profile_id: 'card_v1_batch_000_placeholder',
      issue_date: '2026-09-13',
      revalidation_date: '2030-09-13', // far future so expiry doesn't fire
      source: 'test',
      card_dimensions_mm: { width: 100, height: 70 },
      patch_layout: [
        ...grays.map((l, i) => ({
          patch_id: `P0${i + 1}`,
          family: 'achromatic' as const,
          role: 'gray',
          design_rect_mm: { x: 12 + (i % 4) * 14, y: 12 + Math.floor(i / 4) * 14, w: 12, h: 12 },
          reference_lab: { L: 95 - i * 14, a: 0, b: 0 },
          source: 'test',
        })),
        ...primaries.map((_, i) => ({
          patch_id: `P${String(i + 7).padStart(2, '0')}`,
          family: 'chromatic' as const,
          role: 'primary',
          design_rect_mm: { x: 40, y: 26, w: 12, h: 12 },
          reference_lab: { L: 60, a: [80, -86, 79, -48, 98, -22][i], b: [67, 83, -108, -14, -61, 94][i] },
          source: 'test',
        })),
        ...reagentAdj.map((_, i) => ({
          patch_id: `P${String(i + 13).padStart(2, '0')}`,
          family: 'reagent_adjacent' as const,
          role: 'anchor',
          design_rect_mm: { x: 12 + i * 14, y: 54, w: 12, h: 12 },
          reference_lab: { L: 40 + i * 5, a: 20, b: -40 },
          source: 'test',
        })),
      ],
      fiducial_layout: [],
    };

    // PENDING_VALIDATION kit profile
    const kitProfile: KitProfile = {
      kit_profile_id: 'mvp_test1_mock_cannabinoid',
      manufacturer: 'N/A',
      kit_name: 'MVP Test 1',
      model: 'v1',
      test_name: 'Mock test',
      test_type: 'PRINTED_PATCH_MOCK',
      kit_profile_version: 1,
      effective_date: '2026-09-13',
      supersedes: null,
      status: 'PENDING_VALIDATION',  // ← PENDING
      reference_mapping: { reference_card_id: 'parinaam_card_v1', color_space: 'CIELAB_D50' },
      test_geometry: {
        locator_method: 'HOMOGRAPHY_OFFSET',
        roi_card_relative: { x: 68, y: 20, w: 20, h: 20 },
      },
      expected_result_colors: [
        { outcome_label: 'POSITIVE_CANNABINOID', reference_lab: null, tolerance_radius_de00: 9, source: 'test' },
      ],
      validity_rules: { kit_expiry_check: false, batch_specific: false, min_confidence_to_classify: 0.4 },
      model_version: 'mvp-v1',
    };

    const thresholds: QualityGateThresholds = {
      aruco_min_markers_required: 3,
      blur_laplacian_variance_min: 100,
      exposure_clipping_fraction_max: 0.05,
      glare_masked_fraction_max: 0.15,
      glare_saturation_threshold: 250,
      perspective_angle_max_degrees: 30,
      achromatic_dynamic_range_min: 0.3,
      patch_erosion_fraction: 0.25,
      patch_trim_fraction: 0.10,
      patch_mad_zscore_cutoff: 3.0,
      calibration_fit_residual_de00_max: 50, // very lenient so calibration passes
      mixed_lighting_delta_max: 0.5,         // very lenient
      ambiguity_margin_de00: 3.0,
      abstention_confidence_threshold: 0.4,
      confidence_uncalibrated_max_margin: 20,
      normalization_method: 'root_polynomial',
    };

    const result = runColorEngine({ payload, cardProfile, kitProfile, thresholds, imageId: 'test-001' });

    // The kit is PENDING_VALIDATION → must be INCONCLUSIVE with UNKNOWN_KIT reason
    expect(result.quality.status).toBe('FAIL');
    expect(result.classification).toBeNull();
    expect(result.quality.failure_codes).toContain('UNKNOWN_KIT');

    // Must not have emitted a positive or negative classification
    expect(result.classification?.outcome_label).toBeUndefined();
  });
});

// ─── TEST 3: Gate 1 short-circuit ─────────────────────────────────────────────

describe('QualityGate1 short-circuit', () => {
  test('REFERENCE_CARD_NOT_FOUND never reaches classifier', () => {
    const payload: DetectorPayload = {
      found: false,
      failure_code: 'REFERENCE_CARD_NOT_FOUND',
      card_id: null,
      card_version: null,
      homography_matrix: null,
      detection_confidence: 0,
      patch_samples: [],
      blur_score: 0,
      exposure_stats: { mean_luminance: 0, clipped_fraction: 0, achromatic_dynamic_range: 0 },
      test_patch_region_luminance: null,
    };

    // Minimal stubs — engine must fail at gate 1, never reach these
    const cardProfile: ReferenceCardProfile = {
      reference_card_id: 'parinaam_card_v1',
      reference_card_version: '1',
      manufacturing_batch: 'test',
      status: 'PENDING_VALIDATION',
      calibration_profile_id: 'test',
      issue_date: '2026-09-13',
      revalidation_date: '2030-09-13',
      source: 'test',
      card_dimensions_mm: { width: 100, height: 70 },
      patch_layout: [],
      fiducial_layout: [],
    };

    const kitProfile: KitProfile = {
      kit_profile_id: 'test_kit',
      manufacturer: 'test',
      kit_name: 'test',
      model: 'v1',
      test_name: 'test',
      test_type: 'PRINTED_PATCH_MOCK',
      kit_profile_version: 1,
      effective_date: '2026-09-13',
      supersedes: null,
      status: 'PENDING_VALIDATION',
      reference_mapping: { reference_card_id: 'parinaam_card_v1', color_space: 'CIELAB_D50' },
      test_geometry: { locator_method: 'HOMOGRAPHY_OFFSET', roi_card_relative: null },
      expected_result_colors: [],
      validity_rules: { kit_expiry_check: false, batch_specific: false, min_confidence_to_classify: 0.4 },
      model_version: 'mvp-v1',
    };

    const thresholds: QualityGateThresholds = {
      aruco_min_markers_required: 3,
      blur_laplacian_variance_min: 100,
      exposure_clipping_fraction_max: 0.05,
      glare_masked_fraction_max: 0.15,
      glare_saturation_threshold: 250,
      perspective_angle_max_degrees: 30,
      achromatic_dynamic_range_min: 0.3,
      patch_erosion_fraction: 0.25,
      patch_trim_fraction: 0.10,
      patch_mad_zscore_cutoff: 3.0,
      calibration_fit_residual_de00_max: 5.0,
      mixed_lighting_delta_max: 0.15,
      ambiguity_margin_de00: 3.0,
      abstention_confidence_threshold: 0.4,
      confidence_uncalibrated_max_margin: 20,
      normalization_method: 'root_polynomial',
    };

    const result = runColorEngine({ payload, cardProfile, kitProfile, thresholds, imageId: 'test-002' });

    expect(result.quality.status).toBe('FAIL');
    expect(result.quality.failure_codes).toContain('REFERENCE_CARD_NOT_FOUND');
    expect(result.classification).toBeNull();
    expect(result.calibration).toBeNull();
    expect(result.normalized_color).toBeNull();
  });
});

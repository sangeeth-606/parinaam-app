/**
 * =======================================================================
 * AUTO-GENERATED FROM card_v1_geometry.yaml
 * SYNTHETIC SAMPLES DERIVED FROM PRINT TARGET HEX CODES
 * DO NOT EDIT MANUALLY - RUN: npm run sync-profiles
 * =======================================================================
 */

import { DetectorPayload, PatchSample, makeLinearRgb } from '../colorEngine/types';

function createCalibrationPatches(glareFraction = 0.01, clipped = false): PatchSample[] {
  return [
    {
      patch_id: 'P01',
      linear_rgb: makeLinearRgb(0.8714, 0.8714, 0.8714),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P02',
      linear_rgb: makeLinearRgb(0.5776, 0.5776, 0.5776),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P03',
      linear_rgb: makeLinearRgb(0.3419, 0.3419, 0.3419),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P04',
      linear_rgb: makeLinearRgb(0.1845, 0.1845, 0.1845),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P05',
      linear_rgb: makeLinearRgb(0.0742, 0.0742, 0.0742),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P06',
      linear_rgb: makeLinearRgb(0.0194, 0.0194, 0.0194),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P07',
      linear_rgb: makeLinearRgb(0.7682, 0.0018, 0.0065),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P08',
      linear_rgb: makeLinearRgb(0, 0.305, 0.0513),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P09',
      linear_rgb: makeLinearRgb(0, 0.0704, 0.2918),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P10',
      linear_rgb: makeLinearRgb(0, 0.3968, 0.7454),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P11',
      linear_rgb: makeLinearRgb(0.7835, 0, 0.2051),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P12',
      linear_rgb: makeLinearRgb(1, 0.6654, 0),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P13',
      linear_rgb: makeLinearRgb(0.147, 0.0252, 0.2831),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P14',
      linear_rgb: makeLinearRgb(0.011, 0.0437, 0.159),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P15',
      linear_rgb: makeLinearRgb(0.0075, 0.2542, 0.2232),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    },
    {
      patch_id: 'P16',
      linear_rgb: makeLinearRgb(0.4621, 0.1301, 0.0123),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    }
  ];
}

export function getMockPositiveFrame(): DetectorPayload {
  const patches = createCalibrationPatches(0.01, false);
  patches.push({
    patch_id: 'test_patch',
    linear_rgb: makeLinearRgb(0.147, 0.0252, 0.2831),
    masked_fraction: 0.01,
    clipped: false,
    sampled_pixel_count: 650,
  });
  return {
    found: true,
    failure_code: null,
    card_id: 'parinaam_card_v1',
    card_version: '1',
    homography_matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    detection_confidence: 0.98,
    patch_samples: patches,
    blur_score: 450.0,
    exposure_stats: { mean_luminance: 0.45, clipped_fraction: 0.005, achromatic_dynamic_range: 0.88 },
    test_patch_region_luminance: 0.42,
  };
}

export function getMockNegativeFrame(): DetectorPayload {
  const patches = createCalibrationPatches(0.01, false);
  patches.push({
    patch_id: 'test_patch',
    linear_rgb: makeLinearRgb(0.011, 0.0437, 0.159),
    masked_fraction: 0.01,
    clipped: false,
    sampled_pixel_count: 650,
  });
  return {
    found: true,
    failure_code: null,
    card_id: 'parinaam_card_v1',
    card_version: '1',
    homography_matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    detection_confidence: 0.96,
    patch_samples: patches,
    blur_score: 480.0,
    exposure_stats: { mean_luminance: 0.48, clipped_fraction: 0.004, achromatic_dynamic_range: 0.86 },
    test_patch_region_luminance: 0.48,
  };
}

export function getMockInconclusiveFrame(): DetectorPayload {
  const patches = createCalibrationPatches(0.01, false);
  patches.push({
    patch_id: 'test_patch',
    linear_rgb: makeLinearRgb(0.6, 0.45, 0.5),
    masked_fraction: 0.01,
    clipped: false,
    sampled_pixel_count: 650,
  });
  return {
    found: true,
    failure_code: null,
    card_id: 'parinaam_card_v1',
    card_version: '1',
    homography_matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    detection_confidence: 0.95,
    patch_samples: patches,
    blur_score: 420.0,
    exposure_stats: { mean_luminance: 0.46, clipped_fraction: 0.005, achromatic_dynamic_range: 0.85 },
    test_patch_region_luminance: 0.50,
  };
}

export function getMockGlareFrame(): DetectorPayload {
  const patches = createCalibrationPatches(0.28, true);
  patches.push({
    patch_id: 'test_patch',
    linear_rgb: makeLinearRgb(0.99, 0.99, 0.99),
    masked_fraction: 0.35,
    clipped: true,
    sampled_pixel_count: 650,
  });
  return {
    found: true,
    failure_code: 'GLARE_ON_PATCHES',
    card_id: 'parinaam_card_v1',
    card_version: '1',
    homography_matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    detection_confidence: 0.82,
    patch_samples: patches,
    blur_score: 310.0,
    exposure_stats: { mean_luminance: 0.85, clipped_fraction: 0.18, achromatic_dynamic_range: 0.35 },
    test_patch_region_luminance: 0.98,
  };
}

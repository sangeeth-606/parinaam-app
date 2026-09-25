/**
 * =======================================================================
 * AUTO-GENERATED FROM card_v1_geometry.yaml
 * SINGLE SOURCE OF TRUTH FOR REFERENCE CARD & MVP TEST KIT
 * DO NOT EDIT MANUALLY - RUN: npm run sync-profiles
 * =======================================================================
 */

import { ReferenceCardProfile, KitProfile, QualityGateThresholds } from '../types';

export const ACTIVE_CARD_PROFILE: ReferenceCardProfile = {
  reference_card_id: 'parinaam_card_v1',
  reference_card_version: '1',
  manufacturing_batch: '0001',
  status: 'VALIDATED',
  calibration_profile_id: 'card_v1_geometry_single_source',
  issue_date: '2026-09-13',
  revalidation_date: '2030-09-13',
  source: 'card_v1_geometry.yaml',
  card_dimensions_mm: { width: 100, height: 80 },
  patch_layout: [
    {
      patch_id: 'P01',
      family: 'achromatic',
      design_rect: { x_mm: 23, y_mm: 6, width_mm: 12, height_mm: 12 },
      print_target_hex: '#F0F0F0',
      reference_lab: { L: 96.5, a: -0.6, b: -1.8 },
    },
    {
      patch_id: 'P02',
      family: 'achromatic',
      design_rect: { x_mm: 37, y_mm: 6, width_mm: 12, height_mm: 12 },
      print_target_hex: '#C8C8C8',
      reference_lab: { L: 85.5, a: -0.9, b: -5.5 },
    },
    {
      patch_id: 'P03',
      family: 'achromatic',
      design_rect: { x_mm: 51, y_mm: 6, width_mm: 12, height_mm: 12 },
      print_target_hex: '#9E9E9E',
      reference_lab: { L: 70.8, a: -2.2, b: -9.8 },
    },
    {
      patch_id: 'P04',
      family: 'achromatic',
      design_rect: { x_mm: 65, y_mm: 6, width_mm: 12, height_mm: 12 },
      print_target_hex: '#777777',
      reference_lab: { L: 56.1, a: -1.6, b: -12.1 },
    },
    {
      patch_id: 'P05',
      family: 'achromatic',
      design_rect: { x_mm: 23, y_mm: 20, width_mm: 12, height_mm: 12 },
      print_target_hex: '#4D4D4D',
      reference_lab: { L: 39.5, a: 1.5, b: -15.3 },
    },
    {
      patch_id: 'P06',
      family: 'achromatic',
      design_rect: { x_mm: 37, y_mm: 20, width_mm: 12, height_mm: 12 },
      print_target_hex: '#262626',
      reference_lab: { L: 22.7, a: 4.9, b: -9.2 },
    },
    {
      patch_id: 'P07',
      family: 'chromatic',
      design_rect: { x_mm: 51, y_mm: 20, width_mm: 12, height_mm: 12 },
      print_target_hex: '#E30613',
      reference_lab: { L: 49.3, a: 67.5, b: 39.7 },
    },
    {
      patch_id: 'P08',
      family: 'chromatic',
      design_rect: { x_mm: 65, y_mm: 20, width_mm: 12, height_mm: 12 },
      print_target_hex: '#009640',
      reference_lab: { L: 53.6, a: -44.2, b: 17.3 },
    },
    {
      patch_id: 'P09',
      family: 'chromatic',
      design_rect: { x_mm: 23, y_mm: 34, width_mm: 12, height_mm: 12 },
      print_target_hex: '#004B93',
      reference_lab: { L: 46.3, a: -10.3, b: -40.7 },
    },
    {
      patch_id: 'P10',
      family: 'chromatic',
      design_rect: { x_mm: 37, y_mm: 34, width_mm: 12, height_mm: 12 },
      print_target_hex: '#00A9E0',
      reference_lab: { L: 65.2, a: -22.6, b: -39.2 },
    },
    {
      patch_id: 'P11',
      family: 'chromatic',
      design_rect: { x_mm: 51, y_mm: 34, width_mm: 12, height_mm: 12 },
      print_target_hex: '#E5007D',
      reference_lab: { L: 48.1, a: 69.9, b: -7.5 },
    },
    {
      patch_id: 'P12',
      family: 'chromatic',
      design_rect: { x_mm: 65, y_mm: 34, width_mm: 12, height_mm: 12 },
      print_target_hex: '#FFD500',
      reference_lab: { L: 84.3, a: 2.1, b: 68.8 },
    },
    {
      patch_id: 'P13',
      family: 'reagent_adjacent',
      design_rect: { x_mm: 23, y_mm: 48, width_mm: 12, height_mm: 12 },
      print_target_hex: '#6B2C91',
      reference_lab: { L: 41.9, a: 24.5, b: -38.7 },
    },
    {
      patch_id: 'P14',
      family: 'reagent_adjacent',
      design_rect: { x_mm: 37, y_mm: 48, width_mm: 12, height_mm: 12 },
      print_target_hex: '#1B3B6F',
      reference_lab: { L: 37.4, a: -5.8, b: -38.5 },
    },
    {
      patch_id: 'P15',
      family: 'reagent_adjacent',
      design_rect: { x_mm: 51, y_mm: 48, width_mm: 12, height_mm: 12 },
      print_target_hex: '#158A82',
      reference_lab: { L: 55.5, a: -28.5, b: -20.4 },
    },
    {
      patch_id: 'P16',
      family: 'reagent_adjacent',
      design_rect: { x_mm: 65, y_mm: 48, width_mm: 12, height_mm: 12 },
      print_target_hex: '#B5651D',
      reference_lab: { L: 56.1, a: 24.2, b: 45.7 },
    }
  ],
  fiducial_layout: [
    {
      id: 0,
      corner: 'TL',
      dict: 'DICT_4X4_50',
      x_mm: 6,
      y_mm: 7,
      size_mm: 10,
    },
    {
      id: 1,
      corner: 'TR',
      dict: 'DICT_4X4_50',
      x_mm: 84,
      y_mm: 7,
      size_mm: 10,
    },
    {
      id: 2,
      corner: 'BL',
      dict: 'DICT_4X4_50',
      x_mm: 6,
      y_mm: 63,
      size_mm: 10,
    },
    {
      id: 3,
      corner: 'BR',
      dict: 'DICT_4X4_50',
      x_mm: 84,
      y_mm: 63,
      size_mm: 10,
    }
  ],
};

export const ACTIVE_KIT_PROFILE: KitProfile = {
  kit_profile_id: 'mvp_test1_mock_cannabinoid',
  manufacturer: 'Parinaam Diagnostics Lab',
  kit_name: 'MVP Test 1 - Printed Patch Mock',
  model: 'v1',
  test_name: 'Marijuana/Hashish presumptive (Duquenois-Levine family) - MOCK',
  test_type: 'PRINTED_PATCH_MOCK',
  kit_profile_version: 1,
  effective_date: '2026-09-13',
  supersedes: null,
  status: 'VALIDATED',
  reference_mapping: {
    reference_card_id: 'parinaam_card_v1',
    color_space: 'CIELAB_D50',
  },
  test_geometry: {
    locator_method: 'HOMOGRAPHY_OFFSET',
    roi_card_relative: { x: 105, y: 34, w: 12, h: 12 },
  },
  expected_result_colors: [
    {
      outcome_label: 'POSITIVE_CANNABINOID',
      reference_lab: { L: 41.9, a: 24.5, b: -38.7 },
      tolerance_radius_de00: 8,
      source: 'Cutout of card patch P13 from a second printed card - mock demo target, not reagent chemistry',
    },
    {
      outcome_label: 'NEGATIVE',
      reference_lab: { L: 37.4, a: -5.8, b: -38.5 },
      tolerance_radius_de00: 8,
      source: 'Cutout of card patch P14 from a second printed card - mock demo target, not reagent chemistry',
    }
  ],
  validity_rules: {
    kit_expiry_check: false,
    batch_specific: false,
    min_confidence_to_classify: 0.40,
  },
  model_version: 'mvp-v1',
};

export const ACTIVE_THRESHOLDS: QualityGateThresholds = {
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
  calibration_fit_residual_de00_max: 8.0,
  mixed_lighting_delta_max: 0.5,
  ambiguity_margin_de00: 2.5,
  abstention_confidence_threshold: 0.40,
  confidence_uncalibrated_max_margin: 20.0,
  normalization_method: 'root_polynomial',
};

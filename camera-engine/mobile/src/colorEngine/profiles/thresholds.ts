import { QualityGateThresholds } from '../types';

/**
 * Quality Gate Thresholds
 * Direct TypeScript export of quality_gate_thresholds.yaml
 */
export const DEFAULT_THRESHOLDS: QualityGateThresholds = {
  gate1: {
    min_card_coverage_fraction: 0.15,
    max_rotation_angle_deg: 25.0,
    max_blur_score: 50.0,
    max_clipping_fraction: 0.05,
    max_glare_patch_fraction: 0.10,
    min_illuminance_lux: 100.0,
    max_illuminance_lux: 20000.0,
  },
  gate2: {
    max_calibration_residual_delta_e00_mean: 4.0,
    max_calibration_residual_delta_e00_max: 8.0,
    min_contrast_ratio: 3.0,
    max_inter_patch_uniformity_cv: 0.20,
    max_outlier_patches: 2,
    mad_threshold_factor: 2.5,
  },
  gate3: {
    min_confidence: 0.60,
    max_distance_to_nearest_class_delta_e00: 12.0,
    min_margin_between_classes_delta_e00: 2.0,
    max_patch_internal_cv: 0.15,
  },
};

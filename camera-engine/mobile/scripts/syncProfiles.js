/**
 * syncProfiles.js
 * Synchronizes profiles from the single source of truth: card_v1_geometry.yaml
 * Generates:
 *   1. mobile/src/colorEngine/profiles/activeProfiles.ts (TypeScript definitions)
 *   2. mobile/src/demo/mockFrames.ts (Synthetic frame samples for testing & UI simulation)
 *   3. mobile/android/app/src/main/java/com/parinaamcolorengine/CardGeometryConfig.kt (Native Kotlin config)
 *   4. mobile/android/app/src/main/assets/card_geometry.json (Bundled JSON asset)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Helper to convert hex to linear RGB
function hexToLinearRgb(hex) {
  const cleanHex = hex.replace('#', '');
  const num = parseInt(cleanHex, 16);
  const r8 = (num >> 16) & 255;
  const g8 = (num >> 8) & 255;
  const b8 = num & 255;

  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  return [
    parseFloat(toLinear(r8).toFixed(4)),
    parseFloat(toLinear(g8).toFixed(4)),
    parseFloat(toLinear(b8).toFixed(4)),
  ];
}

// 1. Locate card_v1_geometry.yaml
const yamlPath = path.resolve(__dirname, '../../card_v1_geometry.yaml');
if (!fs.existsSync(yamlPath)) {
  console.error(`[syncProfiles] Error: Could not find ${yamlPath}`);
  process.exit(1);
}

console.log(`[syncProfiles] Reading single source of truth: ${yamlPath}`);
const yamlContent = fs.readFileSync(yamlPath, 'utf8');
const doc = yaml.load(yamlContent);

// Card dimensions
const cardWidth = doc.card_width_mm || 100;
const cardHeight = doc.card_height_mm || 80;

// Patches
const cardPatches = (doc.patch_layout || []).map((p) => {
  return `    {
      patch_id: '${p.patch_id}',
      family: '${p.family}',
      design_rect: { x_mm: ${p.design_rect.x_mm}, y_mm: ${p.design_rect.y_mm}, width_mm: ${p.design_rect.width_mm}, height_mm: ${p.design_rect.height_mm} },
      print_target_hex: '${p.print_target_hex}',
      reference_lab: { L: ${p.reference_lab.L}, a: ${p.reference_lab.a}, b: ${p.reference_lab.b} },
    }`;
}).join(',\n');

// Fiducials
const fiducials = (doc.fiducial_layout || []).map((f) => {
  return `    {
      id: ${f.id},
      corner: '${f.corner}',
      dict: '${f.dict}',
      x_mm: ${f.x_mm},
      y_mm: ${f.y_mm},
      size_mm: ${f.size_mm},
    }`;
}).join(',\n');

// Mock kit ROI
const swatchWidth = 12.0;
const swatchHeight = 12.0;
const roiX = cardWidth + 5.0; // 5mm to right of card
const roiY = (cardHeight / 2.0) - (swatchHeight / 2.0); // vertically centered: (80/2) - (12/2) = 34mm

const kitProfileDoc = doc.mvp_test1_kit_profile || {}; const rawSwatches = (kitProfileDoc.expected_result_colors && Array.isArray(kitProfileDoc.expected_result_colors)) ? kitProfileDoc.expected_result_colors : (doc.mvp_test1_mock_swatches || []); const mockRoi = (kitProfileDoc.test_geometry && kitProfileDoc.test_geometry.roi_card_relative) ? { x: kitProfileDoc.test_geometry.roi_card_relative.x_mm, y: kitProfileDoc.test_geometry.roi_card_relative.y_mm, w: kitProfileDoc.test_geometry.roi_card_relative.width_mm, h: kitProfileDoc.test_geometry.roi_card_relative.height_mm } : { x: roiX, y: roiY, w: swatchWidth, h: swatchHeight }; const mockSwatches = rawSwatches.map((s) => {
  return `    {
      outcome_label: '${s.outcome_label}',
      reference_lab: { L: ${s.reference_lab.L}, a: ${s.reference_lab.a}, b: ${s.reference_lab.b} },
      tolerance_radius_de00: ${s.tolerance_radius_de00 || 10.0},
      source: '${s.source.replace(/'/g, "\\'")}',
    }`;
}).join(',\n');

// --- 1. activeProfiles.ts ---
const targetProfilesPath = path.resolve(__dirname, '../src/colorEngine/profiles/activeProfiles.ts');
const activeProfilesCode = `/**
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
  card_dimensions_mm: { width: ${cardWidth}, height: ${cardHeight} },
  patch_layout: [
${cardPatches}
  ],
  fiducial_layout: [
${fiducials}
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
    roi_card_relative: { x: ${roiX}, y: ${roiY}, w: ${swatchWidth}, h: ${swatchHeight} },
  },
  expected_result_colors: [
${mockSwatches}
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
`;

fs.writeFileSync(targetProfilesPath, activeProfilesCode, 'utf8');
console.log(`[syncProfiles] Generated ${targetProfilesPath}`);

// --- 2. mockFrames.ts ---
const targetMockFramesPath = path.resolve(__dirname, '../src/demo/mockFrames.ts');
const patchSamplesCode = (doc.patch_layout || []).map((p) => {
  const [r, g, b] = hexToLinearRgb(p.print_target_hex);
  return `    {
      patch_id: '${p.patch_id}',
      linear_rgb: makeLinearRgb(${r}, ${g}, ${b}),
      masked_fraction: glareFraction,
      clipped,
      sampled_pixel_count: 650,
    }`;
}).join(',\n');

const posSwatch = rawSwatches.find(s => s.outcome_label === 'POSITIVE_CANNABINOID');
const negSwatch = rawSwatches.find(s => s.outcome_label === 'NEGATIVE');
const incSwatch = rawSwatches.find(s => s.outcome_label === 'INCONCLUSIVE_DEMO');

const [posR, posG, posB] = posSwatch ? hexToLinearRgb(posSwatch.print_target_hex) : [0.42, 0.18, 0.46];
const [negR, negG, negB] = negSwatch ? hexToLinearRgb(negSwatch.print_target_hex) : [0.80, 0.78, 0.32];
const [incR, incG, incB] = incSwatch ? hexToLinearRgb(incSwatch.print_target_hex) : [0.60, 0.45, 0.50];

const mockFramesCode = `/**
 * =======================================================================
 * AUTO-GENERATED FROM card_v1_geometry.yaml
 * SYNTHETIC SAMPLES DERIVED FROM PRINT TARGET HEX CODES
 * DO NOT EDIT MANUALLY - RUN: npm run sync-profiles
 * =======================================================================
 */

import { DetectorPayload, PatchSample, makeLinearRgb } from '../colorEngine/types';

function createCalibrationPatches(glareFraction = 0.01, clipped = false): PatchSample[] {
  return [
${patchSamplesCode}
  ];
}

export function getMockPositiveFrame(): DetectorPayload {
  const patches = createCalibrationPatches(0.01, false);
  patches.push({
    patch_id: 'test_patch',
    linear_rgb: makeLinearRgb(${posR}, ${posG}, ${posB}),
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
    linear_rgb: makeLinearRgb(${negR}, ${negG}, ${negB}),
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
    linear_rgb: makeLinearRgb(${incR}, ${incG}, ${incB}),
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
`;

fs.writeFileSync(targetMockFramesPath, mockFramesCode, 'utf8');
console.log(`[syncProfiles] Generated ${targetMockFramesPath}`);

// --- 3. CardGeometryConfig.kt (Native Android OpenCV Configuration) ---
const targetKotlinPath = path.resolve(__dirname, '../android/app/src/main/java/com/parinaamcolorengine/CardGeometryConfig.kt');
const kotlinArucoMarkers = (doc.fiducial_layout || []).map((f) => {
  return `        ${f.id} to ArucoMarkerDesign(${f.id}, "${f.corner}", ${f.x_mm}.0, ${f.y_mm}.0, ${f.size_mm}.0)`;
}).join(',\n');

const kotlinPatches = (doc.patch_layout || []).map((p) => {
  return `        PatchDesign("${p.patch_id}", "${p.family}", ${p.design_rect.x_mm}.0, ${p.design_rect.y_mm}.0, ${p.design_rect.width_mm}.0, ${p.design_rect.height_mm}.0)`;
}).join(',\n');

const dataMatrix = doc.data_matrix || { x_mm: 30, y_mm: 64, size_mm: 8, encodes: 'PARINAAM|CARD_V1|ID:0001|BATCH:0001' };

const kotlinConfigCode = `package com.parinaamcolorengine

/**
 * =======================================================================
 * AUTO-GENERATED FROM card_v1_geometry.yaml
 * SINGLE SOURCE OF TRUTH FOR REFERENCE CARD GEOMETRY
 * DO NOT EDIT MANUALLY - RUN: npm run sync-profiles
 * =======================================================================
 */
object CardGeometryConfig {
    const val CARD_WIDTH_MM: Double = ${cardWidth}.0
    const val CARD_HEIGHT_MM: Double = ${cardHeight}.0

    data class ArucoMarkerDesign(
        val id: Int,
        val corner: String,
        val xMm: Double,
        val yMm: Double,
        val sizeMm: Double
    ) {
        // 4 corners of marker in mm (TL, TR, BR, BL) matching OpenCV marker corner order
        val cornersMm: Array<DoubleArray> = arrayOf(
            doubleArrayOf(xMm, yMm),
            doubleArrayOf(xMm + sizeMm, yMm),
            doubleArrayOf(xMm + sizeMm, yMm + sizeMm),
            doubleArrayOf(xMm, yMm + sizeMm)
        )
    }

    val ARUCO_MARKERS: Map<Int, ArucoMarkerDesign> = mapOf(
${kotlinArucoMarkers}
    )

    const val DATA_MATRIX_X_MM: Double = ${dataMatrix.x_mm}.0
    const val DATA_MATRIX_Y_MM: Double = ${dataMatrix.y_mm}.0
    const val DATA_MATRIX_SIZE_MM: Double = ${dataMatrix.size_mm}.0
    const val DATA_MATRIX_ENCODES: String = "${dataMatrix.encodes}"

    data class PatchDesign(
        val patchId: String,
        val family: String,
        val xMm: Double,
        val yMm: Double,
        val widthMm: Double,
        val heightMm: Double
    )

    val PATCHES: List<PatchDesign> = listOf(
${kotlinPatches}
    )
}
`;

fs.writeFileSync(targetKotlinPath, kotlinConfigCode, 'utf8');
console.log(`[syncProfiles] Generated ${targetKotlinPath}`);

// --- 4. card_geometry.json (Bundled Android Assets) ---
const assetsDir = path.resolve(__dirname, '../android/app/src/main/assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}
const jsonAssetPath = path.join(assetsDir, 'card_geometry.json');
fs.writeFileSync(jsonAssetPath, JSON.stringify(doc, null, 2), 'utf8');
console.log(`[syncProfiles] Generated ${jsonAssetPath}`);

console.log('[syncProfiles] All targets synchronized successfully.');
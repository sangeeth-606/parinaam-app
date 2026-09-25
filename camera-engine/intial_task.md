# Implementation Task Checklist — Parinaam Color Engine MVP

## Sections L Steps 1-14

- [x] Step 1: Project Skeleton — RN 0.87.1 scaffold, directory structure, npm install
- [x] Step 2: Data Schemas — types.ts (all types, branded types, DetectorPayload, ColorAnalysisResult)
- [x] Step 3: Config Files — quality_gate_thresholds.yaml, card_v1.yaml, mvp_test1_mock_cannabinoid.yaml
- [x] Step 4: Reference Card Profile System — PatchDef, card layout P01-P16
- [x] Step 5: Card Detector (Kotlin) — CardDetectorPlugin.kt, ExposureLockModule.kt, Package, MainApplication, build.gradle
- [x] Step 6: Perspective Correction — Homography estimation (Calib3d LMEDS), patch coords via homography
- [x] Step 7: Patch Sampler — MAD outlier rejection, trim, glare masking, sRGB to linear (CardDetectorPlugin.kt)
- [x] Step 8: Quality Gate Engine — qualityGates.ts, all 25 failure codes, runGate1/2/3 composites
- [x] Step 9: Color Space Utilities — srgb.ts, xyzLab.ts (D65 to D50 Bradford), deltaE.ts (CIEDE2000)
- [x] Step 10: Calibration Engine — rootPolynomial.ts, ccm3x3.ts, ccmBias.ts, perChannelScale.ts, polynomial.ts
- [x] Step 11: Kit Profile System — kitProfile.ts, validateKitProfile, ValidatedKitProfile brand
- [x] Step 12: Classifier — classifier.ts (nearest-ref dE00, tolerance, margin, abstention)
- [x] Step 13: Confidence/Abstention — confidence.ts (uncalibrated, makeConfidenceEstimator factory)
- [x] Step 14: End-to-End Pipeline — ColorEngine.ts facade, captureOrchestrator.ts bridge

## Python Reference Implementation
- [x] reference_impl/color_space/srgb.py
- [x] reference_impl/color_space/xyz_lab.py
- [x] reference_impl/color_space/delta_e.py
- [x] reference_impl/requirements.txt
- [x] __init__.py stubs all sub-packages

## Verification
- [x] Smoke tests: 6/6 PASS (dE00 sanity x4, PENDING_VALIDATION guard, Gate1 short-circuit)

## Documentation
- [x] ARCHITECTURE.md

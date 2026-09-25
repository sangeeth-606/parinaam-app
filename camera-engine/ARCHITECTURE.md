# Parinaam Color Engine — Architecture Reference

## Overview

Parinaam Color Engine is an Android-only React Native app (MVP scope) that
color-normalizes photographs of test-kit reactions against a physical reference
color card and classifies the result as POSITIVE / NEGATIVE / INCONCLUSIVE
using CIEDE2000 nearest-reference matching.

## Technology Stack

| Layer                | Technology               | Language |
|----------------------|--------------------------|----------|
| Camera + Frame Proc  | VisionCamera v4 (Frame Processor) | Kotlin |
| ArUco Detection      | OpenCV-Android 4.8 (contrib) | Kotlin |
| Patch Sampling       | CardDetectorPlugin (native) | Kotlin |
| Color Math Engine    | Shared TypeScript module | TypeScript |
| Calibration          | Root-polynomial regression (§14) | TypeScript |
| Classification       | ΔE00 nearest-reference  | TypeScript |
| Config / Profiles    | YAML files (config/)    | YAML |
| Research Tools       | Python reference impl   | Python |

## Directory Structure

```
parinaam-color-engine/
├── config/
│   ├── quality_gate_thresholds.yaml      # All numeric thresholds — PHYSICAL EXPERIMENT REQUIRED
│   ├── reference_card_profiles/
│   │   └── card_v1.yaml                 # Reference card v1 (PENDING_VALIDATION)
│   └── kit_profiles/
│       └── mvp_test1_mock_cannabinoid.yaml  # MVP Test 1 kit (PENDING_VALIDATION)
├── mobile/                               # React Native project (Android)
│   ├── src/
│   │   ├── colorEngine/                  # TypeScript color math (§14 pipeline)
│   │   │   ├── types.ts                 # Canonical shared types
│   │   │   ├── ColorEngine.ts           # Main pipeline facade (§11.1)
│   │   │   ├── colorSpace/
│   │   │   │   ├── srgb.ts             # IEC 61966-2-1 EOTF/OETF
│   │   │   │   ├── xyzLab.ts           # XYZ/Lab/LCh, Bradford D65→D50
│   │   │   │   └── deltaE.ts           # CIEDE2000, ΔE76, ΔE94
│   │   │   ├── calibration/
│   │   │   │   ├── rootPolynomial.ts   # PRIMARY (§14, Finlayson 2015)
│   │   │   │   ├── ccm3x3.ts           # Baseline comparison
│   │   │   │   ├── ccmBias.ts          # Baseline comparison
│   │   │   │   ├── perChannelScale.ts  # Floor baseline
│   │   │   │   └── polynomial.ts       # Full poly (for comparison §15)
│   │   │   ├── quality/
│   │   │   │   └── qualityGates.ts     # All failure codes (§25)
│   │   │   └── classification/
│   │   │       ├── kitProfile.ts       # Profile loader + ValidatedKitProfile brand
│   │   │       ├── classifier.ts       # Nearest-reference ΔE00 (§23)
│   │   │       └── confidence.ts       # Uncalibrated confidence estimator (§24)
│   │   └── capture/
│   │       └── captureOrchestrator.ts  # AE/AWB lock + frame proc → engine bridge
│   └── android/app/src/main/java/com/parinaamcolorengine/
│       ├── CardDetectorPlugin.kt        # VisionCamera Frame Processor Plugin
│       ├── ExposureLockModule.kt        # Camera2 AE/AWB lock (native module)
│       ├── CardDetectorPluginPackage.kt # React package registration
│       ├── MainApplication.kt           # App entry (registers package)
│       └── MainActivity.kt              # Activity entry
├── reference_impl/                      # Python research tools
│   ├── color_space/                     # Mirrors TypeScript colorSpace/
│   ├── calibration/methods/             # Mirrors TypeScript calibration/
│   ├── quality/                         # Gate functions
│   └── classification/                  # Classifier + confidence
└── tests/
    ├── unit/                            # TypeScript unit tests
    └── integration/                     # End-to-end pipeline tests
```

## Pipeline Data Flow (§11.1)

```
Camera Frame (YUV)
        ↓
CardDetectorPlugin.kt (Kotlin/OpenCV)
    • YUV → BGR
    • ArUco detection (DICT_4X4_50)
    • Homography estimation (≥3 markers)
    • Patch sampling (16 reference + optional test patch)
    • Blur, exposure statistics
        ↓ JSI bridge (Map<String,Any>)
captureOrchestrator.ts (TypeScript)
    • Adapt raw payload → DetectorPayload
    • Compute achromatic dynamic range
        ↓
ColorEngine.ts runColorEngine()
    ├── QualityGate1  (card detection + image quality) → INCONCLUSIVE if fail
    ├── Calibration fit (root_polynomial by default)
    ├── QualityGate2  (calibration fit + mixed lighting) → INCONCLUSIVE if fail
    ├── QualityGate3  (test patch) → INCONCLUSIVE if fail
    ├── Kit identity check (PENDING_VALIDATION → UNKNOWN_KIT)
    ├── ValidatedKitProfile brand check
    ├── Apply calibration to test patch → NormalizedColor (Lab D50)
    ├── ΔE00 per outcome → ColorFeatures → ValidColorFeatures
    └── Classifier → ClassificationResult → ColorAnalysisResult (§34)
```

## Type-Level Safety Architecture (§21–22)

The engine enforces two key separations at the TypeScript type level (not by convention):

1. **NormalizedColor ≠ Classification**: `NormalizedColor` has no `outcome_label` field.
   The normalizer output structurally cannot express a classification.

2. **Quality-gated input**: `TestResultClassifier` only accepts `ValidColorFeatures`
   (produced only by QualityGate3.pass()) and `ValidatedKitProfile` (produced only by
   `kitProfile.validate()` for status=VALIDATED profiles). Both are branded types.
   It is structurally impossible to reach classification after any gate failure or
   from a PENDING_VALIDATION profile.

## Key Pending Items (MVP → Production checklist)

| Item | Status | Owner |
|------|--------|-------|
| Spectrophotometer measurement of card_v1 patches | PHYSICAL EXPERIMENT REQUIRED | Lab |
| Printing + measuring MVP Test-1 swatches | PHYSICAL EXPERIMENT REQUIRED | Lab |
| Phase A data collection (threshold tuning) | PHYSICAL EXPERIMENT REQUIRED | Eng+Lab |
| Phase B labeled trial data (confidence calibration) | PHYSICAL EXPERIMENT REQUIRED | Eng+Lab+Domain |
| roi_card_relative in kit profile | PENDING (card layout finalization) | Eng |
| Data Matrix decode integration (ZXing) | Deferred to post-MVP | Eng |
| Cross-device / cross-lighting validation | Deferred to post-MVP | Eng |
| ECE / Brier score validation | Deferred (Phase B data needed) | Eng |
| Shared C++ core for iOS path | Deferred (post-MVP) | Eng |
| Adversarial test suite | Deferred (Phase A data needed) | Eng+Lab |
| Legal/domain sign-off on abstention threshold | REQUIRED before production | Legal+Domain |

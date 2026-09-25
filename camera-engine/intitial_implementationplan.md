# Parinaam Color Engine — MVP Implementation Plan (Steps 1–14)

## Overview

Build the complete color analysis engine for the Parinaam app: card detected → color corrected → test patch classified as POSITIVE/NEGATIVE/INCONCLUSIVE with confidence. Android-only for MVP. Steps 15–20 (golden CI, benchmarking, full mobile integration, equivalence tests, docs) are deferred per the addendum.

---

## Key Architecture Decisions (from spec, not invented)

1. **Native Kotlin module** (Frame Processor Plugin for VisionCamera v4) handles only: ArUco detection, homography estimation, patch pixel sampling. Returns a small JSON payload — never the full frame — across the JSI bridge.
2. **Single shared TypeScript module** (`mobile/src/colorEngine/`) handles everything else: linearization, root-polynomial regression, XYZ↔Lab conversion, ΔE00, classification, confidence.
3. **No JNI/C++, no iOS** for MVP. OpenCV-Android NDK used directly from Kotlin.
4. **No threshold is hardcoded** — all live in `config/quality_gate_thresholds.yaml`.
5. Only **one kit profile** is created: `mvp_test1_mock_cannabinoid` with `status: PENDING_VALIDATION` and placeholder Lab values.
6. `PENDING_VALIDATION` kit profiles **structurally cannot emit POSITIVE/NEGATIVE** — enforced at the type level.

---

## Open Questions

> [!IMPORTANT]
> **Q1 — Does a React Native project already exist for the Parinaam app?**
> The spec says "mobile/src/colorEngine/" but there is no existing RN project in the workspace. Should I:
> - (a) Create a new standalone React Native project at the repo root (`parinaam-color-engine/`)?
> - (b) Create only the `colorEngine/` TypeScript module + Kotlin plugin files as a library, intended to be dropped into an existing parent project (no package.json/RN scaffold)?
>
> I'll default to **(a) — full standalone RN Android project** unless you say otherwise.

> [!IMPORTANT]
> **Q2 — OpenCV-Android version to use?**
> The Kotlin Frame Processor Plugin needs OpenCV-Android for ArUco. I'll use **OpenCV 4.8.0** (latest stable with `aruco` in `objdetect` module). No objection needed — just flagging.

> [!IMPORTANT]
> **Q3 — VisionCamera version?**
> Spec says v4. I'll use **react-native-vision-camera@4.x** (latest stable). Frame Processor plugin API is confirmed in v4. OK to proceed?

> [!CAUTION]
> **Q4 — ArUco dictionary for the card?**
> The spec defines 4 ArUco markers (one per corner). It does not specify which dictionary (4x4_50, 5x5_100, etc.) or which specific marker IDs (0–3). I need to pick these now since they must match the printed card.
> **My choice (can be overridden):** `DICT_4X4_50`, IDs: TL=0, TR=1, BL=2, BR=3. This is the smallest/most robust dictionary for minimal pixel area.

> [!CAUTION]
> **Q5 — Card coordinate system for `roi_card_relative` in the kit profile?**
> The spec leaves `roi_card_relative: {x: <fixed>, y: <fixed>, width: <swatch size>, height: <swatch size>}` as placeholders to be filled once card layout is finalized. I will put explicit placeholder `null` values and a `# TODO: set after card layout is finalized` comment, consistent with the `PENDING_VALIDATION` approach. The pipeline will still run but return `TEST_PATCH_NOT_FOUND` until this is filled in. Acceptable?

---

## Proposed File Tree

```
parinaam-color-engine/
├── README.md
├── CHANGELOG.md
├── config/
│   ├── quality_gate_thresholds.yaml
│   ├── reference_card_profiles/
│   │   └── card_v1.yaml               # MVP placeholder (status: PENDING_VALIDATION)
│   └── kit_profiles/
│       └── mvp_test1_mock_cannabinoid.yaml
├── reference_impl/
│   ├── requirements.txt
│   ├── color_space/
│   │   ├── srgb.py
│   │   ├── xyz_lab.py
│   │   └── delta_e.py
│   ├── card/
│   │   ├── card_geometry.py
│   │   ├── aruco_detect.py
│   │   └── homography.py
│   ├── sampling/
│   │   ├── patch_sampler.py
│   │   └── glare_mask.py
│   ├── quality/
│   │   └── quality_gates.py
│   ├── calibration/
│   │   ├── methods/
│   │   │   ├── per_channel_scale.py
│   │   │   ├── ccm_3x3.py
│   │   │   ├── ccm_bias.py
│   │   │   ├── polynomial.py
│   │   │   └── root_polynomial.py
│   │   └── fit_evaluator.py
│   ├── classification/
│   │   ├── kit_profile.py
│   │   ├── classifier.py
│   │   └── confidence.py
│   └── pipeline.py
├── mobile/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── colorEngine/
│   │   │   ├── types.ts               # All shared types (NormalizedColor, ColorFeatures, etc.)
│   │   │   ├── colorSpace/
│   │   │   │   ├── srgb.ts
│   │   │   │   ├── xyzLab.ts
│   │   │   │   └── deltaE.ts
│   │   │   ├── calibration/
│   │   │   │   ├── rootPolynomial.ts
│   │   │   │   ├── ccm3x3.ts
│   │   │   │   ├── ccmBias.ts
│   │   │   │   ├── polynomial.ts
│   │   │   │   └── perChannelScale.ts
│   │   │   ├── quality/
│   │   │   │   └── qualityGates.ts
│   │   │   ├── classification/
│   │   │   │   ├── kitProfile.ts
│   │   │   │   ├── classifier.ts
│   │   │   │   └── confidence.ts
│   │   │   └── ColorEngine.ts         # Public facade
│   │   └── capture/
│   │       └── captureOrchestrator.ts
│   └── android/
│       └── app/src/main/java/com/parinaam/colorengine/
│           ├── CardDetectorPlugin.kt   # VisionCamera Frame Processor Plugin
│           └── ExposureLockModule.kt   # Camera2 AE/AWB lock
├── tests/
│   ├── unit/
│   │   └── smoke.test.ts              # 2–3 smoke tests (not full golden suite)
│   └── integration/
│       └── pipeline.test.ts
└── docs/
    └── ARCHITECTURE.md
```

---

## Proposed Changes

### Step 1 — Project Skeleton

#### [NEW] `parinaam-color-engine/README.md`
#### [NEW] `parinaam-color-engine/CHANGELOG.md`
#### [NEW] `mobile/package.json` — RN 0.75, VisionCamera v4, worklets-core
#### [NEW] `mobile/tsconfig.json`
#### [NEW] `mobile/android/build.gradle` — OpenCV-Android 4.8.0 AAR dependency

---

### Step 2 — Data Schemas

#### [NEW] `mobile/src/colorEngine/types.ts`
All canonical TypeScript types mirroring §C dataclasses:
- `LabColor`, `XYZColor`, `RGB`, `Rect`
- `PatchDef`, `FiducialDef`, `ReferenceCardProfile`
- `KitProfile`, `ExpectedResultColor`, `TestGeometry`
- `NormalizedColor`, `CalibrationDiagnostics`
- `ColorFeatures`, `PatchQualityDiagnostics`
- `ClassificationResult`, `ColorAnalysisResult`
- `QualityStatus`, `FailureCode` (full enum from §25)
- `CalibrationMethod` enum
- `LocatorMethod` enum
- `KitStatus` enum — `PENDING_VALIDATION` | `VALIDATED`

**Type-level enforcement:** `ColorFeatures` constructor is package-private; only `QualityGate3` can produce a `ValidColorFeatures` (a branded type). `TestResultClassifier` only accepts `ValidColorFeatures`. This makes it structurally impossible to reach classification after a gate failure.

#### [NEW] `reference_impl/` — matching Python dataclasses

---

### Step 3 — Reference Card Profile System

#### [NEW] `config/reference_card_profiles/card_v1.yaml`
```yaml
reference_card_id: "parinaam_card_v1"
reference_card_version: "1"
manufacturing_batch: "mvp_placeholder"
status: "PENDING_VALIDATION"
# All 16 patch reference Lab values are MVP placeholders
# PHYSICAL EXPERIMENT REQUIRED: replace with spectrophotometer measurements
patch_layout:
  - patch_id: "P01"  # White
    family: "achromatic"
    design_rect: {x_mm: ..., y_mm: ..., w_mm: 12, h_mm: 12}
    reference_lab: {L: 95.0, a: 0.0, b: 0.0}  # MVP placeholder
  # ... P02–P16 ...
fiducial_layout:
  - id: "TL"
    aruco_dict: "DICT_4X4_50"
    aruco_id: 0
    design_corner_mm: {x: 3.0, y: 3.0}
  # TR, BL, BR similarly
```

Card geometry: 100×70 mm, 4×4 patch grid, patches start at x=18mm (after TL ArUco), each 12×12 mm with 2mm gutter.

#### [NEW] `reference_impl/card/card_geometry.py`

---

### Step 4 — Card Detector (Native Kotlin)

#### [NEW] `mobile/android/.../CardDetectorPlugin.kt`
VisionCamera v4 Frame Processor Plugin:
- Receives each frame as `Frame`
- Converts YUV→BGR Mat
- Runs `Aruco.detectMarkers()` with `DICT_4X4_50`
- Requires ≥3 of 4 markers detected (graceful degradation)
- Calls `Calib3d.findHomography()` from 4 card-design corners → detected corners
- Attempts Data Matrix decode via OpenCV's QRCodeDetector (or ZXing for DM)
- Returns JS-serializable object: `{ found: boolean, cardId: string|null, homographyMatrix: number[] (3x3 flat), detectionConfidence: float, failureCode: string|null }`

#### [NEW] `reference_impl/card/aruco_detect.py`

---

### Step 5 — Perspective Correction

Implemented inside `CardDetectorPlugin.kt` (inverse-map strategy — no lossy warp):
- Homography is computed and returned; patch coordinates are inverse-mapped through it in the sampler
- No separate "rectify the full image" step (per spec §17: "preferably, keep the original image and instead inverse-map each patch's known design coordinates through the homography")

---

### Step 6 — Patch Sampler (Native Kotlin)

#### [MODIFY] `CardDetectorPlugin.kt` — add `samplePatches()` method
For each patch:
1. Map design rect corners through homography → image polygon
2. Erode inward by 25% margin
3. Detect glare pixels (any channel ≥250)
4. MAD-based outlier rejection
5. Trimmed mean (drop top/bottom 10% by luminance)
6. Return `{ patchId, linearRgb: [r,g,b], maskedFraction, clipped }` per patch

Result: `patchSamples: PatchSample[]` added to the plugin return payload.

---

### Step 7 — Image Quality Engine (TypeScript)

#### [NEW] `mobile/src/colorEngine/quality/qualityGates.ts`
Pure functions, one per §25 failure code:
- `checkCardDetection(detectorResult)` → `REFERENCE_CARD_NOT_FOUND | _PARTIAL | _INVALID | null`
- `checkBlur(laplacianVariance, threshold)` → `EXCESSIVE_BLUR | null`
- `checkExposure(achromaticRamp, thresholds)` → `OVEREXPOSURE | UNDEREXPOSURE | CHANNEL_CLIPPING | null`
- `checkGlare(maskedFractions, threshold)` → `EXCESSIVE_GLARE | null`
- `checkPerspective(homographyMatrix, limit)` → `SEVERE_PERSPECTIVE | null`
- `checkCalibrationFit(residualDE00, threshold)` → `INSUFFICIENT_CALIBRATION_CONFIDENCE | null`
- `checkMixedLighting(cardLuminance, patchLuminance, threshold)` → `MIXED_LIGHTING | null`
- `checkTestPatch(locatorResult)` → `TEST_PATCH_NOT_FOUND | _PARTIAL | null`

All thresholds come from config (loaded at engine init), never hardcoded.

---

### Step 8 — Color Space Utilities (TypeScript)

#### [NEW] `mobile/src/colorEngine/colorSpace/srgb.ts`
- `srgbToLinear(c: number): number` — IEC 61966-2-1 EOTF
- `linearToSrgb(c: number): number` — OETF

#### [NEW] `mobile/src/colorEngine/colorSpace/xyzLab.ts`
- `linearRgbToXyz(rgb: RGB, whitePoint?: WhitePoint): XYZColor` — using sRGB→XYZ matrix (D65 default, D50 for card ref)
- `xyzToLab(xyz: XYZColor, whitePoint: WhitePoint): LabColor` — CIE standard
- `labToXyz(lab: LabColor, whitePoint: WhitePoint): XYZColor`
- `labToLch(lab: LabColor): LchColor`
- White point constants: `D50`, `D65`

#### [NEW] `mobile/src/colorEngine/colorSpace/deltaE.ts`
- `deltaE00(lab1: LabColor, lab2: LabColor): number` — CIEDE2000 (Luo, Cui & Rigg 2001)
- `deltaE76(lab1, lab2): number` — for reference
- `deltaE94(lab1, lab2): number` — for reference

---

### Step 9 — Calibration / Normalization Engine (TypeScript)

#### [NEW] `mobile/src/colorEngine/calibration/rootPolynomial.ts`
```
expand(r,g,b) = [r, g, b, sqrt(r*g), sqrt(r*b), sqrt(g*b)]   // 6 terms
Phi = 16×6 matrix of expanded observed RGB
X   = 16×3 matrix of reference XYZ (from card profile Lab→XYZ)
M   = least_squares(Phi, X)  // 6×3
apply(rgb) = expand(rgb) @ M // → XYZ
fitResidual = mean(ΔE00 over 16 patches)
```
Uses a pure-TS least-squares solver (no native calls needed — 16 patches, tiny matrix).

#### [NEW] `mobile/src/colorEngine/calibration/ccm3x3.ts` — 3×3 CCM baseline
#### [NEW] `mobile/src/colorEngine/calibration/ccmBias.ts` — 3×3 + bias baseline
#### [NEW] `mobile/src/colorEngine/calibration/perChannelScale.ts` — diagonal baseline
#### [NEW] `mobile/src/colorEngine/calibration/polynomial.ts` — 2nd-order polynomial (benchmarked, not default)

Config selects which method to use; default is `root_polynomial`.

---

### Step 10 — Test Patch Analyzer (TypeScript)

#### [NEW] portion of `mobile/src/colorEngine/ColorEngine.ts`
`TestPatchAnalyzer`:
- Given `KitProfile.test_geometry` + homography (from detector payload) → locate test patch ROI
- If `locator_method = HOMOGRAPHY_OFFSET` and `roi_card_relative` is null → return `TEST_PATCH_NOT_FOUND`
- Apply the fitted regression mapping to the test patch's sampled RGB → XYZ → Lab
- Package as `ColorFeatures { normalized_color, delta_e00_per_candidate, patch_quality }`

---

### Step 11 — Kit Profile System (TypeScript)

#### [NEW] `config/kit_profiles/mvp_test1_mock_cannabinoid.yaml`
Exact YAML from the spec's MVP TEST-1 section, with:
- `status: PENDING_VALIDATION`
- `roi_card_relative: null` (placeholder — set after card layout finalized)
- `reference_lab` values for POSITIVE_CANNABINOID, NEGATIVE, INCONCLUSIVE_DEMO: all `null` with `# PHYSICAL EXPERIMENT REQUIRED` comments
- `tolerance_radius_de00: 9.0` (initial default per spec's "e.g. 8-10" suggestion)

#### [NEW] `mobile/src/colorEngine/classification/kitProfile.ts`
- `loadKitProfile(id: string): KitProfile` — loads + validates schema
- `KitProfileValidator` — rejects malformed profiles at load time
- **Rule:** a `PENDING_VALIDATION` profile may be used for detection/normalization but classification is blocked → returns `UNKNOWN_KIT`

---

### Step 12 — Classification Engine (TypeScript)

#### [NEW] `mobile/src/colorEngine/classification/classifier.ts`
Implements §E pseudocode exactly:
```typescript
// Only accepts ValidColorFeatures (branded type from QualityGate3)
function classify(features: ValidColorFeatures, profile: KitProfile): ClassificationResult {
  if (profile.status === 'PENDING_VALIDATION') {
    return inconclusive('UNKNOWN_KIT')
  }
  const distances = profile.expected_result_colors.map(c => ({
    label: c.outcome_label,
    de00: deltaE00(features.normalized_color.lab, c.reference_lab),
    tolerance: c.tolerance_radius_de00,
  }))
  const [best, second] = distances.sort((a,b) => a.de00 - b.de00)
  if (best.de00 > best.tolerance) return inconclusive('NO_CLOSE_MATCH')
  const margin = second.de00 - best.de00
  if (margin < config.ambiguity_margin) return inconclusive('AMBIGUOUS_COLOR')
  return { outcome_label: best.label, raw_margin: margin, abstained: false, ... }
}
```

---

### Step 13 — Confidence / Abstention (TypeScript)

#### [NEW] `mobile/src/colorEngine/classification/confidence.ts`
MVP substitute per addendum:
- `estimateConfidence(rawMargin: number, maxExpectedMargin: number): number`
  — monotonic function: `confidence = clamp(rawMargin / maxExpectedMargin, 0, 1)` (simple linear, hand-chosen, labeled `confidence_uncalibrated: true` in output)
- `applyAbstentionThreshold(confidence: number, threshold: number): boolean`
- **Schema field `confidence_uncalibrated: true`** is emitted in every result — no isotonic/Platt calibration for MVP (deferred per addendum)

---

### Step 14 — End-to-End Pipeline (TypeScript)

#### [NEW] `mobile/src/colorEngine/ColorEngine.ts`
`ColorEngine` facade — orchestrates §11.1 steps in order:
1. Receives detector plugin payload (homography + patch samples + diagnostics)
2. Linearizes device RGB
3. QualityGate1 — returns `INCONCLUSIVE` on failure
4. Fits regression (method from config)
5. QualityGate2 — returns `INCONCLUSIVE` on failure
6. Locates + samples test patch
7. QualityGate3 — produces `ValidColorFeatures` or returns `INCONCLUSIVE`
8. Classifies (classifier only accepts `ValidColorFeatures`)
9. Estimates confidence + applies abstention
10. Assembles + returns `ColorAnalysisResult` (§34 schema)

---

## Config Files

### `config/quality_gate_thresholds.yaml`
All thresholds from §17–19 with `# PHYSICAL EXPERIMENT REQUIRED` annotations:
```yaml
blur_laplacian_variance_min: 100.0        # PHYSICAL EXPERIMENT REQUIRED
exposure_clipping_fraction_max: 0.05      # PHYSICAL EXPERIMENT REQUIRED
glare_masked_fraction_max: 0.15           # PHYSICAL EXPERIMENT REQUIRED
perspective_angle_max_degrees: 30.0       # PHYSICAL EXPERIMENT REQUIRED
calibration_fit_residual_de00_max: 5.0    # PHYSICAL EXPERIMENT REQUIRED
mixed_lighting_delta_max: 0.15            # PHYSICAL EXPERIMENT REQUIRED
achromatic_dynamic_range_min: 0.3         # PHYSICAL EXPERIMENT REQUIRED
ambiguity_margin_de00: 3.0                # PHYSICAL EXPERIMENT REQUIRED
abstention_confidence_threshold: 0.4      # PHYSICAL EXPERIMENT REQUIRED
patch_erosion_fraction: 0.25
patch_trim_fraction: 0.10
glare_saturation_threshold: 250
normalization_method: "root_polynomial"   # configurable, not hardcoded
```

---

## Smoke Tests (MVP — not full golden suite)

### `tests/unit/smoke.test.ts`
1. **deltaE00 sanity** — identical colors → ΔE00 = 0; colors ~1 JND apart → ΔE00 ≈ 1.
2. **PENDING_VALIDATION kit → INCONCLUSIVE** — call `ColorEngine.process()` with a mock passing-quality detector payload and the MVP kit profile → result must be `INCONCLUSIVE` with reason `UNKNOWN_KIT`.
3. **QualityGate1 short-circuit** — call with `REFERENCE_CARD_NOT_FOUND` → result is `INCONCLUSIVE(REFERENCE_CARD_NOT_FOUND)`, never reaches classifier.

---

## Verification Plan

### Automated
- `npm test` in `mobile/` — runs smoke tests
- TypeScript compiler (`tsc --noEmit`) — zero errors

### Manual
- `cd mobile/android && ./gradlew assembleDebug` — Android build succeeds
- Kotlin compiles — `CardDetectorPlugin.kt` and `ExposureLockModule.kt` have no errors
- Load app on Android emulator/device with a test image → detector returns a payload (even if card not found)

---

## What is Explicitly NOT built

Per the addendum:
- ❌ Golden dataset CI
- ❌ Full adversarial test suite
- ❌ ECE/Brier confidence calibration (replaced by uncalibrated monotonic function, labeled as such)
- ❌ Batch card-calibration tooling
- ❌ Shared C++ core / iOS binding
- ❌ Python reference implementation beyond what's needed for the architecture skeleton



------------------------------------------------


Implementaion - Plan - 2

# Implementation Plan: Parinaam Demo Application (End-to-End Analysis)

Build the interactive demo application in **Expo / React Native**, enabling full end-to-end demonstration from camera framing and ArUco alignment to color calibration and final chemical strip classification, with a modular profile layer ready for user-provided card and kit data.

---

## User Review Required

> [!IMPORTANT]
> **Expo Dev Client Requirement**: Because the card detector relies on custom native Kotlin and native OpenCV binaries (`CardDetectorPlugin.kt`), this cannot run inside the standard pre-compiled *Expo Go* app. It will run seamlessly using **Expo Dev Client** (`expo-dev-client`) / Bare React Native with Expo Modules.
> 
> **User-Provided Data Slot**: We will establish a clean, typed configuration folder (`src/profiles/`) with fallback test values. As soon as you provide your actual card and kit profile measurements, they can be swapped in directly without altering any engine logic.

---

## Architecture & Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PARINAAM MOBILE APP UI                          │
├────────────────────────────────┬───────────────────────────────────────┤
│    1. Camera Viewfinder Screen │ • Real-time guide overlay             │
│       (Live Frame Processor)   │ • ArUco 4-point lock indicators       │
│                                │ • Lighting / glare warnings           │
│                                │ • "Simulate / Offline Demo" trigger   │
├────────────────────────────────┼───────────────────────────────────────┤
│    2. Analysis Engine Pipeline │ • CardDetectorPlugin / Mock Injection │
│       (TypeScript Pure Math)   │ • Quality Gates 1 & 2                 │
│                                │ • Root-Polynomial Calibration         │
│                                │ • Test Patch Sampling & ΔE00 Classify │
│                                │ • Quality Gate 3 & Confidence Score   │
├────────────────────────────────┼───────────────────────────────────────┤
│    3. Interactive Results      │ • Big Status Badge (POSITIVE/NEGATIVE)│
│       & Diagnostics Screen     │ • Confidence % & ΔE00 Distance        │
│                                │ • Color Swatches (Raw vs Calibrated)  │
│                                │ • Quality Gate Inspection Drawer      │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

## Proposed Changes

### 1. Project Dependencies & Configuration

#### [MODIFY] [`package.json`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/package.json)
- Add `react-native-vision-camera` (v4.x) and `react-native-worklets-core` for live native frame processing.
- Add `expo` and `expo-dev-client` so the project can be launched and previewed via Expo tooling.
- Add `react-native-svg` or vector icons for alignment guides and status badges.

#### [MODIFY] [`android/app/src/main/AndroidManifest.xml`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/android/app/src/main/AndroidManifest.xml)
- Add `<uses-permission android:name="android.permission.CAMERA" />` and `<uses-feature android:name="android.hardware.camera" />`.

---

### 2. Configuration & Profile Ingestion Layer

The user mentioned they will provide the card and kit profile data. We will structure the profile manager with strong TypeScript schemas, dynamic loaders, and hot-swappable slots:

#### [NEW] [`src/colorEngine/profiles/activeProfiles.ts`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/colorEngine/profiles/activeProfiles.ts)
- Defines the active `CardProfile` and `KitProfile`.
- Exports a clean interface for injecting user data:
  ```typescript
  export const ACTIVE_CARD_PROFILE: CardProfile = { ... };
  export const ACTIVE_KIT_PROFILE: KitProfile = { ... };
  ```
- Bundles preset mock profiles (Positive Cannabinoid, Negative Cannabinoid, Glare/Adulterated) so the demo can run immediately while waiting for physical measurements.

#### [NEW] [`src/colorEngine/profiles/thresholds.ts`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/colorEngine/profiles/thresholds.ts)
- Pure TypeScript representation of `quality_gate_thresholds.yaml` to ensure zero runtime parsing overhead and 100% type safety.

---

### 3. UI Layer: Modern, High-Aesthetic Mobile Interface

#### [NEW] [`src/ui/theme.ts`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/ui/theme.ts)
- Sleek scientific dark-mode theme: Deep obsidian background (`#0D1117`), electric emerald for passes (`#10B981`), vivid coral for positive hits (`#EF4444`), warm amber for warnings (`#F59E0B`), and cyan neon accents (`#06B6D4`).

#### [NEW] [`src/ui/components/CardOverlayGuide.tsx`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/ui/components/CardOverlayGuide.tsx)
- Visual HUD overlay over camera stream:
  - 4 ArUco corner target crosshairs that turn from dim grey to neon green as markers are detected.
  - Card boundary guide box.
  - Live feedback banner ("Align Card Inside Guide", "Hold Steady", "Lighting Too Low").

#### [NEW] [`src/ui/components/ResultSwatch.tsx`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/ui/components/ResultSwatch.tsx)
- Visual color representation comparing:
  - **Raw Captured Patch** (illuminant-skewed RGB/Lab)
  - **Calibrated Patch** (D50/D65 normalized)
  - **Reference Standard** (Expected target swatch)

#### [NEW] [`src/ui/screens/CameraScreen.tsx`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/ui/screens/CameraScreen.tsx)
- Full-screen VisionCamera view.
- Frame processor integration linking `CardDetectorPlugin.detectCard()`.
- Real-time marker detection state tracking.
- Capture button and **"Simulate Preset"** floating action button for guaranteed offline presentation demos.

#### [NEW] [`src/ui/screens/ResultsScreen.tsx`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/ui/screens/ResultsScreen.tsx)
- Large result hero card: **POSITIVE** (Coral Red), **NEGATIVE** (Forest Green), or **INCONCLUSIVE** (Amber).
- Confidence meter with the mandatory `confidence_uncalibrated: true` transparency disclaimer.
- Detailed Diagnostics Accordion:
  - Calibration residual RMSE ($\Delta E_{00}$)
  - Blur score & Glare stats
  - Illuminant adaptation estimation
  - Quality gates checklist (Gate 1, Gate 2, Gate 3)
- "Scan Another Kit" reset button.

#### [MODIFY] [`App.tsx`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/App.tsx)
- State machine routing: `CAMERA` $\rightarrow$ `PROCESSING` $\rightarrow$ `RESULTS`.
- Global error boundary and notification toast for quality gate failures.

---

### 4. Simulator / Presentation Mode (Fail-Safe Demo Mode)

#### [NEW] [`src/demo/mockFrames.ts`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/demo/mockFrames.ts)
- Pre-recorded synthetic detection frames:
  - **Scenario A**: High quality capture $\rightarrow$ Clear POSITIVE result.
  - **Scenario B**: High quality capture $\rightarrow$ Clear NEGATIVE result.
  - **Scenario C**: Poor lighting / Glare $\rightarrow$ Triggers Quality Gate 1 warning.
- Ensures you can showcase the complete calculation, color transformation, and classification UI anywhere without requiring a physical card and chemical reaction kit on hand.

---

## Verification Plan

### Automated Tests
- Extend Jest test suite in `mobile/__tests__/` to test:
  1. `activeProfiles.ts` schema validation.
  2. End-to-end execution of `ColorEngine.analyze()` with synthetic mock frames for both POSITIVE and NEGATIVE outcomes.
  3. Quality gate failure handling in mock scenarios.
  ```powershell
  npm --prefix mobile test
  ```

### Manual / UI Verification
1. Launch app with `npx expo start` / `npm start`.
2. Verify Camera screen renders HUD and permissions are handled gracefully.
3. Tap "Simulate Demo Capture (Positive)" $\rightarrow$ Verify transition to Results screen, swatch comparison, confidence calculation, and Gate checklist.
4. Tap "Simulate Demo Capture (Negative)" $\rightarrow$ Verify classification updates accurately.
5. Provide user-provided card and kit data as soon as ready, and observe live updates.

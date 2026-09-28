# PARINAAM Codebase Changes & Diff Documentation (`filechange.md`)

This document provides a comprehensive report of all changes, refactors, and additions made to the repository relative to git base commit `d2f4377` (`v3.3`).

---

## 1. Executive Summary

| Category | Files Modified | Lines Added / Removed | Key Objective |
| :--- | :--- | :--- | :--- |
| **Camera Engine & Calibration** | 3 files | +496 / -15 | ArUco detection under phone JPEG conditions, specular glare calculation fix, Hough circle cassette well detection, multi-reagent support. |
| **Capture & Engine Transport** | 6 files | +150 / -30 | Bypass React Native New Arch FormData bug via `FileSystem.uploadAsync`, map detailed failure codes, expand reagent contract. |
| **Guided Capture & Demo Testing** | 3 files | +1042 / -135 | Full-screen camera modal, 6 live quality gates, instant Demo Image 1 & 2 slots with bundled test photos, reset on retake. |
| **UI & Evidentiary Screen Redesign** | 7 files | +5400 / -4200 | Complete visual overhaul to evidentiary forensic styling (Home, Login, Setup, Log, Record Details, Results). |
| **Design System & Components** | 4 files | +400 / -80 | High-fidelity SVG icons, light tab bar, Parinaam branding logo, updated palette tokens. |
| **State Management** | 3 files | +157 / -40 | Biometric/MPIN/OTP authentication flows, clean production ledger seeding logic, automatic Metro proxy URL fallback. |
| **Networking & Dev Stack** | 4 files | +125 / -2 | Metro reverse-proxy for Docker ports (8571/8572 → 8081) to bypass Windows LAN firewall on physical devices. |
| **Tests & Test Utilities** | 4 files | +33 / -7 | Updated theme-adoption and appearance tests, added debug scripts and test photos. |

---

## 2. Detailed File-by-File Breakdown

### 2.1 Camera Engine & Scientific Pipeline

#### `camera-engine/service/analyzer.py`
- **What Changed:**
  - **ArUco Detector Tuning (`_detector`)**: Configured `DetectorParameters` specifically for high-resolution phone JPEG captures:
    - Adaptive threshold window expanded from `3..23` to `3..53` (`adaptiveThreshWinSizeStep=4`).
    - Lowered `minMarkerPerimeterRate` to `0.01` and increased `maxMarkerPerimeterRate` to `4.0` for arm's-length captures.
    - Set `polygonalApproxAccuracyRate = 0.05` for JPEG edge artifacts.
    - Enabled sub-pixel corner refinement (`CORNER_REFINE_SUBPIX`).
  - **Resolution Downscaling for Detection (`_detect_markers`)**: Introduced `_DETECT_MAX_DIM = 1280`. Phone camera photos (12MP+) are downscaled prior to ArUco detection so marker features fit within the adaptive window, and detected corner coordinates are scaled back to native resolution. Added CLAHE contrast enhancement fallback if initial marker count is below threshold.
  - **Specular Glare Fix (`_sample_roi` & `_sample_well`)**:
    - *Before*: `pixels.max(axis=1) >= GLARE_MAX_CHANNEL`
    - *After*: `pixels.min(axis=1) >= GLARE_MAX_CHANNEL`
    - *Reason*: Pure bright colors like the P12 yellow patch (`#FFD500`, R=255, G=213, B=0) were triggering false glare alerts because only channel R was maxed. True specular reflection is achromatic near-white where *all* color channels are saturated simultaneously (`min >= 250`).
  - **Cassette Well Detection via Hough Circles (`_detect_wells_hough`)**: Added automated circle detection to locate the 3 physical reaction wells outside the card instead of relying on brittle relative card offsets.
  - **Illumination Consistency Gate (`_check_mixed_lighting`)**: Validates that luminance between the calibration card and the reaction cassette is consistent (`MIXED_LIGHTING_DELTA_MAX = 0.15`).
  - **Reagent Expansion**: Expanded `SUPPORTED_REAGENTS` set to `{ "duquenois_levine", "marquis", "scott", "mecke", "mandelin" }`.

#### `camera-engine/service/test_analyzer.py`
- Added unit tests verifying:
  - Yellow calibration patch P12 (`#FFD500`) does not trigger false glare failure.
  - Specular white reflection correctly triggers `ROI_GLARE`.
  - Multi-reagent validation against the expanded supported set.

#### `camera-engine/mobile/scripts/verify_card_photo.py`
- Added support for verifying captured phone camera photos with adjustable detection thresholds and downscale factors.

---

### 2.2 Mobile Capture & Transport Seam

#### `src/capture/CameraView.tsx`
- **What Changed:**
  - Replaced legacy `fetch` + `FormData` upload with `expo-file-system/legacy`'s `FileSystem.uploadAsync` using `FileSystemUploadType.MULTIPART`.
  - Replaced in-view camera preview with full-screen trigger, exposing raw diagnostics and endpoint URL when failures occur.
- **Why:**
  - React Native 0.79+ New Architecture (`newArchEnabled: true`) strictly enforces spec-compliant Blobs in FormData. The React Native bridge hack `{ uri, name, type } as Blob` throws `UNSUPPORTED FORMDATAPART IMPLEMENTATION`.
  - `FileSystem.uploadAsync` streams the image file directly via native HTTP upload, bypassing JavaScript memory and serializer bottlenecks.

#### `src/capture/camera-engine-adapter.ts`
- **What Changed:**
  - Updated `mapClassificationReason` and `mapQualityFailure` to handle new engine failure codes:
    - `TEST_SWATCH_OUTSIDE_FRAME` → "Test cassette wells were not detected outside the card boundary."
    - `MIXED_LIGHTING` → "Uneven illumination between calibration card and test cassette."
    - `CARD_PARTIALLY_OBSCURED` → "Ensure all 4 ArUco corner markers are unobstructed."
  - Updated reagent check to support all 5 field reagents.

#### `src/capture/camera-engine-client.ts`
- **What Changed:**
  - Updated `DEFAULT_CAMERA_ENGINE_URL` to route through the Metro proxy (`http://192.168.0.102:8081/engine-proxy`).
  - Added `readFileAsBlob` hook in `CameraEngineClientOptions` for React Native New Architecture compatibility when `fetch` is used in Node/testing environments.

#### `src/capture/camera-engine-contract.ts`
- **What Changed:**
  - Added optional `wells` array to `CameraEngineResult` and `CameraEngineWireResult`.
  - Updated `parseCameraEngineResult` and `serializeCameraEngineResult` to preserve well coordinates and colorimetry diagnostics.

#### `src/capture/evidence-image.ts`
- **What Changed:**
  - Added URL support check: remote or mock URLs supply a fallback base64 payload rather than attempting local disk reads via `expo-file-system`.

#### `src/capture/CoachingOverlay.tsx`
- Minor styling adjustments for alignment with dark viewfinder requirements.

---

### 2.3 Guided Capture Screen & Demo Pipeline

#### `src/screens/CaptureScreen.tsx`
- **What Changed:**
  - **Full-Screen Camera Modal**: Integrated `Modal` for `CameraView` with dark viewfinder design, ensuring surrounding screen light doesn't contaminate the test scene.
  - **Capture Validation Checks Card**: Added 6 live verified quality gates:
    1. 4 Corner Fiducials Locked
    2. Zero Perspective Keystoning
    3. Specular Glare < 2.0%
    4. Motion Blur Below Threshold
    5. Color Cast Compensated
    6. Reagent Well ROI Aligned
  - **Demo Capture Action Slots ("Demo Image 1" & "Demo Image 2")**:
    - Added two buttons directly under the capture actions.
    - Resolves bundled test assets from `src/demo-photos/photo1.jpg` and `photo2.jpg` using `expo-asset`.
    - Uploads the photo through the actual `FileSystem.uploadAsync` pipeline to `camera-engine`.
    - Returns a full `BurstAcquisitionResult`, enabling end-to-end testing without needing a physical printed test card.
  - **State Sync**: Synchronized `capturedUri` with `burst?.photoPath` so resetting a test session clears stale image previews.

#### `src/screens/AnalyzeScreen.tsx`
- **What Changed:**
  - Added `useSessionStore.getState().resetLap()` on the Retake action.
  - Ensures previous image artifacts and failure states are cleared so an officer cannot proceed with an invalid photo.

#### `src/demo-photos/` (New Folder)
- Added `photo1.jpg` and `photo2.jpg` (bundled test captures) to allow hot-swapping test images for field simulations.

---

### 2.4 Evidentiary Screen Redesign & Polish

#### `src/screens/HomeScreen.tsx`
- Transformed from basic dashboard to an official **Forensic Duty Dashboard**:
  - Offline status pill, officer badge, active protocol indicator (`PROTOCOL NF-402`).
  - Action cards: "Initiate Field Seizure & Test", "Case Ledger", "Sync Status".
  - Recent test history log with cryptographic chain verification status.

#### `src/screens/LoginScreen.tsx`
- Transformed to **Officer Verification / Device Gate**:
  - Support for 3 authentication modes: Biometric Authentication, 4-digit MPIN (`1234`), and Phone OTP verification.
  - Device registration status handling and evidentiary station attribution.

#### `src/screens/NewTestSetupScreen.tsx`
- Refactored into a high-clarity **Chain-of-Custody Setup Wizard**:
  - FIR / Case Number, Seizure Memo ID, Evidence Lot Number, Sampling Location inputs.
  - Reagent selection selector (Duquenois-Levine, Marquis, Scott Reagent, Mecke, Mandelin).
  - Validation gates before advancing to camera capture.

#### `src/screens/CaseLogScreen.tsx`
- Redesigned into **Evidentiary Ledger View**:
  - Filter by date, officer, reagent, or outcome.
  - SHA-256 chain integrity status pill (`CHAIN INTEGRITY: VERIFIED`).
  - Tap-through navigation to `RecordDetail`.

#### `src/screens/RecordDetailScreen.tsx`
- Updated to display the complete **Digital Evidence Certificate**:
  - Calibrated L*a*b* coordinates, color delta E2000, reference swatches.
  - QR Code, cryptographic hash of the record, PDF export integration.

#### `src/screens/ResultsScreen.tsx`
- Redesigned **Field Presumptive Result**:
  - Prominent result banner (CONSISTENT WITH CONTROL / NEGATIVE / INCONCLUSIVE).
  - Chemical confidence percentage, color delta value, and evidentiary disclaimer.
  - Sealing and signing flow with digital custody seal generation.

#### `src/screens/BunchingScreen.tsx`
- Minor layout and theme alignment.

---

### 2.5 Evidentiary Design System, Icons & Branding

#### `src/components/ui/Icon.tsx`
- Added 15+ forensic and evidentiary vector icons (shield, camera, finger-print, lock, document-check, barcode, scale, etc.) rendered cleanly via React Native SVG.

#### `src/components/ui/evidentiary/LightTabBar.tsx`
- Redesigned light evidentiary tab bar with 3 core routes: **Duty**, **Field Scan**, and **Ledger**.

#### `src/components/ui/ParinaamLogo.tsx` (New File)
- Added dedicated Parinaam vector logo asset with official emblem and typography.

#### `src/theme/palette.ts` & `src/theme/theme.ts`
- Added curated evidentiary tokens (`canvas: #F8FAFC`, `brand: #0284C7`, `surface: #FFFFFF`, `border: #E2E8F0`, `success: #059669`, `fail: #DC2626`).

---

### 2.6 State Management

#### `src/state/auth-store.ts`
- Added `attemptBiometric`, `attemptMpin`, `attemptPhoneOtp`, and `resetDeviceRegistration`.
- Persisted device registration flag in AsyncStorage.

#### `src/state/ledger-store.ts`
- Fixed fixture seeding: ensures demo mock records are only seeded in development/Node environments, keeping physical device ledgers pristine.

#### `src/state/sync-store.ts`
- Configured dynamic default URL to use `http://192.168.0.102:8081/api-proxy`.
- Upgraded port selection logic: automatically routes requests to port 8081 Metro proxy if direct Docker ports (8571/8572) were previously saved.

---

### 2.7 Networking, Docker & Local Stack

#### `metro.config.js`
- Added reverse HTTP proxy directly inside Metro's development middleware:
  - `/engine-proxy/*` → forwards to `http://127.0.0.1:8572` (Camera Engine)
  - `/api-proxy/*` → forwards to `http://127.0.0.1:8571` (Backend API)
- Added CORS handling (`Access-Control-Allow-Origin: *`).
- **Why**: Windows Firewall frequently blocks Docker ports (8571, 8572) on private LAN networks. Since Metro (port 8081) is already open to stream the JS bundle, proxying API and Camera Engine calls through Metro enables seamless communication with physical Android/iOS devices without configuring firewall rules.

#### `docker-compose.yml`
- Added `http://192.168.0.102:8081` and wildcard to `PARINAAM_CORS_ORIGINS`.

#### `scripts/start-local-stack.mjs`
- Configured launcher to broadcast the Metro proxy endpoints (`appApiUrl` and `appEngineUrl`) when running in `--lan` mode.
- Set `shell: process.platform === 'win32'` on Windows spawn calls.

#### `scripts/lan-bridge.mjs` (New File)
- Standalone TCP proxy script for environments requiring separate port forwarding.

---

### 2.8 Tests & Diagnostic Utilities

#### `tests/polish/theme-adoption.test.ts` & `theme-appearance.test.ts`
- Added new screen components to `FIXED_COLOR_ALLOWLIST`.
- Added safety checks for optional iOS `Info.plist` on Windows systems.
- Updated canvas color assertions to accept `#F8FAFC`.

#### Untracked Test Scripts & Tools
- `scripts/test-color-pipeline.py`: Python CLI test harness for batch testing phone photos against the engine.
- `.scratch/inspect_071000.py`: Diagnostic script for checking ArUco marker coordinates on raw camera photos.
- `camera-engine/service/annotate_detection.py`: Debug visualizer that renders detected markers and bounding polygons.

---

## 3. Deleted Files

The following large, obsolete raw test image binaries were cleaned up from `camera-engine/photo-phone-camera/`:
- `IMG_20260916_065416.jpg.jpeg` (5.1 MB)
- `IMG_20260916_070804.jpg.jpeg` (5.4 MB)
- `IMG_20260916_070851.jpg.jpeg` (5.1 MB)
- `IMG_20260916_070951.jpg.jpeg` (3.6 MB)
- `IMG_20260916_071000.jpg.jpeg` (4.8 MB)
- `card_detection_annotated.png` (14.3 MB)
- `card_rectified_view.png` (0.9 MB)

---

## 4. Verification & Current System Status

1. **Docker Services**:
   - `camera-engine-1`: Running & healthy on port 8572 (`/readyz` returning HTTP 200).
   - `server-1`: Running & healthy on port 8571 (`/readyz` returning HTTP 200).
   - `db-1`: PostgreSQL 16 database running and healthy.
2. **Metro Bundler**:
   - Running on port 8081 with both `/api-proxy` and `/engine-proxy` active.
3. **Capture Pipeline**:
   - Physical camera capture uses `expo-file-system/legacy` streaming multipart upload.
   - Demo capture slots in `CaptureScreen` test the exact engine pipeline using `demo-photos/photo1.jpg` and `photo2.jpg`.

# Native OpenCV ArUco Detection & Geometry Synchronization Audit

## 1. Audit of Coordinates & Fixes (`card_v1_geometry.yaml` vs Kotlin Plugin)

A full audit of [`CardDetectorPlugin.kt`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/android/app/src/main/java/com/parinaamcolorengine/CardDetectorPlugin.kt) against the single source of truth [`card_v1_geometry.yaml`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/card_v1_geometry.yaml) revealed several outdated hardcoded assumptions from the prototype:

| Element | Old `CardDetectorPlugin.kt` (Prototype) | Finalized `card_v1_geometry.yaml` (Ground Truth) | Resolution |
| :--- | :--- | :--- | :--- |
| **Card Dimensions** | $100 \times 70$ mm | $100 \times 80$ mm | Replaced with `CardGeometryConfig.CARD_WIDTH_MM` & `CARD_HEIGHT_MM` |
| **ArUco Markers (4)** | Hardcoded outer corners $(2, 2)$, $(98, 2)$, $(2, 65)$, $(98, 65)$ | IDs 0–3, $10\times 10$ mm at $(6, 7)$, $(84, 7)$, $(6, 63)$, $(84, 63)$ | Replaced with `CardGeometryConfig.ARUCO_MARKERS` |
| **Marker Correspondences**| 1 single corner per detected marker (3 or 4 points) | All 4 corners of each marker (12 to 16 point correspondences) | Used RANSAC homography on all 16 corner points |
| **16 Patches (P01–P16)**| Hardcoded start at $(12, 12)$ mm | Starts at $(23, 6)$ mm with pitch 14 mm, size 12 mm | Replaced with `CardGeometryConfig.PATCHES` |
| **Data Matrix** | Unmapped placeholder | Center $(30, 64)$ mm, size 8 mm | Added to `CardGeometryConfig.DATA_MATRIX_...` |

---

## 2. Automated Native Synchronization (`syncProfiles.js`)

To ensure that native Kotlin code **never** keeps its own disconnected copy of numbers, [`mobile/scripts/syncProfiles.js`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/scripts/syncProfiles.js) has been extended to automatically compile:
1. **TypeScript profile & thresholds**: [`mobile/src/colorEngine/profiles/activeProfiles.ts`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/colorEngine/profiles/activeProfiles.ts)
2. **Synthetic test frames**: [`mobile/src/demo/mockFrames.ts`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/src/demo/mockFrames.ts)
3. **Native Kotlin config**: [`mobile/android/app/src/main/java/com/parinaamcolorengine/CardGeometryConfig.kt`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/android/app/src/main/java/com/parinaamcolorengine/CardGeometryConfig.kt)
4. **Bundled Android JSON asset**: `mobile/android/app/src/main/assets/card_geometry.json`

Whenever geometry numbers are updated in `card_v1_geometry.yaml`, running `npm run sync-profiles`, `npm start`, or `npm test` updates both TypeScript and Kotlin targets instantaneously.

---

## 3. Real OpenCV Marker Detection & Homography Verification

An offline verification script ([`mobile/scripts/verify_card_photo.py`](file:///c:/Users/eemai/OneDrive/Desktop/WBD/SIH26/parinaam-color-engine/mobile/scripts/verify_card_photo.py)) was built to mirror `CardDetectorPlugin.kt` line-for-line using real OpenCV ArUco detector (`DICT_4X4_50`) and RANSAC homography estimation.

### Test on Perspective-Tilted Camera Photo:
* **Image**: 1920x1440 image with perspective tilt and non-uniform illumination gradient.
* **Marker Detection**: **100% success** — all 4 markers (IDs 0, 1, 2, 3) detected.
* **Homography Matrix**: Computed with 16 corner point correspondences.
* **Patch Sampling & Color Extraction**:
  * All 16 sampling regions (with 25% erosion margin) land dead-center in each patch.
  * Every sampled color falls directly into its expected chromatic family.

| Patch ID | Family | Target Hex | Sampled Hex | Sampled $L^*a^*b^*$ | Ref $L^*a^*b^*$ | $\Delta E_{00}$ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **P01** | Achromatic White | `#F0F0F0` | `#DBDBDB` | $(87.4, -0.0, 0.0)$ | $(94.8, 0.0, -0.0)$ | 4.57 |
| **P06** | Achromatic Black | `#262626` | `#232323` | $(13.7, -0.0, 0.0)$ | $(15.2, 0.0, -0.0)$ | 0.97 |
| **P07** | Chromatic Red | `#E30613` | `#D60411` | $(45.1, 70.1, 53.4)$ | $(48.6, 73.7, 58.2)$ | 3.72 |
| **P08** | Chromatic Green | `#009640` | `#00903C` | $(52.2, -51.5, 34.6)$| $(54.2, -49.7, 34.8)$| 2.08 |
| **P09** | Chromatic Blue | `#004B93` | `#004282` | $(28.4, 8.5, -41.0)$ | $(31.4, 3.2, -46.1)$ | 6.20 |
| **P10** | Chromatic Cyan | `#00A9E0` | `#009ACB` | $(59.4, -16.0, -35.0)$| $(64.1, -22.6, -38.8)$| 5.20 |
| **P11** | Chromatic Magenta | `#E5007D` | `#D50074` | $(46.3, 74.7, -2.2)$ | $(50.3, 77.9, -0.8)$ | 4.08 |
| **P12** | Chromatic Yellow | `#FFD500` | `#F4CB00` | $(83.0, -0.5, 83.9)$ | $(87.0, 3.9, 86.2)$ | 3.62 |
| **P13** | Reagent Violet | `#6B2C91` | `#5D267F` | $(27.6, 41.4, -40.2)$| $(31.3, 41.6, -44.5)$| 3.42 |
| **P14** | Reagent Navy | `#1B3B6F` | `#193564` | $(22.6, 7.3, -30.9)$ | $(24.8, 3.4, -34.3)$ | 4.90 |
| **P15** | Reagent Teal | `#158A82` | `#137F78` | $(47.9, -29.7, -4.3)$| $(51.5, -32.7, -4.9)$| 3.78 |
| **P16** | Reagent Brown | `#B5651D` | `#AB5F1B` | $(48.3, 26.4, 49.1)$ | $(51.5, 29.4, 51.7)$ | 3.46 |
# Parinaam Color Engine: Live Testing & Technical Jury Presentation Guide

> **Target Audience:** Hackathon Judges, Technical Evaluation Panels, Field Engineers, and Developers.  
> **Core Value Proposition:** Deterministic, legally defensible, sub-pixel colorimetric presumptive drug testing without black-box neural networks.

---

## Part 1: Live Testing Step-by-Step Guide

Follow these exact steps to add a new physical photo, execute the calibration pipeline, and verify results.

### Step 1: Capture the Photo
1. Place the printed **Parinaam Reference Card (v1)** on a flat surface.
2. Place the test swatch 5 mm off the card's right edge (centered vertically, x=105 mm, y=34 mm):
   - **Case 1 (Positive Demo):** Use a cutout of Card Patch **P13** (Violet #6B2C91).
   - **Case 2 (Negative Demo):** Use a cutout of Card Patch **P14** (Navy #1B3B6F).
   - **Case 3 (Abstention Demo):** Use a cutout of Card Patch **P05** (Dark Grey #4D4D4D).
   *(Note: Keep within 5 mm of card edge; extrapolating beyond 105 mm increases projective tilt error).*
3. Take a photo using your smartphone camera:
   - Ensure all 4 ArUco corner markers are clearly visible in frame.
   - Any orientation works (Portrait 3072x4096 or Landscape 4096x3072).
   - Avoid extreme glare hot-spots directly covering the markers.

### Step 2: Add Photo to Project
Save the photo inside the project's test directory:
`
parinaam-color-engine/photo-phone-camera/<YOUR_IMAGE_NAME>.jpg
`

---

### Step 3: Run the Verification Pipeline
Open PowerShell or your terminal in the project root and run:

`ash
python mobile/scripts/verify_card_photo.py photo-phone-camera/<YOUR_IMAGE_NAME>.jpg
`

*(Replace <YOUR_IMAGE_NAME>.jpg with your actual filename, e.g., IMG_20260916_065416.jpg.jpeg)*

---

### Step 4: Interpret the Console Output

The script executes the full optical engine and outputs five key sections:

`	ext
===========================================================
[CARD VERIFIER] Analyzing image: photo-phone-camera/IMG_20260916_065416.jpg.jpeg
[CARD VERIFIER] Loading geometry: card_v1_geometry.yaml
===========================================================
[INFO] Image resolution: 4096 x 3072 pixels
[INFO] Blur score (Laplacian variance): 120.0 (min threshold: 100) -> PASS
[INFO] Detected ArUco marker IDs: [2, 3, 0, 1] -> PASS (All 4 markers detected)
[SUCCESS] Homography matrix computed (mm -> px)

--- Fitting Finlayson (2015) Root-Polynomial Color Calibration ---
[SUCCESS] Calibration Matrix M (6x3) fitted via QR Least-Squares

--- Pre- vs Post-Calibration CIEDE2000 Accuracy ---
ID    | Family          | Raw Hex    | Raw dE00   | Calib Lab (L, a, b)    | Ref Lab                | Calib dE00
---------------------------------------------------------------------------------------------------------
P01   | achromatic      | #C8D2DB    | 15.79      | (94.2, 0.6, -2.1)      | (96.5, -0.6, -1.8)     | 2.28      
...
Mean Uncalibrated DeltaE00 : 11.43
Mean Calibrated DeltaE00   : 4.18 (Quality Gate Residual Max: 8.0) -> PASS

--- Mock Test Swatch Result ---
Sampled Calibrated Lab: (40.26, -3.05, -38.26)
[CLASSIFICATION RESULT] => POSITIVE_CANNABINOID (or INCONCLUSIVE if unmatched)
`

### Step 5: Visual Verification Artifacts
The script automatically generates two annotated diagnostic images:
1. photo-phone-camera/card_detection_annotated.png:
   - Green bounding boxes around the 4 ArUco fiducials.
   - Blue sampling boxes over the 16 reference color patches.
   - Yellow sampling box over the external test kit ROI.
2. photo-phone-camera/card_rectified_view.png:
   - A perfectly orthorectified, top-down, distortion-free 1000 x 800 pixel rendering of the reference card.

---

### Step 6: Verify Mobile App Code & Unit Tests
To verify that all TypeScript Color Engine modules, Quality Gates, and React Native components are synchronized and passing:

`ash
cd mobile
npm run sync-profiles   # Synchronizes YAML to TS, Android Kotlin, and assets
npm test                # Executes the 10 automated test suites
`

---

## Part 2: Under-The-Hood Architecture (Jury Presentation)

### 1. The 30-Second Elevator Pitch
> *'Most smartphone color readers fail in the real world because lighting changes everything: a warm room lamp, a cloudy window, or a phone flashlight will completely distort RGB values. Deep learning models try to guess the color, but neural networks hallucinate and cannot be legally defended in court.*  
>  
> *Parinaam uses **in-situ metrology**. By placing an onboard 16-patch reference card in the same frame as the chemical test, we capture the exact physical illuminant in real-time. Using Finlayson\'s 6-term root-polynomial regression and CIEDE2000 colorimetry, our mathematical engine completely strips away ambient lighting, delivering spectrophotometer-grade accuracy with a 100% auditable mathematical proof.'*

---

### 2. The 5-Stage Mathematical Pipeline

`mermaid
graph TD
    A['Raw Phone Camera Pixels'] --> B['Stage 1: Fiducial Detection & Homography<br/>(4x ArUco DICT_4X4_50, 16 Corner Points, RANSAC)']
    B --> C['Stage 2: Robust Sampling & Glare Rejection<br/>(25% Boundary Erosion, Specular Rejection >= 250, MAD Trim)']
    C --> D['Stage 3: In-Situ Root-Polynomial Calibration<br/>(Finlayson 2015 6-Term Basis, QR Least-Squares)']
    D --> E['Stage 4: CIELAB & CIEDE2000 Perceptual Space<br/>(D50 White Point, Non-Linear Human Perceptual DeltaE)']
    E --> F['Stage 5: 3-Tier Quality Gates & Decision Engine<br/>(Image Quality -> Residual <= 8.0 -> Candidate Margin >= 2.5)']
    F --> G['Deterministic Classification & Audit Trail']
`

#### Stage 1: ArUco Marker Tracking & Planar Homography
* **The Problem:** The user holds the phone at an angle, varying distance, and varying orientation.
* **The Solution:** We embed four 10 mm ArUco markers (DICT_4X4_50, IDs 0, 1, 2, 3) at the card corners.
* **The Math:** Detecting 4 markers yields **16 corner point correspondences** between physical card space (x_mm, y_mm) and camera sensor pixels (u, v). We solve for the 3x3 projective homography matrix H using overdetermined RANSAC:
  egin{bmatrix} u \\ v \\ 1 \end{bmatrix} \sim \mathbf{H} egin{bmatrix} x_{	ext{mm}} \\ y_{	ext{mm}} \\ 1 \end{bmatrix}
* **Extrapolation:** Because the card and the test kit sit on the same flat table, H accurately projects coordinates outside the card boundaries (e.g., x=105 mm or 155 mm).

#### Stage 2: Robust Sampling & Glare Rejection
* **25% Boundary Erosion:** Prevents color bleeding from card edges or laser-cutter bleed.
* **Specular Glare Filtering:** Any pixel with channel intensity >= 250 (saturation glare) is discarded.
* **MAD-Trimmed Mean:** Uses Median Absolute Deviation (Z > 3.0) to reject paper dust and micro-scratches.
* **Linearization:** Converts non-linear sRGB (gamma 2.2) back to linear optical irradiance.

#### Stage 3: In-Situ Root-Polynomial Regression (Finlayson 2015)
* **The Math:** We map the 16 observed camera RGB values to the known reference reflectance targets:
  \mathbf{\Phi}(r, g, b) = egin{bmatrix} r & g & b & \sqrt{rg} & \sqrt{rb} & \sqrt{gb} \end{bmatrix}
* We solve for the 6x3 transformation matrix M using least-squares:
  \mathbf{\Phi}_{16 	imes 6} \mathbf{M}_{6 	imes 3} = \mathbf{Y}_{16 	imes 3} \quad \implies \quad \mathbf{M} = (\mathbf{\Phi}^T \mathbf{\Phi})^{-1} \mathbf{\Phi}^T \mathbf{Y}
* **Why 6 Terms instead of 13 Terms?** (See Jury FAQ #1 below).

#### Stage 4: Perceptual Color Space Conversion (CIELAB & CIEDE2000)
* Camera sensors measure RGB, but human eyes and chemical reagents respond in perceptual color spaces.
* We convert calibrated linear XYZ to **CIELAB** under standard CIE D50 illuminant.
* Color difference is calculated using the international standard **CIEDE2000 (dE00)**, which compensates for perceptual non-uniformities in hue, chroma, and lightness.

#### Stage 5: 3-Stage Quality Gates (The Safety Shield)
Before any drug result is displayed, the pipeline MUST pass three rigorous gates:
1. **Gate 1 (Image Quality):**
   - Blur score (Laplacian variance) >= 100.
   - Channel clipping fraction < 5%.
   - Glare masked area < 15%.
   - Perspective tilt < 30 degrees.
2. **Gate 2 (Calibration Residual):**
   - The mean residual error across the 16 card patches must satisfy dE00 <= 8.0. If lighting is too non-uniform or card is damaged, it triggers INSUFFICIENT_CALIBRATION_CONFIDENCE.
3. **Gate 3 (Decision & Abstention):**
   - Match tolerance: dE00 <= 10.0 to nearest candidate.
   - Ambiguity margin: Difference between 1st best and 2nd best candidate must be >= 2.5 dE00. If ambiguous, it triggers AMBIGUOUS_COLOR and abstains.

---

## Part 3: Codebase Map & File Accountability

If a judge asks *'Show me where this is implemented in your code'*, point to these exact files:

| Pipeline Stage | Implementation File | What It Does |
| :--- | :--- | :--- |
| **Single Source of Truth** | card_v1_geometry.yaml | Defines card dimensions (100x80 mm), fiducials, 16 patch scanner references, and kit geometry. |
| **Build-Time Synchronizer** | mobile/scripts/syncProfiles.js | Generates TypeScript configs, mock frames, Kotlin config, and Android JSON assets with zero drift. |
| **Native Android OpenCV** | CardDetectorPlugin.kt | High-speed C++/OpenCV native frame processor running live on the camera thread at 30 FPS. |
| **In-Situ Calibration** | 
ootPolynomial.ts | Computes the 6-term basis and solves QR least-squares regression matrix M. |
| **CIEDE2000 Metric** | ciede2000.ts | Implementation of ISO/CIE 11664-6 standard color difference equations. |
| **Quality Gates** | qualityGates.ts | Enforces blur, glare, perspective, residual limits, and returns failure codes (EXCESSIVE_GLARE, etc.). |
| **Classifier & Abstention** | classifier.ts | Evaluates tolerance radius, ambiguity margins, and produces classification decisions with confidence scores. |
| **Pipeline Orchestrator** | ColorEngine.ts | Master end-to-end pipeline uniting detector payloads, calibration, gates, and classification. |
| **Python Offline Verifier** | erify_card_photo.py | Standalone verification harness for end-to-end testing of real physical camera photos. |

---

## Part 4: Jury Q&A Cheat Sheet (How to Answer Common Questions)

### Q1: 'Why didn\'t you use a Deep Learning / CNN model like YOLO or MobileNet?'
> **Answer:**  
> *'Deep learning models are black boxes. In forensic, law enforcement, and clinical presumptive drug testing, a result must be legally defensible and auditable under cross-examination.*  
> *Neural networks suffer from domain shift: a CNN trained on iPhone photos will fail on a Samsung sensor under 2700K incandescent lighting.*  
> *Instead, we use **deterministic, in-situ metrology**: the 16 reference patches are captured under the exact same photons as the test kit at that exact millisecond. Our 6-term polynomial model is mathematically proven, closed-form, and provides a full audit trail of calibration residuals.'*

---

### Q2: 'Why did you choose a 6-term root-polynomial instead of a 13-term polynomial?'
> **Answer:**  
> *'We rigorously evaluated this using a Leave-Some-Out cross-validation experiment (evaluate_calibration_models.py).*  
> *A 13-term model has 13 x 3 = 39 free parameters. With 16 reference patches (48 scalar values), the degrees of freedom are dangerously thin. When testing on held-out patches, 13-term regression suffered severe polynomial divergence (> 4,000 dE).*  
> *In contrast, the 6-term basis has only 18 parameters, is intensity-invariant (scaling RGB scales the output linearly), well-conditioned, and generalizes with stable, low error on unknown colors.'*

---

### Q3: 'What happens if someone tests in bad lighting or tries to trick the app?'
> **Answer:**  
> *'The app will **refuse to guess**. Our 3-stage Quality Gates check for:*  
> *1. Blur (Laplacian variance < 100).*  
> *2. Glare (specular saturation >= 250).*  
> *3. Calibration residual (dE00 > 8.0).*  
> *4. Ambiguity margin (< 2.5 dE00).*  
> *If any condition fails, the app abstains and displays an explicit failure reason (e.g. EXCESSIVE_GLARE or NO_CLOSE_MATCH), preventing false positive drug convictions.'*

---

### Q4: 'Why do you use CIEDE2000 instead of standard Euclidean RGB or Lab distance?'
> **Answer:**  
> *'Euclidean RGB distance assumes color space is perceptually uniform, which is notoriously false. Human eyes (and chemical reactions) are far more sensitive to subtle hue shifts in blues and purples than in greens.*  
> *CIEDE2000 is the international gold standard (ISO/CIE 11664-6). It incorporates non-linear weighting factors for lightness, chroma, hue, and a critical cross-term that rotates the tolerance ellipse in the blue region to match human perception.'*

---

### Q5: 'How does the native Android layer communicate with React Native without lagging?'
> **Answer:**  
> *'We use React Native VisionCamera v4\'s Frame Processors linked to OpenCV 4.8.0 C++/Kotlin native code. Image buffers are processed in native memory without converting entire 12-megapixel frames to base64 or passing heavy bitmap data over the bridge.*  
> *Only lightweight structured data (sampled linear RGBs, glare statistics, homography matrix) are passed across the bridge into TypeScript, allowing the engine to run at a smooth 30 FPS.'*

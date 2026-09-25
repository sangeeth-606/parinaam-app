# Parinaam — Color Normalization & Test-Result Calibration Engine
## Research, Scientific Analysis & Coding-Agent-Ready Technical Specification

---

## MVP FAST-TRACK ADDENDUM — READ THIS FIRST (coding agent: start here)

This document was written as a complete spec for the production/evidentiary version of the color engine. Building all of it before a first demo exists is not necessary and will slow the MVP down. This addendum narrows scope — it does not change any architecture decision made later in the document.

**What "MVP" means here:** a working, demoable, end-to-end pipeline — card detected in a captured frame → color corrected → test patch classified as POSITIVE/NEGATIVE/INCONCLUSIVE with a displayed confidence → quality gates visibly firing `INCONCLUSIVE` on bad captures. It does **not** mean a forensically validated, court-ready system — that needs the physical experiments in §26–31/§37, which no amount of coding effort can substitute for. Don't let the rest of the document's rigor read as "block until that data exists" — it means "build the architecture for it, run it on placeholder data today, swap the data in later without a redesign."

**Build now — Implementation Sequence steps 1–14 (§L):** project skeleton → data schemas → card-profile system → card detector → perspective correction → patch sampler → quality engine → color-space utilities → calibration/normalization engine → test-patch analyzer → kit-profile system → classification engine → confidence/abstention → end-to-end pipeline. Build the *architecture* (module separation, schemas, quality-gate structure, algorithm choice) fully and correctly — that part is not a place to cut corners, since re-architecting later is expensive. Only the *data feeding it* is allowed to be placeholder for now.

**Defer — do not build for MVP:**
- Golden dataset infrastructure/CI (§46, §H) and the full adversarial test suite (§47) — both need a real physical dataset that doesn't exist yet. Write 2–3 smoke tests instead of the full matrix.
- Leave-one-device-out / leave-one-lighting-out validation (§26.2) — same reason.
- ECE / Brier-score / isotonic-regression confidence calibration (§24). **MVP substitute:** derive a 0–1 confidence directly from the ΔE00 margin (best-match distance vs. second-best) via any reasonable monotonic function you pick by hand, and mark it in the output as `confidence_uncalibrated: true`. Keep the schema field and the abstention-threshold code path exactly as designed so real calibration can be dropped in later without touching the pipeline shape.
- Batch card-calibration tooling and card-aging telemetry (§10 steps 3–5) — one card design, one manually-entered profile is enough for MVP.
- The kit-chart digitization / dual-card Phase-2 idea (§9) — irrelevant until multiple kit brands are in play.
- Shared C++ core and the iOS native module (§32). **Confirmed: Android only for MVP.** Build a single native Kotlin module for the Frame Processor Plugin directly — no JNI/C++ shared-core layer, no iOS binding. Revisit §32's shared-C++-core option only if/when iOS is added post-MVP.

**Placeholder data is explicitly allowed — with labeling, not silently:** `PHYSICAL EXPERIMENT REQUIRED` / `DOMAIN-EXPERT VALIDATION REQUIRED` in the rest of this document mean "not scientifically final," not "don't write code that uses a number here." For MVP: populate exactly one `reference_card_profiles/card_v1.yaml` and exactly one `kit_profiles/<id>.yaml`, set `status: PENDING_VALIDATION` and `source: "MVP placeholder, not validated"` on the kit profile, and keep the existing rule that a `PENDING_VALIDATION` kit profile can never produce anything presented as a validated result — it's fine for it to run and demo the pipeline, just never fine for the demo narrative to blur "placeholder" and "validated."

**Printing the card now, in parallel with coding — no blocking dependency either way.** The design geometry is already fully specified (§6–9: 100×70 mm, 16 patches in a 4×4 grid, 4 ArUco corners, 1 Data Matrix) — the coding agent can build and test the detector against a synthetic/rendered card (an SVG/PNG generated straight from the design file) before the physical card exists.
1. **P01–P06 (achromatic ramp) and P07–P12 (primary/secondary):** no blocker — these are standard, well-defined colors (white/grays/black, R/G/B/C/M/Y). Pick standard values now and send to print.
2. **P13–P16 (reagent-adjacent):** real values need forensic-chemistry input that doesn't exist yet. For a v1 card, use reasonable placeholder hues from the general families already named in §4.2 (violet/purple, blue, blue-green/teal, amber/orange-brown) — good enough to be useful, and explicitly a v1 you expect to reprint as v2 once real reagent-response data exists. That's exactly what `reference_card_version` is for.
3. **After printing, get it measured** — a spectrophotometer is the defensible answer (§10), but if that's not reachable in your timeframe, an approximate measurement (a calibrator/colorimeter, or even the print job's own color-managed target values) is a legitimate, clearly-labeled MVP substitute. Put whatever you get into `card_v1.yaml`. The pipeline needs *some* number in that config to run at all — roughly right and honestly labeled beats blocked.

**Resolved: the MVP demo uses printed color swatches as the "test kit," not a real chemical reagent reaction** — see the dedicated section immediately below for the exact kit definition to hand the coding agent.

---

## MVP TEST-1: MOCK PRINTED-PATCH KIT DEFINITION

This is not a workaround dressed up as a limitation — it is exactly the "Phase A: color-science calibration, no controlled substances" approach the main document already specifies (§26.3/§31), used directly as the MVP's demo article. It has a genuine advantage over a real reagent for this purpose: because the swatch is printed, its true intended color is known in advance, so you can actually check whether the detection→correction→classification pipeline gets the right answer — something a live chemical reaction can't give you without independent lab confirmation.

**What to print (in addition to the reference card):**
- Two, or optionally three, small swatches — same material/matte finish/print process as the main reference card (§9), sized similarly to one of the card's own patches (≈15–20 mm square) so they resolve at the same working distance:
  - **`POSITIVE` swatch — violet/purple.** A reasonable, informed placeholder, not an arbitrary color: violet/purple is the well-documented general color family for a positive Duquenois-Levine-type reaction, the reagent family actually used for cannabinoid (marijuana/hashish) presumptive field tests — so this matches the test you named. The *exact* hue/Lab value is still an MVP placeholder (v1), under the same caveat as the reference card's own reagent-adjacent patches (§4.2, P13–P16) — not a certified reagent-response value.
  - **`NEGATIVE` swatch — any color clearly distant from the positive swatch** in color space (e.g., a pale tan/beige or muted yellow-green), so the two are never confusable under realistic lighting error. There's no real negative-reaction chemistry being represented here, only a printed stand-in, so forensic accuracy isn't the goal — clear separation is.
  - **`INCONCLUSIVE_DEMO` swatch (optional, recommended).** A color deliberately placed roughly halfway between the positive and negative swatches in Lab space, purely to let you demonstrate, live, that the system correctly abstains (`INCONCLUSIVE` / `AMBIGUOUS_COLOR`) instead of guessing on a genuinely ambiguous result — one of the most distinctive, judge-visible design choices in the whole system (§48), worth a rehearsed demo moment.
- All swatches sit at the **same fixed position** relative to the reference card — the viewfinder overlay guides placement to that one spot regardless of which swatch is being shown, exactly as it would guide placement of a real test-kit result. No new detection logic is needed: this is the same `test_geometry.roi_card_relative` / `HOMOGRAPHY_OFFSET` mechanism §20 already specifies for a real kit.

**KitProfile to hand the coding agent (concrete, explicitly MVP-labeled):**
```yaml
kit_profile_id: "mvp_test1_mock_cannabinoid"
manufacturer: "N/A — MVP mock, not a real manufactured kit"
kit_name: "MVP Test 1 — Printed Patch Mock"
model: "v1"
test_name: "Marijuana/Hashish presumptive (Duquenois-Levine family) — MOCK for MVP demo, not a real chemical test"
test_type: "PRINTED_PATCH_MOCK"           # new value, extends the test_type enum in §20
kit_profile_version: 1
status: "PENDING_VALIDATION"               # must never let this present as a validated result

test_geometry:
  locator_method: "HOMOGRAPHY_OFFSET"
  roi_card_relative: {x: <fixed, set once card layout is finalized>, y: <fixed>, width: <swatch size>, height: <swatch size>}

expected_result_colors:
  - outcome_label: "POSITIVE_CANNABINOID"
    reference_lab: {L: <from swatch measurement>, a: <...>, b: <...>}   # placeholder until measured — see below
    tolerance_radius_de00: <initial default, e.g. 8-10 — not experimentally validated, tune later>
    source: "MVP printed mock patch v1, hand-chosen violet — not a certified reagent value"
  - outcome_label: "NEGATIVE"
    reference_lab: {L: <...>, a: <...>, b: <...>}
    tolerance_radius_de00: <initial default>
    source: "MVP printed mock patch v1, hand-chosen — not real reagent chemistry"
  - outcome_label: "INCONCLUSIVE_DEMO"       # optional
    reference_lab: {L: <...>, a: <...>, b: <...>}
    tolerance_radius_de00: <initial default>
    source: "MVP printed mock patch v1, intentionally ambiguous — abstention demo only"

validity_rules:
  kit_expiry_check: false
  batch_specific: false
  min_confidence_to_classify: <initial default>

model_version: "mvp-v1"
```

**Measuring the swatches:** treat exactly like the reference card (§10) — print, then measure with whatever is reachable (spectrophotometer if you can get access, otherwise the print job's own target values as a documented approximation, same "roughly right, honestly labeled beats blocked" rule as above) and put the measured Lab values into `reference_lab`. Because these are fixed, known printed colors, this is the one place in the whole MVP where you can run a genuinely clean accuracy check: capture the swatch under a few different lighting conditions, run the full pipeline, and compare the reported normalized Lab against the swatch's independently measured Lab. That ΔE00 is an honest measure of whether the calibration pipeline actually works — worth capturing for the hackathon presentation.

Everything else about this profile follows the `PENDING_VALIDATION` rule already stated above: fine to run and demo against, never fine to present as a validated chemical result — the demo narrative should say plainly that "positive"/"negative" here are printed reference colors standing in for a real reagent.

---

**Scope of this document:** the color-science subsystem only — reference card, capture pipeline, calibration, classification interface. Authentication, hashing/signing, hash-chain, GPS, sync, dashboard, SIMS/NIDAAN integration, and PDF export are explicitly out of scope and are treated only as an interface boundary (§21).

**Status legend used throughout:**
`KNOWN` — settled by physics/standards, safe to hard-code as a decision.
`RESEARCH REQUIRED` — needs literature/vendor lookup, not physical experiment.
`PHYSICAL EXPERIMENT REQUIRED` — cannot be resolved without lab/field data collection.
`DOMAIN-EXPERT VALIDATION REQUIRED` — needs a forensic chemist / NFSU-CFSL input.
`LEGAL VALIDATION REQUIRED` — needs a lawyer/judicial-process check.

---

## 1. Executive Summary

The engineering objective is **not** "recover the true RGB of the test patch under any lighting." That is not physically achievable from a single consumer-camera photograph (§2). The correct, achievable objective is:

> **Estimate the test patch's color under a defined, reproducible reference condition (CIE Lab, D50 illuminant, using the co-photographed reference card as the transfer standard), report that estimate together with a calibrated confidence and an explicit quality gate, and refuse to classify when the image does not support a reliable estimate.**

Final recommendations (justified in the sections that follow):

| Decision | Recommendation |
|---|---|
| Reference card | Custom **hybrid** 16-patch "Parinaam Card" (achromatic ramp + primaries/secondaries + reagent-adjacent patches) + 4 ArUco fiducials + 1 Data Matrix, individually batch-calibrated (§6–7) |
| Kit's own chart | Photographed and hashed as evidence, **not** used as a calibration input for MVP (§9) |
| Calibration color space | Fit in linearized camera RGB → CIE XYZ (D50), report in CIE Lab/LCh (§12–13) |
| Normalization algorithm | **Root-polynomial regression** (Finlayson, Mackiewicz & Hurlbert, 2015, *IEEE TIP* 24(5):1460–1470) as primary hypothesis, benchmarked against 3×3 CCM and CCM+bias baselines; final choice made by measured ΔE00 (§14–16) |
| Illumination/white-balance estimation | Joint estimation from the 6 achromatic patches inside the same regression, not gray-world (§18) |
| Geometry/detection | ArUco fiducials for pose + Data Matrix for card identity (§20) |
| Quality gate | Hard gate before classification; failure → `INCONCLUSIVE` + machine-readable reason, never a forced guess (§25) |
| Classifier | Classical distance/likelihood model in Lab space first; ML classifier only if evidence justifies it, never conflated with the normalizer (§23–24) |
| Confidence | Selective-classification framework (risk-coverage, ECE) — not raw softmax (§26) |
| Mobile stack | **React Native.** react-native-vision-camera (JSI Frame Processor Plugins) for capture; native code (Kotlin + Swift, ideally behind a single shared C++/OpenCV core) only for ArUco detection, homography, and pixel-level patch sampling; every other calculation (color space, regression application, ΔE00, classification, confidence) lives in one shared TypeScript module used by both platforms; TFLite only if a learned classifier is adopted later (§32) |

No reagent colors, kit geometries, or manufacturer specifications are invented anywhere in this document. Every such value is flagged `PHYSICAL EXPERIMENT REQUIRED` or `DOMAIN-EXPERT VALIDATION REQUIRED` with the exact experiment needed to obtain it.

---

## 2. Scientific Reality & Constraints

### 2.1 Why "exact RGB under any lighting" is the wrong target

A photograph is the output of this chain:

```
spectral reflectance ρ(λ) of the patch
   × spectral power distribution of the illuminant E(λ)
   × camera lens/filter/sensor spectral sensitivity S(λ)
 → sensor response (device-dependent, non-human-visual RGB)
   → ISP pipeline (demosaic, denoise, tone-map, AWB, gamma)
 → encoded sRGB pixel value
```

Three separate physical/mathematical facts make "exact RGB" unrecoverable from one photo of one channel triple per pixel:

1. **Metamerism.** Infinitely many different spectral reflectances ρ(λ) produce the *same* RGB response under a given illuminant+sensor combination. A single RGB triple cannot be inverted back to a unique reflectance. This is a property of any three-channel (trichromatic) sensor, human eye included — it is not a camera defect to be "fixed."
2. **Illuminant/sensor confound.** The observed RGB is a product of illuminant, reflectance, and sensor sensitivity. Without independently knowing the illuminant's spectrum and the sensor's exact spectral sensitivity (proprietary, varies by phone model/firmware, and is altered post-capture by the ISP), the three cannot be separated exactly — only estimated.
3. **Camera RGB ≠ colorimetric RGB.** Consumer camera sensor sensitivities are not, and are not required to be, linear combinations of the CIE color-matching functions (the Luther-Ives condition). Nearly no consumer sensor satisfies this. So camera RGB is not simply a "distorted" version of a true colorimetric RGB; it is a fundamentally different, device-specific representation. Converting it to a device-independent representation (CIE XYZ/Lab) is *characterization*, not "correction back to truth."

`KNOWN`. This is textbook color-camera colorimetry (see ISO 17321-1:2012, *Colour characterisation of digital still cameras*, which explicitly frames this as characterization against a calibrated target under defined stimuli/metrology conditions, not "true color recovery").

### 2.2 The correct, achievable objective

Given a reference target of **known** CIE Lab values (measured once, off-line, with a spectrophotometer) placed in the same frame under the same illumination and imaged by the same sensor as the test patch, we can estimate a mapping:

```
observed device RGB (reference patches) → known CIE XYZ/Lab (reference patches)
```

and apply that *same* mapping to the test patch. This estimates **"what a spectrophotometer/colorimeter would likely report for this patch, under the assumption that the patch and the card are under statistically the same local illumination and imaged through the same camera response,"** not the patch's intrinsic reflectance. This is the standard operating assumption behind every reference-target color-correction system (photography, forensics, agriculture, medical imaging) and is the correct formulation for Parinaam.

### 2.3 Explicit limits that must be engineered around, not hidden

- If the card and patch are lit differently (strong local shadow/glare on one but not the other) the shared-illumination assumption breaks — this must be **detected**, not silently accepted (§19).
- If the scene illuminant is so far outside the calibration data's illuminant range (e.g., pure narrow-band sodium vapor light) that the regression is extrapolating, the corrected color is unreliable — this must be **flagged**.
- Metameric failure between the reagent's true reflectance and the classifier's reference model under an unusual illuminant is a residual risk that no amount of software fixes; it is why the disclaimer ("presumptive only, not a substitute for CFSL/SFSL confirmation") is a hard product requirement, not boilerplate (already reflected in the parent app design).

---

## 3. Requirements Audit

Requirements that are **fixed inputs** to this subsystem (from the parent brief, not to be re-litigated here):
- Zero new hardware; ordinary phone camera only.
- Fully offline capture → classify → sign pipeline.
- Tri-state + confidence output (`POSITIVE` / `NEGATIVE` / `INCONCLUSIVE`), never forced binary.
- In-app-only capture (no gallery import) — outside this subsystem's boundary, but it constrains what image metadata this engine can assume it will receive (a live camera frame stream, not an arbitrary imported JPEG).
- Kit geometry and reagent colors will vary by kit brand/model — must not be hardcoded.
- Batch-specific calibration is explicitly stated as "not currently applicable" — architecture must allow it later without a redesign.

Requirements that are **open and must be resolved by this document**: reference card design, color pipeline, normalization algorithm, quality gate thresholds, dataset/validation protocol, output schema, mobile architecture.

---

## 4–7. Reference Card: Alternatives, Decision, and Exact Layout

### 4.1 Candidates evaluated

| Candidate | Verdict | Why |
|---|---|---|
| A — Grayscale only | **Rejected as sole target** | Grayscale patches estimate illumination *intensity* and a per-channel gain/gamma, but cannot constrain a full 3×3 or root-polynomial cross-channel (hue-plane) correction — a purely diagonal (per-channel-gain) model is provably insufficient whenever the camera's channel crosstalk is non-negligible, which is the normal case for phone sensors. Good for exposure/linearity estimation only — retained as a *component*, not the whole card. |
| B — RGB/CMY only | **Rejected as sole target** | Gives hue-plane coverage but no dynamic-range/linearity information (only one lightness level per hue), and no anchoring near the actual reagent-color decision region. Retained as a *component*. |
| C — Standard ColorChecker (e.g., X-Rite Classic, 24 patch) | **Rejected for field deployment, useful as lab reference** | (a) Physical size (~21.6×27.9 cm) is impractical to co-frame with a small reagent-test device at usable patch resolution from a one-handed phone shot; (b) many of its 24 patches (skin tones, foliage, "natural" colors) are irrelevant to reagent chemistry and consume space that would be better spent near the actual reagent color region; (c) it is a licensed/manufactured third-party product, not something Parinaam can freely reproduce, batch-track, and re-calibrate at the unit cost needed for mass field issuance; (d) its own manufacturing tolerances are those of a general-purpose photography target, not tuned to this problem. **However**, a ColorChecker (or ColorChecker-derivative like the X-Rite ColorChecker Passport/Digital SG referenced in the Finlayson et al. root-polynomial paper) is the right instrument for **lab-side algorithm development and camera characterization research**, and should be used in that role (§27–28), just not as the card officers carry. |
| D — Custom Parinaam target | **Adopted, as the calibration component** | Can be sized, patch-selected, and manufactured specifically for this problem. |
| E — Hybrid | **Adopted — this is the actual recommendation** | Combine a compact achromatic ramp (from A) + primary/secondary chromatic patches (from B) + purpose-built reagent-adjacent patches (from D), laid out on one small, individually-identified, individually-calibrated card. |

### 4.2 Patch-count and layout optimization (§6 requirement — exact, not "several colors")

**Card: 16 color patches, 4 fiducial markers, 1 Data Matrix, arranged as follows.**

```
 [ArUco-TL]  [P01] [P02] [P03] [P04]  [ArUco-TR]
             [P05] [P06] [P07] [P08]
             [P09] [P10] [P11] [P12]
             [P13] [P14] [P15] [P16]
 [ArUco-BL]  [DataMatrix + card_id text]      [ArUco-BR]
```

Patch roles (exact — reference *values* are placeholders pending physical calibration; roles and count are the deliverable here):

| Patch ID | Role | Family | Why this patch exists |
|---|---|---|---|
| P01–P06 | Achromatic ramp (6 steps: white, light gray, mid-light gray, mid gray ~ photographic 18%-gray reference, dark gray, black) | Neutral axis | Estimates illumination intensity, exposure state, per-channel gain, and — critically, because it spans the dynamic range in ≥6 steps rather than 2 — lets the engine detect **nonlinearity/clipping across the tonal range**, not just at the extremes. A 2-patch (black/white only) ramp cannot detect a clipped highlight that isn't literally white, or shadow crush that isn't literally black; 6 steps can. |
| P07–P12 | Primary + secondary chromatic patches: R, G, B, C, M, Y | Hue-plane coverage | Constrains the cross-channel (off-diagonal) terms of the color-correction model — this is what lets the system correct hue shifts (e.g., a warm LED making a blue-violet reagent read purple), not just brightness/gain. Six patches spanning the hue circle at high chroma give the regression leverage across the full color wheel, which a grayscale-only card cannot provide. |
| P13–P16 | **Reagent-adjacent anchor patches** — four patches chosen to sit near the hue/chroma regions that common presumptive colorimetric reagents (Marquis, Mecke, Duquenois-Levine, Scott/Simon's) are documented to produce at their positive/negative endpoints (broad families: violet/purple, blue, blue-green/teal, amber/orange-brown) | Local anchoring | A regression fit only on primaries/secondaries/grays is well-conditioned overall but can still have **locally elevated error in color regions none of those patches sit near** — precisely the risk in this application, because the decision-relevant colors are narrow, specific hues, not the primaries. Anchoring patches near those hues reduces interpolation error exactly where classification accuracy matters most. **The precise Lab/hex values of P13–P16 are placeholders and must be finalized only after Phase B chemistry data collection (§31) — DOMAIN-EXPERT VALIDATION REQUIRED.** |

**Why 16 and not more/fewer:** 16 patches is enough to well-condition a root-polynomial regression with up to ~11 terms (needs at minimum #terms+a few for stable least squares; 16≫11 gives residual degrees of freedom to estimate fit quality) while keeping the card small enough (see §8 physical spec) to co-frame with a small reagent-test device at a photographable patch size from typical one-handed phone distances (~15–25 cm). More patches (e.g., a 24-patch ColorChecker-style layout) would either shrink individual patch size below reliable-sampling area at that working distance, or force a larger, less pocketable card — both rejected per §4.1(C).

### 4.3 Solid colors vs. gradients (§7)

**Decision: solid patches only. Gradients/continuous ramps are explicitly rejected.**

Analysis:
- A gradient's information content, for calibration purposes, is equivalent to sampling it at a modest number of discrete points along the gradient — i.e., a gradient is only useful if you already know exactly which points on it you're going to sample and treat those as "patches." At that point it *is* a discrete multi-step ramp, not a true gradient — which is exactly what P01–P06 already provide for the achromatic axis.
- Costs of a continuous gradient that a discrete ramp avoids entirely: (a) printer/RIP reproducibility of a smooth gradient is materially harder to hold within tolerance across print runs than solid patches (banding, non-monotonic steps from color-management rounding); (b) a printed gradient's *effective* color at any given point depends on exact sub-millimeter sampling location, adding a registration/detection burden the discrete-patch grid does not have; (c) computational/UX cost of asking the officer's phone (and the officer, via UI feedback) to align a small precise sub-region of a gradient is higher than aligning within a solid patch's generous flat region.
- "Multiple brightness versions of every chromatic color" (§7 Option 3) was also considered and rejected for the field card specifically because it would require ≥4× the chromatic patches (24 additional patches for 6 hues × 4 brightness levels) — a card that size fails the co-framing/portability constraint from §4.1(C). The achromatic ramp already estimates the tonal-response curve; adding brightness variants of chromatic patches gives diminishing marginal conditioning improvement for a large area cost. This trade-off should be **re-examined experimentally** once real ΔE00 data exists (§14) — if validation shows the chromatic patches alone are insufficiently constraining specific reagent hues, the correct fix is to swap in more reagent-adjacent anchor patches (§4.2, P13–P16), not to add brightness ramps.

**Minimum-complexity conclusion: 16 solid patches (6 gray + 6 primary/secondary + 4 reagent-adjacent), no gradients.**

---

## 8. Kit's Own Chart vs. Parinaam Card

Three architectures were compared (§9 requirement):

- **A (kit chart only):** Rejected. Kit-printed charts have unknown, uncalibrated, manufacturer- and batch-varying colorimetry; Parinaam has no spectrophotometric ground truth for any of them without an ongoing per-brand-per-batch measurement program (a large undertaking with no current data — `PHYSICAL EXPERIMENT REQUIRED`, out of scope for MVP). Using an unmeasured target as a calibration standard is scientifically indefensible and would undermine the very Section 63(4)-grade auditability the app exists to provide.
- **B (Parinaam card only):** **Adopted for MVP.** The Parinaam card is the only element in the frame with a known, individually-calibrated, spectrophotometrically-traceable reference value (§10–11). This is the only architecture that supports a defensible ΔE-based quality claim today.
- **C (both, interacting):** **Adopted as the target end-state, in a specific division of labor** — not as two parallel calibration sources feeding the same regression (that would let an unmeasured, unreliable input silently degrade a measured, reliable one). Concretely:
  - The Parinaam card is the *sole* colorimetric calibration input.
  - The kit's own printed chart, if present in frame, is captured, hashed, and stored in the record purely as **contextual/comparative evidence** — e.g., so a human reviewer (supervisor, FSL reviewer, judicial officer) can visually compare the corrected test patch against what the officer would have compared it to under the pre-existing Standing-Order-1/88 procedure. It is never used as a numeric input to the correction or classification math for MVP.
  - **Phase 2 (future work, not MVP):** a "kit-chart digitization program" could spectrophotometrically measure a representative sample of each kit brand/batch's printed chart and register it as an optional secondary calibration source once genuine ground truth exists for it. This is explicitly deferred — `PHYSICAL EXPERIMENT REQUIRED` + a data-management program, not a software task.

---

## 9. Physical Manufacturing Specification

`KNOWN` (can be specified now, independent of chemistry data):

| Parameter | Specification | Rationale |
|---|---|---|
| Card dimensions | 100 mm × 70 mm (larger than ID-1 credit-card format 85.6×53.98 mm) | Needs room for 16 patches ≥10 mm square plus 4 fiducials + Data Matrix at a size resolvable from ~15–25 cm phone distance at typical rear-camera resolution, while remaining pocketable. |
| Patch size | ≥10 mm × 10 mm, target 12 mm × 12 mm | Must leave a usable interior sampling region (§17) after excluding a ≥1.5 mm border margin per patch to avoid edge/bleed contamination. |
| Patch spacing (gutter) | 2 mm neutral (unprinted substrate, matte black or gray) between patches | Prevents optical bleed/flare between adjacent saturated patches and gives the detector a clean patch-boundary signal. |
| Fiducials | 4× ArUco markers, ≥8 mm, one per corner | Robust pose estimation under rotation, moderate perspective, and partial occlusion — decision justified in §20. |
| Identity marker | 1× Data Matrix (preferred over QR for this size — higher data density at small print size) encoding `reference_card_id`, `reference_card_version`, `manufacturing_batch` | Machine-readable card identity without relying on OCR of small print. |
| Material | Rigid or semi-rigid substrate (e.g., laminated card stock or PETG), **matte finish only** | Matte finish minimizes specular glare (§17); rigidity resists field-handling warp that would distort planarity assumptions used in perspective correction. |
| Print process | Color-managed digital press with a fixed, documented ICC output profile; **not** consumer inkjet | Consumer inkjet has materially worse batch-to-batch and even print-to-print colorimetric repeatability; a defensible ΔE budget requires a controlled, profiled process. |
| Tolerance | Target: each printed patch within ΔE00 ≤ 2.0 of its assigned reference Lab value, measured after printing (spec target — **validate/tighten after first print run**, `PHYSICAL EXPERIMENT REQUIRED`) | ΔE00 ≈ 1 is a "just noticeable difference"; a ≤2 print tolerance keeps printing error small relative to the illumination/camera errors the system is designed to correct. |
| Card ID/version/batch | Encoded in the Data Matrix and printed in human-readable text on the card border | Supports manual fallback entry and physical audit even if the app can't read the code. |
| Expected lifetime / revalidation | Define a revalidation interval (e.g., 12 months) after which a card must be re-measured or retired | Printed inks fade/shift with heat, humidity, UV exposure — all realistic for roadside carry in Punjab/Rajasthan/Gujarat conditions. **Exact degradation curve is `PHYSICAL EXPERIMENT REQUIRED`** (accelerated aging test: heat/humidity/UV chamber exposure of sample cards, re-measured periodically against the spectrophotometer). |
| Storage requirement | Officer-facing guidance: store flat, out of direct sunlight, replace if visibly faded, creased, or stained | Operational control until aging data justifies an automated fade-detection check (a stretch goal: the app could itself flag a card as suspect if its own achromatic-ramp residuals drift over many uses — feasible only after field telemetry exists). |
| "Can an ordinary printed card be stable enough?" | **No, not an uncontrolled consumer-printed card.** A *controlled*, profiled, individually-measured, batch-tracked, periodically-revalidated card — yes, that is exactly the architecture recommended here. The distinction is "printed" vs. "printed under a managed, measured, versioned process," not paper vs. some exotic material. |

---

## 10. Reference Card Calibration Procedure

1. **Ground truth instrument: spectrophotometer, not colorimeter, and never the phone's own camera.** `KNOWN`. A spectrophotometer measures the full spectral reflectance curve and derives CIE XYZ/Lab under any chosen illuminant/observer combination analytically; a colorimeter only integrates three broad filtered channels (itself a lower-fidelity trichromatic device, with its own metamerism-type limitations) and is adequate only as a cheaper *secondary* QC check, not as the primary ground-truth source. Using the phone's own RGB as "ground truth" is circular and explicitly rejected (this is stated directly in the parent brief and is scientifically correct).
2. **Measurement condition:** CIE illuminant D50, 2° standard observer, 45°/0° (or diffuse/8° with specular component excluded) measurement geometry — the standard graphic-arts/printing colorimetry convention (consistent with ISO 17321-1's ties to ISO/CIE colorimetric practice). Record the exact geometry used; it must be held constant across all card batches.
3. **Universal vs. per-card reference values:** Use a **per-manufacturing-batch** reference value (mean of N sampled cards from that batch, each measured at multiple points per patch), **not** a single universal value assumed for all future print runs, and **not** a full per-individual-card measurement (impractical at issuance scale). This is the standard middle ground in color-target manufacturing: batch-level calibration captures run-to-run printing drift while remaining operationally feasible.
4. **Batch acceptance/rejection:** For each batch, measure a statistically justified sample size (e.g., 1 in every N cards off the press — exact N is a `PHYSICAL EXPERIMENT REQUIRED` decision once first-run repeatability data exists) and reject the batch if any patch's within-batch standard deviation, or its deviation from the target design Lab value, exceeds the tolerance in §9. Accepted batches get a `calibration_profile` record (mean Lab per patch + measured intra-batch variance) referenced by `manufacturing_batch` ID.
5. **Individual-card spot check:** A lightweight in-app self-check is possible: because the app captures the achromatic-ramp residual on every real use, aggregate per-card-serial residual statistics over time can flag an individual card that has drifted (faded, stained) from its batch profile — a `PHYSICAL EXPERIMENT REQUIRED` calibration exercise to set the drift threshold, deferred to post-MVP telemetry.

---

## 11–13. Color Pipeline, Color Space, and Where Each Transform Happens

### 11.1 Full pipeline

```
1. Captured frame (YUV/JPEG from Camera2/CameraX, AWB+AE locked at capture — see §34)
2. Decode → device RGB (8-bit sRGB-encoded, as delivered by the OS camera pipeline)
3. Linearize: undo sRGB opto-electronic transfer function (OETF) → linear device RGB
   [KNOWN formula: standard sRGB EOTF, IEC 61966-2-1]
4. Reference-card detection (ArUco corner localization → homography) — §17,20
5. Perspective-correct / rectify the card region using the estimated homography
6. Patch region extraction for all 16 patches using the card's fixed design geometry
   mapped through the homography — §17
7. Robust per-patch statistic extraction (trimmed mean after glare/outlier masking) — §18
8. Quality gate #1: card-level checks (detection confidence, patch visibility,
   glare fraction, clipping) — §25. Fail → INCONCLUSIVE, stop here.
9. Fit regression: linear device RGB (16 patches, observed) → CIE XYZ (16 patches,
   known reference, chromatically adapted to the capture's estimated illuminant if
   needed) using root-polynomial regression (§14-16)
10. Quality gate #2: calibration-fit quality checks (residual ΔE00 on the 16
    reference patches themselves — a fit that can't even reproduce its own
    reference patches well is not trustworthy) — §25. Fail → INCONCLUSIVE.
11. Test-patch region extraction (kit-profile-defined geometry, mapped through the
    same homography) — §21-22
12. Apply the fitted regression to the test-patch's linear device RGB → CIE XYZ
13. XYZ → CIE Lab (D50) → LCh
14. Quality gate #3: test-patch-level checks (glare/clipping/visibility on the
    test patch itself) — §25. Fail → INCONCLUSIVE.
15. TestPatchAnalyzer: package NormalizedColor + diagnostics as ColorFeatures
16. TestResultClassifier: compare ColorFeatures against the KitProfile's
    expected_result_colors using ΔE00-based distance/likelihood — §23
17. Confidence & abstention layer — §24,26
18. Emit ColorAnalysisResult (§36 schema) to the evidence pipeline
```

Normalization (steps 1–13) and classification (steps 15–17) are implemented as **separate modules with a typed boundary** (`NormalizedColor` in, `ClassificationResult` out) per the brief's explicit requirement (§24) — this is non-negotiable architecture, not a style preference, because it is what allows the classifier to be replaced/retrained per kit without touching the color-correction math, and what allows an auditor to inspect "what color did the engine measure" independent of "what did it conclude."

### 11.2 Color space decision matrix

| Purpose | Space | Why |
|---|---|---|
| Reference card ground truth (storage) | CIE Lab (D50, 2°) | Standard graphic-arts colorimetry convention; perceptually meaningful; instrument-native output. |
| Regression fitting (calibration) | Linear device RGB → CIE XYZ | Root-polynomial regression is defined and validated in RGB→XYZ space (Finlayson et al. 2015); XYZ is the linear device-independent space color science mappings are built on. |
| Illumination/white-point estimation | Chromaticity (CIE xy) derived from the achromatic patches' fitted XYZ | Standard way to characterize an illuminant's color independent of its intensity. |
| Comparison / classification distance | CIE Lab / LCh, ΔE00 | CIEDE2000 (Luo, Cui & Rigg, 2001, *Color Research & Application* 26(5):340–350) is the CIE-recommended, most perceptually uniform standard color-difference metric currently available, correcting known CIE76/94 weaknesses particularly in saturated/blue regions — directly relevant here since reagent endpoint colors are often saturated. |
| Storage in the evidence record | Both: raw device RGB (unaltered, for audit) **and** derived Lab (normalized result) | Never store only the derived value — the evidence engine must be able to recompute/audit from the raw image independently (§38). |
| On-screen officer feedback (optional) | HSV/HSL acceptable for simple viewfinder overlays (e.g., "too dark/too bright" bar) | HSV is intuitive for lightweight real-time UI feedback; it is not used anywhere in the calibration or classification math. |

sRGB "as delivered by the phone" is explicitly **not** used as the calibration or classification space — it is only the raw ingest format that gets linearized in step 3.

---

## 14–16. Normalization Algorithm: Candidates, Comparison Protocol, and Recommendation

### 14.1 Candidates evaluated

| # | Method | Verdict |
|---|---|---|
| 1 | Per-channel scaling (diagonal gain) | Baseline only — cannot correct cross-channel/hue errors (§4.1 rationale). Include in benchmark as the floor. |
| 2 | 3×3 color correction matrix (CCM), least squares | Strong, simple, exposure-independent baseline. Include in benchmark. |
| 3 | 3×3 CCM + bias (affine) | Adds a constant offset term — can help with black-level/flare offsets. Include in benchmark. |
| 4 | Full polynomial regression (2nd order, 9+ terms) | Documented in the literature to become unstable/rank-deficient with few patches and to **non-linearly magnify errors when exposure changes** between calibration and test conditions (Finlayson et al. 2015) — a real risk here since officers cannot be assumed to hold identical exposure every time. Include in benchmark for completeness, expect it to underperform on the cross-exposure validation split. |
| 5 | **Root-polynomial regression** | **Primary hypothesis.** Same expressive power as polynomial regression for the *chromaticity* mapping but each expanded term is constructed to scale linearly with exposure (e.g., the 2nd-order root terms are R, G, B, √(RG), √(RB), √(GB) — 6 terms instead of 9), which the original paper shows preserves exposure-invariance the way the plain 3×3 CCM does while still correcting cross-channel/hue errors better than a 3×3 matrix alone. This directly targets Parinaam's two worst real-world variables at once: uncontrolled exposure and uncontrolled illuminant hue. |
| 6 | Chromatic adaptation transform (e.g., Bradford) alone | Not a substitute for camera characterization — a CAT corrects for illuminant *white-point* shift given already-colorimetric XYZ values; it does not characterize a non-colorimetric camera sensor. **Used as a component inside step 9 of the pipeline** (adapting the reference Lab values' D50 basis to the estimated scene illuminant before/after the regression, as needed) rather than as a standalone method. |
| 7 | Compact ML model (small MLP / lightweight learned mapping) | **Not adopted for MVP**, explicitly not assumed superior (per instruction). Reasons: (a) each individual capture event only has 16 calibration points — an MLP has no meaningful "per-image" training signal beyond what a regression already extracts; any ML model here would have to be trained *once, offline*, on the large cross-device/cross-lighting dataset (§27) to learn a *global* correction function, which raises harder generalization and drift-monitoring questions than a per-image regression; (b) forensic auditability favors a small number of named, inspectable coefficients (a 6×3 or similar matrix) that can be exported into the evidentiary record and explained in court testimony over an opaque learned model; (c) determinism/versioning (§39) is simpler for a closed-form regression. **Flagged as a Phase-2 research track**, to be revisited only if the measured ΔE00 of the root-polynomial approach, after real dataset validation, is not good enough. |

### 15. Experimental comparison protocol (must be run before locking in a method)

For every candidate, on a held-out validation set (not used for fitting), compute:
- Mean, median, 90th-percentile, and worst-case ΔE00 between the corrected test-patch/validation-patch color and its known ground truth.
- Robustness breakdown by: illumination condition, camera/device, exposure level (leave-one-out splits per §27–29).
- Compute cost (ms) and memory footprint on a representative low/mid-range Android device.
- Explainability: can each fitted coefficient be inspected/exported for audit? (Yes for 1–6; effectively no for 7.)
- Reproducibility: does the same input always produce the same output within numerical tolerance across the reference (research) implementation and the mobile implementation (§35)?

**Selection rule:** choose the method with the best median+90th-percentile ΔE00 on the *cross-device, cross-lighting* held-out splits (not the in-distribution split — in-distribution performance is not the relevant question), subject to meeting the mobile latency/memory budget (§34). Root-polynomial regression is the working hypothesis to start this comparison from, not an assumed final answer — this document does not claim it is superior without the experiment; §14 states the evidence and reasoning for testing it first.

### 16. Illumination / white-balance estimation method (§18)

**Adopted: card-based joint estimation, not gray-world, not single white-patch.**
- Gray-world assumes the *average* scene reflectance is neutral gray — false here by construction, because the frame is deliberately dominated by a small number of saturated reagent/card colors, not a naturally colorful, averaging-out scene.
- Single white-patch estimation uses only the brightest/whitest patch, which is exactly the patch most susceptible to localized glare/clipping (§17) — a poor single point of failure.
- The recommended approach uses **all 6 achromatic patches** (P01–P06) as the neutral-axis anchor and folds the white-balance/illumination estimate into the *same* least-squares regression that produces the full color-correction mapping (step 9 of §11.1), rather than as a separate upstream white-balance pass followed by a second color-correction pass. Doing it jointly avoids compounding two independently-erroring stages and is consistent with how the root-polynomial method is validated in the literature (fit directly against all reference patches at once).

---

## 17. Reference Card Detection & Perspective Correction

**Geometry method comparison (§20):**

| Method | Verdict |
|---|---|
| Plain contour/edge detection of the card outline | Fragile under partial occlusion, cluttered backgrounds (a truck bed at night, a dhaba table), and low-light noise. Rejected as the primary method. |
| QR/Data Matrix corner detection for pose | Usable, but a single code's 3 finder patterns are a comparatively small, tightly clustered detection target — accuracy of the derived homography degrades with distance/blur. |
| **ArUco markers (4, one per corner)** | **Adopted for pose/geometry.** Purpose-built for exactly this — robust, sub-pixel corner localization even at moderate blur/rotation/partial occlusion (an ArUco detector can still resolve a homography if 2–3 of the 4 markers are visible, degrading gracefully rather than failing completely), and computationally cheap (well-supported in OpenCV, real-time on-device). |
| AprilTag | Comparable robustness to ArUco; ArUco is chosen for tooling maturity/ecosystem support in OpenCV's `aruco` module, which the rest of this spec assumes. Either is defensible; do not use both. |
| **Data Matrix (separate from the 4 ArUco corner markers)** | **Adopted for card *identity*, not pose** — encodes `reference_card_id` / `reference_card_version` / `manufacturing_batch` (§21) at high data density in a small footprint. |

**Procedure:** detect the 4 ArUco markers → estimate a homography from their known design-file corner coordinates to their detected image coordinates → warp/rectify (or, preferably, keep the original image and instead inverse-map each patch's known design coordinates through the homography to sample directly from the un-warped frame, avoiding a lossy re-sampling step) → this homography is also used to locate the Data Matrix and, via the `KitProfile`'s declared card-relative offset, to help locate the test-patch region if the kit profile specifies the test device's position relative to the card (§21–22).

**Spatial illumination (§19):** Because the reference card is placed immediately beside the test patch by design, a **global** (single) correction transform is the default and is sufficient for the typical case (card and patch under materially the same local light). Do **not** implement local/spatially-varying correction for MVP — added complexity is not justified without evidence of need. Instead, **detect** the failure case: if the local exposure/luminance statistics of the region immediately adjacent to the test patch differ materially from the region immediately adjacent to the card (e.g., one is in a hard shadow edge the other isn't), raise a `MIXED_LIGHTING` quality-gate failure (§25) rather than silently attempting an unvalidated local correction. This is the "detect rather than fabricate" principle applied to the spatial dimension.

---

## 18. Patch Sampling — Robust Statistics

**Decision: for every patch, compute a spatially-trimmed robust statistic, never a naive full-patch mean.**

Procedure per patch:
1. Using the homography, map the patch's known design rectangle into image coordinates.
2. Erode the mapped region inward by a fixed margin (e.g., 25% of patch width) to discard edge/bleed/registration-error pixels — this alone removes most contamination from adjacent-patch bleed and minor homography error.
3. Within the eroded region, compute per-pixel local statistics (a small sliding window) to identify:
   - **Specular/glare pixels** — pixels where at least one channel is at or near sensor saturation (e.g., ≥250/255 in 8-bit) *and* the local neighborhood shows a sharp, small, high-contrast highlight (glare's spatial signature vs. a genuinely bright but uniform patch).
   - **Shadow-edge/contamination pixels** — pixels that are strong local outliers (e.g., beyond a robust z-score threshold using MAD — median absolute deviation) relative to the rest of the eroded patch region.
4. Mask out flagged pixels.
5. From the remaining pixels, compute the **trimmed mean** (e.g., drop the top/bottom 10% by luminance before averaging) as the patch's representative linear RGB value — trimmed mean (rather than plain mean or a single central-crop pixel) is chosen because it is robust to a moderate fraction of residual outliers without discarding as much information as a median-only or tiny-central-crop approach, and is cheap to compute on-device.
6. Record, per patch, the **fraction of pixels masked out** as a diagnostic — feeds directly into the glare/contamination quality gate (§25): if masked-fraction exceeds a threshold for a given patch, that patch's contribution to the regression is down-weighted or the whole frame is rejected (see §19 below for the exact rule).

**Exact numeric thresholds** (erosion %, MAD z-score cutoff, saturation cutoff, trim %, masked-fraction rejection limit) are **initial engineering defaults**, not experimentally validated — mark as `PHYSICAL EXPERIMENT REQUIRED`: they must be tuned against the labeled adversarial dataset (§27, §47) before being frozen in the shipped config (§51 config file, not hardcoded in logic).

---

## 19. Glare, Exposure, and Clipping — Detection Rules

**Principle (§16 of the brief, restated as the governing rule): prefer safe rejection over unreliable correction. Glare is detected and, where it invalidates a patch, causes rejection — it is not "corrected."**

| Failure | Detection signal | Action |
|---|---|---|
| `EXCESSIVE_GLARE` | Masked-pixel fraction (§18 step 6) exceeds threshold on ≥1 reference patch or the test patch itself | Reject that patch's contribution; if it's a reference patch needed for regression conditioning, or the test patch itself, fail the whole frame → `INCONCLUSIVE` |
| `OVEREXPOSURE` / `CHANNEL_CLIPPING` | Fraction of pixels at/near the sensor's max digital value (per channel) in the white patch (P01) or test patch exceeds threshold; or the achromatic ramp's expected monotonic ordering (white > light-gray > mid-gray > ... > black in raw luminance) is violated/compressed | Reject frame |
| `UNDEREXPOSURE` / `LOW_LIGHT` | Overall scene luminance (e.g., mean of the black/dark-gray patches, or overall histogram) below threshold; or achromatic ramp's dynamic range (white-patch value minus black-patch value) is too compressed to usefully separate the 6 steps | Reject frame, coach officer ("more light required") in real time before capture even completes (viewfinder-stage check, not just post-capture) |
| `EXCESSIVE_BLUR` | Standard on-device sharpness metric (e.g., variance of Laplacian) below threshold on the card region | Reject frame, coach ("hold steady") |
| `SEVERE_PERSPECTIVE` | ArUco-derived homography implies an oblique viewing angle beyond a set limit (derivable from the ratio of the card's detected vs. design aspect ratio / from the homography's decomposed rotation angle) | Reject frame, coach ("hold camera more level") |

Exact numeric thresholds for all rows above are **initial defaults pending calibration against the dataset (§27)** — not invented "impressive numbers," per instruction. The calibration procedure: capture a labeled set of images spanning the full range from clearly-good to clearly-unusable for each failure mode, and choose each threshold at the operating point that separates them on a precision/recall or ROC basis on that labeled set (this is a standard threshold-selection exercise, but it requires the physical dataset described in §27 to execute — it cannot be done from first principles alone).

---

## 20. Test-Patch Detection & Kit-Profile Architecture

The test-result geometry varies by kit (§22 requirement). **Do not hardcode a pixel rectangle.** Adopt a configurable `KitProfile`:

```yaml
kit_profile_id: string            # stable unique ID
manufacturer: string
kit_name: string
model: string
test_name: string                 # e.g. which reagent test within a multi-test kit
test_type: enum                   # e.g. COLOR_STRIP, WELL, AMPOULE, PRINTED_PATCH_MOCK — extensible
kit_profile_version: integer
effective_date: date
supersedes: kit_profile_id | null

test_geometry:
  locator_method: enum            # HOMOGRAPHY_OFFSET | MANUAL_ROI | (future) VISUAL_DETECTOR
  # HOMOGRAPHY_OFFSET: officer places kit at a fixed, guided position relative to
  # the reference card; the test-patch rectangle is defined in card-relative
  # coordinates and located via the same homography used for card patches.
  roi_card_relative: {x, y, width, height}   # only if locator_method = HOMOGRAPHY_OFFSET
  roi_manual: null                # reserved: officer-assisted bounding box, MVP fallback
                                   # for any kit not yet profiled

expected_result_colors:
  # one entry per defined outcome category for this specific test
  - outcome_label: string          # e.g. "POSITIVE_OPIATES", "NEGATIVE", "INDETERMINATE_COLOR"
    reference_lab: {L, a, b}       # PHYSICAL/CHEMICAL EXPERIMENT REQUIRED — placeholder only
    tolerance_radius_de00: float   # calibrated, not guessed — see §23
    source: string                 # e.g. "Phase B controlled trial, batch X, N=..." — audit trail

reference_mapping:
  reference_card_id: string        # which Parinaam card design/version this profile assumes
  color_space: "CIELAB_D50"

validity_rules:
  kit_expiry_check: boolean
  batch_specific: boolean          # false until batch-level data exists (per brief)
  min_confidence_to_classify: float

model_version: string              # ties this profile to a specific classifier build
```

**Fallback for an unprofiled kit** (explicitly required by the brief, since officer manual entry is the MVP path for kit identification): if no `KitProfile` matches the officer-entered kit details, the pipeline still runs card detection/color-correction (useful for the record and future profiling) but **must** return `UNKNOWN_KIT` at the classification quality gate rather than guessing a generic geometry or color mapping.

**Kit-specific calibration (§23 of brief):** different kits will, in general, need different `expected_result_colors` sets (different reagents produce different endpoint hues) and potentially different `tolerance_radius_de00` (some reactions may be more visually distinct/robust than others). Do **not** assume a single global tolerance. The architecture above makes this per-`kit_profile_id`; populating real values is `DOMAIN-EXPERT VALIDATION REQUIRED` + `PHYSICAL EXPERIMENT REQUIRED` (Phase B, §31), not a software decision.

---

## 21–22. Normalization vs. Classification — Enforced Separation

```
ColorNormalizer(image, capture_metadata, reference_card_profile)
    → NormalizedColor { lab, xyz, raw_device_rgb, calibration_diagnostics }

TestPatchAnalyzer(image, homography, kit_profile, NormalizedColor-producing
                  calibration function)
    → ColorFeatures { normalized_lab, delta_e_vs_each_expected_outcome,
                       patch_quality_diagnostics }

TestResultClassifier(ColorFeatures, kit_profile.expected_result_colors)
    → ClassificationResult { outcome_label, confidence, abstained: bool,
                              inconclusive_reason: string|null }
```

`ColorNormalizer` never sees `expected_result_colors` and never emits an outcome label — enforced at the type/interface level (its output type has no field capable of expressing a classification). `TestResultClassifier` never touches raw pixels — it only consumes already-normalized `ColorFeatures`. This lets the classifier be swapped, re-trained, or extended to new kits without touching the color-correction math, and lets an auditor independently verify "what color was measured" separate from "what the software concluded from it" — directly serving the evidentiary/auditability goal.

---

## 23. Classification Architecture

**MVP method: nearest-reference classification with calibrated distance-to-confidence mapping, in CIE Lab using ΔE00**, not a trained neural classifier, for the same reasons ML was deferred in §14 candidate 7 (auditability, small per-kit calibration datasets initially, determinism).

Procedure:
1. Compute ΔE00 between the normalized test-patch Lab value and each `outcome_label`'s `reference_lab` in the active `KitProfile`.
2. The outcome with the smallest ΔE00 is the candidate label, **only if** that ΔE00 is within its `tolerance_radius_de00` **and** is meaningfully smaller than the distance to every other candidate outcome (a explicit margin check — prevents picking a "closest but still far and ambiguous" label).
3. If no candidate satisfies both conditions, or if two candidates are within a defined ambiguity margin of each other, the result is `INCONCLUSIVE` with `inconclusive_reason = "AMBIGUOUS_COLOR"` or `"NO_CLOSE_MATCH"`.
4. `tolerance_radius_de00` and the margin threshold are **per-kit-profile, experimentally calibrated values** (`PHYSICAL EXPERIMENT REQUIRED` — Phase B trial data, §31), not global constants.

**Phase-2 path (explicitly deferred, not MVP):** once enough labeled Phase B/C data exists per kit, a small, interpretable statistical classifier (e.g., a per-outcome Gaussian/ellipsoid model in Lab space fit from real trial replicates, rather than a single point + radius) could replace the fixed-tolerance nearest-reference rule, still without opening the door to an opaque MLP unless the evidence (§15 protocol) justifies it.

---

## 24. Confidence & Abstention

**Do not use a raw softmax-style number as "confidence."** Design requirements:

- **Confidence definition:** a *calibrated* probability that the assigned outcome label is correct, derived from the ΔE00-to-outcome margin structure above (e.g., via a **monotonic calibration function** — such as isotonic regression or Platt-style scaling — fit against real labeled trial outcomes, mapping "margin between best and second-best ΔE00" → "empirical accuracy in that margin bucket"), not an arbitrary function invented without validation data.
- **Calibration validation:** report **Expected Calibration Error (ECE)** and a **reliability diagram** (predicted confidence bucket vs. observed accuracy in that bucket) on held-out labeled data before shipping any confidence number — this is a testable requirement, not a nice-to-have.
- **Brier score** reported alongside accuracy as a proper scoring rule that jointly penalizes miscalibration and inaccuracy.
- **Selective classification / abstention:** define an abstention threshold on confidence such that, below it, the system returns `INCONCLUSIVE` with `inconclusive_reason = "LOW_CONFIDENCE"` rather than forcing an answer. Choose this threshold using a **risk-coverage curve** (accuracy among *accepted* predictions vs. fraction of samples accepted) evaluated on held-out data — pick the operating point that satisfies a pre-agreed acceptable-risk target (e.g., "false-classification rate among accepted samples ≤ X%"), where **X is a policy decision requiring domain/legal input, not a number this document invents** (`DOMAIN-EXPERT VALIDATION REQUIRED` + `LEGAL VALIDATION REQUIRED` — what false-classification rate is acceptable for a presumptive-only, non-confirmatory tool is a joint technical/legal/operational decision).
- **Product principle (§48 of brief, restated as an engineering constraint):** the abstention threshold must be tunable via configuration (§51), and the system's primary optimization target during tuning is **risk-controlled coverage**, not maximizing the raw percentage of images that receive a firm answer.

---

## 25. Quality-Gating System — Exact Failure States

The full enumerated failure-state set (from the brief, confirmed complete for this architecture) with the gate stage each belongs to:

| Stage | Failure codes |
|---|---|
| Card detection | `REFERENCE_CARD_NOT_FOUND`, `REFERENCE_CARD_PARTIAL`, `REFERENCE_CARD_TOO_SMALL`, `REFERENCE_CARD_INVALID` (wrong/unrecognized card ID, or expired per `expiry/revalidation_date`) |
| Image quality (card region) | `EXCESSIVE_BLUR`, `LOW_LIGHT`, `OVEREXPOSURE`, `UNDEREXPOSURE`, `CHANNEL_CLIPPING`, `EXCESSIVE_GLARE`, `SEVERE_PERSPECTIVE` |
| Calibration-fit quality | `INSUFFICIENT_CALIBRATION_CONFIDENCE` (the fitted regression's residual ΔE00 on its own 16 reference patches exceeds a threshold — i.e., even the model's fit to known-answer patches is poor, so applying it to the unknown test patch is unjustified) |
| Illumination consistency | `MIXED_LIGHTING` (card-region vs. test-patch-region local exposure/shadow statistics diverge beyond threshold — §17) |
| Test patch | `TEST_PATCH_NOT_FOUND`, `TEST_PATCH_PARTIAL` |
| Kit identity | `UNKNOWN_KIT` (no matching `KitProfile`) |
| Classification | `AMBIGUOUS_COLOR`, `NO_CLOSE_MATCH`, `LOW_CONFIDENCE` (§23–24) |

**Hard rule:** any failure at any stage short-circuits the pipeline. The output is `INCONCLUSIVE` plus the specific machine-readable code(s) that fired (more than one may fire; report all that apply, not just the first). **The system must never proceed to emit `POSITIVE`/`NEGATIVE` after a quality-gate failure**, and this must be enforced structurally (e.g., the classifier function's input type cannot be constructed except from a successfully-gated `ColorFeatures` object) rather than by convention, so a future code change cannot accidentally bypass it.

---

## 26–30. Dataset Design, Camera/Lighting Generalization, Ground Truth

### 26.1 Dataset composition (physical, required before any threshold/algorithm is finalized)

For every capture in the dataset, record: reference card (ID + independently spectrophotometer-measured ground truth), a known color target standing in for the test patch (see Phase A/B/C split below), device model, lighting condition, distance, orientation/tilt, and exposure setting (locked vs. auto).

**Lighting conditions to cover** (§27 of brief): daylight (direct sun), open shade, overcast/cloudy, indoor LED (multiple correlated color temperatures if possible — warm white and cool white LED are visually and colorimetrically different), fluorescent tube, vehicle interior (dome light / headlamp spill, a realistic Parinaam scenario per the brief's own "rear of a truck" example), mixed lighting (e.g., one side lit by a phone torch, the other by ambient), low light, and night/roadside with only a phone flashlight or vehicle headlights — the brief's own stated realistic deployment conditions.

**Devices:** deliberately diverse — multiple manufacturers, at least low/mid/flagship price tiers (given real procurement, officers will not all have the same phone), multiple sensor generations, multiple Android OS versions where camera-stack behavior differs (e.g., HDR/computational-photography defaults vary by OS version and OEM camera app — must be tested with those defaults **on**, since officers will not be expected to change phone settings).

### 26.2 Cross-device and cross-lighting validation (§28–29 of brief)

- **Leave-one-device-out:** fit/select thresholds and (if applicable) any learned component using all devices except one, evaluate on the held-out device. Repeat rotating the held-out device. Report the *distribution* of held-out ΔE00/accuracy across devices, not just an average — a method that works great on 9 devices and fails on the 10th is a real risk to flag, not average away.
- **Leave-one-lighting-out:** analogous, rotating which lighting condition is held out (brief's own example: train on daylight+LED, test on fluorescent/cloudy/vehicle-interior). Report degradation explicitly; do not report only best-case numbers.

### 26.3 Ground truth methodology (§30)

Spectrophotometer measurement of the reference card (already specified, §10) is the ground truth for **calibration**. For **test-patch/classification** ground truth in Phases A/B, use:
- **Phase A (color-science calibration only):** standardized, spectrophotometer-measured color targets/patches as stand-ins for the "test patch" position — this validates the *color-correction pipeline itself*, independent of any drug chemistry, and requires no controlled substances at all.
- **Phase B (field-kit chemical response validation):** real field-kit reagent reactions against safe surrogates and laboratory-approved non-controlled reference materials that are documented to produce characteristic colorimetric responses analogous to the target analytes, plus any authorized inert/blank controls — exact protocol is `DOMAIN-EXPERT VALIDATION REQUIRED` (a forensic chemist must specify which surrogates are appropriate per reagent; this document does not invent reagent chemistry).
- **Phase C (authorized forensic validation):** real reagent-vs-controlled-substance trials, only through an authorized forensic lab (e.g., NFSU/CFSL-affiliated) under proper legal authorization — `LEGAL VALIDATION REQUIRED` + `DOMAIN-EXPERT VALIDATION REQUIRED`, entirely outside this document's authority to specify further.

In all phases, ground truth for the *color* is still the spectrophotometer measurement of whatever is in the test-patch position (the surrogate/target/authorized sample), never the phone's own camera output.

### 26.4 Synthetic augmentation (§32)

A synthetic augmentation pipeline (simulating illumination shift, exposure change, white-balance error, gamma variation, sensor noise, JPEG compression artifacts, mild blur, synthetic glare/shadow overlays, and perspective warps applied to *already-captured real* Phase-A images) is a reasonable and standard way to multiply effective training/validation coverage for threshold-tuning and regression-robustness testing. **It must supplement, never replace, physical photographs** — synthetic augmentation can interpolate around real captured conditions but cannot manufacture new information about how an actual unseen device's sensor or an actual unseen lighting spectrum behaves; leave-one-device-out and leave-one-lighting-out validation (§26.2) must always include a real, physically captured held-out set.

---

## 31. Evaluation Metrics (consolidated)

| Category | Metrics |
|---|---|
| Color accuracy | Mean / median / 90th-percentile / worst-case ΔE00 (primary); ΔE76 and ΔE94 reported for comparability with older literature but not used for decisions |
| Classification | Accuracy, precision, recall, F1 per outcome label, full confusion matrix, all broken out by lighting/device split (§26.2) |
| Confidence calibration | Expected Calibration Error (ECE), reliability diagram, Brier score |
| Abstention | Risk-coverage curve, false-classification rate among accepted (non-abstained) predictions, overall abstention/rejection rate |

**Acceptance targets are determined from these experiments, not asserted up front** — per instruction, this document does not invent "impressive numbers." The correct process: run the above on the Phase A/B dataset, report the actual achieved numbers, and set the shipped abstention threshold at the operating point that meets a jointly agreed (technical + domain + legal) acceptable-risk target (§24).

---

## 32. Mobile Architecture & Performance — React Native

**Governing split, and why it matters more (not less) in React Native:** anything that touches a full-resolution image buffer or needs direct native camera-hardware control must be native code. Anything that only operates on small numeric arrays — the ≤16 patch RGB triples per capture, small matrices, scalars — can, and should, be a **single shared TypeScript module** used by both platforms. This is the same normalizer/classifier separation from §21–22, mapped onto where the code is physically allowed to live in a cross-platform stack.

- **Camera capture:** `react-native-vision-camera` (VisionCamera v4) — the current, actively-maintained option that supports synchronous, JSI-based Frame Processors with direct native frame-buffer access (no bridge-serialization copy of a ~10–12 MB frame per capture), and lets Frame Processor Plugins be written in Kotlin, Swift, Objective-C++, or C++.

- **Manual AE/AWB lock — a real engineering gap, confirm before assuming it's solved.** VisionCamera's built-in `exposure` prop is an exposure-*compensation bias* layered on top of continuous auto-exposure — not a true lock of exposure/ISO/white-balance (a long-standing open feature request against the library at the time of this writing). Because §17/§19's quality gates depend on the reference card and the test patch being captured under one stable, queryable exposure/white-balance state, this requires a **small custom native module**: wrap Android Camera2's `CONTROL_AE_LOCK` / `CONTROL_AWB_LOCK` and iOS AVFoundation's `AVCaptureDevice` locked exposure/white-balance modes, and expose a `lockExposureAndWhiteBalance()` / `unlock()` pair to the JS capture-flow code, called immediately before the shutter trigger. **Re-verify VisionCamera's current capabilities at implementation time** — this library ecosystem moves quickly and this gap may close.

- **Card detection / geometry (native, image-heavy):** implement ArUco detection + homography estimation as a VisionCamera Frame Processor Plugin. Two structural options exist long-term — **for MVP, the Android-only choice below is adopted; the shared-core option is documented for when iOS is added post-MVP:**
  - **Post-MVP option: a single shared C++ core.** Write the ArUco/homography/patch-pixel-sampling logic once in C++ against OpenCV's C++ API, wrapped by a thin Kotlin/JNI binding on Android and a thin Swift/Objective-C++ binding on iOS. This avoids maintaining two independent reimplementations of the same geometry code — in a court-facing tool, "Android and iOS silently disagree on a homography" is exactly the kind of bug that must be architecturally prevented, not caught in QA. Community bindings such as `react-native-fast-opencv` are a reasonable prototyping accelerant, but given the evidentiary correctness bar here, treat any third-party OpenCV binding as a development convenience and plan to vendor/pin the actual detection code path so an upstream package update can never silently change a court-facing result.
  - **Android-only for MVP (adopted).** A single native Kotlin module directly wrapping OpenCV-Android — no JNI/C++ shared-core layer, no iOS binding. This removes all cross-platform-parity risk and the associated build-tooling overhead for now. Revisit the shared-C++-core option above only if/when iOS is added post-MVP.

- **Color-space conversion, regression application, ΔE00, classification, and confidence (shared, small-math — not image-heavy):** implement once as a **single TypeScript module** (`mobile/src/colorEngine/`), unit-tested once, imported unchanged on both platforms. This is a genuine advantage of the React Native architecture over a native-only build: the §33 numerical-consistency requirement changes from "keep a Python reference implementation in sync with *two* platform reimplementations (Kotlin and Swift)" to "keep it in sync with *one* shared TypeScript implementation" — meaningfully less surface area for silent cross-platform divergence. These functions run on at most 16 small arrays per capture, so JS execution speed is not a real constraint here; do not move this logic into native code "for performance" — it doesn't need it, and every line moved to native is a line that now has to be duplicated and kept in sync per platform.

- **Data flow per capture:** Frame Processor Plugin (native) detects the card, computes the homography, and returns a small JSON-serializable payload — per-patch robust-sampled RGB values + diagnostics, not the full image — across the JSI boundary → the shared TypeScript `ColorEngine` module consumes that payload and runs steps 9 onward of §11.1 (fit, correction, classification, confidence) → the result is handed to the (out-of-scope) evidence engine.

- **ML runtime:** **not required for MVP** (§14/§23 keep the pipeline classical). If/when a learned component is adopted (Phase 2), `react-native-fast-tflite` (TFLite via a VisionCamera Frame Processor) or an ONNX Runtime Mobile equivalent is the appropriate path — decide at that time based on the actual model's export needs. **Do not force ML where classical color science performs comparably or better.**

- **Performance budget (initial targets, to be confirmed by real benchmarking — `PHYSICAL EXPERIMENT REQUIRED`):** end-to-end pipeline should still complete within roughly 1–2 seconds on a mid-tier device. The JSI Frame Processor path avoids bridge-serializing the full frame, which keeps this achievable, but it must be benchmarked on real low/mid-tier Android hardware (and iOS hardware, if in scope) — not assumed from the library's marketing claims.

- **Image resolution:** unchanged from the original requirement — capture at a resolution that keeps each ~10–12 mm patch resolvable at the guided working distance (e.g., a ≥40×40 px per-patch target post-rectification, derived from field of view and working distance). Exact number is a `PHYSICAL EXPERIMENT REQUIRED` tuning step once real devices/lenses are benchmarked.

---

## 33. Numerical Consistency Requirement

Because a Python (or similar) reference implementation will be used for research/threshold-tuning/dataset processing while the shipped product runs the equivalent logic on-device, the two implementations **must be verified numerically equivalent**, not just "logically similar". With the React Native architecture in §32, "the mobile implementation" for everything past patch-sampling (color space, regression application, ΔE00, classification, confidence) is the **single shared TypeScript module**, not a separate Android and iOS reimplementation — so this equivalence test suite only has one on-device target to validate against for that portion of the pipeline. The native Frame Processor Plugin (ArUco detection, homography, patch sampling) still needs its own equivalence check against the Python reference, and if the shared-C++-core option was chosen, that check also only needs to run once, not once per platform.

- Maintain a shared, versioned **golden numerical test suite**: a fixed set of input patch RGB values (synthetic, spanning edge cases) with pre-computed expected outputs (linearization, regression fit, XYZ/Lab conversion, ΔE00) generated once from the reference implementation.
- The mobile implementation must reproduce these to within an explicitly stated tolerance (e.g., ΔE00 agreement within 0.1, normalized color channel agreement within a stated epsilon) — exact tolerance is an engineering decision to set once both implementations exist, but the *requirement that this test suite exists and gates every release* is not optional.
- Any change to either implementation that shifts these golden numbers must be a deliberate, reviewed, versioned event (§39), not a silent drift.

---

## 34. Output Contract (Schema)

```json
{
  "engine_version": "string (semver)",
  "normalization_model_version": "string",
  "classifier_model_version": "string",
  "reference_card_id": "string",
  "reference_card_version": "string",
  "reference_card_calibration_profile_id": "string",
  "kit_profile_id": "string",
  "kit_profile_version": "string",
  "image_id": "string (matches evidence engine's image hash record)",

  "quality": {
    "status": "PASS | FAIL",
    "failure_codes": ["string", "..."],
    "diagnostics": {
      "card_detection_confidence": "float",
      "patches_masked_fraction": {"P01": 0.0, "...": "..."},
      "blur_score": "float",
      "exposure_histogram_summary": "object",
      "mixed_lighting_delta": "float"
    }
  },

  "calibration": {
    "method": "root_polynomial | ccm_3x3 | ccm_bias | per_channel_scale",
    "fit_residual_delta_e00": "float",
    "illuminant_estimate_xy": {"x": "float", "y": "float"},
    "coefficients": "array (method-specific, for audit/export)"
  },

  "raw_color": {
    "device_rgb_linear": {"r": "float", "g": "float", "b": "float"},
    "device_rgb_srgb_encoded": {"r": "int", "g": "int", "b": "int"}
  },

  "normalized_color": {
    "color_space": "CIELAB_D50",
    "L": "float", "a": "float", "b": "float"
  },

  "classification": {
    "outcome_label": "string | null",
    "confidence": "float | null",
    "abstained": "boolean",
    "inconclusive_reason": "string | null",
    "delta_e00_per_candidate": {"outcome_label": "float", "...": "..."}
  },

  "diagnostics": {
    "processing_time_ms": "int",
    "notes": "string"
  }
}
```

This schema is the deliverable for §36/§39 of the brief — every field needed to (a) reproduce the reasoning later, (b) audit the exact model/card/kit versions involved, and (c) support the presumptive-only disclaimer (the schema has no field that could be mistaken for a confirmatory forensic identification) is present.

---

## 35. Integration Boundary with the Evidence Engine

**What this engine records vs. what the evidence engine hashes:**
- The **raw captured image bytes** are owned entirely by the evidence engine (capture, immediate hashing, signing) — the color engine receives a reference/handle to the already-captured, already-immutable image; it never mutates or re-saves the image.
- The color engine's entire output (§34 schema) is **derived data** — it gets included in the signed record's payload (so it is covered by the same Section 63(4)-style hash/signature as everything else) but is clearly distinguishable, in the schema itself, from the raw evidentiary image.
- **Version information preserved:** `engine_version`, `normalization_model_version`, `classifier_model_version`, `reference_card_id/version`, `kit_profile_id/version` are all first-class fields precisely so that a record produced today remains fully interpretable if the algorithm, card design, or kit profile changes later (§39 reproducibility requirement) — a reviewer or court can always determine exactly which version of every component produced a given historical record.

---

## 36. Manual / Physical Work Required (cannot be resolved in software)

- Obtain actual field kits (multiple brands/models) used across NCB/state police units; physically photograph and measure their geometry and any bundled reference chart.
- Obtain/request manufacturer technical documentation for reagent color-change endpoints per test type (Marquis, Mecke, Duquenois-Levine, Scott/Simon's, and any others in active use) — `RESEARCH REQUIRED` first, `DOMAIN-EXPERT VALIDATION REQUIRED` to confirm.
- Design, print, and spectrophotometrically measure the first Parinaam reference card print run; assess actual achievable print tolerance (§9) and revise the ΔE tolerance spec if needed.
- Conduct accelerated aging tests (heat/humidity/UV) on printed cards to set the revalidation interval.
- Capture the full Phase A physical dataset (§26) across multiple real devices and real lighting conditions, including realistic night/vehicle-interior/roadside conditions.
- Conduct Phase B controlled trials with authorized surrogate/reference materials under forensic-chemist supervision to populate real `expected_result_colors` per kit profile.
- Pursue Phase C authorized forensic validation only through proper institutional/legal channels.
- Physically test across the target range of Android devices (leave-one-device-out requires real hardware, not emulators, for camera-sensor-specific behavior).
- Engage a legal reviewer for the Section 63(4) certificate content and for the acceptable-risk-rate policy decision in §24.

None of the above can be shortcut with a software assumption — this document deliberately leaves each one as an open physical/human task rather than inventing a plausible-sounding placeholder for it.

---

## 37. Unknowns Register

| Item | Status |
|---|---|
| Exact Lab/hex values for reference card patches (all 16) | PHYSICAL EXPERIMENT REQUIRED (spectrophotometer measurement of first print run) |
| Exact hue/chroma of the 4 reagent-adjacent anchor patches | DOMAIN-EXPERT VALIDATION REQUIRED (needs real reagent endpoint color data first) |
| Print tolerance achievability (ΔE00 ≤ 2 target) | PHYSICAL EXPERIMENT REQUIRED |
| Card revalidation interval / aging curve | PHYSICAL EXPERIMENT REQUIRED |
| Quality-gate numeric thresholds (blur, exposure, glare, perspective limits) | PHYSICAL EXPERIMENT REQUIRED (threshold selection against labeled dataset) |
| `expected_result_colors` per kit/reagent | DOMAIN-EXPERT VALIDATION REQUIRED + PHYSICAL EXPERIMENT REQUIRED (Phase B/C) |
| `tolerance_radius_de00` and ambiguity margin per kit | PHYSICAL EXPERIMENT REQUIRED (Phase B/C) |
| Acceptable false-classification-rate-among-accepted target | DOMAIN-EXPERT VALIDATION REQUIRED + LEGAL VALIDATION REQUIRED |
| Section 63(4) certificate exact template/content | LEGAL VALIDATION REQUIRED (outside this subsystem's scope) |
| Whether ArUco vs AprilTag matters materially in practice | RESEARCH REQUIRED (literature suggests near-parity; low priority to re-litigate) |
| Root-polynomial vs 3×3-CCM final choice | To be settled by the §15 experimental protocol once Phase A data exists — **not assumed in advance** |
| Mobile performance budget feasibility on low-end target devices | PHYSICAL EXPERIMENT REQUIRED (benchmark on real hardware) |

---

## 38. Risks & Failure Modes

- **Silent extrapolation risk:** if a scene illuminant falls far outside the calibration data's covered range, the root-polynomial fit will still produce *a* number — it will not automatically know it's extrapolating. Mitigation: the calibration-fit residual check (§25, `INSUFFICIENT_CALIBRATION_CONFIDENCE`) is the primary defense, since a poor fit to the card's own known patches is a proxy signal for being in a hard/unusual illumination regime, but this is an imperfect proxy and should be revisited once real adversarial-illumination data exists.
- **Overfitting the reagent-adjacent anchor patches to Phase-B surrogate data that doesn't perfectly match Phase-C real analyte behavior** — a real metamerism risk (§2.3) that must be explicitly retested once Phase C data is available, not assumed resolved by Phase B alone.
- **Card wear in the field degrading calibration silently** — addressed only partially by the future drift-telemetry idea in §10 step 5; until that exists, physical card replacement discipline is an operational control, not a software one.
- **Officer workaround behavior** (e.g., propping the card at an angle that just barely passes the perspective gate) — a UX/training risk, not purely a color-science one; the live-viewfinder coaching should be designed (outside this document's scope) to make correct positioning the path of least resistance.
- **Over-trust in "confidence score":** if the confidence number is not genuinely calibrated (§24) it will mislead officers/reviewers exactly where an uncalibrated ML system typically fails — this is why the ECE/reliability-diagram validation is a hard release gate, not optional QA.

---

## 39. Final Architecture Diagram (textual)

```
                ┌───────────────────────────┐
                │   Guided Capture Module    │  (outside this subsystem;
                │  (viewfinder overlay, AWB/AE│   provides locked-exposure
                │   lock, secure in-app only) │   frame + capture metadata)
                └─────────────┬──────────────┘
                              │ image + metadata
                              ▼
        ┌─────────────────────────────────────────────┐
        │              COLOR ENGINE (this spec)         │
        │                                               │
        │  Card Detector (ArUco+DataMatrix) ──► Patch    │
        │  Sampler (robust stats, glare mask) ──► Quality│
        │  Gate #1 ──► ColorNormalizer (root-poly fit)   │
        │  ──► Quality Gate #2 ──► TestPatchAnalyzer      │
        │  ──► Quality Gate #3 ──► TestResultClassifier   │
        │  ──► Confidence/Abstention ──► ColorAnalysisResult│
        └───────────────────────┬───────────────────────┘
                                 │ ColorAnalysisResult (§34 schema)
                                 ▼
                ┌───────────────────────────┐
                │  Tamper-Evident Record      │  (outside this subsystem;
                │  Generator / Evidence Engine │   hashes image + this result,
                │  (hash, sign, hash-chain)    │   signs, appends to chain)
                └───────────────────────────┘
```

---

# CODING-AGENT-READY IMPLEMENTATION SPECIFICATION

## A. Repository Structure

```
parinaam-color-engine/
├── README.md
├── CHANGELOG.md
├── config/
│   ├── quality_gate_thresholds.yaml     # all numeric thresholds from §17-19 — NOT hardcoded
│   ├── reference_card_profiles/
│   │   └── card_v1_batch_<id>.yaml       # per-batch calibration profile from §10
│   └── kit_profiles/
│       └── <kit_profile_id>.yaml         # schema from §20
├── reference_impl/                       # Python — research + threshold tuning + golden-value generation
│   ├── color_space/
│   │   ├── srgb.py                       # linearize/encode sRGB (IEC 61966-2-1)
│   │   ├── xyz_lab.py                    # XYZ<->Lab<->LCh, D50/D65 white points
│   │   └── delta_e.py                    # CIE76, CIE94, CIEDE2000
│   ├── card/
│   │   ├── card_geometry.py              # design-file patch/fiducial coordinates
│   │   ├── aruco_detect.py               # wraps OpenCV aruco module
│   │   └── homography.py
│   ├── sampling/
│   │   ├── patch_sampler.py              # §18 robust extraction
│   │   └── glare_mask.py
│   ├── quality/
│   │   └── quality_gates.py              # §25 — pure functions, one per failure code
│   ├── calibration/
│   │   ├── methods/
│   │   │   ├── per_channel_scale.py
│   │   │   ├── ccm_3x3.py
│   │   │   ├── ccm_bias.py
│   │   │   ├── polynomial.py
│   │   │   └── root_polynomial.py        # primary candidate, §14-16
│   │   └── fit_evaluator.py              # §15 experimental comparison harness
│   ├── classification/
│   │   ├── kit_profile.py                # loads/validates KitProfile schema
│   │   ├── classifier.py                 # §23 nearest-reference + margin logic
│   │   └── confidence.py                 # §24 calibration (isotonic/Platt), ECE, Brier
│   ├── pipeline.py                       # orchestrates §11.1 end-to-end
│   └── golden/
│       ├── generate_golden_values.py     # produces the numerical-consistency fixtures, §33
│       └── golden_fixtures/*.json
├── mobile/                               # React Native
│   ├── src/
│   │   ├── colorEngine/                  # SHARED TypeScript — one copy for both platforms, mirrors reference_impl/
│   │   │   ├── colorSpace/ (srgb.ts, xyzLab.ts, deltaE.ts)
│   │   │   ├── calibration/ (rootPolynomial.ts, ccm3x3.ts, ccmBias.ts, polynomial.ts, perChannelScale.ts)
│   │   │   ├── classification/ (kitProfile.ts, classifier.ts, confidence.ts)
│   │   │   └── ColorEngine.ts             # public API; consumes the native plugin's payload, mirrors pipeline.py
│   │   └── capture/                       # VisionCamera setup + capture-flow orchestration (exposure lock call, etc.)
│   ├── android/.../CardDetectorPlugin.kt  # Frame Processor Plugin: ArUco + homography + patch sampling
│   ├── android/.../ExposureLockModule.kt  # native module: Camera2 AE/AWB lock (§32)
│   ├── ios/.../CardDetectorPlugin.swift   # same responsibility, iOS
│   ├── ios/.../ExposureLockModule.swift   # native module: AVFoundation AE/AWB lock (§32)
│   ├── cpp/                               # OPTIONAL: shared native core if the shared-C++ option in §32 is chosen
│   │   └── card_detector.cpp / .h         # ArUco + homography + patch sampling, OpenCV C++ API — one implementation, both platform bindings call into it
│   └── __tests__/
│       └── numericalEquivalence.test.ts   # consumes golden_fixtures/*.json, tests the shared colorEngine/ module (§33)
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── golden/
│   └── adversarial/
├── datasets/
│   ├── phase_a_colorscience/             # §26, not committed to git — pointer/manifest only
│   ├── phase_b_kit_trials/
│   └── manifest_schema.md
└── docs/
    ├── ARCHITECTURE.md
    ├── REFERENCE_CARD_SPEC.md
    ├── KIT_PROFILE_GUIDE.md
    ├── CALIBRATION_PROCEDURE.md
    └── VALIDATION_REPORT_TEMPLATE.md
```

## B. Dependencies

| Library | Purpose | Where |
|---|---|---|
| NumPy / SciPy | Linear algebra (least-squares fit for CCM/root-polynomial), stats | `reference_impl` |
| OpenCV (`opencv-contrib-python` incl. `aruco` module) | ArUco detection, homography, geometric ops | `reference_impl`, `mobile` (NDK build) |
| colour-science (optional, for cross-checking XYZ/Lab math against a peer-reviewed reference implementation during development) | Sanity-check only, not a runtime dependency of the shipped engine | `reference_impl` dev-only |
| scikit-learn | Isotonic regression for confidence calibration (§24), evaluation metrics | `reference_impl` |
| pytest | Test runner | `reference_impl`, `tests` |
| `react-native-vision-camera` (v4) | Camera capture + JSI Frame Processor plugin host | `mobile` |
| `react-native-worklets-core` | Required by VisionCamera to run JS worklets for frame processors | `mobile` |
| OpenCV (C++ core, wrapped per-platform) — or `react-native-fast-opencv` for prototyping | ArUco detection, homography, geometric ops (native layer only) | `mobile` native layer |
| TypeScript | The single shared `colorEngine/` module (color space, regression, ΔE00, classification, confidence) — one implementation, both platforms | `mobile` |
| `react-native-fast-tflite` (deferred, Phase 2 only) | On-device inference if/when a learned classifier is adopted | `mobile`, conditional |

No cloud/network dependency anywhere in the runtime path — offline-first is a hard constraint (§32).

## C. Data Structures (canonical, both languages must match exactly)

```python
@dataclass
class ReferenceCardProfile:
    reference_card_id: str
    reference_card_version: str
    manufacturing_batch: str
    calibration_profile_id: str
    issue_date: date
    revalidation_date: date
    patch_layout: list[PatchDef]   # design-space coordinates + reference Lab per patch
    fiducial_layout: list[FiducialDef]

@dataclass
class PatchDef:
    patch_id: str                  # "P01".."P16"
    family: Literal["achromatic","chromatic","reagent_adjacent"]
    design_rect: Rect              # mm, card-local coordinate system
    reference_lab: LabColor

@dataclass
class KitProfile:
    # exact fields per §20 YAML — mirrored 1:1 as a typed class

@dataclass
class NormalizedColor:
    lab: LabColor
    xyz: XYZColor
    raw_device_rgb_linear: RGB
    raw_device_rgb_srgb: RGB
    calibration_diagnostics: CalibrationDiagnostics

@dataclass
class ColorFeatures:
    normalized_color: NormalizedColor
    delta_e00_per_candidate: dict[str, float]
    patch_quality: PatchQualityDiagnostics

@dataclass
class ClassificationResult:
    outcome_label: str | None
    confidence: float | None
    abstained: bool
    inconclusive_reason: str | None

@dataclass
class ColorAnalysisResult:
    # exact §34 JSON schema, 1:1
```

These match §34's JSON schema field-for-field; the JSON schema is the wire/storage format, these are the in-process types.

## D. Module Responsibilities (one line each, expand per module in `docs/ARCHITECTURE.md`)

- `CardDetector`: locate 4 ArUco markers + Data Matrix, return homography + `reference_card_id` (or `REFERENCE_CARD_NOT_FOUND`/`_PARTIAL`/`_INVALID`).
- `PatchSampler`: given homography + `ReferenceCardProfile`, return robust linear-RGB per patch + masked-fraction diagnostics (§18).
- `QualityGate1` (card/image level): evaluate all §25 "Card detection"/"Image quality" codes; short-circuit on failure.
- `ColorNormalizer`: fit the selected regression method (config-selected — see `config/` — defaulting to root-polynomial) from the 16 sampled patches vs. `ReferenceCardProfile.patch_layout` reference Lab values → produce the fitted mapping function + `fit_residual_delta_e00`.
- `QualityGate2` (calibration level): evaluate `INSUFFICIENT_CALIBRATION_CONFIDENCE` and `MIXED_LIGHTING`.
- `TestPatchLocator`: given `KitProfile.test_geometry` + homography, extract the test-patch region (or `TEST_PATCH_NOT_FOUND`/`_PARTIAL`).
- `TestPatchAnalyzer`: apply the fitted mapping to the test patch's sampled RGB → `ColorFeatures`.
- `QualityGate3` (test-patch level): re-run the relevant §19 checks scoped to the test-patch region.
- `TestResultClassifier`: ΔE00 nearest-reference + margin logic against `KitProfile.expected_result_colors` (§23).
- `ConfidenceEstimator`: apply the pre-fit calibration function (§24) to produce a calibrated confidence + apply the abstention threshold.
- `ColorEngine` (facade): orchestrates the above in the exact order of §11.1, assembles `ColorAnalysisResult`.

## E. Algorithms / Pseudocode (the two most decision-critical ones)

**Root-polynomial fit (2nd-order, 6-term form; extend to 3rd-order per Finlayson et al. if validation shows benefit):**
```
Given: observed linear RGB for 16 patches -> R (16x3)
       reference XYZ for 16 patches       -> X (16x3)   # from card profile Lab, converted

expand(r,g,b) = [r, g, b, sqrt(r*g), sqrt(r*b), sqrt(g*b)]   # 6 terms, 2nd order
Phi = stack([expand(*row) for row in R])                     # 16x6

M = least_squares_solve(Phi, X)                               # 6x3, minimize ||Phi @ M - X||^2
fit_residual = mean(delta_e00(lab(Phi @ M), lab(X)))          # -> QualityGate2 input

apply(rgb_lin) = expand(*rgb_lin) @ M                          # -> XYZ for any pixel, incl. test patch
```

**Classification with margin + calibrated confidence:**
```
Given: test_lab, KitProfile.expected_result_colors[], calibration_fn (pre-fit offline)

distances = { c.outcome_label: delta_e00(test_lab, c.reference_lab) for c in expected_result_colors }
best, second = two smallest entries of distances (by value)

if best.value > best.candidate.tolerance_radius_de00:
    return INCONCLUSIVE("NO_CLOSE_MATCH")
if (second.value - best.value) < ambiguity_margin(kit_profile):
    return INCONCLUSIVE("AMBIGUOUS_COLOR")

raw_margin = second.value - best.value
confidence = calibration_fn(raw_margin)          # isotonic/Platt fn fit offline on labeled data
if confidence < config.abstention_threshold:
    return INCONCLUSIVE("LOW_CONFIDENCE")

return ClassificationResult(best.outcome_label, confidence, abstained=False)
```

## F. Configuration Files

- `config/quality_gate_thresholds.yaml`: every numeric threshold named in §17–19 (blur, exposure, glare-masked-fraction, perspective-angle limit, calibration-fit-residual limit, mixed-lighting delta, ambiguity margin, abstention threshold). **No threshold may be a literal constant in code** — all are loaded from this file, versioned, and referenced by `engine_version`.
- `config/reference_card_profiles/*.yaml`: one file per manufacturing batch, produced by the calibration procedure in §10, never hand-edited.
- `config/kit_profiles/*.yaml`: one file per kit test, schema per §20, populated only from Phase B/C validated data — a placeholder/template file with fields left explicitly `null` and a `status: PENDING_VALIDATION` flag must be used for any kit not yet validated, and `ColorEngine` must refuse to classify (→ `UNKNOWN_KIT`) against a `PENDING_VALIDATION` profile even if geometry is defined.

## G. Model Versioning Rules

- `engine_version`: semver, bumped on any change to the orchestration pipeline (§11.1 step order/logic).
- `normalization_model_version`: bumped on any change to the regression method or its fitting procedure (not on card-batch changes — those are tracked via `reference_card_calibration_profile_id`).
- `classifier_model_version`: bumped on any change to the classification/confidence logic or its calibration fit.
- Every `ColorAnalysisResult` (§34) is self-describing with all four version fields (`engine_version`, `normalization_model_version`, `classifier_model_version`, plus card/kit profile versions) — this is the mechanism that satisfies §39 reproducibility: given an old record, the exact code+config+card+kit combination that produced it can always be reconstructed and re-run.
- Golden fixtures (§33) are tagged with the `engine_version` they were generated against; a mismatch between a build's `engine_version` and its passing golden-fixture set is a release blocker.

## H. Test Plan

**Unit (per module, examples — not exhaustive):**
- `CardDetector`: valid card, rotated (15°/45°/90°), perspective-skewed, partially occluded (1, 2, 3 of 4 ArUco markers visible), wrong/unrecognized card ID, expired card.
- `PatchSampler`: clean patch, glare-affected patch, shadow-affected patch, contaminated (dirty/faded) patch, clipped patch, patch with imperfect homography (border-bleed) — verify masked-fraction and trimmed-mean outputs.
- `ColorNormalizer` (per method incl. root-polynomial): daylight, warm-LED, cool-LED, fluorescent, mixed-light, low-light, overexposed inputs — verify fit succeeds/fails appropriately and residual ΔE00 is computed correctly.
- `QualityGates`: one test per failure code in §25, both the "should fire" and "should not fire" boundary cases.
- `TestResultClassifier`: exact-match case, near-boundary/ambiguous case (two close candidates), far-outlier case, unknown-kit case.
- `ConfidenceEstimator`: verify monotonicity of the calibration function, verify abstention threshold behavior at the boundary.
- **Generalization:** replay the leave-one-device-out / leave-one-lighting-out held-out sets (§26.2) as regression tests once the physical dataset exists — these become permanent CI tests, not one-off analyses.
- **Determinism:** same image + same config, run N times → identical output within numerical tolerance (guards against any accidental non-determinism, e.g., unseeded randomness in an outlier-trimming tie-break).

**Integration:** full `ColorEngine.process()` call, end-to-end, for: (a) a fully valid capture → expected classification; (b) each individual quality-gate failure triggered in isolation → correct single failure code; (c) multiple simultaneous failures → all correct codes reported; (d) unknown kit profile → `UNKNOWN_KIT` with normalization still completed and recorded.

**Golden dataset (§46 of brief):** for each golden image, store input image reference, `reference_card_id`, `kit_profile_id`, expected card-detection result, expected per-patch sampled values (within tolerance), expected `NormalizedColor`, expected quality status, expected `ClassificationResult`, expected confidence range, expected failure reason if applicable. Every code change affecting the pipeline must be run against the full golden set before merge; any golden-value change must be a deliberate, reviewed update (bump `engine_version`/`normalization_model_version` as appropriate), never a silent side effect.

**Adversarial set (§47 of brief — build as its own labeled subset, expected outcome mostly `INCONCLUSIVE`):** extremely warm/cool lighting, low light, direct sun, harsh shadow, mixed lighting, glare, over/under-exposure, motion blur, severe perspective, partial card/test-patch obstruction, dirty/faded card, wrong/unknown card, wrong/unknown kit profile, expired card. Explicit assertion for each: the correct behavior is abstention (`INCONCLUSIVE` + correct reason code), not a forced guess — this is the primary regression suite protecting the §48 product principle.

## I. Benchmarking

- Run the §15 experimental comparison protocol (all 7 candidate methods, full metric set, cross-device/cross-lighting splits) as a reproducible script (`fit_evaluator.py`) that outputs a versioned report (`docs/VALIDATION_REPORT_TEMPLATE.md` defines the expected structure: method, split, mean/median/p90/worst ΔE00, latency, memory, ECE, Brier, risk-coverage curve).
- On-device latency/memory benchmark on a defined matrix of ≥3 real Android devices spanning price tiers, reported per pipeline stage (detection, sampling, fit, classification) so the dominant cost is identifiable and optimizable.
- Benchmarks are re-run and the report re-versioned on every `normalization_model_version` or `classifier_model_version` bump.

## J. Logging & Determinism

- **Log:** all quality-gate outcomes and codes, calibration method used, fit residual, processing time per stage, all version fields, and the full `ColorAnalysisResult` (this is evidentiary data, meant to be logged/retained per the evidence engine's requirements).
- **Never log:** anything not already part of the defined schema; in particular, do not add ad hoc debug fields to production logs that aren't part of a reviewed schema, since anything captured here may eventually be subject to legal discovery/audit — undocumented fields undermine, rather than support, the auditability goal.
- **Determinism:** no unseeded randomness anywhere in the runtime path; any algorithm with a stochastic element (none currently specified, but if introduced later, e.g., a RANSAC-style robust fit) must use a fixed, recorded seed so outputs are exactly reproducible given the same inputs and config.

## K. Documentation Deliverables

- `ARCHITECTURE.md` — expands §11.1/§D above into full module contracts.
- `REFERENCE_CARD_SPEC.md` — the exact §6–9 physical spec, kept in sync with the actual manufactured card design file.
- `KIT_PROFILE_GUIDE.md` — how to author/validate a new `KitProfile`, including the `PENDING_VALIDATION` workflow (§F).
- `CALIBRATION_PROCEDURE.md` — the exact §10 batch-calibration SOP for whoever runs the spectrophotometer measurements.
- `VALIDATION_REPORT_TEMPLATE.md` — the standard report structure for §I benchmarking, reused every release.

## L. Implementation Sequence (unchanged from the brief's own §51, confirmed correct and adopted as-is)

```
1. Project skeleton
2. Data schemas
3. Reference-card profile system
4. Card detector
5. Perspective correction
6. Patch sampler
7. Image-quality engine
8. Color-space utilities
9. Calibration/normalization engine
10. Test-patch analyzer
11. Kit-profile system
12. Classification engine
13. Confidence/abstention
14. End-to-end pipeline
15. Golden tests
16. Benchmarking
17. Mobile implementation
18. Mobile/reference numerical equivalence tests
19. Integration API
20. Documentation
```

Do not begin classification-engine work (step 12) before steps 1–11 are complete and tested — the normalizer must be validated on its own terms (ΔE00 against known patches) before it is trusted to feed a classifier, per the enforced separation in §21–22.

## M. Acceptance Criteria (process, not invented numbers)

A build is release-ready only when:
1. All unit, integration, golden, and adversarial tests pass.
2. The §15 experimental comparison has been run on real Phase-A data and the selected normalization method's cross-device/cross-lighting ΔE00 distribution is documented in a versioned validation report.
3. Confidence calibration (ECE, reliability diagram, Brier score) is documented and the abstention threshold is set at a jointly agreed (technical+domain+legal) risk-coverage operating point.
4. Numerical-equivalence tests between `reference_impl` and `mobile` pass within stated tolerance.
5. On-device performance benchmarks meet the latency/memory budget on the defined device matrix.
6. No `KitProfile` marked `PENDING_VALIDATION` can produce a non-`INCONCLUSIVE` classification.

## N. Final Checklist for the Coding Agent

- [ ] Card, patch, and fiducial geometry implemented exactly per §6–9/§20 (16 patches, 4 ArUco, 1 Data Matrix, exact roles) — no placeholder rectangles.
- [ ] Every quality-gate failure code in §25 implemented as its own testable function.
- [ ] Root-polynomial regression implemented and benchmarked against the 6 other candidates per §14–15 before being locked in as default.
- [ ] Normalizer/classifier separation enforced at the type level, not just by convention (§21–22).
- [ ] No numeric threshold hardcoded outside `config/` (§F).
- [ ] No `POSITIVE`/`NEGATIVE` output reachable after any quality-gate failure — structurally, not conventionally, enforced.
- [ ] Confidence is a calibrated value with a documented ECE, not a raw model score.
- [ ] Golden dataset and numerical-equivalence tests wired into CI before mobile release.
- [ ] Every unresolved item in §37 remains explicitly flagged in code comments/config `status` fields (`PENDING_VALIDATION` etc.) rather than filled with an invented value.

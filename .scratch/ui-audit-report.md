# Parinaam officer-app UI audit — demo/fixture/mock inventory

Scope: `src/screens/**`, `src/components/**`, `src/navigation/**`, `src/demo/**`, `src/state/**`, `src/db/**`, plus every data source those surfaces render. Read-only. Repo at `9bf913c v3.2`.

---

## 1. Navigation wiring (`src/navigation/AppNavigator.tsx`)

All 12 declared routes are mounted (lines 131–149) and every one is reachable.

| Route | Wired | Notes |
|---|---|---|
| Login / PostLoginBrief / Home / CaseLog / Integrity / NewTestSetup / Capture / Analyze / Results / RecordDetail / Bunching / Settings | yes | gate-driven (`AppNavigator.tsx:118-119`) |

One file exists in `src/screens/` but is **not** a route: `TamperDemoScreen.tsx` — only its inner `TamperDemoSection` is consumed (`IntegrityScreen.tsx:27,344`); the `TamperDemoScreen` default export (line 281) is dead.

---

## 2. DEMO-FIXTURE

**D1 — `src/demo/demo-dataset.ts:80-176` — 15 hardcoded synthetic field-test records with realistic officer identities, ΔE00, confidence, timestamps.**
Evidence: `operator_name: 'Head Constable R. Sharma'`, `confidence: n === 5 ? 0.95 : 0.97`, `lab: { l: Number((19.4 + n * 0.18).toFixed(2)), ... }`, `kit_lot_no: 'MK-24B-118'`. Header comment: `* One deterministic, synthetic dataset … Every row is explicitly marked is_demo`.
*UI truth:* **partially.** `CaseLogScreen.tsx:275` shows a `"N DEMO SEED · LOCAL ONLY"` pill and `RecordDetailScreen.tsx:353-354` says `"DEMO SEED — LOCAL ONLY, never uploaded"`. **But `HomeScreen.tsx:259-344` ("LATEST READINGS / Forensic Case Log") shows the same 15 synthetic records with no demo label at all** — that is the first screen after login, so a judge sees 15 fake readings presented as the duty log.

**D2 — `src/demo/demo-dataset.ts:75-78` — four hardcoded GPS coordinate sets, one flagged mocked.**
Evidence: `const DZU_GPS = { lat: 28.5562, lon: 77.0999, accuracy_m: 5.2, mocked: false }`, `const BZU_GPS = { …, mocked: true }`.
*UI truth:* **partially.** `RecordDetailScreen.tsx:360-365` prints `"GPS mock provider detected — location is demonstrative only."` for the single `mocked:true` record; the other three render as plain `"LOCATION (GPS) 28.5562, 77.0999 ±5.2 m"` with no demo marker.

**D3 — `src/demo/demo-dataset.ts:178-200` — synthetic supervisory workflow history.**
Evidence: `note: 'Synthetic demo workflow marker assigned for supervisor review; no confirmatory laboratory conclusion is recorded.'`
*UI truth:* **not shown at all.** `repo/fixtures.ts:66-71` loads `DEMO_CASES` but reads only `panchnama_ref`; `history`/`case_status`/`actor` are never rendered (case status comes from the server, `sync-store.ts:260`). Dead fixture data.

**D4 — `src/demo/demo-dataset.ts:66-73` — reaction-kinetics curve synthesised by linear scaling of the ΔE value.**
Evidence: `function kinetics(delta) { return [{ t_ms: 0, delta_e: 0.2 }, { t_ms: 5_000, delta_e: Number((delta * 0.18).toFixed(2)) }, …] }`
*UI truth:* **no.** `RecordDetailScreen.tsx:443-446` renders it under the heading `"LEGACY REACTION KINETICS — ΔE(t), 30 s WINDOW"`; the record is demo-labelled, but the chart itself carries no demo mark and reads as a real reaction curve.

**D5 — `src/repo/fixtures.ts:64-81` — the demo chain is seeded into the real ledger on first boot.**
Evidence: `syncStatus: 'demo-seed'`, `sealState: 'UNATTESTED'`; `ledger-store.ts:156-161` writes them through `persistRecord` whenever the DB is empty.
*UI truth:* **yes, where it is shown** (`CaseLogScreen.tsx:122,275,417,509`; `IntegrityScreen.tsx:225` `({demoCount} demo fixtures)`), but see D6 for the record that gets mislabelled.

**D6 — `src/repo/fixtures.ts:70` + `src/db/ledger-repository.ts:264-265,185` — a *real* capture is persisted as a demo seed and re-labelled as one after restart.**
Evidence: `isDemo: true` (set from the engine's unvalidated profile at `ResultsScreen.tsx:228`) → `state, reason = rec.isDemo ? 'demo-seed' : 'queued', rec.isDemo ? 'preinstalled deterministic demo record' : null`. `ledger-store.ts:233` sets in-memory `syncStatus: 'queued'` and `ledger-store.ts:245` calls `queueForSync(...)`, so the record *is* uploaded.
*UI truth:* **no — it is actively wrong.** After a restart `RecordDetailScreen.tsx:331-332,353-354` tell the officer `"LOCAL DEMO RECORD — never uploaded to the API"` / `"DEMO SEED — LOCAL ONLY, never uploaded"` about a genuine field test that is sitting in the outbox.

**D7 — `src/screens/BunchingScreen.tsx:90-197` — two synthetic bunching scenarios fabricated in-component, claiming a StrongBox seal the app never achieves.**
Evidence: `deviceAttestation: 'StrongBox Hardware Keystore'`, `sealState: 'ATTESTED'`, `syncStatus: 'synced'`, `payloadSha256: 'sha-sim-1'`, `chainHash: 'hash-sim-1'`, `case_ref: 'NCB/TEST/HDE-01/2026'`; and a 26-record generator at lines 163-194.
*UI truth:* **partially.** Section eyebrow reads `"EVALUATION PRESETS"` and the a11y labels say `"Simulate High Delta E variance"` / `"Simulate 26 Package Multi-Lot"`, but the **visible** chip text is `"✗ High ΔE (>15 ΔE00)"` and `"26-Package Multi-Lot"`, and each fake row renders a green **`"Attested"`** seal pill (`BunchingScreen.tsx:661-666`) — directly contradicting `SettingsScreen.tsx:124` `"Keystore seal UNAVAILABLE on this path"`.

---

## 3. SILENT-PLACEHOLDER

**S1 — `src/screens/BunchingScreen.tsx:334-337,989-997` — "Copy Text" on the statutory determination certificate copies nothing.**
Evidence: `const handleCopyCertificate = () => { setCertCopied(true); setTimeout(() => setCertCopied(false), 2500); };` — no `Clipboard` import exists anywhere in `src/` (`rg 'Clipboard|setString' src/` → 0 hits). The label flips to `"Copied"`.
*UI truth:* **no.** The card is titled `"Formal Determination Certificate"` / `"Tenderable statutory certificate text formatted for inclusion in Panchnama and court evidence bundles."` The officer is told a court artifact was copied.

**S2 — `src/screens/SettingsScreen.tsx:409-426` and `387-408` — the "Audio coaching" switch and the EN/HI/PA language tiles are inert.**
Evidence: `onValueChange={setAudioCoaching}` → only writes `useAppStore`; `AudioCoachingService` is imported by **zero** source files (only `tests/polish/audio-coaching.test.ts`), and no `assets/` directory or `.m4a` file exists in the repo.
*UI truth:* **no.** Sub-labels: `"Spoken prompts during guided capture"`, `"Voice coaching language for the on-screen prompts (Phase 6)."`

**S3 — `src/capture/CameraView.tsx:162` — the in-viewfinder coaching HUD is permanently disabled.**
Evidence: `<CoachingOverlay qualityResult={null} />` (no `photoProgress` either). `CoachingOverlay.tsx:19` then always falls through to the literal `'Position the card, then capture one photo'`. `src/capture/frame-processor.ts` (the only caller of `evaluateFullQuality` in `quality-gates.ts`) is not imported by `CameraView` at all.
*UI truth:* **no.** The reticles and banner render as if live guidance were running; no blur/glare/lighting coaching ever fires.

**S4 — `src/capture/CameraView.tsx:39-49` — the glare/exposure gate maps codes the engine never emits, plus a typo.**
Evidence: `hasGlare: failed.has('ROI_GLARE') || failed.has('GLOBAL_GLARE')`, `exposureOk: !failed.has('UNDerexposure'.toUpperCase()) && !failed.has('OVEREXPOSURE')` → `'UNDEXPOSURE'`. The engine only emits `EXCESSIVE_BLUR / IMAGE_TOO_SMALL / INSUFFICIENT_MARKERS / MISSING_CARD_MARKER / HOMOGRAPHY_UNSTABLE / TEST_SWATCH_OUTSIDE_FRAME` (`camera-engine/service/analyzer.py:738-749,787`) and hardcodes `"glare_fraction": 0.0` (line 753).
*UI truth:* **no.** `hasGlare` is structurally always false, `exposureOk` always true, `glareFraction` always 0.0.

**S5 — `src/screens/AnalyzeScreen.tsx:73,77,84,89,231` — the "LIVE" pipeline progress bar is a set of sleeps.**
Evidence: `const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));` driving `await tick(180) / tick(240) / tick(300) / tick(220)`, while `STAGES` labels flip `"PASSED"` / `"RUNNING NOW"`. The card is headed `"COLOURIMETRIC PIPELINE — LIVE"` / `"End-to-End Stage Walk"` and the sub-copy promises *"Each one shows the number it used"*.
*UI truth:* **no.** Percentages, stage state and elapsed feel are fabricated; the computation itself between ticks is real but instantaneous.

**S6 — `src/services/export-flow.ts:114-120` — fabricated seizure weights written into NDPS Forms 4/5/6.**
Evidence: `placeOfSeizure: rec.gps ? … : 'Field location'`, `grossWeightGrams: 500`, `netWeightGrams: 498.2`, `dateOfSeizure: rec.created_at`, `magistrateCourtName: 'Court of Metropolitan Magistrate (Trial) — for s. 52A(2) application'`. Rendered at `ndps-forms.ts:83-84,201`: `- Gross Weight (Grams) : 500 g`.
*UI truth:* **no.** `RecordDetailScreen.tsx:518-520` labels these rows `"NDPS FORM 4 (SEIZURE MEMORANDUM)"` with a green `"GENERATED"` badge.

**S7 — `src/services/export-flow.ts:73` — the literal string `'unavailable-in-simulator'` is printed as the device attestation value on real device builds.**
Evidence: `device_attestation: rec.deviceAttestation ?? 'unavailable-in-simulator'` → `certificate-generator.ts:159` `- Device Attestation Seal : ${record.device_attestation}`.
*UI truth:* **no** — it is not distinguished from a real hex signature inside the certificate text.

**S8 — `src/domain/outcome-copy.ts:61-65,31-36` — hardcoded ΔE gate numbers that contradict the engine's real gate.**
Evidence: `GOOD: { note: 'within the 2.5 ΔE00 master gate' }`, `DEGRADED: { … '2.5–4.0 ΔE00 — inconclusive band widened' }`, `'Calibration residual exceeded the 4.0 ΔE00 gate — measurement refused'`. The engine's actual gate is `calibration_fit_residual_de00_max: 5.0` (`camera-engine/config/quality_gate_thresholds.yaml`), and its README calls it *"an engineering default, not a scientifically validated threshold"*.
*UI truth:* **no.** Rendered verbatim at `ResultsScreen.tsx:449` and `RecordDetailScreen.tsx:375`, next to a grade the engine actually computed at 5.0.

**S9 — `src/screens/BunchingScreen.tsx:319-324` vs `src/bunching/bunching-engine.ts:120,134,193` — two different bunching thresholds on the same screen.**
Evidence: screen: `pairwiseAnalysis.maxDeltaE < 5.0` and legend `"Identical (< 5)"`; engine: `const isConsistent = dE <= 3.0` / `canBunch = … && maxDeltaE <= 3.0`, certificate prints `"Tolerance threshold <= 3.00 ΔE00"`.
*UI truth:* **no.** For a 3.0–5.0 ΔE00 pair the screen simultaneously shows `"Identical results confirmed - packages can be grouped"` (line 545), `"No Composite Lots Formed"` (line 961) and a certificate reading `"BUNCHING REFUSED (INDIVIDUAL SAMPLING REQUIRED)"`.

**S10 — `src/screens/BunchingScreen.tsx:84` and `388-473` — hardcoded demo case references as fallback and as preset chips.**
Evidence: `const activeCase = selectedCase ?? focusCase ?? cases[0]?.[0] ?? 'NCB/DZU/CR-14/2026';`; `setSelectedCase('NCB/DZU/CR-14/2026')`, `setSelectedCase('NCB/MZU/CR-02/2026')`; visible labels `"✓ Identical Batch (CR-14)"`, `"✗ Divergent Mix (CR-02)"`.
*UI truth:* **partially** — the a11y labels say "Load … Case CR-14" with no demo word; the visible text carries none either.

**S11 — `src/components/statutory-timers.ts:61-76` + `StatutoryClockModal.tsx:50-51` — the "Rule 10(2) Seizure Clock" is anchored on a test-record timestamp, not a seizure time.**
Evidence: `const seizureTimestamp = activeCase?.timestampIso ?? new Date().toISOString();` fed by `CaseLogScreen.tsx:485` `timestampIso: c.lastAt` (the *last* record's time) and `RecordDetailScreen.tsx:572` `timestampIso: record.created_at`. No seizure datetime is captured anywhere in intake (`NewTestSetupScreen.tsx:193-236`).
*UI truth:* **partially.** Footer says `"Clocks derive from local sealed evidentiary ledger timestamps."` (line 208) — but the sheet title is `"Rule 10(2) Seizure Clock"` and the remaining-hour values are labelled `"LIMIT: 48 HOURS"`, `"STATUTORY MANDATE"`.

**S12 — `src/screens/ResultsScreen.tsx:331,356,376,406` — hardcoded seal-field values on the outcome screen.**
Evidence: `<BannerPill label="PHOTO" value="1" …/>`; `<MetaTile label="KIT ENTRY METHOD" value={setup.entryMethod.toUpperCase()} />` → renders `"OCR"` after the officer tapped `"SCAN LABEL (SIM)"` (`NewTestSetupScreen.tsx:310`), which hard-fills `kitMake: 'Sirchie', kitTestName: 'NARK II', kitLotNo: 'MK-24B-118'` (lines 165-173).
*UI truth:* **partially** — the setup screen is honest (`"SCAN LABEL (SIM)"`, `"Label read by SIMULATED OCR — confirm or correct each field."`); the sealed record's `KIT ENTRY METHOD: OCR` is not.

**S13 — `src/screens/SettingsScreen.tsx:437-453` — the four About rows look tappable and only dismiss the sheet.**
Evidence: `onPress={() => setAboutOpen(false)}` on every `sheetAction`, with `accessibilityRole="button"`.
*UI truth:* **no** affordance that they do nothing; they are static prose wearing button styling.

**S14 — `src/screens/PostLoginBriefScreen.tsx:6,82` — a comment claims a mandated disclaimer banner that no longer renders.**
Evidence: `the statutory warning pulled out of the prose into its own mandated banner` and `{/* The law, verbatim and unmistakable — not buried in a paragraph (rule 3). */}` directly above the closing `</ScrollView>` — nothing there.
*UI truth:* **n/a** (no code renders a claim), but the file header misdescribes the screen.

**S15 — `src/screens/BunchingScreen.tsx:208` — hardcoded package weight.**
Evidence: `weightGrams: 500,` for every package in the comparison set.
*UI truth:* **no** (currently unused by the engine, but it is a numeric field a statutory sample-draw calculation is written against).

---

## 4. MOCK-EXTERNAL

**M1 — `src/export/certificate-generator.ts:95-99,188-215` — a fabricated forensic expert signs a pre-written certification.**
Evidence: `expertName: 'Dr. V. K. Sharma'`, `qualification: 'M.Sc. (Forensic Science), Ph.D., Forensic Examiner'`, `institution: 'Central Forensic Science Laboratory / State FSL Cyber Division'`, `registrationNumber: 'CFSL-CYB-2026-8841'`; body: `I have examined the cryptographic ledger … and certify that:` … `Independent Verification: VERIFIED MATCH via SHA-256` (hardcoded, not computed) … `Signature: ___________________________`.
*UI truth:* **no.** `RecordDetailScreen.tsx:517` offers it as `"BSA s. 63(4) — PART B CERTIFICATE"` with a green `"GENERATED"` tag.

**M2 — `src/services/export-flow.ts:91-100` — a hardcoded device identity for every record on every phone.**
Evidence: `make: 'Google', model: 'Pixel 7a', colour: 'Charcoal', serialNumber: 'SIM-SERIAL-0001', androidId: 'a91f…77c2 (device build)', osVersion: 'Android 13 (API 33)', appVersion: 'Parinaam 1.0.0 (dev build)'` → printed at `certificate-generator.ts:132-137` and in both HTML variants (lines 235-240, 275).
*UI truth:* **no.**

**M3 — `src/services/export-flow.ts:54,57,64,65,44,45,37,47,67` — hardcoded device/attestation facts in the exported record entity.**
Evidence: `biometric_ok: 1`, `root_detected: 0`, `security_level: rec.deviceAttestation ? 'TrustedEnvironment' : 'Software'`, `card_version: 'card-v2.1'`, `card_print_batch: 'batch-2026-08-a'`, `card_is_self_printed: 0`, `meas_covariance: '[[1.4,0.2],[0.2,1.2]]'`, `kit_entry_method: 'manual'`, `sample_orig_no: 'SO-1' / sample_dup_no: 'SD-1'`, `tz_offset_min: 330`.
*UI truth:* **no.** `security_level` reaches the certificates at `certificate-generator.ts:158,200,240,275` (`- Hardware Security Level : ${record.security_level}`), and `SO-1/SD-1` ignores the `SO-n/SD-n` actually computed in `BunchingScreen`.

**M4 — `src/services/export-flow.ts:101-107` — custodian identity is invented, not the signed-in officer.**
Evidence: `officerName: rec.operator` (an id like `OFFICER-ADMIN`), `designation: 'Head Constable'`, `agency: 'Narcotics Control Bureau'`, `station: 'Zonal Unit — field deployment'`, `badgeNumber: rec.operator.split(' ')[0] ?? ''`.
*UI truth:* **no.** The real officer is `'Admin (Demo Officer)'`, role `ADMIN` (`auth-store.ts:38-45`).

**M5 — `src/crypto/hardware-key.ts:69,112-116` — StrongBox/TEE is a hardcoded return value.**
Evidence: `private probeHardwareSecurityLevel(): SecurityLevel { … return 'TrustedEnvironment'; }` with the comment `// For mid-range test phones, default to TrustedEnvironment (TEE)`. Keys are generated with `node:crypto` and held in an in-memory `Map`.
*UI truth:* **n/a in the app path** — the seal falls through to chain-only via `services/analysis-pipeline.ts:79-92`, and the UI correctly reports `UNATTESTED`. But it contradicts D7's fabricated `'StrongBox Hardware Keystore'` pill.

**M6 — `src/export/map-snapshot.ts:36-76` — a fabricated "map" that asserts GNSS verification.**
Evidence: the pin is hardcoded at `<circle cx="240" cy="120">` with decorative `<path>` "roads" and the string `'✓ HARDWARE GNSS RECEIVER VERIFIED'` whenever `isMocked` is false.
*UI truth:* **n/a** — the module has zero importers today. It is a live landmine if ever wired.

**M7 — `src/audio/audio-coaching.ts:99-112` — `triggerPrompt` reports `played: true` and plays nothing.**
Evidence: `this.playbackLog.push({…}); // In native runtime, calls expo-audio to play prompt.assetPath; return { played: true, prompt };`
*UI truth:* **n/a** (unreachable), but the Settings switch at S2 advertises it.

**M8 — `src/sync/outbox.ts:22,69-72` — the in-memory "server" fallback still marks records synced.**
Evidence: `private serverLedger: Set<string> = new Set(); // Server-side deduplication simulator` … `this.serverLedger.add(item.idempotency_key); success = true;`
*UI truth:* **n/a in the app path** — `sync-store.ts:98` always injects the real HTTP client. It is the default whenever `remoteClient` is absent (tests, any future caller).

**M9 — `src/db/driver.ts:123-142` — the no-op persistence adapter.**
Evidence: `export class MemoryAdapter` with `pathLabel = 'IN-MEMORY (PERSISTENCE FAILED — RECORDS DO NOT SURVIVE RESTART)'` and `/* deliberate no-op */`.
*UI truth:* **yes** — `IntegrityScreen.tsx:249-255` renders a red `"PERSISTENCE UNAVAILABLE / This session's records are IN-MEMORY ONLY"` banner.

**M10 — `src/capture/card-detector.ts:191-192` — a `mockIdentity` CardIdentity.**
Evidence: `// Here we provide a verified fallback and mock handler:` / `const mockIdentity: CardIdentity = {…}`.
*UI truth:* **n/a** — zero importers.

---

## 5. UNVALIDATED-REAL

**U1 — `camera-engine/config/kit_profiles/mvp_test1_mock_cannabinoid.yaml:2,20,25,31-40` — the only kit profile is a mock, explicitly pending validation.**
Evidence: `# STATUS: PENDING_VALIDATION`, `test_type: "PRINTED_PATCH_MOCK"`, `manufacturer: "N/A — MVP mock, not a real manufactured kit"`, `reference_lab: {L: null, a: null, b: null}  # PHYSICAL EXPERIMENT REQUIRED`, `roi_card_relative: null  # TODO: PHYSICAL EXPERIMENT REQUIRED`, `source: "MVP printed mock patch v1 … not real reagent chemistry"`.
*UI truth:* **yes, and well done** — `ResultsScreen.tsx:293-307` renders a `"PROFILE STATUS · UNVALIDATED / Printed mock profile — pending validation"` card, and `SettingsScreen.tsx:58-61` repeats it in About. **But** the record still seals with a confidence %, ΔE00 and an `"INTEGRITY SEAL"` banner, and the `isDemo` flag then turns it into a "DEMO SEED" label after restart (D6).

**U2 — `camera-engine/config/quality_gate_thresholds.yaml:1-4` — every threshold is an engineering default.**
Evidence: `# ALL values are INITIAL ENGINEERING DEFAULTS.` / `# PHYSICAL EXPERIMENT REQUIRED: tune every threshold against the labeled adversarial dataset … before production release.`
*UI truth:* **no** — the UI never surfaces this, and instead prints different, wrong numbers (S8).

**U3 — camera path is `expo-camera`, not the required VisionCamera 5 with locked AE/AWB.**
Evidence: `src/capture/CameraView.tsx:11-15` imports `{ CameraView as NativeCameraView } from 'expo-camera'` with `flash="off" autofocus="on"` and **no** exposure/white-balance lock; `package.json:66` still ships `react-native-vision-camera: 5.2.3` which is imported nowhere in `src/`. `CaptureScreen.tsx:7-8` asserts *"AE/AWB/gates run inside CameraView unchanged."*
*UI truth:* **no.**

**U4 — 8 of the 9 reagent choices the intake screen offers can never produce a positive or negative.**
Evidence: `camera-engine-adapter.ts:13` `export const CAMERA_ENGINE_REAGENT: ReagentType = 'duquenois_levine';` and `105-118` → `'The current camera-engine profile does not cover the selected reagent. No presumptive outcome was produced.'`; `NewTestSetupScreen.tsx:42-52` offers `marquis, mecke, mandelin, scott, duquenois_levine, simons, ehrlich, nitric_acid, ferric_chloride`.
*UI truth:* **partially** — the abstention text is honest and shown, but the reagent picker presents all nine as equally usable.

**U5 — the entire in-app colour pipeline and Mahalanobis/QDA/conformal classifier are orphaned; the presumptive call comes from the unvalidated Python service.**
Evidence (zero importers in `src/`): `src/colour/linearize.ts`, `root-polynomial.ts`, `white-balance.ts`, `patch-extractor.ts`, `pipeline.ts`, `src/classify/mahalanobis.ts`, `conformal.ts`, `calibration.ts`, `phase-boundary.ts`, `reagent-profiles.ts`, `src/export/evidence-bundler.ts`. Only `src/colour/delta-e.ts` is live (BunchingScreen pairwise table + `bunching-engine.ts`).
*UI truth:* **misleading by omission** — `AnalyzeScreen.tsx:219-223` says *"The presumptive decision is a transparent CIEDE2000 distance in corrected CIELAB space"*, which is true, but it is the Docker service's distance, not this app's pipeline.

**U6 — dead but present UI/screen modules.**
`src/components/StatutoryClock.tsx`, `src/components/ui/KineticsChart.tsx` (only `LightKineticsChart` is used), `ui/Metrics.tsx`, `ui/Stepper.tsx`, `ui/ListRow.tsx`, `ui/Sheet.tsx`, `ui/States.tsx`, `ui/Card.tsx`, `ui/Chip.tsx`, `ui/IntegrityBits.tsx`, `ui/OutcomeBadge.tsx`, `ui/Fields.tsx`, `ui/Screen.tsx`, `ui/Banner.tsx`, `TamperDemoScreen.tsx:281`, `src/capture/frame-processor.ts`, `src/capture/card-detector.ts`, `src/capture/burst-manager.ts:97` (`BurstManager` class).

**U7 — `src/screens/BunchingScreen.tsx:522` — substance names in the UI.**
Evidence: `Ganja / Charas / Opium` on the `"SUBSTANCE CATEGORY & LOT SIZING"` toggle.
*UI truth:* it is a category selector, not a record claim, but it is the only place in the app where a substance name is rendered.

**U8 — `docs/known-gaps.md` does not exist** although `AGENTS.md` calls it "the authoritative list of what is genuinely incomplete". `docs/` contains only `appearance-theme.md` and `camera-engine-integration.md`. No in-repo gap register backs up the About sheet's claims.

---

## 6. WORKING (genuinely implemented)

1. **Login gate** — real constant-time salt+SHA-256 verification, 5-attempt / 60 s lockout, session in `expo-secure-store` (`auth/credential-verifier.ts:41-56`, `state/auth-store.ts:98-121`). Honestly printed: `LoginScreen.tsx:166` `DEMO BUILD CREDENTIAL — USER "admin" · PASSWORD "adminpass"`.
2. **Hash chain + live verification** — RFC 8785 canonicalisation + SHA-256 linkage, `verifyChain()` run at boot and on demand; `IntegrityScreen.tsx:127` tags it `"COMPUTED LIVE"` and `127-128` replaced the old hardcoded "Verified Intact".
3. **Tamper demonstration runs on the real chain** — one byte flipped in the canonical payload then re-verified (`ledger-store.ts:260-271`, `TamperDemoScreen.tsx`), honestly titled `"TAMPER DEMONSTRATION — MANDATED M4.6"` with a `RESTORE` affordance.
4. **Append-only SQLite with UPDATE/DELETE triggers** plus an honest persistence panel that shouts `"IN-MEMORY ONLY"` when the driver fails (`IntegrityScreen.tsx:219-257`).
5. **Evidence-image hashing with a seal-time cross-check** — the durable copy is re-hashed and a mismatch aborts sealing (`ResultsScreen.tsx:189-195`); honest `"NOT AVAILABLE — no durable photo was attached to this record"` when absent.
6. **Real offline outbox** — exponential backoff, batch pacing, dead-letter sweep, real HTTP client (`sync-store.ts:176-250`, `sync/outbox.ts:50-114`). The old "simulate sync" is off the app path.
7. **Real geotag with honest absence and a surfaced mock flag** (`capture/geotag.ts:33-43,81-106`; `RecordDetailScreen.tsx:360-365`).
8. **Demo seeds are never counted as queued and never render as SYNCED** (`CaseLogScreen.tsx:122,275,417,509`).
9. **Engine profile honesty end-to-end** — `ResultsScreen.tsx:293-307` unvalidated card, `AnalyzeScreen.tsx:180-214` first-class halt states, `AnalyzeScreen.tsx:173` `"Reaction kinetics / NOT MEASURED — SINGLE PHOTO"`, `EvidenceBits.tsx:232` `"DISPLAY ONLY — NOT A COLORIMETRIC STANDARD"`, no gallery-import path anywhere.
10. **Real CIEDE2000 math** in the bunching pairwise table (`colour/delta-e.ts` used at `BunchingScreen.tsx:227` and `bunching-engine.ts:115`).
11. **Trilevel outcome vocabulary enforced** across `domain/outcome-copy.ts:18-29`; no substance-identity string in any record path.

---

## 7. The 8 most misleading things for a judge / demo audience

1. **The Court Evidence Package is a fabricated statutory document.** `services/export-flow.ts:91-120` hardcodes `Pixel 7a / Charcoal / SIM-SERIAL-0001 / Android 13 (API 33)`, invents a custodian (`'Head Constable'`, `'Narcotics Control Bureau'`, badge = first word of the operator id), and stamps **`Gross Weight: 500 g / Net Weight: 498.2 g`** on a seizure memo for a seizure whose weight was never weighed. `RecordDetailScreen.tsx:490-540` presents it as *"Court Evidence Package … generated live from the sealed canonical payload"* with a green `GENERATED` badge. Nothing on screen says any field is a fixture.
2. **The BSA s. 63(4) Part B certificate is a fake human expert signing a pre-written certification.** `export/certificate-generator.ts:95-99,188-215` — "Dr. V. K. Sharma", reg. `CFSL-CYB-2026-8841`, "I have examined … and certify", "Independent Verification: **VERIFIED MATCH**" (hardcoded, never computed), and a blank `Signature: ______` line. To a judge this reads as a completed forensic-expert certificate.
3. **The Duty board's "Forensic Case Log" is 15 synthetic records with no demo label.** `demo/demo-dataset.ts:80-176` — 95–98 % confidences, 28.5562/77.0999 GPS, "Head Constable R. Sharma" — rendered at `HomeScreen.tsx:259-344` with only ΔE00/CONF/CALIB/SEQ chips. The Records and Integrity tabs do label them; the first screen after login does not.
4. **A real capture gets relabelled as demo data after a restart — and falsely claimed never to have been uploaded.** `ResultsScreen.tsx:228` → `ledger-repository.ts:264-265` writes `state='demo-seed'`, `reason='preinstalled deterministic demo record'`, and `RecordDetailScreen.tsx:331-332,353-354` prints *"LOCAL DEMO RECORD — never uploaded to the API"*. Meanwhile `ledger-store.ts:245` did queue it for upload. A demo that seals a genuine test and then reopens the app shows the officer's own record flagged as fake and falsely denied to the server.
5. **BunchingScreen fabricates a StrongBox seal the app admits it does not have.** `BunchingScreen.tsx:112,134,156,189` — `deviceAttestation: 'StrongBox Hardware Keystore'`, `sealState: 'ATTESTED'`, `syncStatus: 'synced'`, `chainHash: 'hash-sim-1'`, rendered as a green `"Attested"` pill — while `SettingsScreen.tsx:124` says *"Keystore seal UNAVAILABLE on this path"*. The "26-Package Multi-Lot" preset manufactures 26 attested, synced records that never existed.
6. **The "Copy Text" button on the tenderable bunching certificate copies nothing** (`BunchingScreen.tsx:334-337`, no `Clipboard` call anywhere in `src/`). Flipping to "Copied" after a demo says *"Copy the certificate for the panchnama"* is a claim with no mechanism.
7. **The camera viewfinder's coaching HUD is wired to `null`.** `CameraView.tsx:162` `<CoachingOverlay qualityResult={null} />` — the banner always reads *"Position the card, then capture one photo"*, the reticles are static, and no blur/glare/light coaching ever fires (`frame-processor.ts` and `quality-gates.ts` are unimported). A demo of "guided capture with real-time quality gating" shows nothing being gated. Compounded by `CameraView.tsx:48`'s `'UNDerexposure'.toUpperCase()` typo and the engine never emitting glare codes at all.
8. **The "COLOURIMETRIC PIPELINE — LIVE" progress bar is four `setTimeout`s**, and the "Seizure Clock" is anchored to the last *test record's* timestamp, not a seizure time. `AnalyzeScreen.tsx:73,77,84,89,231` (`await tick(180/240/300/220)`) with the card promising *"Each one shows the number it used"*; `StatutoryClockModal.tsx:51` fed by `CaseLogScreen.tsx:485` `c.lastAt`. The 48 h / 72 h / 15+15-day "STATUTORY MANDATE" countdowns are therefore not statutory clocks at all — and no seizure datetime is captured anywhere in intake.

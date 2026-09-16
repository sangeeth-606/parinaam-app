# Parinaam

> Calibrated evidence for the colour that decides a case.

**Smart India Hackathon 2026 — Problem Statement 26231**  
**Nodal Agency:** Narcotics Control Bureau (NCB), Ministry of Home Affairs  
**Theme:** MedTech / BioTech / HealthTech | **Category:** Software  
**Team:** shauryas  

---

## 1. What It Does

**Parinaam** is an offline-first Android application that transforms standard colorimetric chemical field tests (e.g. NIK, Sirchie NARK II pouch-and-ampoule kits) into **calibrated, confidence-scored, tamper-evident, court-tenderable digital records** without requiring any new physical chemistry, proprietary optical attachments, or external hardware.

> [!IMPORTANT]
> **Parinaam does NOT identify drugs.**
> Under the NCB *Drug Law Enforcement Field Officers' Handbook* and SWGDRUG analytical guidelines, colorimetric field spot tests are **Category C** (presumptive/indicative only) and are legally inadmissible to prove substantive chemical identity in court. Definitive chemical proof requires laboratory analysis (GC-MS, LC-MS/MS, FTIR).
> 
> Parinaam records **the test event itself**, providing structured data, reproducible colorimetry, package-to-lot mapping, and cryptographic integrity proof.

---

## 2. Core Architecture & Tech Stack

- **Framework:** React Native 0.87.1 + Expo SDK 57 (Prebuild / EAS Dev Client workflow; **Expo Go is not supported** due to native camera frame processors, SQLCipher, and hardware keystore modules).
- **Language:** TypeScript (strict mode).
- **Camera & Vision:** `react-native-vision-camera` v5.2.3 (locked AE/AWB/focus), `react-native-worklets` (320x240 frame processing off the JS thread), `react-native-vision-camera-barcode-scanner` (ML Kit 4-corner marker tracking), `react-native-fast-opencv` (homography, perspective warping, Laplacian sharpness).
- **Colour Engine:** Pure TypeScript (~200 lines, unit-tested against Python `colour-science` and Sharma 2005 CIEDE2000 datasets): Grey-ramp tone curve linearization -> White-patch von Kries -> Root-Polynomial degree-2 regression (RP-2) -> XYZ -> CIELAB -> CIEDE2000 ($\Delta E_{00}$).
- **Decision Engine:** Quadratic Discriminant Analysis / Mahalanobis distance in $(a^*, b^*)$ space coupled with burst measurement noise ($\Sigma_{eff} = \Sigma_{class} + \Sigma_{meas}$) and class-conditional Mondrian conformal prediction. Dual abstentions: Low-margin and $\chi^2$ novelty detection.
- **Storage:** `expo-sqlite` with SQLCipher (AES-256 encrypted at rest, key held in `expo-secure-store`), append-only database triggers (`ABORT` on `UPDATE` or `DELETE`), FTS5 search index.
- **Evidentiary Integrity:** Hardware-backed ECDSA key attestation (`@pagopa/io-react-native-crypto`), RFC 8785 Canonical JSON Serialization (JCS), SHA-256 hash chaining, standalone POSIX `verify.sh` verification.
- **Document Export:** `expo-print` generating Bharatiya Sakshya Adhiniyam (BSA) 2023 s. 63(4) dual certificates (Part A & Part B), NDPS Form-4 (Inventory), Form-5 (Magistrate Application), and Form-6 (Test Memo).
- **Backend:** in-repo REST API (`server/`, `node:http` + `node:sqlite`, **zero npm dependencies**) — consumed by this officer app and the separate web dashboard repo. Its operations guide lives at [`server/README.md`](server/README.md). Supabase may become the storage layer behind the same contract once provisioned.

---

## 3. Quick Start & Developer Setup

### Prerequisites
- Node.js 22+ (the server + tests use `node:sqlite` / `--experimental-strip-types`) and npm
- Android Studio with Android SDK API 28+ installed (for the device build)
- Target Android physical device (Snapdragon 6xx/7xx class, Android 13+)

### Installation & Development Build

```bash
# 1. Install dependencies (postinstall patches native configs via scripts/patch-react-native.js)
npm install

# 2. Prebuild native Android project
npx expo prebuild

# 3. Run development client on physical Android device
npx expo run:android
# Or via EAS build:
# eas build --profile development --platform android
```

> [!WARNING]
> Do NOT use standard Expo Go. The native modules (`react-native-vision-camera`, `react-native-fast-opencv`, `@pagopa/io-react-native-crypto`, SQLCipher) require a custom development client build.

---

## 4. Project File Structure

```
parinaam-app/
├── README.md                           # This file
├── App.tsx / app.json                  # Expo entry & config (React Native 0.87.1)
├── src/                                # Application source — screens, components, state,
│   │                                   #   capture pipeline, colour science, crypto, sync
│   ├── screens/  components/  theme/   #   UI (WCAG AAA "evidentiary" light language)
│   ├── state/                          #   zustand stores incl. case-context + sync engine
│   ├── capture/  colour/  domain/      #   guided capture, calibration, classification
│   ├── crypto/  db/  evidentiary/      #   hash chain, SQLite ledger, seals & certificates
│   ├── sync/                           #   outbox transport ⇄ server
│   └── services/  navigation/  types/  #   export flows, stacks, shared types
├── server/                             # In-repo REST API: node:http + node:sqlite,
│   │                                   #   ZERO npm deps; operations guide server/README.md
│   └── src/ (auth·verify·routes·bus·db·main)
├── tests/                              # node:test suites (170) — crypto, db, sync, server,
│                                       #   auth, state, acceptance matrix incl. live API
└── scripts/                            # metro stubs, native patching, verify.sh (chain demo)
```

### Running the stack (officer app + backend)

```bash
npm install                      # JS deps (server/ itself uses ZERO deps — node builtins)
npm run server                   # REST API on http://localhost:8571 (PARINAAM_API_PORT to
                                 #   change; DB: server/data/parinaam-server.db — gitignored,
                                 #   auto-seeded with the demo officer admin/adminpass)
npx expo start --android         # officer app on device/emulator; point Settings → SYNC →
                                 #   SERVER URL at the API (10.0.2.2:8571 from the Android
                                 #   emulator reaching a host server; login admin/adminpass)
npx expo start                   # press `w` to run the same app in the browser (web build;
                                 #   camera capture is simulator-backed there)
npm test                         # 170 node:test cases (ledger, triggers, sync, server, e2e matrix)
npm run lint                     # eslint incl. the forbidden-claims guard (see §6)
npm run typecheck                # strict TS: app + server projects
```

---

## 5. Team Roles (Grand Finale Allocation)

| Role | Responsibility | Core Deliverables |
|---|---|---|
| **Role A — Capture** | Camera pipeline, frame processing worklets | VisionCamera 5, quality gates, 4-corner homography |
| **Role B — Colour** | Colorimetry mathematics, calibration | Pure TS colour pipeline, calibration card design |
| **Role C — Inference** | Statistical modeling, confidence guarantees | Mahalanobis QDA, conformal sets, dual abstentions |
| **Role D — Evidence** | Cryptographic sealing, statutory certificates | Hardware attestation, hash chain, s. 63(4) PDF |
| **Role E — Platform** | Storage, synchronization, backend API | SQLite append-only triggers, outbox sync, `server/` REST API |
| **Role F — Demo & Docs**| Live presentation, QA, rehearsal | Flight-mode rehearsal, script timing, jury defense |

---

## 6. Key Legal & Procedural Guardrails

These are enforced in code, not just on paper — the ESLint config carries static rules for the
forbidden-claims list, and the append-only triggers live in the DB layer:

1. **Never Assert Substance Identity:** The outcome vocabulary is strictly `CONSISTENT_WITH_REAGENT_POSITIVE`, `CONSISTENT_WITH_REAGENT_NEGATIVE`, or `INCONCLUSIVE`.
2. **Standing Order 1/88 is Repealed:** Repealed by Rule 29 of the NDPS Rules 2022. Cite **Rule 10(2) of NDPS Rules 2022** for package bunching.
3. **Never Replace Panch Witnesses:** Sits *alongside* e-Sakshya video and mandatory civilian panchas under BNSS s. 103/105; replaces neither.
4. **Device Key ≠ Digital Signature:** Bespoke device keys are termed **"device attestation"** or **"integrity seal"** under IT Act 2000.
5. **No Gallery Import:** The camera pipeline is the sole ingest path; external file picking is physically blocked.
6. **Append-Only Ledger:** `UPDATE`/`DELETE` on `test_record` raise `ABORT` via triggers — tamper is visible, never silent.

# Known Gaps — Parinaam

> **Read this before trusting any checklist.**
> The phase-spec milestone tables (`spec/01`–`07`) were never ticked and are stale. This file
> is the authoritative list of what is genuinely incomplete, unverified, or deferred.
>
> **How to use this file:** when you fix a gap, change its marker to ✅ and name the PR or
> commit that closed it, then update the matching row in `spec/`. A gap is not closed because
> the code compiles — it is closed when the claim it makes is *true* and, where testable, is
> *tested*.

Legend: ⛔ blocking (do not use the feature in the field) · ⚠️ misleading (the app says
something the code cannot back up) · 🧩 incomplete (module exists, wiring/asset missing) ·
📋 deferred (deliberately out of scope for the hackathon prototype)

---

## 1. Citation that is NOT verified (⚠️ misleading — read before shipping any export)

`src/export/certificate-generator.ts:196` (text) and `:287` (HTML) print:

> *"Pune Bar Association v. Union of India, Supreme Court of India, 2026"*

**This citation could not be verified.** Web search was unavailable when this note was written
(the agent session's search API returned 401), so no primary-source check was possible — not on
SCC's site, not on the Supreme Court's site, not on any reputable secondary source.

**Owner decision (2026-09-25): leave it in place, investigate later.** It is recorded here so it
is not forgotten, and so nobody adds a *second* unverified citation alongside it.

**Before this app is used to produce a real certificate, someone with access to a legal
database must either:**

- **A.** confirm the case exists and cite it properly — neutral citation, court, bench, date of
  judgment, and what it actually holds; **or**
- **B.** delete both lines and replace them with the statutory basis that is already correct and
  verifiable: **Rule 10(2) of the NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022,
  G.S.R. 899(E)**, and **Bharatiya Sakshya Adhiniyam, 2023, s. 63(4)**.

Risk if left unfixed: a certificate that cites a case which does not exist is, on its face, a
false statement made to a court by a public-safety officer. That is a far worse defect than an
incomplete form.

`tests/evidentiary/bsa-certificate.test.ts:96` asserts the citation string is present, so
removing it will require updating that test at the same time.

**Related statutory wording that *was* verified against the code and must not drift:**
Standing Order 1/88 is repealed and must never be cited (AGENTS rule 5); "deviceAttestation" /
"integrity seal" — never "digital signature" (rule 6); the trilevel `PresumptiveOutcome`
vocabulary, never a drug identity (rule 7).

---

## 2. Backend / sync

| # | Gap | State |
|---|-----|-------|
| 2.1 | **API account vs. device gate** — the phone unlock gate password is NOT the server account. They are now separate credentials, stored separately. | ✅ fixed 2026-09-25 (`src/sync/server-credentials.ts`, `src/state/sync-store.ts`). An unknown account now fails with an actionable message instead of a loop. |
| 2.2 | **Dead-lettered records** were deleted, then the UI reported "Outbox clear" — silent record loss. | ✅ fixed 2026-09-25. Rows are now marked `dead_lettered_at` and retained; the case log, record detail and integrity screens say `SERVER REJECTED · NOT UPLOADED`. |
| 2.3 | `department` on an ingested record was a hardcoded `'NCB'` literal. | ⚠️ now honestly `'UNSPECIFIED'`. A real unit requires adding a `department` column to `officers` — not yet provisioned. |
| 2.4 | A `panchnama_ref` was *invented* from the case-reference string for the four demo cases. | ✅ fixed 2026-09-25: never inferred. It belongs to `MutableCaseReview` and is only ever set by a reviewer from a real panchnama. |
| 2.5 | `locationFromCaseRef` derives a city from the case-reference *string* (`DZU` → "Delhi"). | ⚠️ kept deliberately, but it is a **filing/routing label, not a claim about where a seizure occurred**. Only the record's own sealed GPS is a location fact. Rename the column if it ever reaches a court document. |
| 2.6 | Server-side reads (case list, status, record detail) were never audited end-to-end. | 📋 unaudited. Treat dashboard/case-log server data as untrusted input until reviewed. |
| 2.7 | `src/sync/db-shim.ts:36` opens a **second, unkeyed** SQLite connection (`SQLite.openDatabaseSync('parinaam.db')`, no key) to the encrypted ledger. | ⛔ a data-protection defect: the outbox reads/writes a store that is not SQLCipher-encrypted. Needs to share the keyed connection or the key. |
| 2.8 | No rate limiting, lockout, or audit trail on the API beyond session rows. | 📋 acceptable for a hackathon prototype; not for a real deployment. |

---

## 3. Court export (`src/export/`, `src/services/export-flow.ts`)

| # | Gap | State |
|---|-----|-------|
| 3.1 | The export hardcoded a Pixel 7a, serial `SIM-SERIAL-0001`, an Android ID, a badge number derived from the officer's name, a 520 g / 500 g / 498.2 g seizure weight, a court, a designation, a sample origin/dup number, a card print batch, a measurement covariance, `biometric_ok: 1`, and a hardcoded `TrustedEnvironment` security level. | ✅ fixed 2026-09-25. Every unmeasurable field is now `TO_BE_COMPLETED` / `NOT RECORDED` / `null`. A certificate is visibly incomplete rather than plausibly false. |
| 3.2 | Part B named a fictional expert, "Dr. V. K. Sharma", registration `CFSL-CYB-2026-8841`. | ✅ fixed 2026-09-25 — Part B is left for a real forensic/cyber expert to complete. |
| 3.3 | Part B claimed the seal "was verified using secp256r1 (P-256) ECDSA-SHA256" and "VERIFIED MATCH via SHA-256". | ✅ fixed 2026-09-25 — the certificate now says verification was **not** performed and names how to reproduce it (`verify.sh`, `POST /records/:uuid/verify`). |
| 3.4 | PDF typesetting (`expo-print`) and system share need a device build. | 🧩 simulator path is honest: text/HTML/MANIFEST are genuinely generated; PDF is reported as unavailable rather than faked. |
| 3.5 | No court-bundle signature or seal. | 📋 the manifest carries a SHA-256 manifest digest only. |

---

## 4. Device integrity / attestation

| # | Gap | State |
|---|-----|-------|
| 4.1 | The key path is unavailable at runtime, so **no hardware keystore operation succeeds**. Every real capture records `deviceAttestation: null` and `security_level: 'Software'`. | ⛔ per AGENTS rule 10 the app must never claim StrongBox; it records the achieved level. See 4.2. |
| 4.2 | `StrongBoxUnavailableException` fallback → TEE → Software needs a physical device to prove. | 📋 **unverifiable in the simulator.** Test on a real handset before any field claim. |
| 4.3 | Bunching "evaluation presets" claimed `StrongBox Hardware Keystore` / `ATTESTED` / `synced` on rows that no device produced. | ✅ fixed 2026-09-25 — preset rows are `UNATTESTED` / `demo-seed`, and the screen shows a red **SIMULATED DATA** banner whenever a preset is selected. |
| 4.4 | `IntegrityScreen` shows a hardware-seal tile even when no seal exists. | ✅ already honest: "RECORDS WITH KEYSTORE SEAL" vs "CHAIN-ONLY (HONEST NULL)", latest seal printed as `NULL — CHAIN-ONLY`. |

---

## 5. Demo vs. real data

| # | Gap | State |
|---|-----|-------|
| 5.1 | `ResultsScreen.isDemo` was true for any capture whose engine profile was unvalidated, so a **real** capture was stored as a `demo-seed` and, after restart, described as "LOCAL DEMO RECORD — never uploaded" although it had been queued. | ✅ fixed 2026-09-25: `isDemo` now depends only on `profile.demoMode`. The unvalidated-profile disclosure lives in the PROFILE STATUS card, where it is honest. |
| 5.2 | The duty board (Home) listed demo records with no marker. | ✅ fixed 2026-09-25: every demo record now carries a `SIMULATED DEMONSTRATION RECORD` tag, and a rejected one says so. |
| 5.3 | The 15 seeded demo records use real-looking case refs (`NCB/DZU/CR-14/2026`, `src/demo/demo-dataset.ts:83`) — a `DEMO-` prefix on all of them would make misreading impossible rather than merely unlikely. | ⚠️ mitigated by the 5.2 tag only. |

---

## 6. Colour pipeline / engine (behaviour is correct; these are the honest limits)

| # | Gap | State |
|---|-----|-------|
| 6.1 | The engine profile is `PENDING_VALIDATION` with `classification_capable: false`, so **every live capture returns `INCONCLUSIVE`**. | ⛔ this is correct behaviour, not a bug. The app cannot classify until a real calibration study completes. Never ship a build that claims otherwise. |
| 6.2 | ΔE₀₀ is verified 34/34 against Sharma/Wu/Dalal (max error 4.9e-5). | ✅ |
| 6.3 | `camera-engine/service/analyzer.py:755` hardcodes `"glare_fraction": 0.0` in the quality diagnostics, and no exposure gate is applied. | ⚠️ a quality gate that always reports "no glare" is not a gate. Measure glare and add an exposure gate. |
| 6.4 | `src/capture/quality-gates.ts:291-293` fabricates framing values (`occupancyFraction: 0.60`, `skewDegrees: 2.0`) when no framing metrics were measured. | ⚠️ the camera reports framing numbers it invented. It must report "not measured" instead. |
| 6.5 | `CameraView.tsx:162` passes `qualityResult={null}`. | 🧩 the quality result is computed but not surfaced. |
| 6.6 | Exposure-gate copy/typo sweep: verify every `UNDEXPOSURE`/gate string an officer can read. | 📋 re-check when the exposure gate lands. |
| 6.7 | `src/state/guidance.ts:13` tells the officer "The shutter arms itself." | 📋 guidance copy describes a capability that is not implemented. |
| 6.8 | `src/domain/outcome-copy.ts:35,63,64` tell the officer the gate is **4.0 ΔE₀₀**, while the engine enforces **5.0** (`camera-engine/service/analyzer.py:47`, `CALIBRATION_RESIDUAL_MAX = 5.0`). | ⚠️ the officer is shown a threshold the engine does not use, and the 2.5–4.0 "DEGRADED" band in the same file does not exist in the engine at all. Reconcile — the engine is the truth. |
| 6.9 | Physical printed calibration card (CIE-Lab reflectance baselines) is not manufactured or measured. | ⛔ blocks profile validation. |

---

## 7. Features that exist as modules but are not wired

| # | Gap | State |
|---|-----|-------|
| 7.1 | Audio coaching (`src/audio/audio-coaching.ts`) — the language + audio-coaching controls are live in `SettingsScreen.tsx:75,507`, but there is **no `assets/` directory at all**, so no pre-recorded prompt can play. | 🧩 dead controls. Hide them or record and ship the prompts. |
| 7.2 | "Copy Text" in Bunching set a **"Copied"** label and copied nothing — no Clipboard module is available to this build. | ✅ fixed 2026-09-25: the lying button is gone. The certificate text is native `selectable`, and the header now says "Long-press the text to copy". Installing `expo-clipboard` would need a native rebuild — still possible later. |
| 7.3 | Reaction kinetics (ΔE(t), 10–60 s) — `src/capture/kinetics.ts` and the burst manager exist, but no capture window drives a 10–60 s trajectory on a real device. | 📋 |
| 7.4 | Offline map snapshot (Phase 6). | 📋 no map is rendered anywhere; location is text + coordinates only. |
| 7.5 | OTP, Supabase provisioning, QR kit-identity. | 📋 deferred (GAP-2/3/7 from `docs/v2-officer-app-brief.md`). |

---

## 8. Deferred by design (not defects)

- **No live government-system writes** (SIMS / NIDAAN / NCORD / CCTNS / ICJS) — constraint 8. Exports are files plus mock-schema JSON aligned to NCB Form F. Never claim integration.
- **Zero training on seizure imagery** — constraint 9. Any future model work must use printed swatches, synthetic simulators, or legal chemical proxies.
- **No new online platforms; fully self-hosted** — Docker Compose only.

---

## 9. Verification commands

```bash
npm run typecheck          # app
npm run typecheck:server   # server
npm run lint
npm test                   # 246 tests
docker exec parinaam-app-camera-engine-1 \
  python -m unittest discover -s /app/service -p "test_*.py" -t /app/service   # 12 tests
```

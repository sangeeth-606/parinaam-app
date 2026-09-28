# AGENTS.md — Repository Guidance & Invariant Rules

> **Mandatory rules and architectural constraints for any agent working in `parinaam-app`.**

---

## 1. The Ten Invariant Rules

1. **No Gallery Import:**
   The camera pipeline captures directly from the camera preview. Gallery image picking is strictly forbidden to preserve evidentiary chain of custody.
2. **Append-Only Ledger Integrity:**
   Never weaken `UPDATE` or `DELETE` triggers on `field_test`, `case_status_history`, `server_audit`, `idempotency`, or `evidence_blobs`. On SQLite, mutations abort via `RAISE(ABORT)`. On PostgreSQL, mutations abort with SQLSTATE `55000`.
3. **Presumptive Banner Display:**
   Every test result is presumptive. The app must transparently state that chemical field tests are presumptive indicators, never confirmatory laboratory assays.
4. **Transparent Colourimetry, No ML:**
   Classification is based strictly on transparent CIE $L^*a^*b^*$ colour distance calculations ($\Delta E_{00}$) against published reagent standards. Never introduce opaque deep learning models or neural classifiers for drug identification.
5. **Statutory Basis:**
   Standing Order 1/88 was repealed. Always cite Rule 10(2) of the NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022, and Section 63(4) of Bharatiya Sakshya Adhiniyam, 2023.
6. **Integrity Seal Terminology:**
   Use "deviceAttestation" and "integrity seal". Never use "digital signature", "PKI signature", or "e-sign" unless backed by a statutory certificate authority.
7. **Never Assert Drug Identity:**
   Results must be labelled with the trilevel vocabulary:
   `CONSISTENT_WITH_REAGENT_POSITIVE`, `CONSISTENT_WITH_REAGENT_NEGATIVE`, or `INCONCLUSIVE`. Never assert "Heroin", "Cocaine", or any substantive drug identity.
8. **No Live Government System Writes:**
   The system is fully self-hosted (Docker Compose). Never attempt live network writes to SIMS, NIDAAN, NCORD, CCTNS, or ICJS.
9. **Zero Training on Seizure Imagery:**
   Never train models on real-world seizure photographs. Calibration uses physical printed cards or synthetic colourimetry charts.
10. **Record Achieved Security Level:**
    Never claim `StrongBox` or `HardwareKeystore` without dynamically probing the keystore. Record the achieved security level honestly (`Software`, `TEE`, or `StrongBox`).

---

## 2. Version 4 Execution Program

The `version4` engineering program systematically resolved the 5 core user programs across 19 sequential phases:

- **Baseline:**
  - Base commit: `fdf4c1507e2ea75b6a0b5486cb151ac824be471a`
  - 259 passing tests, 0 failures.
  - 2 TypeScript compiler errors (`IconName` in `CaptureScreen.tsx`).
- **Ordering Constraints Enforced:**
  - Rule 1: Phase 14 (versioned migrations) must precede additive server DDL (Phase 8).
  - Rule 2: Phase 13 (SQLCipher connection fork fix) must precede Phase 15 (sync queue outbox query).
  - Rule 3: Phase 1 (stop sealing fabricated science) must precede Phase 2 (seal/register UI honesty).
- **Phases Completed:**
  - **Phase 0:** Baseline recording & honest labelling sweep.
  - **Phase 1:** Stop sealing fabricated science in `ResultsScreen`.
  - **Phase 2:** Seal & register confirmation UI honesty.
  - **Phase 3:** Immutability of GPS coordinates and timestamp on `ResultsScreen`.
  - **Phase 4:** Location accuracy grading (`GPS_GOOD_ACCURACY_M`) and iOS permission disclosures.
  - **Phase 5:** Geotag provenance marker (`source`) in `FieldTestGps` wire payload.
  - **Phase 6:** Honest keystore probing (`probeHardwareSecurityLevel`) & hoisted sealing service.
  - **Phase 7:** Single source of truth for officer roles (`src/contracts/officer-roles.ts`).
  - **Phase 8 & 14:** Versioned database migrations (v1/v2) and 14 new officer metadata columns.
  - **Phase 9:** Realistic synthetic demo roster & removal of plaintext credentials.
  - **Phase 10:** RBAC guard consolidation in `server/src/rbac.ts`.
  - **Phase 11:** Device gate hardening: honest lockouts, server-confirmed identity binding.
  - **Phase 12:** Session & authentication audit hardening (lockout, `server_audit`).
  - **Phase 13 & 15:** SQLCipher connection fork resolution via `toSqliteDatabase()`, dead-letter filter.
  - **Phase 16:** Cloud deploy hardening: enforced `POSTGRES_PASSWORD`, `PARINAAM_SEED=0` default.
  - **Phase 17:** Complete documentation suite (`data-model-reference.md`, `mobile-to-server-contract.md`, `integration-gotchas.md`).
  - **Phase 18:** Retirement of dead legacy database modules.
  - **Phase 19:** Final full verification gate across app and server.
- **Final Test Verification:**
  - `npm test`: **323 passing tests**, 0 failures across 85 test suites.
  - `npx tsc --noEmit`: **0 errors**.
  - `npm run typecheck:server`: **0 errors**.
  - `npm run lint`: **clean**.

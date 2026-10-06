# Parinaam Web Integration & Unification Specification

> **Document Version:** 1.0.0  
> **Status:** Approved Architecture Plan  
> **Target Repositories:**  
> - Mobile App / Backend Server: `/home/zape/Projects/parinaam-app`  
> - Web Review Dashboard: `/home/zape/Projects/parinaam-web`  
> **Shared Database:** Supabase PostgreSQL (`aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`)

---

## 1. Executive Summary & Vision

The `parinaam-web` repository is a Next.js 15 review dashboard designed for supervisory officers, forensic administrators, and judicial authorities to review NDPS field test records. Currently, `parinaam-web` operates on an isolated in-memory mock store (`src/lib/mock-data.ts`) with synthetic users, non-compliant vocabulary ("positive", "negative", "digital signature"), and no live database connectivity.

With the successful migration of `parinaam-app` to **Supabase PostgreSQL**, both the mobile application and the web dashboard must now operate against the **same authoritative cloud database and API surface**.

This specification defines the complete end-to-end architectural, schema, backend, and frontend overhaul required to bring `parinaam-web` to enterprise forensic parity with `parinaam-app`.

---

## 2. Mandatory Invariant Rules (AGENTS.md Compliance)

Any code in `parinaam-web` must strictly abide by the **Ten Invariant Rules**:

1. **Immutable Audit Ledger:**
   Never issue `UPDATE` or `DELETE` against `field_test`, `server_audit`, or `evidence_blobs`. Status updates must strictly write append-only event rows to `case_status_history`.
2. **Mandatory Presumptive Banner:**
   Every screen displaying field test results must visibly declare that chemical tests are *presumptive indicators*, never confirmatory laboratory assays.
3. **Statutory Legal Foundation:**
   - Cite **Rule 10(2) of NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022**.
   - Cite **Section 63(4) of Bharatiya Sakshya Adhiniyam, 2023 (BSA)**.
   - **Never** cite the repealed Standing Order 1/88 or the repealed Indian Evidence Act, 1872.
4. **Trilevel Reagent Vocabulary:**
   Results must be strictly labelled as:
   - `CONSISTENT_WITH_REAGENT_POSITIVE`
   - `CONSISTENT_WITH_REAGENT_NEGATIVE`
   - `INCONCLUSIVE`
   *Never* assert definitive drug identity ("Heroin", "Cocaine") on presumptive assays.
5. **Integrity Seal Terminology:**
   Use `"deviceAttestation"` and `"integrity seal"`. Never use "digital signature", "PKI signature", or "e-sign" unless backed by a statutory Certifying Authority.
6. **Self-Hosted / Air-Gapped Simulation:**
   No live writes to national law enforcement databases (SIMS, NIDAAN, NCORD, CCTNS, ICJS). Placeholders must be clearly marked.

---

## 3. Unified Architecture & Integration Strategy

```
               ┌────────────────────────────────────────────────────────┐
               │              Field Officers (Mobile App)               │
               │                   `parinaam-app`                       │
               └──────────────────────────┬─────────────────────────────┘
                                          │ Encrypted sync payload (JCS)
                                          │ + Evidence Blobs (Photos)
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   PARINAAM BACKEND & SUPABASE POSTGRESQL                         │
│                                                                                  │
│   Endpoints:                                 Tables:                             │
│   • POST /api/v1/auth/login                  • officers                          │
│   • GET  /api/v1/records                     • cases                             │
│   • POST /api/v1/cases/:id/status            • field_test (Append-only)          │
│   • GET  /api/v1/blobs/:hash                 • evidence_blobs (Photos)           │
│   • GET  /api/v1/events (SSE Real-time)      • case_status_history               │
│   • GET  /api/v1/audit                       • server_audit                      │
└───────────────────────▲──────────────────────────────────────────▲───────────────┘
                        │ API Client / Server Actions              │ Direct DB Pool
                        │                                          │ (Node pg / ORM)
               ┌────────┴──────────────────────────────────────────┴────────┐
               │                  Supervisors & Court Review                │
               │                `parinaam-web` (Next.js 15)                 │
               └────────────────────────────────────────────────────────────┘
```

### Web Connectivity Model:
1. **Primary Route:** `parinaam-web` uses Next.js Server Components and Route Handlers to communicate directly with the Parinaam Backend API (`http://127.0.0.1:8571/api/v1`) or directly via PostgreSQL connection pooler (`DATABASE_URL`).
2. **Image Serving:** Evidence photos captured on mobile devices are stored in `evidence_blobs`. The web dashboard fetches and displays real JPEG/PNG seizure photography directly from `/api/v1/blobs/:hash`.
3. **Live Ingest:** Web dashboard connects to the Server-Sent Events (SSE) stream (`/api/v1/events`) to show real-time incoming field tests on the dashboard without manual refresh.

---

## 4. Officer Roles & Unified RBAC Matrix

Roles are aligned with `src/contracts/officer-roles.ts`:

| Role | Web Access Scope | Permissions & Capabilities |
| :--- | :--- | :--- |
| **`ADMIN`** | All National / Zonal Records | User Management, System Audit, Case Review, Panchnama Escalation, Recompute Integrity, Full Exports |
| **`SUPERVISOR`** | Zonal / Unit Records | Case Status Transition (`UNDER_REVIEW` ➔ `REVIEWED` / `ESCALATED`), Panchnama Reference Recording, Unit Exports |
| **`SENIOR`** | Station / Own Records | Field Test Review, Court Certificate Export (BSA §63), Integrity Verification |
| **`JUNIOR`** | Own Submissions Only | View Own Sealed Records, Download Field Receipt |
| **`JUDICIARY`** | Evidentiary Court Records | Read-Only Evidentiary Dossier, Chain of Custody Audit Log, Legal Print/Export |

---

## 5. Phased Implementation Roadmap

### Phase 1: Environment & Supabase Connection Setup
- [ ] **1.1** Configure `parinaam-web/.env.local` to inherit `DATABASE_URL` and `PARINAAM_API_URL` (`http://localhost:8571`).
- [ ] **1.2** Install `@types/pg` and `pg` (or Supabase client) in `parinaam-web`.
- [ ] **1.3** Establish database connection client supporting SSL and connection pooling.
- [ ] **1.4** Verify web app can query the live Supabase `officers`, `cases`, and `field_test` tables.

### Phase 2: Domain Model & Vocabulary Harmonization
- [ ] **2.1** Update `src/lib/types.ts` in `parinaam-web`:
  - Deprecate `"positive" | "negative" | "inconclusive"`.
  - Introduce `CONSISTENT_WITH_REAGENT_POSITIVE`, `CONSISTENT_WITH_REAGENT_NEGATIVE`, `INCONCLUSIVE`.
  - Align `CaseRecord` with `FieldTestWireRecord` (including `deviceSecurityLevel`, `locationSource`, `recordHash`, `prevRecordHash`).
- [ ] **2.2** Update role definitions in `src/lib/roles.ts` to `ADMIN | SUPERVISOR | SENIOR | JUNIOR | JUDICIARY`.
- [ ] **2.3** Terminology audit: Replace all references to "Digital Signature" with "Integrity Seal" / "Device Attestation".
- [ ] **2.4** Statutory citation audit: Replace SO 1/88 and IEA 1872 with Rule 10(2) NDPS Rules 2022 and Section 63 BSA 2023.

### Phase 3: Authentication & Session Realism
- [ ] **3.1** Retire hardcoded demo passwords in `src/lib/auth.ts`.
- [ ] **3.2** Connect login screen (`src/app/login/page.tsx`) to `/api/v1/auth/login` (or verify scrypt hashes from Supabase `officers` table).
- [ ] **3.3** Support the 10 seeded demo officers (`admin`, `supervisor`, `iyer`, `sharma`, `reddy`, etc., password `Parinaam#2026`).
- [ ] **3.4** Maintain encrypted JWT/session cookie with role claims and station attribution.

### Phase 4: Data Layer Overhaul (Retiring Mock Store)
- [ ] **4.1** Replace `src/lib/store.ts` in-memory mock Map with real database queries against Supabase:
  - Query cases with pagination, filtering by zone, status, outcome, and officer.
  - Query case status history from `case_status_history`.
- [ ] **4.2** Replace `/api/mock-image` with real photo retrieval from `evidence_blobs`.
- [ ] **4.3** Implement `/api/cases/[id]/status` action that writes to `case_status_history` and updates `cases` status with actor audit.

### Phase 5: UI & Dashboard Forensics Upgrade
- [ ] **5.1** Add prominent **Presumptive Drug Test Banner** across Dashboard, Case Details, and Table views:
  > *"NOTICE: Field chemical test results are presumptive indicators only. Confirmatory forensic laboratory analysis is required under Rule 10(2) of NDPS Rules, 2022."*
- [ ] **5.2** Update Case Details view to render:
  - CIE $L^*a^*b^*$ colourimetry breakdown and $\Delta E_{00}$ distance standard.
  - Device Keystore Attestation badge (`StrongBox`, `TEE`, or `Software`).
  - GPS provenance marker (`DEVICE_GPS`, `CELL_TOWER_APPROXIMATE`, or `USER_ESTIMATED`) and accuracy radius.
  - SHA-256 Chain of Custody hash verification pill (`record_hash` vs parent hash).
- [ ] **5.3** Integrate Server-Sent Events (SSE) in `src/components/app-shell.tsx` to notify supervisors when a new field seizure is sealed in real time.

### Phase 6: Analytics, Map & Geo-Intelligence
- [ ] **6.1** Feed MapLibre (`src/components/case-map.tsx`) with real GPS coordinates from Supabase `field_test`.
- [ ] **6.2** Display clusters by District / Police Station with reagent outcome colour coding.
- [ ] **6.3** Analytics overview: Real metrics for Test Volumes, Presumptive Positive Rates, and Review Latency.

### Phase 7: Court Certificate & Legal Export Generation
- [ ] **7.1** Re-engineer PDF export (`src/lib/export/court-pdf.tsx`) to generate the **Section 63 Bharatiya Sakshya Adhiniyam, 2023 Certificate of Electronic Evidence**.
- [ ] **7.2** Embed cryptographic SHA-256 hashes of test payload, device attestation level, and panchnama reference.
- [ ] **7.3** Align DOCX and Excel exports with statutory court submission standards.

### Phase 8: Full Verification & Automated Testing
- [ ] **8.1** End-to-end test: Create test on mobile app ➔ Upload to Supabase ➔ Verify instant visibility on web dashboard.
- [ ] **8.2** RBAC test: Verify `JUNIOR` cannot modify status, `SUPERVISOR` can review, and `ADMIN` can manage users.
- [ ] **8.3** Ensure zero TypeScript errors (`tsc --noEmit`) and clean build (`next build`).

---

## 6. Verification Checklist

| Area | Criteria | Pass / Fail |
| :--- | :--- | :--- |
| **Database** | `parinaam-web` reads and writes directly to Supabase PostgreSQL | Pending |
| **Presumptive Notice** | Presumptive banner visible on all test screens & reports | Pending |
| **Vocabulary** | Zero instances of "Heroin/Cocaine" assertion; trilevel vocabulary enforced | Pending |
| **Statutory Law** | All PDFs and screens cite BSA 2023 §63 & NDPS Rules 2022 Rule 10(2) | Pending |
| **Authentication** | Real login via Supabase credentials (`Parinaam#2026`) | Pending |
| **Real Evidence** | Real capture photos loaded from `evidence_blobs` | Pending |
| **Live Updates** | SSE live feed updates case table on new mobile test submission | Pending |

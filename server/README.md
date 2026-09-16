# Parinaam Backend API & Storage Architecture (`server/`)

The **in-repo backend** for Parinaam. It serves both the React Native officer mobile application (`parinaam-app`) and the web supervision dashboard (`parinaam-web`).

Designed for **complete self-hosting without cloud or third-party online platforms**:
- **Zero cloud platforms**: No external BaaS, no Supabase, no SaaS dependencies. Fully self-contained on-premise / containerized infrastructure.
- **Interchangeable storage engines**:
  - **PostgreSQL**: Production engine via Docker Compose running on conflict-free port **`55433`** (container `5432`).
  - **SQLite (`node:sqlite`)**: Lightweight file-backed (`server/data/parinaam-server.db`) or `:memory:` store for fast, hermetic local testing.
- **Port**: API binds to **`8571`** (configurable via `PARINAAM_API_PORT`).
- **CORS**: Wide-open (`Access-Control-Allow-Origin: *`) for seamless local development between the mobile app, backend, and web dashboard repos.

---

## 1. Quick Start

### Option A: Docker Compose (PostgreSQL + API Server) — Recommended for Web Team

```bash
# Start PostgreSQL (port 55433) and the API server (port 8571) with auto-seeded demo data:
docker compose up -d db server

# Verify containers are healthy:
docker compose ps

# View API logs:
docker compose logs -f server
```

The database port is mapped to **`55433`** on your host machine to prevent port collisions with any existing PostgreSQL instance running on the default `5432` port.

### Option B: Local Node.js against Docker PostgreSQL

```bash
# 1. Start the PostgreSQL container only:
docker compose up -d db

# 2. Seed realistic demo accounts and cases:
PARINAAM_DB=postgres npm run seed:server

# 3. Start the API server:
PARINAAM_DB=postgres npm run server
```

### Option C: Lightweight Embedded SQLite (No Docker Required)

```bash
# Seed the local SQLite database:
npm run seed:server

# Start server against SQLite:
npm run server
```

---

## 2. Seed Accounts & Roles

The seed script (`npm run seed:server` or `PARINAAM_SEED=1` in Docker Compose) creates authentic accounts representing each role defined in the supervision workflow:

| Username | Password | Role | Display Name | Permissions / UI View |
|---|---|---|---|---|
| `admin` | `adminpass` | `SENIOR` | Admin / Station House Officer | Full administrative access, Section 52A disposal certifications, user creation, case review |
| `supervisor` | `superpass` | `SUPERVISOR` | Superintendent R. K. Verma (NCB DZU) | Supervisor dashboard, case status review/escalation, forensic lab approvals |
| `judiciary` | `judiciarypass` | `JUDICIARY` | Special Judge P. S. Bhatia (NDPS Court) | Judicial read-only view, cryptographic attestation verification, certificate audits |
| `sharma` | `sharmapass` | `SENIOR` | HC-4412 Sharma (Delhi Zonal Unit) | Senior field officer, package sealing, Rule 10(2) bunching |
| `gill` | `gillpass` | `JUNIOR` | IC-9007 Gill (Mumbai Zonal Unit) | Junior field officer (can submit test records; cannot transition case review status) |

---

## 3. Seeded Demo Cases

Four coherent multi-zone cases are seeded out-of-the-box with valid RFC 8785 canonical JCS hashes and unbroken cryptographic chains:

1. **`NCB/DZU/CR-14/2026`** (Delhi Zonal Unit — Air Cargo Complex, IGI Airport)
   - **Status**: `UNDER_REVIEW` | **Panchnama**: `PAN/DZU/2026/884`
   - **Records**: 6 packages (`P-1` through `P-6`), Marquis reagent positive. Demonstrates NDPS Rule 10(2) "Identical Results" bunching ($\Delta E_{00} \le 3.0$).
2. **`NCB/MZU/CR-02/2026`** (Mumbai Zonal Unit — Container Berth 4, JNPT Docks)
   - **Status**: `REPORTED` | **Panchnama**: `PAN/MZU/2026/091`
   - **Records**: 3 packages (`P-1` Duquenois-Levine inconclusive, `P-2` Scott negative, `P-3` Mecke positive). Divergent reagents demonstrate refused bunching.
3. **`NCB/KZU/CR-07/2026`** (Kolkata Zonal Unit — Howrah Railway Yard Parcel Office)
   - **Status**: `REVIEWED` | **Panchnama**: `PAN/KZU/2026/312`
   - **Records**: 4 packages (`P-1` to `P-3` Froehde/Marquis positive for Opioids, `P-4` inert cutting agent). Certified under Section 52A NDPS.
4. **`NCB/BZU/CR-19/2026`** (Bengaluru Zonal Unit — Electronic City International Courier Hub)
   - **Status**: `ESCALATED` | **Panchnama**: `PAN/BZU/2026/505`
   - **Records**: 2 packages (`P-1`, `P-2` Marquis positive for synthetic methamphetamine). Commercial quantity escalated to Special Operations.

---

## 4. API Endpoints Reference

All `/api/v1/*` endpoints accept and return JSON. Endpoints marked `Bearer` require an `Authorization: Bearer <token>` header obtained from `/api/v1/auth/login`.

### Authentication & Account

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Open | Log in with `{ username, password }`. Rate-limited (5 attempts / 60s per IP). |
| `POST` | `/api/v1/auth/logout` | Bearer | Revoke current session token. |
| `GET` | `/api/v1/auth/me` | Bearer | Return `{ id, username, display_name, role }` for the authenticated token. |

### Dashboard & Analytics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Open | Healthcheck returning `{ ok: true, engine: "postgres", records: 15 }`. |
| `GET` | `/api/v1/stats` | Bearer | Summary numbers for dashboard home: total cases, cases by status, total records, records by outcome, total officers, and recent audit activity. |
| `GET` | `/api/v1/stream` | Open | Real-time Server-Sent Events (SSE) feed (`record-ingested`, `case-status`). |

### Cases & Supervision

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/cases` | Bearer | List cases with rollup counts. Query params: `status` (`REPORTED`, `UNDER_REVIEW`, `REVIEWED`, `ESCALATED`), `search` (substring match on case_ref / panchnama_ref). |
| `GET` | `/api/v1/cases/:caseRef` | Bearer | Detailed case record including metadata, list of test packages, and complete chronological status transition history. |
| `POST` | `/api/v1/cases/:caseRef/status` | Bearer (Senior/Admin) | Update case status: `{ status: "UNDER_REVIEW"|"REVIEWED"|"ESCALATED", note?: string }`. |
| `POST` | `/api/v1/cases/:caseRef/panchnama` | Bearer | Attach or update Panchnama reference: `{ panchnama_ref: string }`. |

### Field Test Records (Evidentiary)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/records` | Bearer | Ingest sealed `FieldTestRecord`. Validates RFC 8785 canonical JCS, recomputes SHA-256 hash, checks chain continuity. Supports `Idempotency-Key` header. |
| `GET` | `/api/v1/records` | Bearer | Query test records. Query params: `case_ref`, `outcome`, `operator_id`, `search`, `limit`, `offset`. |
| `GET` | `/api/v1/records/:uuid` | Bearer | Retrieve full record payload (including image reference, GPS coordinates, calibration residuals, kinetics curve, and attestation seal). |
| `POST` | `/api/v1/records/verify` | Bearer | Cryptographically re-verify stored record integrity: `{ uuid: string }` $\to$ `{ valid: boolean, checks: string[] }`. |

### User Management & Audit Trail

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users` | Bearer | List all registered officers and reviewers. |
| `POST` | `/api/v1/users` | Bearer (Senior/Admin) | Onboard new account: `{ username, password, display_name, role }`. |
| `GET` | `/api/v1/audit` | Bearer | Audit log entries (login events, record uploads, status transitions). Query params: `limit`, `offset`. |

---

## 5. Field Test Record Wire Schema

Below is the exact JSON structure of a test record as stored and returned by `GET /api/v1/records/:uuid`:

```json
{
  "record_uuid": "a3f19c20-7d41-4b02-9e58-1c6d2f70ab11",
  "case_ref": "NCB/DZU/CR-14/2026",
  "panchnama_ref": "PAN/DZU/2026/884",
  "package_no": "P-1",
  "lot_no": "LOT-DEL-2026-01",
  "reagent": "marquis",
  "kit": {
    "make": "Sirchie",
    "test_name": "NARK II",
    "lot_no": "MK-24B-118",
    "expiry": "2027-04-30"
  },
  "corrected_lab": { "l": 19.58, "a": 16.3, "b": -12.48 },
  "delta_e_00": 1.95,
  "calibration_residual": { "mean": 0.8, "max": 1.5, "grade": "GREEN" },
  "outcome": "CONSISTENT_WITH_REAGENT_POSITIVE",
  "confidence": 0.97,
  "conformal_set": ["POSITIVE"],
  "abstention_reason": null,
  "kinetics": [
    { "t_ms": 0, "delta_e": 0.1 },
    { "t_ms": 15000, "delta_e": 1.36 },
    { "t_ms": 30000, "delta_e": 1.95 }
  ],
  "gps": {
    "lat": 28.5562,
    "lon": 77.0999,
    "accuracy_m": 5.2,
    "mocked": false
  },
  "image_ref": "file:///evidence/NCB-DZU-CR14-P1.jpg",
  "image_sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a01",
  "operator_id": "HC-4412 Sharma",
  "operator_name": "Head Constable R. Sharma",
  "officer_role": "SENIOR",
  "created_at": "2026-09-14T09:11:00.000Z",
  "payload_jcs": "{\"calib_grade\":\"GREEN\",\"calib_residual_mean\":0.8,\"case_ref\":\"NCB/DZU/CR-14/2026\",\"confidence\":0.97,\"corrected_lab_a\":16.3,\"corrected_lab_b\":-12.48,\"corrected_lab_l\":19.58,\"device_clock_iso\":\"2026-09-14T09:11:00.000Z\",\"operator_id\":\"HC-4412 Sharma\",\"outcome\":\"CONSISTENT_WITH_REAGENT_POSITIVE\",\"package_no\":\"P-1\",\"reagent\":\"marquis\",\"record_uuid\":\"a3f19c20-7d41-4b02-9e58-1c6d2f70ab11\"}",
  "record_hash": "2ffc82a588b394f4da677c77d455486958fe7d42cfbba76033488ee2798e16ea",
  "prev_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "chain_hash": "959cb4a5b42d13ec80277874945d81aa42cb782e3bbda94ba32e3ea8fa0c04f9",
  "device_attestation": "3045022100959cb4a5b42d13ec80277874945d81aa42cb782e3bbda94ba32e3ea8fa0c02202ffc82a588b394f4da677c77d455486958fe7d42cfbba76033488ee2798e16"
}
```

---

## 6. Sample curl Workflows for Frontend Developers

### 1. Health & Ping
```bash
curl -s http://localhost:8571/api/v1/health | jq
```

### 2. Login as Supervisor
```bash
TOKEN=$(curl -s -X POST http://localhost:8571/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"supervisor","password":"superpass"}' | jq -r .token)

echo "Session token: $TOKEN"
```

### 3. Fetch Dashboard Summary Numbers
```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8571/api/v1/stats | jq
```

### 4. Fetch Cases List (with status filter)
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8571/api/v1/cases?status=UNDER_REVIEW" | jq
```

### 5. Fetch Case Detail (metadata + packages + audit history)
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8571/api/v1/cases/NCB%2FDZU%2FCR-14%2F2026" | jq
```

### 6. Transition Case Status (Review Workflow)
```bash
curl -s -X POST "http://localhost:8571/api/v1/cases/NCB%2FDZU%2FCR-14%2F2026/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "REVIEWED",
    "note": "Forensic laboratory report confirmed Marquis presumptive positive. Section 52A disposal inventory signed."
  }' | jq
```

### 7. Re-verify Cryptographic Evidence Chain
```bash
curl -s -X POST "http://localhost:8571/api/v1/records/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid":"a3f19c20-7d41-4b02-9e58-1c6d2f70ab11"}' | jq
```

### 8. Add a New Officer Account (Admin Only)
```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8571/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"adminpass"}' | jq -r .token)

curl -s -X POST http://localhost:8571/api/v1/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "patil",
    "password": "patilpassword",
    "display_name": "Inspector S. Patil (Pune)",
    "role": "SENIOR"
  }' | jq
```

---

## 7. Legal & Forensic Guardrails (Rule 6/7/10 Culture)

1. **Trilevel Vocabulary**: The wire format uses exact statutory terms: `CONSISTENT_WITH_REAGENT_POSITIVE`, `CONSISTENT_WITH_REAGENT_NEGATIVE`, and `INCONCLUSIVE`. The backend NEVER infers substance identity (e.g. it never outputs "Heroin Detected").
2. **Non-Editable Evidentiary Data**: Record hashes, colorimetry, package numbers, timestamps, and operator identities are cryptographically sealed and immutable. Only `case_status` and `panchnama_ref` can be transitioned through authenticated review actions.
3. **Single Attestation Source**: The server recomputes `sha256(payload_jcs)` using the exact same canonical serializer (`src/crypto/canonical-json.ts`) used on-device.

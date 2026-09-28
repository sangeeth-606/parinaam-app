# Parinaam self-hosted API

This directory contains the API used by the Parinaam officer app and by the
separate `parinaam-web` dashboard. It is a small Node.js service with two local
storage engines:

- **PostgreSQL 15** through Docker Compose for a shared, persistent deployment.
- **`node:sqlite`** for hermetic tests and a single-process local fallback.

There is no dependency on a hosted backend, managed database, or other online
platform. The API does not write to any government system.

The normative HTTP description is [`openapi.yaml`](openapi.yaml). The shared
record contract is [`../src/contracts/field-test-record.ts`](../src/contracts/field-test-record.ts).

## Run with PostgreSQL

Requirements: Docker Compose v2 and Node.js 22+ (Node is only needed for the
host-side seed command or the test runner).

```bash
cp .env.example .env                 # edit passwords before sharing a host
# Optional: choose free host ports in .env, for example:
# POSTGRES_PORT=55434
# API_PORT=8572

docker compose up -d db server
docker compose ps
curl http://127.0.0.1:8571/api/v1/health
```

The default host mappings are PostgreSQL `127.0.0.1:55433` and API
`127.0.0.1:8571`. Set `POSTGRES_BIND` or `API_BIND` to `0.0.0.0` only when a
LAN client must connect, and put the API behind an appropriate TLS reverse
proxy before exposing it beyond a trusted development network.

The Compose file creates a project-scoped, versioned volume named
`parinaam_pgdata_v2`; it does not reuse retired data. The default account
password is a local-development value. Always replace it in `.env` and in the
database before a shared deployment.

To run a one-shot idempotent seed against the same database:

```bash
docker compose run --rm seed
```

`PARINAAM_SEED=0` is the production default — a fresh server starts with an empty ledger (0 records).
Set `PARINAAM_SEED=1` only when you explicitly want the server to seed the 15-record synthetic demo ledger
on first boot. The seed refuses to mix the synthetic demo ledger with a non-demo ledger.

## Cloud Deployment Checklist

Before deploying to any shared host or cloud VM:

```text
[ ] POSTGRES_PASSWORD set, 16+ chars, no default in compose (mandatory in .env)
[ ] PARINAAM_API_ADMIN_PASSWORD set, 16+ chars
[ ] PARINAAM_SEED=0 (default; set 1 only if synthetic demo data is desired)
[ ] PARINAAM_CORS_ORIGINS set to the real dashboard origin (NOT * in production)
[ ] TLS terminated upstream (reverse proxy like Caddy/Nginx); mobile app does NOT use cleartext
[ ] Postgres not exposed to the public interface (db.ports removed or bound to 127.0.0.1)
[ ] Server credentials issued per officer, not the shared demo password
```

### CORS Configuration Trap
`PARINAAM_CORS_ORIGINS` defaults to `http://localhost:8081,http://127.0.0.1:8081`.
Any browser dashboard connecting to the API must have its origin explicitly listed in `PARINAAM_CORS_ORIGINS`,
or browser requests will fail with a CORS policy violation. In production, never leave `*` in the allowed origins.

### Data Protection & DPDP / NDPS Section 8(5) Isolation
In production PostgreSQL deployments, create a dedicated read-only or application role for dashboard reporting
separate from the admin/migration role. Specifically:
- The `officers` table contains password salts and hashes (`pass_salt`, `pass_hash`).
- Dashboard queries should only access views or columns omitting credentials (`officer_code`, `display_name`, `role`, `status`).
- Granting `SELECT` on `field_test`, `field_test_blob`, and `cases` to an analytics role without granting access to `officers` protects against credential harvesting if a dashboard query vulnerability occurs.

### Run the API on the host against the container database

```bash
docker compose up -d db
export PARINAAM_DB=postgres
export DATABASE_URL=postgres://parinaam:parinaam@127.0.0.1:55433/parinaam
export PARINAAM_API_ADMIN_PASSWORD='replace-this-local-password'
npm run seed:server
npm run server
```

For a local file database instead, leave `PARINAAM_DB` unset and optionally set
`PARINAAM_SERVER_DB`:

```bash
PARINAAM_SERVER_DB=server/data/parinaam-server.db npm run server
```

Do not point two independent API processes at the same SQLite file.

## Synthetic seed data

The seed contains exactly **15 records across 4 cases**, with fixed
chronological timestamps, a linked hash chain, `is_demo: true`, null image
hashes, and null device attestations. It does not contain real imagery,
substance identities, laboratory confirmation, or legal conclusions.

| Case | Records | Status | Panchnama reference |
|---|---:|---|---|
| `NCB/DZU/CR-14/2026` | 5 | `UNDER_REVIEW` | `PAN/DZU/2026/884` |
| `NCB/MZU/CR-02/2026` | 3 | `REPORTED` | `PAN/MZU/2026/091` |
| `NCB/KZU/CR-07/2026` | 4 | `REVIEWED` | `PAN/KZU/2026/312` |
| `NCB/BZU/CR-19/2026` | 3 | `ESCALATED` | `PAN/BZU/2026/505` |

The deterministic records are shared byte-for-byte by the app's local SQLite
fixture and the server seed. Demo rows are local/synthetic and are not marked
as uploaded by the officer app.

### Seed accounts

The following are **local demonstration credentials only**. All seeded demo
accounts share the demo password from `PARINAAM_SEED_PASSWORD` (set in `.env`).
On initial seed, the complete credential card is written to `server/data/DEMO-CREDENTIALS.txt` (gitignored).

| Username | Role | Officer Code | Display Name | Unit |
|---|---|---|---|---|
| `admin` | `ADMIN` | `OFFICER-ADMIN` | Anil Kumar Verma | NCB Headquarters, New Delhi |
| `supervisor` | `SUPERVISOR` | `OFFICER-SUPERVISOR` | Farah Nasim Qureshi | NCB Zonal Office, Mumbai |
| `iyer` | `SUPERVISOR` | `AC-7788` | Meenakshi Iyer | NCB Zonal Office, Bengaluru |
| `sharma` | `SENIOR` | `HC-4412` | Baljinder Singh Sidhu | NCB Zonal Office, Delhi |
| `mukherjee` | `SENIOR` | `SI-5521` | Priya Mukherjee | Kolkata Railway Parcel Intelligence Unit |
| `rao` | `SENIOR` | `INSP-1044` | Venkateswara Rao | NCB Intelligence Bureau, Bengaluru |
| `kapoor` | `SENIOR` | `DSP-3310` | Ranjeet Singh Kapoor | Delhi Police Crime Branch, Central District |
| `patel` | `SENIOR` | `IC-2264` | Hetalben Patel | Air Cargo Intelligence Cell, Delhi |
| `gill` | `JUNIOR` | `IC-9007` | Sukhdev Singh Gill | NCB Zonal Office, Delhi |
| `reddy` | `JUDICIARY` | `JM-5501` | Ananya Reddy | Fast Track Court, Hyderabad |

New accounts created through the API start as `PENDING`, must be approved by
an `ADMIN`, and cannot log in until approved. Suspended or pending accounts
cannot use an existing bearer token. A password reset revokes that account's
sessions.

## HTTP conventions

- Base path: `/api/v1`.
- JSON request bodies are limited to 1,000,000 bytes.
- Evidence uploads are raw `image/jpeg` or `image/png` bytes, limited to 5 MiB.
- Authenticated endpoints use `Authorization: Bearer <token>`.
- Record ingestion also requires an `Idempotency-Key` header of 8–160
  URL-safe characters.
- Every response includes `X-Request-ID`; JSON errors have this shape:

```json
{
  "error": {
    "code": "INVALID_FILTER",
    "message": "region is too long",
    "retryable": false
  },
  "request_id": "..."
}
```

Successful list endpoints return `{ "items": [...], "page": { "limit", "offset", "total", "has_more" } }`.
The API uses authoritative snake_case wire names. Do not infer camelCase
aliases.

### Authentication and health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Service, storage engine, record count, and ledger head |
| `POST` | `/api/v1/auth/login` | Public | `{ "username": "...", "password": "..." }` → bearer token and officer |
| `GET` | `/api/v1/auth/me` | Bearer | Current officer identity and account status |
| `POST` | `/api/v1/auth/logout` | Bearer | Revoke the current token |

Login attempts are limited per client IP and username. The API hashes bearer
tokens before storing them; the raw token is returned only at login.

### Records and evidence

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/records` | Writer | Ingest one sealed `FieldTestRecordV1`; atomic with case, audit, idempotency, and chain head |
| `GET` | `/api/v1/records` | Bearer | Filtered/paginated record summaries |
| `GET` | `/api/v1/records/:uuid` | Bearer | Full sealed record, summary, and evidence status |
| `POST` | `/api/v1/records/verify` | Bearer | `{ "uuid": "..." }` integrity verification result |
| `GET` | `/api/v1/records/:uuid/verify` | Bearer | Same verification result without a JSON body |
| `PUT` | `/api/v1/records/:uuid/evidence` | Writer | Upload raw evidence bytes; the bytes must match the sealed `image_sha256` |
| `GET` | `/api/v1/records/:uuid/evidence` | Bearer | Download the immutable evidence bytes and integrity headers |

Record list filters are `date_from`, `date_to`, `region`, `location`,
`department`, `officer`, `kit_type`, `kit_batch`, `outcome`, `status`,
`case_ref`, `search`, `limit`, and `offset`. Dates accept `YYYY-MM-DD` or an
ISO UTC timestamp. `outcome` and `status` values are validated; invalid filters
return `400`.

The server checks all of the following before accepting a record: exact
contract keys and enums, canonical JSON, `record_hash = SHA256(payload_jcs)`,
`chain_hash = SHA256(prev_hash + record_hash)`, the current sequence/head,
indexed columns, and the authenticated operator binding. A missing
predecessor is `409 PREV_HASH_NOT_STORED` with `retryable: true`; it is not a
permanent rejection.

`case_status` and `panchnama_ref` are case-level review facts and are not part
of the record hash. Evidence rows are append-only. A declared image without
uploaded bytes is reported as `DECLARED_NOT_UPLOADED`, not as an available
image.

### Cases, review, and exports

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/cases` | Bearer | Case summaries with `status`, `region`, `location`, `search`, and pagination filters |
| `GET` | `/api/v1/cases/:caseRef` | Bearer | Case metadata, ordered record summaries, and status history |
| `PATCH` | `/api/v1/cases/:caseRef/status` | Senior/Admin/Supervisor | `{ "status": "UNDER_REVIEW", "note": "..." }`; validates the workflow |
| `PATCH` | `/api/v1/cases/:caseRef/panchnama` | Senior/Admin/Supervisor | `{ "panchnama_ref": "PAN/..." }` or `null` |
| `GET` | `/api/v1/cases/:caseRef/export` | Bearer | JSON export manifest; optional `formats=pdf,docx,xlsx` |

Allowed case transitions are `REPORTED → UNDER_REVIEW|ESCALATED`,
`UNDER_REVIEW → REVIEWED|ESCALATED`, and `ESCALATED → REVIEWED`. `REVIEWED` is
terminal. Every accepted transition increments the case version and appends
history and audit rows. Supervisors and admins may review; judiciary accounts
are read/export-only.

The export endpoint returns a deterministic data manifest, not binary files.
The web client renders PDF, DOCX, and XLSX from that manifest and must retain
the manifest's disclaimer. It also returns each record's integrity checks and
whether evidence is available.

### Dashboard, accounts, audit, and events

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/stats` | Bearer | Record/case totals, status/outcome/region breakdowns, ledger head, and account counts |
| `GET` | `/api/v1/users` | Admin | Paginated account list with `last_login_at` and approval facts |
| `POST` | `/api/v1/users` | Admin | Create a `PENDING` account; password is 12–256 characters |
| `PATCH` | `/api/v1/users/:username` | Admin | Approve, suspend, change role/name, or reset password |
| `GET` | `/api/v1/audit` | Admin/Supervisor | Paginated audit/filter view (`actor`, `action`, `subject`, `search`) |
| `GET` | `/api/v1/stream` | Reviewer roles | Bounded Server-Sent Events stream (`record-ingested`, `case-status`, `case-panchnama`); junior officers receive `403` |

The stream is intentionally unavailable to junior accounts because its events
are global. The web dashboard should use `/stats` for its initial page, then use filtered
record/case endpoints for drill-down. It should render the server's status and
panchnama values as facts; it must not edit record payloads or evidence.

## Record contract and integrity boundary

The sealed payload contains only the field-test event and operator binding. A
live record has the following top-level fields (the OpenAPI schema is the
machine-readable source):

```text
schema_version, seq, record_uuid, case_ref, package_no, lot_no, reagent, kit,
corrected_lab, delta_e_00, calibration_residual, outcome, confidence,
conformal_set, abstention_reason, kinetics, gps, image_sha256, operator_id,
operator_name, officer_role, created_at, is_demo, payload_jcs, record_hash,
prev_hash, chain_hash, device_attestation
```

`payload_jcs` is canonical JSON. `record_hash` is its SHA-256 digest.
`chain_hash` is SHA-256 of `prev_hash + record_hash`, with a genesis previous
hash of 64 zeroes. The server has no trusted device-key registry, so a
non-null `device_attestation` is reported as
`UNVERIFIED_NO_TRUSTED_DEVICE_KEY_REGISTRY`; it is not treated as a statutory
credential.

The only mutable review metadata is `cases.case_status` and
`cases.panchnama_ref`. The API does not accept a replacement for a sealed
record body or evidence bytes. The app's `demo-seed` sync state is a local fact and is never sent to this API.
Authenticated ingest also rejects `is_demo: true`; the deterministic demo is
installed only by the local seed process.

## Worked curl workflow

```bash
BASE=http://127.0.0.1:8571/api/v1
ADMIN_TOKEN=$(curl -fsS -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"'"${PARINAAM_SEED_PASSWORD:-Parinaam#2026}"'"}' | jq -r .token)

curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/stats" | jq
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE/records?region=DZU&limit=20&offset=0" | jq
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE/cases/NCB%2FDZU%2FCR-14%2F2026" | jq
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE/cases/NCB%2FDZU%2FCR-14%2F2026/export?formats=pdf,docx,xlsx" | jq
```

To submit a live record, obtain the exact sealed JSON from the officer app's
outbox; do not hand-edit its hashes. Send it with a stable key:

```bash
curl -fsS -X POST "$BASE/records" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -H 'Idempotency-Key: officer-device-00000016' \
  --data-binary @record.json | jq
```

Upload evidence only when the record has a non-null sealed `image_sha256`:

```bash
curl -fsS -X PUT "$BASE/records/RECORD_UUID/evidence" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: image/jpeg' \
  --data-binary @capture.jpg
```

## Verification commands

```bash
npm ci
npm test
npm run typecheck
npm run lint
docker compose config --quiet
```

The optional PostgreSQL test is run against a deliberately isolated database:

```bash
PARINAAM_TEST_DATABASE_URL=postgres://parinaam:parinaam@127.0.0.1:55433/parinaam \
  node --experimental-strip-types --test tests/sync/e2e-postgres.test.ts
```

Do not use a database containing real evidence for the synthetic seed or demo
credentials. Back up PostgreSQL before changing versions, and use a unique
Compose project name when running parallel verification stacks.

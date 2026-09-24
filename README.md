# Parinaam

Parinaam is an offline-first Android field-test recording prototype for the
Smart India Hackathon 2026 problem statement. It records a **presumptive
colorimetric test event** and its local integrity chain. It does not identify a
substance and does not replace laboratory confirmation.

> **Scope:** this repository is a student hackathon prototype. The exported
> workflow and integrity metadata are not a statutory certificate, a court
> report, or a legal conclusion. No government or external case system is
> contacted.

## What the app records

The camera capture and calibration pipeline produces a structured event with
CIE-Lab measurements, calibration residual, reagent/kit information, optional
GPS and kinetics, a qualified outcome, and an operator identity. Outcomes are
restricted to:

- `CONSISTENT_WITH_REAGENT_POSITIVE`
- `CONSISTENT_WITH_REAGENT_NEGATIVE`
- `INCONCLUSIVE`

The local app ledger is append-only. A record's canonical JSON, record hash,
and global predecessor chain are sealed before it enters the offline outbox.
Reviewers can change only server-owned case metadata (`case_status` and
`panchnama_ref`); they cannot replace a record body or evidence bytes.

A device attestation, when present, is an integrity seal. The server reports it
as unverified because this prototype has no trusted device-key registry; it is
not described as a statutory digital signature.

## Repository layout

```text
src/                         Expo/React Native officer app
  capture/ colour/ classify/ camera and field-test processing
  contracts/                 shared server/app wire and error contracts
  crypto/                    canonical JSON, SHA-256, chain helpers
  db/                        app SQLite migrations and append-only ledger
  demo/                      deterministic synthetic 15-record/4-case fixture
  screens/ state/ sync/      UI, local state, and offline outbox
server/                      self-hosted Node HTTP API
  src/                        PostgreSQL/SQLite stores, migrations, RBAC, routes
  openapi.yaml                machine-readable HTTP contract
  README.md                   deployment and API guide
tests/                       unit, contract, SQLite, API, and E2E tests
scripts/                     local build and verification helpers
```

The untracked `camera-engine/` workspace is outside this repository's change
set and is not required to run the API.

## Requirements

- Node.js 22+ and npm
- Android Studio/SDK and a development build for the officer app
- Docker Compose v2 for the PostgreSQL deployment

Expo Go is not sufficient for the native camera and device modules. The app is
built as a custom development client.

## App development

```bash
npm ci
npx expo prebuild
npx expo run:android
```

The local demo build displays its demo credentials in the login screen. The
local app-side demo account is intentionally separate from the server's
self-hosted deployment credentials; do not use demo credentials on a shared
host.

Run the local quality gates with:

```bash
npm test
npm run typecheck
npm run lint
```

The normal test suite is hermetic and uses an in-memory server SQLite database.
An optional PostgreSQL integration test is described in
[`server/README.md`](server/README.md).

## Self-hosted API with PostgreSQL

From the repository root:

```bash
cp .env.example .env
# Change the passwords and ports in .env as needed.
docker compose up -d db server
docker compose ps
curl http://127.0.0.1:8571/api/v1/health
```

The default host bindings are loopback-only: PostgreSQL `127.0.0.1:55433` and
API `127.0.0.1:8571`. Set a different free `POSTGRES_PORT` or `API_PORT` when
those ports are occupied. Set a bind address to `0.0.0.0` only for a deliberate
LAN test, and place the API behind TLS and an access-controlled reverse proxy
for any shared deployment.

The API is the shared source for the officer app and the separate web
repository. It serves the synthetic demo seed on an empty PostgreSQL database
and refuses to mix that seed with a non-demo ledger. See
[`server/README.md`](server/README.md) for seed accounts, filters, RBAC,
evidence upload, export manifests, and curl examples. The complete route and
schema description is [`server/openapi.yaml`](server/openapi.yaml).

To stop a verification stack without removing its database:

```bash
docker compose down
```

Do not use `docker compose down -v` for a stack containing data. The Compose
volume is versioned so a new project does not silently reuse an old one.

## Honest prototype boundaries

- No gallery import: capture is the only evidence acquisition path.
- No substance identity is asserted from a presumptive reagent result.
- No confirmation, disposal, transfer, or government-system write is implied.
- Device security is reported as `StrongBox`, `TrustedEnvironment`, or
  `Software` based on the actual device capability; a software fallback is not
  silently upgraded to hardware-backed status.
- The server verifies hashes and authorization, but it is not a trusted device
  key registry and does not issue a legal certificate.
- PDF/DOCX/XLSX files are rendered by the web client from a server export
  manifest. The API does not pretend that a JSON manifest is a signed filing.
- The deterministic demo contains no real imagery, substance identity,
  laboratory result, or evidentiary conclusion.

## Guardrails maintained in the code

- Strict TypeScript with no `any` in the backend contract path.
- Append-only triggers for app evidence and server evidence/audit/history rows.
- One global hash chain with atomic sequence/head checks.
- Retryable missing-predecessor errors for out-of-order offline delivery.
- RBAC for admin, supervisor, judiciary, senior, and junior accounts.
- Explicit request IDs, bounded bodies, restricted CORS, hashed sessions, and
  account suspension/session revocation.
- No managed/cloud service dependency in the runtime configuration.

## Team-facing references

- [Server deployment and API guide](server/README.md)
- [OpenAPI contract](server/openapi.yaml)
- [Shared field-test contract](src/contracts/field-test-record.ts)
- [Deterministic demo fixture](src/demo/demo-dataset.ts)

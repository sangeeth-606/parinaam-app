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

The `camera-engine/` workspace is an existing nested source repository. The
officer app now consumes its Docker service through `docker-compose.yml`; the
authoritative integration, provenance, and physical-validation notes live in
[`docs/camera-engine-integration.md`](docs/camera-engine-integration.md) and
[`camera-engine/service/README.md`](camera-engine/service/README.md). Keep the
nested repository's own history and backup fixtures intact when packaging the
app.

## Requirements

- Node.js 22+ and npm
- Android Studio/SDK and a development build for the officer app
- A Mac with Xcode and an Apple signing setup for a physical iOS development build
- Docker Compose v2 for the self-hosted local stack

Expo Go is not sufficient for the native camera and device modules. The normal
app launcher therefore starts the complete local self-hosted stack first, waits
for the API and camera-engine health checks, and then starts Metro. The engine is
still Dockerized; an iOS app cannot start a Linux Docker daemon itself, so the
launcher is the single process boundary rather than a second manual step.

## One-command local app

Install dependencies once:

```bash
npm ci
```

For a physical iPhone using Expo Go on the same trusted Wi-Fi, run:

```bash
npm run app:go
```

That one command starts `db`, `server`, and `camera-engine`, waits for both
services to become healthy, sets the laptop LAN URLs for the app, and starts
Metro with a direct Expo Go QR code. Keep the terminal open. On first use,
allow the two local service ports through the host firewall if UFW is active:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 8571 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 8572 proto tcp
```

The launcher prints the exact API and camera-engine URLs. Do not start
`camera-engine` separately. `npm run start:lan:go` is the equivalent command
kept for the previous workflow.

For the custom native development build (recommended for camera validation),
use:

```bash
npm run app
# or: npm run start:lan
```

This performs the same stack startup and then targets the installed Parinaam
development client. A physical iOS development build must be compiled and
signed on a Mac/Xcode host; the Linux host used for the backend cannot compile
or install the iOS app itself.

The low-level `npm run start:metro` command starts Metro only. It is useful for
debugging the bundler, but it does **not** start the self-hosted engine and is
not the normal app command.

## App development

The officer app has one theme model with light and dark palettes and a
**Light / Dark** control in **Settings → Appearance**, persisted on the
device. The token model, the fixed camera/terminal/export surfaces, and the
runtime API are documented in
[`docs/appearance-theme.md`](docs/appearance-theme.md).

```bash
npx expo prebuild
npx expo run:android
```

If the host cannot discover the LAN, the same launcher can use Expo's tunnel
when a valid ngrok credential is available:

```bash
npm run start:tunnel
```

`npm run start:tunnel` still starts the self-hosted stack first. The tunnel only
publishes Metro; it does not publish the camera-engine or API ports. The tunnel
instructions are documented in the [Expo CLI reference](https://docs.expo.dev/more/expo-cli/#tunnel).

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

For normal app use, `npm run app`/`npm run app:go` is the supported entry
point and starts this stack together with the camera engine. The commands below
are for isolated service administration, diagnostics, or deployments where the
API is started without Metro.

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

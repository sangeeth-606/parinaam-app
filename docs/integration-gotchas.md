# Parinaam Backend Integration Gotchas

> **Essential Reference for Frontend, Dashboard, and Integration Engineers.**  
> Captures verified non-obvious behaviors, edge cases, and design realities across the Parinaam API and database.

---

### 1. `department` Defaults to `'UNSPECIFIED'`
On raw ingested records, the `field_test.department` database column was historically unpopulated and defaults to `'UNSPECIFIED'`. If an agency requires institutional attribution, read `officers.department` joined on `officer_code`, or handle `'UNSPECIFIED'` honestly in the UI. Never assume all records belong to the Narcotics Control Bureau.

### 2. `region` and `location_label` are String Routing Hints, NOT GPS Coordinates
The server derives `region` (`DZU`, `MZU`, `BZU`) and `location_label` (`Delhi`, `Mumbai`, `Bengaluru`) by regex parsing the case string (e.g. `NCB/DZU/CR-14/2026`).
- This is an **administrative routing prefix**, never the physical location of a seizure.
- For genuine seizure location, inspect `body.gps` (`lat`, `lon`, `accuracy_m`).
- If an unrecognised zone code is used in a case reference, `location_label` falls through to the code itself rather than throwing an error.

### 3. `panchnama_ref` is `null` on 100% of Mobile Submissions
The mobile app captures chemical and field evidence during active search-and-seizure. Formal panchnama numbers are assigned hours or days later during legal documentation.
- The server will **never** infer or auto-generate a panchnama number.
- Any dashboard UI that expects `panchnama_ref != null` to consider a case "active" will render empty on real field data.

### 4. `field_test.officer_code` vs `operator_id`
In baseline schemas, `field_test.officer_code` was `NULL`, while `operator_id` held the device operator's text identifier. Following Phase 8.5, `field_test.officer_code` is populated and constrained to `officers(officer_code)`. When writing historical reports spanning older test databases, fall back from `officer_code` to `operator_id`.

### 5. `GET /auth/me` is Flat; `POST /auth/login` Nests Under `officer`
- `POST /api/v1/auth/login` returns:
  `{ token: "...", expires_at: "...", officer: { id, officer_code, username, role, ... } }`
- `GET /api/v1/auth/me` returns the officer object flat at the root:
  `{ id, officer_code, username, role, status }`
Client HTTP wrappers must not expect the nested `officer` key when refreshing identity via `/auth/me`.

### 6. `POST /records` Returns 201 OR 200 (Check `status`)
- On initial atomic ingestion: Returns `201 Created` with `{ status: 'stored', ... }`.
- On idempotency replay or existing UUID: Returns `200 OK` with `{ status: 'already-stored', ... }`.
Clients must inspect `response.status === 200 || response.status === 201` and check `body.status` rather than asserting 201 strictly.

### 7. JUNIOR Role Scoping is Silent
When a `JUNIOR` officer calls `GET /api/v1/records` or `GET /api/v1/cases`:
- The server filters results strictly to records where `operator_id == authed.officerCode`.
- It does **not** return `403 Forbidden` and does not leak global counts in pagination headers.
- The response is a standard `200 OK` with fewer records. Reviewer roles (`SENIOR`, `SUPERVISOR`, `ADMIN`, `JUDICIARY`) observe all records across all zones.

### 8. `REVIEWED` is a Strictly Terminal Workflow Status
Case review states follow a finite directed state machine:
- `REPORTED` $\to$ `UNDER_REVIEW`, `ESCALATED`
- `UNDER_REVIEW` $\to$ `REVIEWED`, `ESCALATED`
- `ESCALATED` $\to$ `UNDER_REVIEW`, `REVIEWED`
Once marked `REVIEWED`, a case is finalized. It can **never** be re-opened, moved back to `UNDER_REVIEW`, or `ESCALATED`. Attempts to transition out of `REVIEWED` return `400 INVALID_STATUS_TRANSITION`.

### 9. Server-Sent Events (SSE) Have No History Replay
The `/api/v1/stream` endpoint broadcasts live real-time events (`record:created`, `case:status_changed`) over an in-memory Node.js EventEmitter bus.
- There is no persistent message log or broker.
- Reconnection with `Last-Event-ID` does **not** replay missed events.
- Treat SSE strictly as a notification hint to trigger a fresh `GET /api/v1/records` or `GET /api/v1/cases` fetch.

### 10. The Server Renders No Export Files
The endpoint `GET /api/v1/cases/:caseRef/export` does **not** generate PDF, Word, or Excel binary downloads. It returns an authoritative JSON court manifest:
`{ case_ref, records, checksum, requested_formats, rendering: "client-side" }`
The dashboard/web application is responsible for client-side rendering into PDF/DOCX using its own templating engine.

### 11. All API Responses Send `Cache-Control: no-store`
Every authenticated API route emits headers preventing browser or proxy caching:
`Cache-Control: no-store, no-cache, must-revalidate`
`Pragma: no-cache`
The frontend must manage its own client-side caching or state invalidation strategy.

### 12. Evidence Fetching Requires `/records/:uuid/evidence`
Evidence images are never served as public static URLs (e.g. `http://.../images/123.jpg`).
- Fetch raw JPEG bytes using authenticated `GET /api/v1/records/{uuid}/evidence`.
- The server validates the bearer token and sends raw binary bytes with `Content-Type: image/jpeg` and an `ETag` containing the SHA-256 digest (`ETag: "sha256:..."`).

### 13. CORS Configuration Trap (`PARINAAM_CORS_ORIGINS`)
In `server/src/main.ts`, allowed origins are read from `PARINAAM_CORS_ORIGINS` (defaulting to `http://localhost:8081,http://127.0.0.1:8081`).
- If your dashboard is served on `http://localhost:3000` or an internal DNS name, every browser call will fail with a browser CORS error unless the exact dashboard origin is added to `PARINAAM_CORS_ORIGINS` in `.env`.
- In production, never leave `*` in the CORS origin list.

### 14. `is_demo` Boolean Representation (Postgres vs SQLite)
- On **PostgreSQL**: Stored as native SQL boolean (`true` / `false`).
- On **SQLite**: Stored as integer (`1` / `0`).
If querying tables directly via SQL rather than through the REST API, write queries using boolean compatibility: `WHERE is_demo = true OR is_demo = 1` (or `WHERE is_demo`).

### 15. Never Directly Insert into `GENERATED ALWAYS AS` Columns
Both `idempotency` and `evidence_blobs` tables contain generated columns:
- `idempotency.response` is `GENERATED ALWAYS AS (response_json) STORED`
- `evidence_blobs.hash` is `GENERATED ALWAYS AS (sha256) STORED`
- `evidence_blobs.size` is `GENERATED ALWAYS AS (byte_size) STORED`
Direct SQL inserts supplying values for these columns will fail with syntax/constraint errors. Omit them from `INSERT` column lists.

### 16. Pagination Uses Offset, Max Limit 200
All list endpoints (`/records`, `/cases`, `/users`, `/audit`) support `limit` and `offset` query parameters.
- Default page size: `limit=100` (records) or `limit=50` (cases).
- Hard maximum page size: `limit=200`. Requests requesting larger limits will be clamped.
- No cursor pagination is supported; use `offset = page * limit`.

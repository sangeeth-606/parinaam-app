# Parinaam API Server (v2 phase D)

The **in-repo backend** for the officer app — and the exact HTTP contract the separate
web-repo supervision dashboard builds against. No external dependencies: `node:http` +
`node:sqlite` + `node:crypto` (Node ≥ 24 recommended; the repo runs Node 26).

```bash
npm run server                 # http://localhost:8571 (PARINAAM_API_PORT to move)
npm run typecheck:server       # strict tsc for server + the shared crypto it imports
node --experimental-strip-types --test tests/server/api.test.ts   # full e2e suite
```

DB file: `server/data/parinaam-server.db` (auto-created, gitignored; `PARINAAM_SERVER_DB`
overrides, `:memory:` supported). Seeded officer: `admin` / `adminpass` (role SENIOR —
scrypt-hashed at first boot, no plaintext stored). Password override at seed time:
`PARINAAM_API_ADMIN_PASSWORD`.

## Contract (authoritative copy: `docs/v2-plan/04-phase-d-backend-api.md`)

`POST /api/v1/records` accepts the app's `FieldTestRecord` JSON. The server **recomputes**
`sha256(payload_jcs)` with the same RFC 8785 canonicalizer the app ships
(`src/crypto/canonical-json.ts`) and rejects mismatches (422) — so "the backend can verify
our hashes" is a repo-wide, tested property, not a promise. `device_attestation` is stored
as opaque signature hex and **not** cryptographically verified here; the API never claims
otherwise (AGENTS rule 6/10). Outcome values are the trilevel constants
(`CONSISTENT_WITH_REAGENT_*`, `INCONCLUSIVE`) — client display aliases like "positive" are
rendered client-side, never stored (rule 7 / decision D1).

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/health` | open | liveness + record count |
| GET | `/api/v1/stream` | open | SSE: `hello`, `record-ingested`, `case-status` events |
| POST | `/api/v1/auth/login` | open | `{username,password}` → `{token, officer}` (rate-limited 5/60s/IP) |
| POST | `/api/v1/auth/logout` | bearer | revoke token |
| GET | `/api/v1/auth/me` | bearer | current officer |
| POST | `/api/v1/records` | bearer | ingest (honor `Idempotency-Key`; 201 stored / 200 replayed-or-already / 409 conflict / 422 integrity reject) |
| GET | `/api/v1/records?case_ref=&limit=&offset=` | bearer | list |
| GET | `/api/v1/records/:uuid` | bearer | full body + stored meta + case status + history |
| POST | `/api/v1/records/verify` | bearer | `{uuid}` → honest re-check list (hash, canonicality, linkage, attestation stored-vs-verified wording) |
| GET | `/api/v1/cases` | bearer | per-case rollups (`case_status` starts `REPORTED`) |
| GET | `/api/v1/cases/:caseRef` | bearer | rollup + records + status history |
| POST | `/api/v1/cases/:caseRef/status` | bearer · **SENIOR only** | `{status: REPORTED|UNDER_REVIEW|REVIEWED|ESCALATED, note?}` — audited |

## Smoke transcript (live server, 2026-09-16)

```
$ curl -s localhost:8571/api/v1/health
{"ok":true,"version":"v2-0.1","engine":"node:sqlite","records":0}

$ TOKEN=$(curl -s -X POST localhost:8571/api/v1/auth/login \
    -d '{"username":"admin","password":"adminpass"}' | jq -r .token)

$ curl -s -H "authorization: Bearer $TOKEN" localhost:8571/api/v1/auth/me
{"id":1,"username":"admin","display_name":"Station House Officer (demo)","role":"SENIOR"}

$ curl -s -X POST -H "authorization: Bearer $TOKEN" \
    -d '{"username":"admin","password":"wrong"}' localhost:8571/api/v1/auth/login
{"error":"invalid credentials (or rate-limited)"}
```

## Notes for the web repo team

- CORS is open (`*`) on all routes for now — reads work from any origin; tighten at the
  Supabase pass.
- Sync may arrive out of order (offline backoff): the server accepts it and reports
  `chain-order: out of sequence` in `checks` rather than rejecting.
- `case_status` is a SERVER REVIEW fact about the case record bundle — it is not, and
  must never be rendered as, a legal conclusion about the substance (rule 7 culture).

# Parinaam Data Model Reference

> **Authoritative Database Reference for Backend, Dashboard, and Integration Engineers.**  
> Describes all 10 server tables across PostgreSQL 15 and `node:sqlite`, their constraints, trigger protections, and their relationship to device-side storage.

---

## 1. Core Architecture Principles

1. **`field_test.body` is the Single Source of Truth:**
   The canonical evidence payload resides in the `field_test.body` JSON text. Scalar columns (`outcome`, `confidence`, `reagent`, `kit_type`, etc.) are projections indexed exclusively for SQL filtering and search. If a scalar column ever appears to diverge from `body`, `JSON.parse(body)` is normative and legally authoritative.
2. **Append-Only Immutability:**
   Five tables enforce absolute append-only semantics via database triggers:
   `field_test`, `case_status_history`, `server_audit`, `idempotency`, and `evidence_blobs`.
   - On **SQLite**: `UPDATE` or `DELETE` aborts immediately with `RAISE(ABORT, '<table_name> is append-only: <OP> disallowed')`.
   - On **PostgreSQL**: `UPDATE` or `DELETE` throws error code `55000` (`OBJECT_NOT_IN_PREREQUISITE_STATE`) via the trigger function `parinaam_reject_append_only_mutation()`.
   Never attempt an `UPDATE` or `DELETE` on these tables.
3. **Review Metadata Separation:**
   Sealed field test records never contain case review workflow facts (`case_status`, `panchnama_ref`). Workflow updates mutate the `cases` table and append a historical row to `case_status_history` without disturbing the immutable cryptographic hash chain in `field_test`.

---

## 2. Server Tables Reference

### 2.1 `schema_migrations`
Tracks transactionally applied schema versions.
- **SQLite Engine:** `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`
- **PostgreSQL Engine:** `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`

| Column | Type (PG / SQLite) | Nullable | Default | Description |
|---|---|---|---|---|
| `version` | `INTEGER` | NO | None (PK) | Sequential migration version (1 = baseline, 2 = officer schema v2). |
| `name` | `TEXT` | NO | None | Human-readable migration identifier (`server_schema_v1`, `officer_schema_v2`). |
| `checksum` | `TEXT` | NO | None | SHA-256 digest of migration statements for drift detection. |
| `applied_at` | `TIMESTAMPTZ` / `TEXT` | NO | `NOW()` / ISO text | Timestamp when migration executed. |

---

### 2.2 `officers`
Stores authenticated system operators, credentials, and hierarchy.
- **Constraints:**
  - `CHECK (role IN ('JUNIOR', 'SENIOR', 'ADMIN', 'SUPERVISOR', 'JUDICIARY'))`
  - `CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED'))`
  - `UNIQUE (officer_code)`
  - `UNIQUE (username)`

| Column | Type (PG / SQLite) | Nullable | Default | Written By | Description |
|---|---|---|---|---|---|
| `id` | `BIGSERIAL` / `INTEGER` | NO | PK | System | Internal numeric primary key. |
| `officer_code` | `TEXT` | NO | None | User/Seed | Unique identity code (e.g. `IC-9007`, `HC-4412`). |
| `username` | `TEXT` | NO | None | User/Seed | Login identifier (lowercase alphanumeric). |
| `pass_salt` | `TEXT` | NO | None | Auth/Seed | 32-hex (16-byte) random salt for scrypt derivation. |
| `pass_hash` | `TEXT` | NO | None | Auth/Seed | 64-hex (32-byte) scrypt key output. |
| `display_name` | `TEXT` | NO | None | User/Seed | Full human name and rank label. |
| `role` | `TEXT` | NO | None | Admin/Seed | RBAC role enum. |
| `status` | `TEXT` | NO | `'PENDING'` | Admin/Seed | Operational lifecycle state. |
| `created_at` | `TIMESTAMPTZ` / `TEXT` | NO | None | System | Creation ISO timestamp. |
| `approved_at` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | Admin | Approval ISO timestamp (`NULL` if self-registered). |
| `approved_by` | `BIGINT` / `INTEGER` | YES | `NULL` | Admin | FK to `officers(id)` of approving administrator. |
| `last_login_at` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | Auth | Updated on successful session login. |
| `rank` | `TEXT` | YES | `NULL` | Seed/Admin | Official police/NCB rank (e.g. `Sub-Inspector`, `Inspector`). |
| `department` | `TEXT` | YES | `NULL` | Seed/Admin | Department/Agency (e.g. `Narcotics Control Bureau`). |
| `unit` | `TEXT` | YES | `NULL` | Seed/Admin | Operational unit (e.g. `DZU`, `Crime Branch`). |
| `region_code` | `TEXT` | YES | `NULL` | Seed/Admin | Administrative zonal code (e.g. `DZU`, `BZU`, `MZU`). |
| `service_id` | `TEXT` | YES | `NULL` | Seed/Admin | Formal badge or government service number. |
| `official_email` | `TEXT` | YES | `NULL` | Seed/Admin | Institutional government email address. |
| `phone` | `TEXT` | YES | `NULL` | Seed/Admin | Registered contact telephone number. |
| `reporting_officer_code` | `TEXT` | YES | `NULL` | Seed/Admin | FK to `officers(officer_code)` of supervisory officer. |
| `must_change_password` | `INTEGER` | NO | `0` | Admin | Flag requiring credential update on next login. |
| `password_changed_at` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | Auth | Timestamp of last password change. |
| `failed_attempts` | `INTEGER` | NO | `0` | Auth | Counter for bad login attempts (resets to 0 on success). |
| `locked_until` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | Auth | Lockout timestamp set after 5 consecutive failures. |
| `mfa_secret` | `TEXT` | YES | `NULL` | Reserved | Optional TOTP/MFA secret. |
| `pass_algo` | `TEXT` | NO | `'scrypt-v1'` | Auth | Password hashing algorithm identifier. |

---

### 2.3 `sessions`
Active bearer session tokens.
- **Constraints:**
  - `CHECK (length(token_hash) = 64)`
  - `FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE CASCADE`

| Column | Type (PG / SQLite) | Nullable | Default | Description |
|---|---|---|---|---|
| `token_hash` | `TEXT` | NO | None (PK) | SHA-256 hex digest of the raw 32-byte random bearer token. Plaintext tokens are never stored. |
| `officer_id` | `BIGINT` / `INTEGER` | NO | None | Owning officer identifier. |
| `created_at` | `TIMESTAMPTZ` / `TEXT` | NO | None | Issuance timestamp. |
| `expires_at` | `TIMESTAMPTZ` / `TEXT` | NO | None | Session expiration timestamp (TTL = 12 hours). |

---

### 2.4 `field_test` 🔴 (APPEND-ONLY)
Authoritative cryptographic ledger of sealed chemical field tests.
- **Triggers:** Rejects any `UPDATE` or `DELETE`. Advance `ledger_head` on `INSERT`.
- **Constraints:**
  - `PRIMARY KEY (record_uuid)`
  - `UNIQUE (seq)`
  - `UNIQUE (chain_hash)`
  - `FOREIGN KEY (officer_code) REFERENCES officers(officer_code) ON UPDATE RESTRICT ON DELETE RESTRICT`

| Column | Type (PG / SQLite) | Nullable | Default | Status / Query Advice |
|---|---|---|---|---|
| `seq` | `BIGINT` / `INTEGER` | NO | None | Monotonic ledger sequence number (1, 2, 3...). |
| `record_uuid` | `TEXT` | NO | None | Globally unique record identifier (UUIDv4). |
| `officer_code` | `TEXT` | YES | `NULL` | Populated in Phase 8.5+; FK to `officers(officer_code)`. |
| `case_ref` | `TEXT` | NO | None | Case reference identifier (`NCB/DZU/CR-14/2026`). |
| `package_no` | `TEXT` | NO | None | Seizure packet number (`P-1`, `P-2`). |
| `operator_id` | `TEXT` | NO | None | Capturing device officer attribution code. |
| `operator_name` | `TEXT` | YES | `NULL` | Human operator name at time of seal. |
| `outcome` | `TEXT` | NO | None | `CONSISTENT_WITH_REAGENT_POSITIVE`, `CONSISTENT_WITH_REAGENT_NEGATIVE`, or `INCONCLUSIVE`. |
| `confidence` | `DOUBLE PRECISION` / `REAL` | NO | None | Conformal prediction confidence score (0.0 to 1.0). |
| `reagent` | `TEXT` | YES | `NULL` | Tested chemical reagent (`marquis`, `mecke`, `scott`, etc.). |
| `kit_type` | `TEXT` | YES | `NULL` | Test kit manufacturer/brand (`Sirchie NARK II`). |
| `kit_batch` | `TEXT` | YES | `NULL` | Kit manufacturing lot number. |
| `region` | `TEXT` | YES | `NULL` | **Do not query directly** (always NULL in raw inserts). Projected from `case_ref` in API views. |
| `department` | `TEXT` | YES | `NULL` | **Do not query directly** (always NULL in raw inserts). Projected from `officers` or reported as `'UNSPECIFIED'`. |
| `location_label` | `TEXT` | YES | `NULL` | **Do not query directly** (always NULL in raw inserts). Projected from `case_ref` zone code in API views. Real coordinates live in `body.gps`. |
| `created_at` | `TIMESTAMPTZ` / `TEXT` | NO | None | Timestamp of device capture/seal. |
| `received_at` | `TIMESTAMPTZ` / `TEXT` | NO | None | Timestamp server ingested and committed the record. |
| `payload_jcs` | `TEXT` | NO | None | Exact RFC 8785 Canonical JSON representation of payload. |
| `record_hash` | `TEXT` | NO | None | `SHA256(payload_jcs)`. |
| `prev_hash` | `TEXT` | NO | None | `chain_hash` of predecessor record (or 64 zeros for genesis). |
| `chain_hash` | `TEXT` | NO | None | `SHA256(prev_hash + payload_jcs)` — tamper-evident chain. |
| `device_attestation` | `TEXT` | YES | `NULL` | JSON attestation metadata (seal state, key security level). |
| `image_ref` | `TEXT` | YES | `NULL` | **Permanently NULL.** Legacy column; evidence is stored in `evidence_blobs`. |
| `image_sha256` | `TEXT` | YES | `NULL` | SHA-256 digest of original evidence JPEG (null if no image). |
| `is_demo` | `BOOLEAN` / `INTEGER` | YES | `0` / `false` | Distinguishes synthetic rehearsal data from real operational seizures. |
| `body` | `TEXT` | NO | None | **Authoritative source of truth.** Contains full rich payload. |

---

### 2.5 `cases`
Workflow case aggregation table.
- **Constraints:**
  - `PRIMARY KEY (case_ref)`
  - `CHECK (case_status IN ('REPORTED', 'UNDER_REVIEW', 'REVIEWED', 'ESCALATED'))`

| Column | Type (PG / SQLite) | Nullable | Default | Notes |
|---|---|---|---|---|
| `case_ref` | `TEXT` | NO | None | Canonical case identifier. |
| `case_status` | `TEXT` | NO | `'REPORTED'` | Current mutable review state. |
| `version` | `BIGINT` / `INTEGER` | NO | `1` | Optimistic concurrency control counter. |
| `region` | `TEXT` | NO | `''` | Derived from `case_ref` prefix (`DZU`, `MZU`). |
| `department` | `TEXT` | NO | `''` | Agency identifier (`NCB`, `UNSPECIFIED`). |
| `location` | `TEXT` | NO | `''` | **Permanently empty/NULL.** Do not build UI on this. |
| `location_label` | `TEXT` | NO | `''` | Human zone label derived from region code. |
| `first_record_at` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | Earliest `created_at` timestamp among case records. |
| `last_record_at` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | Latest `created_at` timestamp among case records. |
| `first_seen` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | **Permanently NULL.** Legacy field. |
| `last_seen` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | **Permanently NULL.** Legacy index exists but is unused. |
| `panchnama_ref` | `TEXT` | YES | `NULL` | Formal court seizure memorandum number (entered during review). |
| `created_at` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | Case creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | Timestamp of last status or metadata modification. |
| `assigned_officer_code` | `TEXT` | YES | `NULL` | **Permanently NULL.** Not wired to API routes. |
| `reviewer_officer_code` | `TEXT` | YES | `NULL` | **Permanently NULL.** Not wired to API routes. |
| `review_note` | `TEXT` | YES | `NULL` | **Permanently NULL.** Review notes live in `case_status_history`. |
| `reviewed_at` | `TIMESTAMPTZ` / `TEXT` | YES | `NULL` | **Permanently NULL.** Terminal timestamp lives in `case_status_history`. |

---

### 2.6 `case_status_history` 🔴 (APPEND-ONLY)
Audit trail of case workflow transitions.
- **Triggers:** Rejects any `UPDATE` or `DELETE`.
- **Constraints:**
  - `FOREIGN KEY (case_ref) REFERENCES cases(case_ref)`
  - `CHECK (from_status IN ('REPORTED', 'UNDER_REVIEW', 'REVIEWED', 'ESCALATED'))`
  - `CHECK (to_status IN ('REPORTED', 'UNDER_REVIEW', 'REVIEWED', 'ESCALATED'))`

| Column | Type (PG / SQLite) | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `BIGSERIAL` / `INTEGER` | NO | PK | Auto-incrementing identifier. |
| `case_ref` | `TEXT` | NO | None | Case being transitioned. |
| `officer_code` | `TEXT` | YES | `NULL` | Officer code of reviewer performing transition. |
| `from_status` | `TEXT` | NO | None | Starting workflow status. |
| `to_status` | `TEXT` | NO | None | New workflow status. |
| `actor` | `TEXT` | NO | None | Username of reviewer. |
| `at` | `TIMESTAMPTZ` / `TEXT` | NO | None | ISO 8601 transition timestamp. |
| `note` | `TEXT` | YES | `NULL` | Justification note accompanying status change. |

---

### 2.7 `server_audit` 🔴 (APPEND-ONLY)
Security, authorization, and administrative action audit ledger.
- **Triggers:** Rejects any `UPDATE` or `DELETE`.

| Column | Type (PG / SQLite) | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `BIGSERIAL` / `INTEGER` | NO | PK | Auto-incrementing primary key. |
| `officer_code` | `TEXT` | YES | `NULL` | Attributed officer code (resolved via `officers` lookup). |
| `actor` | `TEXT` | NO | None | Username or subsystem name initiating action (`admin`, `system`, `gill`). |
| `action` | `TEXT` | NO | None | Event name (`login`, `logout`, `auth-failed`, `permission-denied`, `account-locked`, `bootstrap-admin`). |
| `subject` | `TEXT` | YES | `NULL` | Target of action (username, record UUID, or route path). |
| `at` | `TIMESTAMPTZ` / `TEXT` | NO | None | Timestamp of event. |
| `detail` | `TEXT` | YES | `NULL` | Structured contextual metadata (IP, failure reason, request ID). |

---

### 2.8 `ledger_head`
Singleton state row pointing to the tip of the immutable chain.
- **Constraints:**
  - `CHECK (id = 1)` — exactly one row permitted.
  - `CHECK (seq >= 0)`
  - `UNIQUE (seq)`, `UNIQUE (record_uuid)`, `UNIQUE (chain_hash)`

| Column | Type (PG / SQLite) | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `INTEGER` | NO | `1` | Singleton identifier constraint. |
| `seq` | `BIGINT` / `INTEGER` | NO | None | Latest sequence number committed to ledger. |
| `record_uuid` | `TEXT` | YES | `NULL` | Record UUID of current head. |
| `chain_hash` | `TEXT` | NO | None | Current running cryptographic chain digest. |
| `updated_at` | `TIMESTAMPTZ` / `TEXT` | NO | None | Timestamp when head was advanced. |

---

### 2.9 `idempotency` 🔴 (APPEND-ONLY)
Guarantees at-most-once processing for record submissions.
- **Triggers:** Rejects any `UPDATE` or `DELETE`.
- **Constraints:**
  - `PRIMARY KEY (officer_code, key)`
  - `FOREIGN KEY (record_uuid) REFERENCES field_test(record_uuid)`

| Column | Type (PG / SQLite) | Nullable | Default | Description |
|---|---|---|---|---|
| `officer_code` | `TEXT` | NO | None | Ingesting officer code. |
| `key` | `TEXT` | NO | None | Client-supplied idempotency key (`rec:<record_uuid>`). |
| `request_hash` | `TEXT` | NO | None | SHA-256 digest of incoming HTTP request body. |
| `record_uuid` | `TEXT` | NO | None | Associated field test record. |
| `response_status` | `INTEGER` | NO | None | HTTP status code to replay (`201` or `200`). |
| `response_json` | `TEXT` | NO | None | Complete cached JSON response body to replay. |
| `response` | `TEXT` | NO | Generated | `GENERATED ALWAYS AS (response_json) STORED`. **Never insert into this column.** |
| `created_at` | `TIMESTAMPTZ` / `TEXT` | NO | None | Ingestion timestamp. |

---

### 2.10 `evidence_blobs` 🔴 (APPEND-ONLY)
Stores original binary JPEG evidence images matching sealed records.
- **Triggers:** Rejects any `UPDATE` or `DELETE`.
- **Constraints:**
  - `PRIMARY KEY (record_uuid)`
  - `FOREIGN KEY (record_uuid) REFERENCES field_test(record_uuid)`
  - `CHECK (byte_size > 0)`

| Column | Type (PG / SQLite) | Nullable | Default | Description |
|---|---|---|---|---|
| `record_uuid` | `TEXT` | NO | None | Target record UUID. |
| `sha256` | `TEXT` | NO | None | SHA-256 digest of image bytes; MUST match `field_test.image_sha256`. |
| `content_type` | `TEXT` | NO | None | MIME type (`image/jpeg` or `image/png`). |
| `byte_size` | `BIGINT` / `INTEGER` | NO | None | Length in bytes (max 5 MB enforced). |
| `bytes` | `BYTEA` / `BLOB` | NO | None | Raw cryptographic image bytes. |
| `hash` | `TEXT` | NO | Generated | `GENERATED ALWAYS AS (sha256) STORED`. **Never insert directly.** |
| `size` | `BIGINT` / `INTEGER` | NO | Generated | `GENERATED ALWAYS AS (byte_size) STORED`. **Never insert directly.** |
| `created_at` | `TIMESTAMPTZ` / `TEXT` | NO | None | Commitment timestamp. |

---

## 3. Permanently-NULL and Unpopulated Columns

The following columns exist in schemas for historical or architectural compatibility, but **are never populated by server endpoints**:

1. **`field_test.image_ref`**: Evidence is stored in `evidence_blobs` and retrieved via `GET /records/:uuid/evidence`.
2. **`field_test.region`, `field_test.department`, `field_test.location_label`**: Always stored as `NULL` during `POST /records` inserts. The API projects these fields dynamically during `GET /records` based on `case_ref` parsing and `officers` lookup.
3. **`cases.location`**: Always empty text `''`. Real geographic coordinates reside in `body.gps` of the child test records.
4. **`cases.first_seen`, `cases.last_seen`**: Always `NULL`. Use `first_record_at` and `last_record_at`.
5. **`cases.assigned_officer_code`, `cases.reviewer_officer_code`, `cases.review_note`, `cases.reviewed_at`**: Always `NULL` on the case row itself; reviewer history and notes are audited in `case_status_history`.

---

## 4. Device-Side Tables (Never Uploaded)

The mobile app operates an encrypted SQLite database on-device (`parinaam.db`).
The **only** table that is ever synchronized to the server is `field_test`.
The following device-side tables **never leave the phone**:

- `app_schema_migrations`: Device database version tracker.
- `audit_log`: Local device audit log of authentication attempts, PIN changes, and exports.
- `sync_queue`: Outbox queue tracking pending record uploads, backoff, and retry attempts.
- `synced_record`: Local ledger tracking server-confirmed hashes and HTTP response codes.
- `app_state`: Key/value store for officer PIN verifier, active case prefill, and selected language.
- `field_test_fts`: FTS5 full-text search virtual table for instant on-device offline search.
- `camera_engine_result`: Ephemeral staging table for raw computer vision colorimetry measurements.

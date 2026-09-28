# Mobile-to-Server Ingestion Contract

> **Authoritative Specification of What the Parinaam Mobile App Sends to the Server.**  
> Answers: *"What data goes from the mobile app to the server database, how is it verified, and what stays on the phone?"*

---

## 1. Overview and Wire Principles

1. **Exact Keys Enforced:**
   The ingestion endpoint (`POST /api/v1/records`) strictly enforces schema shape. Payloads with any missing required keys or any unexpected extra keys are rejected with HTTP `422 UNPROCESSABLE_ENTITY` (`UNKNOWN_FIELD_IN_RECORD`).
2. **Deterministic Cryptographic Seal:**
   Before submission, the device canonicalizes the core 23-property payload using **RFC 8785 JSON Canonicalization Scheme (JCS)**, calculates its SHA-256 digest (`record_hash`), binds it to the previous record's `chain_hash`, and produces a tamper-evident ledger block.
3. **Evidence Upload Separation:**
   The binary evidence image is **never embedded in JSON** (no Base64 strings). It is uploaded as raw binary bytes in a secondary step and validated against `image_sha256`.

---

## 2. The 28 Exact Wire Keys

Every JSON payload posted to `POST /api/v1/records` must have exactly these 28 top-level keys:

| # | Field Name | Type | Constraints & Format | Description |
|---|---|---|---|---|
| 1 | `schema_version` | `string` | Must be `'parinaam-field-record-v1'` | Contract version identifier. |
| 2 | `seq` | `number` | Integer $\ge 1$, monotonic | Sequence position in local device chain. |
| 3 | `record_uuid` | `string` | UUIDv4 (canonical 8-4-4-4-12 hex) | Globally unique record identifier. |
| 4 | `case_ref` | `string` | `^[A-Z0-9-]+\/[A-Z0-9-]+\/[A-Z0-9-]+\/\d{4}$` | Formal seizure case reference. |
| 5 | `package_no` | `string` | `^P-\d+$` (e.g. `P-1`, `P-2`) | Packet / container identifier within the case. |
| 6 | `lot_no` | `string \| null` | Max 200 chars or null | Batch/lot identifier of seized material. |
| 7 | `reagent` | `string` | One of: `marquis`, `mecke`, `mandelin`, `scott`, `duquenois_levine`, `simons`, `ehrlich`, `nitric_acid`, `ferric_chloride` | Chemical reagent applied. |
| 8 | `kit` | `object` | Exact keys: `make`, `test_name`, `lot_no`, `expiry` | Field test kit manufacturer metadata. |
| 9 | `corrected_lab` | `object` | Exact keys: `l`, `a`, `b` (all numbers) | Calibrated CIE $L^*a^*b^*$ colourimetry coordinates. |
| 10 | `delta_e_00` | `number` | Finite number $\ge 0$ | CIEDE2000 colour distance against reagent reference. |
| 11 | `calibration_residual` | `object` | Exact keys: `mean`, `max`, `grade` (`'GOOD'` \| `'DEGRADED'`) | Target card color chart calibration residuals. |
| 12 | `outcome` | `string` | `'CONSISTENT_WITH_REAGENT_POSITIVE'`, `'CONSISTENT_WITH_REAGENT_NEGATIVE'`, `'INCONCLUSIVE'` | Presumptive test outcome. **Never asserts drug identity.** |
| 13 | `confidence` | `number` | $0.0 \le x \le 1.0$ | Conformal prediction confidence score. |
| 14 | `conformal_set` | `string[]` | Non-empty array of outcome strings | Conformal coverage prediction set. |
| 15 | `abstention_reason` | `string \| null` | Null or: `'low_margin'`, `'novelty_ood'`, `'calibration_failed'` | Reason if system refused classification. |
| 16 | `kinetics` | `array \| null` | Null or array of `{ t_ms: number, delta_e: number }` | Reaction rate time-series curve points. |
| 17 | `gps` | `object \| null` | Null or `{ lat, lon, accuracy_m, mocked, source? }` | Geotag fix with provenance marker. |
| 18 | `image_sha256` | `string \| null` | Null or 64-character lowercase hex digest | SHA-256 of the original evidence JPEG. |
| 19 | `operator_id` | `string` | Min 2, max 80 chars | Officer identifier attributed to seizure. |
| 20 | `operator_name` | `string \| null` | Null or max 120 chars | Human operator name. |
| 21 | `officer_role` | `string` | One of: `'JUNIOR'`, `'SENIOR'`, `'ADMIN'`, `'SUPERVISOR'`, `'JUDICIARY'` | Role of operator at time of capture. |
| 22 | `created_at` | `string` | ISO 8601 UTC with milliseconds | Time of seizure record seal. |
| 23 | `is_demo` | `boolean` | `true` or `false` | Distinguishes rehearsal from live enforcement. |
| 24 | `payload_jcs` | `string` | Valid JSON string | Exact RFC 8785 canonical string of fields 1–23. |
| 25 | `record_hash` | `string` | 64-character lowercase hex | `SHA256(payload_jcs)`. |
| 26 | `prev_hash` | `string` | 64-character lowercase hex | `chain_hash` of preceding record. |
| 27 | `chain_hash` | `string` | 64-character lowercase hex | `SHA256(prev_hash + payload_jcs)`. |
| 28 | `device_attestation`| `string \| null`| JSON string or null | Hardware security level and integrity metadata. |

---

## 3. Two-Step Ingestion Sequence

The mobile app's sync queue transfers data to the server in two distinct steps:

```
[Mobile Device]                                           [Parinaam API Server]
      |                                                             |
      | 1. POST /api/v1/records                                     |
      |    Headers: Authorization: Bearer <token>                   |
      |             Idempotency-Key: rec:<record_uuid>              |
      |    Body: { ... 28 wire keys ... }                           |
      |------------------------------------------------------------>|
      |                                                             | Validates JCS & chain hash.
      |                                                             | Atomically commits to field_test.
      |                                                             | Inserts idempotency cache receipt.
      |<------------------------------------------------------------|
      |    201 Created { status: 'stored', ... }                    |
      |                                                             |
      | 2. (If image_sha256 != null)                                |
      |    PUT /api/v1/records/{uuid}/evidence                      |
      |    Headers: Authorization: Bearer <token>                   |
      |             Content-Type: image/jpeg                        |
      |    Body: <raw binary JPEG bytes>                            |
      |------------------------------------------------------------>|
      |                                                             | Validates SHA256(bytes) == image_sha256.
      |                                                             | Stores in evidence_blobs.
      |<------------------------------------------------------------|
      |    200 OK { status: 'stored', ... }                         |
      |                                                             |
[Record marked SYNCED]
```

- **Idempotency Guarantee:** If step 1 is retried due to network interruption, the server replays the cached 200/201 response without duplicating ledger rows.
- **Evidence Verification:** Step 2 fails with `422 HASH_MISMATCH` if uploaded bytes do not match the `image_sha256` that was previously sealed into the record.
- **Atomic Completion:** The device marks a record as `synced` in its local outbox **only when both steps succeed**.

---

## 4. What NEVER Leaves the Mobile Phone

To preserve investigative integrity and privacy (DPDP Act 2023), the following tables and device data **never leave the device**:

1. **`record_sync_state` & `sync_queue`:** Local backoff counters, retry timers, and error queues.
2. **`synced_record`:** Local receipt mirrors.
3. **`app_state`:** Key-value store holding the local officer PIN verifier, active case prefill, and interface preferences.
4. **`field_test_fts`:** SQLite FTS5 full-text search index.
5. **`camera_engine_result`:** Raw uncalibrated RGB colorimeter matrices and debug patches.
6. **Device `audit_log`:** On-device authentication attempts, lockouts, and screen visits.
7. **Local Security State:** The device MPIN / password salt, biometric authentication states, and test mock bypass flags.
8. **Retired Spec Columns:** Legacy columns from earlier speculative designs (`device_serial`, `device_model`, `root_detected`, `play_integrity`, `gnss_clock_offset`, `video_sha256`, `rfc3161_token`, `esign_pkcs7`).

---

## 5. Dead-Lettered Records (Crucial Dashboard Caveat)

If a locally sealed record fails validation (e.g. hash tampering, predecessor missing permanently, or corrupted payload), the device moves it to a permanent **dead-letter state**.

> [!WARNING]
> **Server Under-Reporting:**
> Dead-lettered records are excluded from the sync queue and **are never uploaded to the server**.
> Consequently, `GET /api/v1/records` and `GET /api/v1/stats` reflect **only successfully synchronized records**.
> There is no server endpoint to query "captured but failed to upload" records, because that data never leaves the physical handset.

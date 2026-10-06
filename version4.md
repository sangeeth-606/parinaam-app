# version4.md — Execution Specification for Parinaam

**Status:** ready to execute. Written after a full read-only investigation of the repository at
`master` = `fdf4c15`. Every claim below is anchored to a `file:line` that was verified against the
code, the live Docker stack, and the live Postgres database.

**Audience:** an agent (or engineer) who has never seen this repository. You do not need any context
from the investigation conversation. Everything you need is in this file plus the repository itself.

**Repository:** `/home/zape/Projects/parinaam-app`

---

## 0. How to use this document

### 0.1 What this file is

Five things were requested. They are vague as requests and precise as engineering work. This file
turns them into **19 ordered phases**, each with:

- a **goal** (one sentence),
- the **exact files and line numbers** to change,
- the **exact change** to make,
- **why it is correct** (so you can tell if the finding is still true when you get there),
- a **verification gate** you must pass before moving on,
- **rollback** notes.

Execute phases **in order**. The ordering is a hard dependency graph, not a preference. Section 3
explains why.

### 0.2 Non-negotiable constraints (from `AGENTS.md`)

These are already enforced in the repo and you must not weaken any of them:

| # | Constraint | Practical meaning for you |
|---|---|---|
| 1 | **No gallery import** | Never add `expo-image-picker` / `expo-document-picker`. The camera is the only ingest path. |
| 2 | **Append-only ledger** | `UPDATE`/`DELETE` on evidence tables must keep raising `RAISE(ABORT)`. **Never write a migration that relaxes a trigger.** |
| 3 | Presumptive banner retired in-app | Do not reintroduce it. Court-facing exports still keep the verbatim disclaimer. |
| 4 | Transparent colourimetry, no ML | Never add a classifier. ΔE00 only. |
| 5 | Standing Order 1/88 is repealed | Cite **Rule 10(2), NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022 (G.S.R. 899(E))**. |
| 6 | `deviceAttestation` / "integrity seal" | **Never** write "digital signature", "signed", or "e-sign" for the device key. |
| 7 | Never assert drug identity | The type stays `PresumptiveOutcome` with exactly 3 values. Never print a substance name. |
| 8 | No live government-system writes | No SIMS / NIDAAN / NCORD / CCTNS / ICJS. Mock-schema JSON only, aligned to NCB Form F. |
| 9 | Zero training on seizure imagery | No ML training anywhere. |
| 10 | Record the **achieved** security level | Never print `StrongBox` unless it was actually probed and returned. |

The ESLint config [`.eslintrc.js`](.eslintrc.js) enforces 5, 6, 7 and part of 8 via
`no-restricted-syntax` literals. **Phase 0 widens that net** — read it.

### 0.3 Verification commands (the gate for every phase)

```bash
cd /home/zape/Projects/parinaam-app

npx tsc --noEmit                      # app typecheck
npm run typecheck:server             # server typecheck
npm run lint                          # eslint
npm test                              # node:test suite — currently 259 tests, all passing
```

**Known baseline failures at `fdf4c15` — these are PRE-EXISTING. Do not attribute them to your work,
and do not "fix" them silently:**

```
src/screens/CaptureScreen.tsx(250,25): Type '"image"' is not assignable to type 'IconName'.
src/screens/CaptureScreen.tsx(264,25): Type '"image"' is not assignable to type 'IconName'.
```

Two `tsc` errors only. The owner deferred them. **`Phase 2` step 2.7 fixes them as a courtesy**; if you
skip that step, the count must stay at exactly 2 and no more.

Docker stack (needed for phases 8, 13, 16, 17):

```bash
node scripts/start-local-stack.mjs --lan   # brings up db + camera-engine
docker compose ps                          # 3 containers healthy
docker exec parinaam-app-db-1 psql -U parinaam -d parinaam -c '\dt'
```

Database changes are **destructive if applied to the live dev database**. The owner's live stack holds
15 demo records and 4 cases. **Every phase that changes server schema has a documented reset command.**
Use them rather than reasoning about partial states.

### 0.4 Repository conventions

From `AGENTS.md` §5:

- TypeScript `strict: true`. **No `any`.**
- Modules/utilities/services: `kebab-case.ts`. Components/screens: `PascalCase.tsx`.
- Named exports for utilities/services. Default exports only for root screen components.
- Commits: Conventional Commits. Branch: `feat/v4-<phase-slug>`. Push after each phase.

---

## 1. What the five requests actually turned out to be

The requests were: (1) make GPS unchangeable, (2) nothing should live only on the phone, (3) build a
real role-based auth system with a proper seed, (4) the seal/register button does nothing, (5) write
an API spec so the dashboard team can integrate.

Two of them are **not what the owner assumed**. Read these before you start.

### 1.1 Request 1 (GPS) — the system is already tamper-proof; the *input* lies

The owner asked for GPS to be unchangeable. **It already is, cryptographically.** GPS is part of the
hashed payload, so any change breaks the chain. Proven by the existing test
[tests/contracts/field-test-record-contract.test.ts:333](tests/contracts/field-test-record-contract.test.ts#L333),
which mutates `gps.lat` and asserts the payload changes.

What is broken is different and worse in kind: the app **shows the officer an editable text box for
the location, and silently throws away whatever they type.** It is not that they can forge the sealed
GPS — it is that the screen lies to them about what was recorded. The typed value is discarded; the
sealed value comes from a different `acquireGeoTag()` call made separately.

The `TIMESTAMP` field has the identical bug, and it is *more* visible because the value also appears
in the header badge.

### 1.2 Request 3 (auth) — the server is real; the phone's lock screen is not

The owner said "the current authentication is like a demo version". Half true:

- **Server auth and RBAC are real and properly built.** scrypt password hashing, SHA-256-hashed
  bearer tokens, a `sessions` table, 12-hour TTL, 5 roles enforced server-side, rate limiting,
  audited. Roughly 20 role checks, all server-side.
- **The device gate (the phone's own unlock) is a no-op.** The one function that actually verifies a
  credential exists but **no screen ever calls it** — only a test does. The three paths the login
  screen really uses all succeed unconditionally, and each one mints a session for a hardcoded
  `ADMIN` officer.

So the app currently hands `ADMIN` to anyone who can get past the lock screen. The 5-attempt lockout
exists in code and is **unreachable**, and is reset on every app restart.

The seed is also better than the owner believed — there are 7 plausible officers, not placeholders.
The real seed defects are: three of the seven are role labels rather than people, and all seven
passwords are plaintext literals committed to the repository.

### 1.3 Request 4 (seal) — two different buttons; the one labelled SEAL seals nothing

This one is a clean, fully-explained bug. The button reads `SEAL EVIDENCE & CREATE RECORD`. Its
press handler is a single `navigate('CaseLog')`. No seal, no write, no feedback. The record was
already sealed one screen earlier.

And when the officer lands on the case log, the record they just made is labelled **`PENDING SEAL`**
in amber — because the device attestation is always `null` on device, and the label's rule equates
"no device attestation + not synced" with "pending seal". So: correct label, zero behaviour, result
that reads as "it didn't register". That is exactly the reported symptom.

### 1.4 Request 5 (API docs) — the spec exists and is good; the *database* is undocumented

`server/openapi.yaml` is a valid OpenAPI 3.0.3 document, 19 paths / 22 operations / 37 schemas, and
every documented endpoint answers 200 against the live stack. It is, however, **stale** — last
touched before the P0 honesty fixes and the teammate merge.

The gap the owner actually cares about — *"what all things are storing in the database?"* — is **not
covered anywhere**, because OpenAPI is an HTTP document and cannot describe tables. That is the bulk
of Phase 5.

### 1.5 Request 2 (data residency) — mostly already true; the real problems are elsewhere

Records and images already reach Postgres. The owner's premise is roughly 85% correct. The genuine
defects, in priority order:

1. **A fork that makes encryption and sync mutually exclusive** — the sync connection opens the same
   database file **without the SQLCipher key**. On a SQLCipher build sync can never work; on a build
   without SQLCipher the ledger is plaintext. Never both.
2. **Server schema edits are a landmine** — the migration system hashes all current DDL into a
   checksum, so *any future column addition* makes the server refuse to boot against an
   already-migrated database. Must be fixed before Phase 8 adds officer columns.
3. **Deployable cloud defaults** — `POSTGRES_PASSWORD=parinaam` and the admin password ship as
   compose defaults.
4. **Cleartext HTTP permitted** in the Android manifest.
5. Dead-lettered rows are re-uploaded forever (unbounded growth).

### 1.6 A defect that was not requested but is more serious than all five

In `ResultsScreen`, a **failed** camera capture is sealed with fabricated science:

```ts
{ l: 50.0, a: 0.0, b: 0.0 }                      // neutral grey, invented
residual || { meanDeltaE: ?? 1.2, maxDeltaE: ?? 2.4, grade: 'GOOD' }   // "GOOD", invented
```

Verified live: POSTing a real photo to the camera engine returns `normalized_color: null`,
`calibration: null`, `outcome: INCONCLUSIVE / IMAGE_QUALITY_FAILED` — and the app seals it with
`{l:50,a:0,b:0}` and a `GOOD` calibration grade. **This is the single most serious integrity defect in
the codebase.** It is Phase 1, and it must land first.

---

## 2. Phase dependency graph

```
PHASE 0   Baseline + honest labelling          (no deps)
   │
PHASE 1   Stop sealing fabricated science      (no deps — DO FIRST)
   │
PHASE 2   Seal/register UI honesty             (needs 1 — both touch ResultsScreen)
   │
   ├── PHASE 3   GPS + timestamp cannot be edited     (independent)
   ├── PHASE 4   Location accuracy + iOS permission  (needs 3)
   ├── PHASE 5   Geotag provenance in the payload    (needs 3, 4)
   ├── PHASE 6   Fix the seal-confirmation feedback  (needs 2)
   │
PHASE 7   Single source of truth for officer roles (no deps)
   │
PHASE 8   Officer schema columns                (needs 7)  ← MUST precede 13
   │
   ├── PHASE 9   Realistic seed + credential hygiene  (needs 8)
   ├── PHASE 10  Guard consolidation (rbac.ts)       (needs 7, 8)
   ├── PHASE 11  Device gate honesty                 (needs 8, 10)
   ├── PHASE 12  Session + auth audit hardening      (needs 8)
   │
PHASE 13  Fix the SQLCipher / sync fork        (no deps)  ← MUST precede 14, 15
   │
   ├── PHASE 14  Versioned server migrations          (needs 8 — additive DDL)
   ├── PHASE 15  Sync queue correctness               (needs 13)
   ├── PHASE 16  Cloud-deploy hardening               (independent)
   ├── PHASE 17  Documentation                        (needs everything above)
   │
PHASE 18  Retire dead code                    (needs 13, 15)
PHASE 19  Final verification + known-gaps update (needs all)
```

**Three ordering rules that are not obvious and that will bite you if you ignore them:**

1. **Phase 14 (versioned migrations) must land before any further server DDL.** Phase 8 adds officer
   columns. If you add them under the current checksum scheme, the server will refuse to boot against
   every already-migrated database. Either land 14 first, or land 8's columns and 14 in the same
   change with a data-migration step. **Recommended: land 14, then 8.**
2. **Phase 13 (SQLCipher fork) must land before Phase 15.** Phase 15 changes the outbox query. On a
   SQLCipher build that query cannot execute at all until 13 is done, so you cannot test 15 without 13.
3. **Phase 1 before Phase 2.** Both rewrite `ResultsScreen.handleConfirmAndProceed`. Doing 2 first
   means merging two edits to the same 70-line function.

---

# PHASE 0 — Baseline and honest labelling

**Goal:** record the exact starting state, and fix three on-screen lies that would otherwise survive
into the final build.

**Why first:** Phase 1 onward changes the files that contain these strings. If you fix them later you
will be searching for moved line numbers.

## 0.1 Record the baseline

```bash
cd /home/zape/Projects/parinaam-app
git rev-parse HEAD                      # record the base commit
git status --porcelain                  # must be empty
npx tsc --noEmit 2>&1 | tee /tmp/v4-baseline-tsc.txt
npm test 2>&1 | tail -20 | tee /tmp/v4-baseline-tests.txt
```

Append to `docs/known-gaps.md` a new section `## version4 baseline` containing the commit sha, the
tsc error count, and the test count. This is the rollback reference for every later phase.

## 0.2 Remove the fabricated hardware claims

`src/screens/CaptureScreen.tsx:420-423` currently renders:

> Zero–loss uncompressed RAW frame cryptographically signed

This is false on three counts. The pipeline produces a single JPEG, not a RAW frame. It is chain-hashed,
not signed. And `deviceAttestation` is always `null` on device (§2, Phase 2.3 explains why). It also
violates rule 6 — "signed" is exactly the term the repo forbids.

Replace the `<Text>` body with:

```tsx
Zero-loss JPEG frame, SHA-256 hash-chained at seal
```

`src/screens/CaptureScreen.tsx:434` currently renders:

> GALLERY INGESTION DISABLED • BSA SEC-63 HARDWARE ENCLAVE ATTESTED • TAMPER-EVIDENT FORENSIC TIMESTAMPS

`GALLERY INGESTION DISABLED` is **true** — keep it. `HARDWARE ENCLAVE ATTESTED` is **false** (rule 10;
see `hardware-key.ts:112-116`, which hardcodes `'TrustedEnvironment'` and never probes). Replace:

```tsx
GALLERY INGESTION DISABLED • CHAIN-HASHED RECORD • DEVICE SEAL UNAVAILABLE ON THIS BUILD
```

Phase 11 step 11.3 restores an honest attestation line once the level is actually probed. Until then
this wording is the truth.

## 0.3 Fix the always-true GPS badge

`src/screens/CaptureScreen.tsx:367` renders the literal string:

> GPS location tagged (lat/lon ±6m)

This is **hardcoded and unconditional**. It does not read the geotag, and it does not read `burst`. It
claims a ±6 m fix on every capture, including ones where the GPS was denied and no fix exists at all.

Phase 4 replaces this properly. For Phase 0, make it honest by binding it to the state that already
exists:

```tsx
<Text style={styles.dngSubText}>
  {geo ? `GPS fix ${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)} (accuracy ±${Math.round(geo.accuracy_m ?? 0)} m)` : 'No GPS fix — record will seal without coordinates'}
</Text>
```

Use the `geo` value Phase 3 introduces. **If you execute Phase 0 and Phase 3 together**, wire it
directly to the hoisted `geo`; if you execute Phase 0 standalone, use a `useEffect` that calls
`acquireGeoTag()` and holds the result in local state. Phase 4 removes the whole block in favour of a
component that owns the real accuracy policy.

## 0.4 Widen the forbidden-terminology lint net

`src/screens/CaptureScreen.tsx:422` says "cryptographically signed" and passed lint, because
`.eslintrc.js` only bans the literal `/digital.?signature/i`. Extend `no-restricted-syntax`:

```js
{
  selector: 'Literal[value=/cryptographically signed|signed by the device|device signed/i]',
  message:
    'Rule 6: the device key produces an integrity seal, never a signature. Say "chain-hashed" or "device attestation".',
},
{
  selector: 'Literal[value=/StrongBox/i]',
  message:
    'Rule 10: StrongBox may only be named when probeHardwareSecurityLevel() actually returned it. Derive the string instead.',
},
```

**The second rule needs care.** Read `src/crypto/hardware-key.ts` and
`src/types/domain.ts:18` first: `SecurityLevel` is a union type that *legitimately* contains the
string `'StrongBox'`, and `probeHardwareSecurityLevel` is supposed to return it. If you add a blanket
literal ban you will break the type definition.

**Correct approach:** the ban applies only to **`.tsx` UI strings**, not to the type module or the
prober. Scope it by adding an `overrides` block:

```js
overrides: [
  {
    files: ['src/screens/**/*.tsx', 'src/components/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', /* only the UI rules above */],
    },
  },
],
```

The two rules in the top-level block (`Standing Order 1/88`, `digital signature`) must stay global —
`.eslintrc.js` ignores itself, so the quoted strings in it are safe.

## 0.5 Fix the two `IconName` typecheck errors

`src/screens/CaptureScreen.tsx:250` and `:264` pass `name="image"`, which is not in the `IconName`
union ([src/components/ui/Icon.tsx:11](src/components/ui/Icon.tsx#L11), 45 members).

Two valid resolutions — **pick the first**:

1. Add a glyph. Find an existing photo/camera-ish member in the `IconName` union and use it.
2. If no suitable glyph exists, add `"image"` to the union in `Icon.tsx` **and** add a matching entry
   to the glyph path map in the same file, following the existing pattern exactly. A union member
   with no path renders nothing — that is how this bug happened.

**Verification gate for Phase 0:**

```bash
npx tsc --noEmit      # must be 0 errors (was 2)
npm run lint          # must be clean; if the UI override broke, scope it tighter
npm test              # must still be 259 pass, 0 fail
```

---

# PHASE 1 — Stop sealing fabricated science  🔴 P0

**Goal:** a failed or degraded measurement must never be sealed with invented numbers.

**This is the most serious defect in the codebase.** It was not in the five requests. It is first
because every later phase assumes the sealed payload is truthful.

## 1.1 The defect

`src/screens/ResultsScreen.tsx:150-163`, inside the single `appendRecord` call:

```ts
corrected_lab: burst?.engineResult?.normalizedColor
  ? { l: burst.engineResult.normalizedColor.l, a: …, b: … }
  : { l: 50.0, a: 0.0, b: 0.0 },                    // ← line 154: invented

calibration_residual: burst?.engineResult?.calibration
  ? { meanDeltaE: …, maxDeltaE: …, grade: … }
  : { meanDeltaE: burst?.engineResult?.quality?.meanDeltaE ?? 1.2,
      maxDeltaE: burst?.engineResult?.quality?.maxDeltaE ?? 2.4,
      grade: 'GOOD' },                              // ← lines 155-158: invented
```

**Verified live.** POSTing `src/demo-photos/photo1.jpg` to `http://127.0.0.1:8572/v1/analyze` returns:

```json
{ "normalized_color": null, "calibration": null,
  "outcome": "INCONCLUSIVE", "reason": "IMAGE_QUALITY_FAILED" }
```

That response takes the `: 50.0` branch and produces a record with a neutral-grey CIE-Lab triple and
`grade: 'GOOD'` — a *passing* calibration claim for a capture that never measured anything.

The server accepts it, because the values are individually well-formed. `verify.ts` checks
`calibration_residual.grade ∈ {GOOD, DEGRADED}` — it cannot know the value was invented on the phone.

## 1.2 The fix

Delete the fallbacks. When the engine did not measure, say so.

Replace `ResultsScreen.tsx:150-163` with a computation that **separates "measured" from "absent"**:

```ts
// Truthful measurement extraction. A missing measurement is absent, never defaulted.
const measuredColor = burst?.engineResult?.normalizedColor ?? null;
const measuredCalib = burst?.engineResult?.calibration ?? null;
const quality = burst?.engineResult?.quality ?? null;

const correctedLab = measuredColor
  ? { l: measuredColor.l, a: measuredColor.a, b: measuredColor.b }
  : null;

const calibrationResidual = measuredCalib
  ? { meanDeltaE: measuredCalib.meanDeltaE, maxDeltaE: measuredCalib.maxDeltaE,
      grade: measuredCalib.grade }
  : quality
    ? { meanDeltaE: quality.meanDeltaE, maxDeltaE: quality.maxDeltaE, grade: 'DEGRADED' }
    : null;
```

Note the one deliberate judgement: when there is a *quality* residual but no *calibration* residual,
the grade is `DEGRADED`, never `GOOD`. Claiming `GOOD` on a measurement the calibration card did not
support is the same fabrication in a smaller window.

## 1.3 Handle the nulls at the type boundary

`corrected_lab` and `calibration_residual` are **required, non-null** in the wire contract
([src/contracts/field-test-record.ts](src/contracts/field-test-record.ts)), and the server rejects
`null` with `schema-validation`. So the record cannot simply be sealed without them.

The correct behaviour is: **if there is no measurement, the officer must not be able to seal a positive
result — and an INCONCLUSIVE record must still carry a truthful explanation.**

`appendRecord` already throws when required identity is missing
([src/state/ledger-store.ts:196-198](src/state/ledger-store.ts#L196)). Add the same guard immediately
above it:

```ts
if (!input.correctedLab || !input.calibrationResidual) {
  throw new Error(
    'no measurement was taken — the calibration card was not read, so this capture cannot be sealed'
  );
}
```

This is a hard block, not a warning. The officer gets a clear, actionable message; the ledger never
receives a fabricated Lab triple. **The alternative — defaulting to something and sealing it — is
precisely the bug this phase exists to remove.**

## 1.4 Make the error reachable

An officer who hits this must see it. `ResultsScreen` renders its error box at **line 269** and the
confirm button at **line 407** — 138 lines apart inside one `ScrollView`, roughly ten screens of
content apart. On a long scroll the message is off-screen and the press looks like a no-op.

Phase 2 step 2.5 moves the error box adjacent to the button. **Do that in the same commit**, otherwise
this phase turns a data-integrity bug into a UX dead end.

## 1.5 Add the regression guard

Open `tests/platform/honesty-guards.test.ts`. It uses `code(rel)` to strip comments and then match
literals, which is exactly the mechanism needed. Add:

```ts
describe('Rule 4/7 — a missing measurement is absent, never defaulted', () => {
  const results = code('src/screens/ResultsScreen.tsx');

  it('does not substitute neutral grey for an unmeasured CIE-Lab triple', () => {
    assert.ok(
      !/l:\s*50(\.0)?\s*,\s*a:\s*0(\.0)?\s*,\s*b:\s*0(\.0)?/.test(results),
      'a capture with no colour measurement must seal as null, not as {l:50,a:0,b:0}'
    );
  });

  it('never invents a calibration grade', () => {
    assert.ok(
      !/grade:\s*'GOOD'/.test(results),
      "grade 'GOOD' must come from the engine's calibration result, never from a literal"
    );
  });

  it('never invents a delta-E residual', () => {
    assert.ok(
      !/(meanDeltaE|maxDeltaE):[^,}]*\?\?\s*\d/.test(results),
      'delta-E residuals must not carry numeric fallbacks'
    );
  });
});
```

The third guard is the general one — it catches this entire *class* of bug, not just these three
constants. Check the whole repo for other `?? <number>` on measurement fields before you finish:

```bash
grep -rn "DeltaE\|deltaE\|delta_e" src/ --include=*.ts --include=*.tsx \
  | grep "??" | grep -v "^src/.*test"
```

Every hit is a candidate for the same fabrication. Triage each; leave the ones that are genuinely
optional metadata, fix the ones that are measurements.

**Verification gate for Phase 1:**

```bash
npx tsc --noEmit && npm test
node --experimental-strip-types --test tests/platform/honesty-guards.test.ts   # 15 tests now
```

Then prove the real-world case still behaves: capture with the engine up and a valid calibration
card, seal one record, and confirm `payload_jcs` contains a **non-50** `corrected_lab.l`.

```bash
docker compose up -d
curl -s -X POST http://127.0.0.1:8572/v1/analyze \
  -H 'content-type: application/json' \
  -d '{"image_base64":"'"$(base64 -w0 src/demo-photos/photo1.jpg | tr -d '\n')"'"}' | jq '{normalized_color, calibration, outcome}'
```

`normalized_color` is `null` for this fixture — which is exactly why the fallback existed, and
exactly why it is wrong. A real capture with a card produces a real value.

---

# PHASE 2 — Seal / register: make the UI tell the truth

**Goal:** pressing seal must produce a visible, correct, verifiable result; and no control on any
screen may claim to do something it does not do.

**Depends on:** Phase 1 (same function).

## 2.1 The root cause — a navigation stub wearing a seal's label

`src/screens/RecordDetailScreen.tsx:387-397`:

```tsx
<TouchableOpacity
  style={styles.sealBtn}
  onPress={() => navigation.navigate('CaseLog')}
  accessibilityLabel="Seal Evidence and Create Record"
>
  <Icon name="shield" size={18} … />
  <Text style={styles.sealBtnText}>SEAL EVIDENCE & CREATE RECORD</Text>
</TouchableOpacity>
```

No seal. No database write. No state change. No feedback. The record on this screen **was already
sealed** one screen earlier, by
[`ResultsScreen.handleConfirmAndProceed`](src/screens/ResultsScreen.tsx#L114) → `appendRecord`
(`ResultsScreen.tsx:136`) → `navigate('RecordDetail')` (`ResultsScreen.tsx:181`).

**Fix — delete the button.** Replace the whole `actionsBlock` (`:387-409`) with honest navigation:

```tsx
<View style={styles.actionsBlock}>
  <TouchableOpacity
    style={styles.sealBtn}
    onPress={() => navigation.navigate('CaseLog')}
    accessibilityRole="button"
    accessibilityLabel="View this case in the case log"
  >
    <Icon name="folder" size={18} color="#FFFFFF" strokeWidth={2.2} />
    <Text style={styles.sealBtnText}>VIEW IN CASE LOG</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={styles.retakeBtn}
    onPress={() => navigation.navigate('Integrity')}
    accessibilityRole="button"
    accessibilityLabel="View the integrity audit trail"
  >
    <Icon name="shieldCheck" size={17} color="#2563EB" strokeWidth={2.3} />
    <Text style={styles.retakeBtnText}>VIEW IN AUDIT TRAIL</Text>
  </TouchableOpacity>
</View>
```

Check the two `Icon` names against the `IconName` union before using them; fall back to members you
have confirmed exist.

The sibling button "Retake Assay Capture" (`RecordDetailScreen.tsx:399-408`) navigates to `Capture`
**directly**, skipping `NewTestSetup` — so the reagent and kit draft are bypassed. It must route
through the wizard:

```tsx
onPress={() => navigation.navigate('NewTestSetup')}
```

## 2.2 Delete the fabricated fallback record

`RecordDetailScreen.tsx:54-66` fabricates a complete, positive, sealed record whenever the uuid is
not in the ledger:

```tsx
const record: Partial<LedgerRecord> = recordFromStore ?? {
  record_uuid: route.params.uuid,
  case_ref: 'FIELD-RECORD',
  outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
  deltaE: 1.48,
  confidence: 0.942,
  …
};
```

A stale uuid, a persistence failure, or any deep link produces a convincing dossier for a record that
does not exist. **This is a rule-7-adjacent fabrication and it is the most dangerous kind — it invents
a positive result.**

Replace with an early return that renders an honest empty state:

```tsx
if (!recordFromStore) {
  return (
    <View style={styles.host}>
      <Text style={styles.emptyTitle}>RECORD NOT FOUND IN THE LOCAL LEDGER</Text>
      <Text style={styles.emptyBody}>
        No sealed record matches this identifier on this device. It may have been sealed on a
        different device, or the write may have failed. Check the audit trail.
      </Text>
      <Button title="VIEW IN AUDIT TRAIL" onPress={() => navigation.navigate('Integrity')} />
    </View>
  );
}
```

Reuse the existing empty-state styling from `src/screens/IntegrityScreen.tsx:185` so this matches
the app's evidentiary language. Adjust the component's existing prop contract to the shape this
screen already uses.

## 2.3 Derive the integrity line from real state

`RecordDetailScreen.tsx:188-193` renders `SEALED (SHA-256)` **unconditionally** — it never reads
`sealState`, `chainHash`, or `deviceAttestation`.

**Why `deviceAttestation` is always null on device** (read this before writing the fix — it is not a
bug you can simply repair here):

1. `src/crypto/hardware-key.ts:16` imports `node:crypto`.
2. `metro.config.js:24-29` aliases `crypto` / `node:crypto` to `scripts/node-crypto-stub.js`.
3. That stub **throws on every export**, including `generateKeyPairSync`.
4. `hardware-key.ts:83` calls it, throws, propagates through `signChainHash` → `sealRecord`.
5. `src/services/analysis-pipeline.ts:79-92` catches it and degrades to chain-only: 
   `deviceAttestation: null`, `sealState: 'UNATTESTED'`.

So on a real phone the integrity seal is *structurally unavailable*. The UI must say so.

```tsx
<Text style={styles.integrityGreen}>
  {record.deviceAttestation
    ? 'INTEGRITY SEAL ATTACHED'
    : 'CHAIN-ONLY — NO DEVICE SEAL (this build cannot reach the keystore)'}
</Text>
{record.chainHash ? (
  <Text style={styles.mono}>CHAIN HASH {abbreviateHash(record.chainHash)}</Text>
) : null}
```

`abbreviateHash` is exported from `src/domain/outcome-copy.ts:112`. Follow rule 6: "integrity seal",
never "signature".

## 2.4 Fix the "PENDING SEAL" lie

`src/screens/CaseLogScreen.tsx:178`:

```tsx
const isPending = !item.deviceAttestation && item.syncStatus !== 'synced';
```

rendered at `:251` as `{isPending ? 'PENDING SEAL' : 'SEALED'}`.

Since `deviceAttestation` is always `null`, **every unsynced record is labelled "PENDING SEAL"** — a
fully sealed, hash-chained record described as awaiting its seal. This is the second half of why the
owner's seal button "did nothing": the record appears unregistered.

Replace with a state-derived label:

```tsx
const sealLabel =
  item.deviceAttestation ? 'SEALED' :
  item.syncStatus === 'synced'    ? 'SYNCED' :
  item.syncStatus === 'dead-letter' ? 'DEAD-LETTER' :
  'CHAIN-ONLY · NO DEVICE SEAL';
```

`src/screens/BunchingScreen.tsx:681` already uses the "Chain Sealed · No Device Seal" wording — match
it for consistency. Keep the amber colour for anything not `SEALED`/`SYNCED`.

## 2.5 Add a seal confirmation the officer actually sees

Right now the officer presses seal and the next thing they see is a dossier with no confirmation that
anything happened. The chain hash, the seq, and the upload state are shown **nowhere** on the sealing
path — `chainHash`, `payloadSha256`, and `sealState` appear on neither `ResultsScreen` nor
`RecordDetailScreen`. They only appear on `IntegrityScreen` and `SettingsScreen`, which the officer
must navigate to find.

Add a confirmation block to `ResultsScreen`, rendered after `appendRecord` resolves
(`ResultsScreen.tsx:174`). Reuse `StateBanner`, `TerminalBox` and `TerminalField` from
`src/components/ui/evidentiary/EvidenceBits.tsx` — the same components `AnalyzeScreen.tsx:183` and
`TamperDemoScreen.tsx:91` already use, so the language stays consistent.

It must show, on one screen, immediately after the press:

1. `RECORD SEALED` (green `StateBanner`)
2. `SEQ #n` — the ledger position
3. `CHAIN HASH` — first/last 8 hex, monospace, copyable, via `abbreviateHash`
4. `PAYLOAD SHA-256` — the JCS digest
5. The honest integrity line from §2.3
6. Upload state: `QUEUED FOR SERVER · n pending` or `SYNCED`, from `record.syncStatus`
7. Two deep links: `VIEW IN CASE LOG` → `CaseLog`, `VIEW IN AUDIT TRAIL` → `Integrity`
8. **A red banner if the database write failed** (see §2.6)

**Move the error box** from `ResultsScreen.tsx:269` to immediately above the confirm button (`:407`).
The button currently sits at the bottom of a long `ScrollView` and the error renders at the top, so
the officer's thumb and the only diagnostic are in different places. Optionally call
`scrollToEnd()` when `error` becomes non-null.

**Rename the button.** `ResultsScreen.tsx:419` currently reads `CONFIRM & VIEW FULL EVIDENCE
DOSSIER`. This is the control that actually seals, and it should say so:

> `SEAL RECORD & VIEW DOSSIER`

Keep `accessibilityLabel="Seal record and view the evidence dossier"` in sync.

## 2.6 Surface the silent write failure

`src/state/ledger-store.ts:255-262`:

```ts
try {
  await persistRecord(record);
  if (record.engineResult) await persistEngineResult(record.record_uuid, record.engineResult);
  await queueForSync(record.record_uuid, record.record_uuid);
} catch {
  // The file write failed — surface via persistence facts on next read; the in-memory
  // view stays honest for the session, syncStatus 'queued' already reflects reality.
}
```

The comment promises surfacing. **It never surfaces** — no `set({ persistence })` in the catch, and
nothing reads it on this path. Worse,
[`persistRecord`](src/db/ledger-repository.ts#L201) returns `false` rather than throwing when no
adapter is active, so on the `MemoryAdapter` path **every write is a silent no-op with zero error
signal**. The officer sees a sealed record that vanishes on the next app launch.

Fix:

```ts
let persistError: string | null = null;
try {
  const written = await persistRecord(record);
  if (!written) {
    persistError = 'no database adapter — this record is in memory only and will be lost';
  } else {
    if (record.engineResult) await persistEngineResult(record.record_uuid, record.engineResult);
    await queueForSync(record.record_uuid, record.record_uuid);
  }
} catch (err) {
  persistError = err instanceof Error ? err.message : String(err);
}
if (persistError) {
  set({ persistence: { ...state.persistence, error: persistError } });
}
```

Thread `persistError` onto the returned record (e.g. `persistFailed: true`) so the confirmation panel
in §2.5 item 8 can render **NOT WRITTEN TO THE LEDGER** in red. Honour the `false` return — that is
the branch that is currently invisible.

## 2.7 Add the seal regression tests

The reason this shipped is that **no test covers any of it**. Existing coverage is all store-level:
`tests/crypto/hash-chain.test.ts`, `tests/evidentiary/sealer.test.ts`,
`tests/evidentiary/tamper-detection.test.ts`, `tests/db/ledger-repository.test.ts:55-114`.

Add to `tests/platform/honesty-guards.test.ts` (source-level, no mounting required — screens import
`react-native`):

```ts
describe('Sealing — the control must do what its label says', () => {
  const detail = code('src/screens/RecordDetailScreen.tsx');

  it('no control on RecordDetail is labelled as a sealing action', () => {
    assert.ok(
      !/accessibilityLabel="[^"]*seal[^"]*"/i.test(detail),
      'a record on RecordDetail is already sealed; the screen must not offer a seal action'
    );
  });

  it('never fabricates a positive record for an unknown uuid', () => {
    assert.ok(
      !/CONSISTENT_WITH_REAGENT_POSITIVE/.test(detail),
      'RecordDetail must render a not-found state, not an invented positive result'
    );
  });

  it('never hardcodes a SEALED label', () => {
    assert.ok(!/>\s*SEALED \(SHA-256\)\s*</.test(detail));
  });
});

describe('Sealing — a chain-sealed record is never called PENDING SEAL', () => {
  const caseLog = code('src/screens/CaseLogScreen.tsx');
  it('the pill is derived from seal state, not from a missing attestation', () => {
    assert.ok(!/'PENDING SEAL'/.test(caseLog));
  });
});
```

And in `tests/db/ledger-repository.test.ts`, add a case that forces the adapter to be absent and
asserts `appendRecord` records a visible `persistError` rather than returning quietly.

**Verification gate for Phase 2:**

```bash
npx tsc --noEmit && npm run typecheck:server && npm test
node --experimental-strip-types --test tests/platform/honesty-guards.test.ts
```

Then walk the flow by hand: capture → results → **press seal** → the confirmation block appears with
a seq and a chain hash → `RecordDetail` shows the derived integrity line → `CaseLog` shows
`CHAIN-ONLY · NO DEVICE SEAL`, **not** `PENDING SEAL` → no screen anywhere offers a "seal" button
that only navigates.

---

# PHASE 3 — Location and time cannot be edited

**Goal:** remove every editable location/timestamp input and make the sealed value structurally
immutable at the call site.

**Depends on:** nothing.

## 3.1 What is already correct — do not "fix" it

Before changing anything, understand the existing guarantee:

- GPS is part of the sealed payload
  ([`sealedPayloadFromCore`](src/contracts/field-test-record.ts#L120) copies `gps: input.gps`).
- `canonicalizeJson` ([src/crypto/canonical-json.ts:60-70](src/crypto/canonical-json.ts#L60)) recurses
  into every object with no key allow/deny list, so `gps` **cannot** be skipped.
- `payload_sha256 = SHA256(JCS)`, `chain_hash = SHA256(prevHash + payloadSha256)`.
- Mutating `gps.lat` therefore changes the hash and the record is rejected — proven by
  [`tests/contracts/field-test-record-contract.test.ts:333,343-367`](tests/contracts/field-test-record-contract.test.ts#L333).

**The hash chain and the append-only SQL triggers already do this job.** The problem is the input
layer, and that is what this phase fixes.

## 3.2 The actual defect

`src/screens/ResultsScreen.tsx:381-390`:

```tsx
<TextInput
  value={locationStr}
  onChangeText={setLocationStr}
  placeholder="Acquiring GNSS fix…"
  style={styles.fieldInput}
/>
```

I verified `locationStr` is referenced at exactly two places: its declaration (`:76`) and this
`TextInput` (`:385`). **The typed value is silently discarded.** The sealed value comes from a
*separate* `const geo = await acquireGeoTag()` at `ResultsScreen.tsx:132`, while the *displayed* value
comes from a *second* `acquireGeoTag()` call at `:85`. Two calls, two results, one of which is shown
and the other of which is sealed. **The officer can see one location and the record contains another.**

`timestampStr` (`:392-401`) has the identical bug, and is worse because
[`ResultsScreen.tsx:245`](src/screens/ResultsScreen.tsx#L245) renders `timestampStr.split('·')[0]` in
the header badge — so the editable-looking value is also the one shown at the top of the screen.

`src/screens/RecordDetailScreen.tsx:221-228` is **already correct** — plain `<Text>`, no `useState`.
Use it as the model for what the Results screen should look like.

## 3.3 The fix

**Step 1 — hoist a single geotag acquisition.** Delete the call at `ResultsScreen.tsx:85` and the
`locationStr` / `timestampStr` state at `:76-77`. Acquire once, in the handler, and use it for both
display and seal:

```ts
const [geo, setGeo] = useState<FieldTestGps | null>(null);
const [capturedAt, setCapturedAt] = useState<string>('');

useEffect(() => {
  let cancelled = false;
  void acquireGeoTag().then((g) => {
    if (cancelled) return;
    setGeo(g);
    setCapturedAt(new Date().toISOString());
  });
  return () => { cancelled = true; };
}, []);
```

`acquireGeoTag` already has a 5-second hard timeout and returns `null` on deny/failure
([src/capture/geotag.ts:81](src/capture/geotag.ts#L81)), so this never blocks the screen.

**Step 2 — replace the two `TextInput`s with display-only rows.** Follow the `RecordDetailScreen:221-228`
pattern exactly:

```tsx
<View style={styles.fieldRow}>
  <Text style={styles.fieldLabel}>RECORDED GPS LOCATION</Text>
  <Text style={styles.fieldValue}>
    {geo
      ? `${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)} · accuracy ±${Math.round(geo.accuracy_m ?? 0)} m${geo.mocked ? ' · MOCK PROVIDER' : ''}`
      : 'No GNSS fix obtained — this record will seal without coordinates'}
  </Text>
</View>
```

**Rules for both fields:**

- **Never add a manual-entry fallback, a "correct location" affordance, or a retry-that-types.** All
  three recreate the original bug. If there is no fix, the honest answer is "no fix".
- Render `geo.mocked === true` visibly. `acquireGeoTag` already normalises it; hiding it would be a
  rule-10-adjacent untruth.
- Show `capturedAt`, never a `TextInput`, for the timestamp.

**Step 3 — make it structurally impossible to pass a different value.** Right now a caller *can*
pass any `gps` to `appendRecord`. Narrow the type so the crypto layer is the only source:

- In `src/state/ledger-store.ts`, remove `gps` from the exported `AppendInput` (`:68`).
- Add an internal-only parameter or re-derive it inside `appendRecord` from the store.
- If the geotag must be passed, accept it under a name that marks it as untrusted
  (`acquiredGps`) and normalise it in exactly one place.

The goal: **there is no code path that can construct a record with a hand-supplied location.**

## 3.4 Add database-level range checks

`src/db/app-migrations.ts:50-53` declares `gps_lat REAL, gps_lon REAL, gps_accuracy_m REAL,
gps_mocked INTEGER` — all nullable, **no CHECK constraints**. A row could hold latitude 900.

**Do not edit `MIGRATION_APP_V1`.** It will not retrofit existing installs — migrations only apply
forward. Add a new versioned migration. The file already has the pattern at `:216-234` (V4 added
`dead_lettered_at` and tolerates a `duplicate column name` error, which is exactly the tolerance you
need):

```ts
// MIGRATION_APP_V5 — bounds on recorded coordinates (AGENTS rule 2: triggers untouched,
// only new CHECKs on the same append-only table).
const MIGRATION_APP_V5 = `
  CREATE TABLE IF NOT EXISTS field_test_v5_tmp (
    ...full column list copied from V1 with the new CHECKs...
  );
  INSERT INTO field_test_v5_tmp SELECT ... FROM field_test;
  DROP TABLE field_test;
  ALTER TABLE field_test_v5_tmp RENAME TO field_test;
  -- re-create the append-only triggers: field_test_no_update / field_test_no_delete
`;
```

**This is a table rebuild. It will drop and recreate `field_test_no_update` and
`field_test_no_delete` — you MUST re-declare them in the same migration** or you will silently break
rule 2. The trigger bodies are at `app-migrations.ts:77-85`; copy them verbatim.

The new CHECKs:

```sql
CHECK (gps_lat IS NULL OR (gps_lat >= -90 AND gps_lat <= 90)),
CHECK (gps_lon IS NULL OR (gps_lon >= -180 AND gps_lon <= 180)),
CHECK (gps_accuracy_m IS NULL OR gps_accuracy_m >= 0)
```

Use the rebuild approach rather than `ALTER TABLE … ADD CONSTRAINT` **only if** your SQLite version
in CI supports it. Test both engines; `app-migrations.ts` runs against `node:sqlite` in the test
suite and against SQLCipher on device.

**Before you write this:** confirm how many rows exist. If the live device database has records, the
rebuild must preserve them — a data-loss bug in a phase about data immutability would be the worst
possible outcome. Verify with:

```bash
node --experimental-strip-types -e "
import { openAppDatabase } from './src/db/driver.ts';
" 2>/dev/null || echo "use the in-app path; do not run ad-hoc SQL against the device DB"
```

## 3.5 Add the server-side accuracy policy

`server/src/verify.ts:138-144` validates the lat/lon bounds and the `mocked` boolean, but **records no
policy** about whether the accuracy is good enough to be evidence.

Add an explicit, documented rule. Recommended, and deliberately conservative:

- `gps == null` → **allowed.** A record with no fix is a truthful record; a seizure happened whether
  or not the phone had a signal.
- `gps.mocked === true` → **allowed but flagged.** Do not reject. Record the fact.
- `gps.accuracy_m > 100` → **allowed but flagged** in `checks` so a reviewer sees it.

Never reject on accuracy alone — that would push officers toward fabricating a fix to get a record
accepted, which is precisely the behaviour rule 7 and this whole phase exist to prevent.

Add the corresponding test in `tests/sync/e2e-postgres.test.ts` or a new
`tests/contracts/gps-policy.test.ts`.

## 3.6 Add the iOS location permission string

`app.json` is missing `NSLocationWhenInUseUsageDescription`. This is Android-only today, so it is not
breaking anything, but if iOS is ever enabled the app crashes on the first geotag call. Add it
alongside the existing permission entries, with text that describes the actual use:

```json
"NSLocationWhenInUseUsageDescription":
  "Parinaam records the approximate coordinates and accuracy of a seizure so the sealed record can be tied to a place. The fix is hashed into the record and cannot be edited afterwards."
```

## 3.7 Tests

```ts
// tests/contracts/field-test-record-contract.test.ts — the existing tamper probe.
// Confirm it still passes and ADD the complementary case:
it('a record with no GPS is still valid and is not defaulted', () => {
  const record = buildRecord({ gps: null });
  const out = sealedPayloadFromCore(record);
  assert.equal(out.gps, null, 'absence of a fix must stay absence, never a zero coordinate');
  assert.equal(out.gps?.lat, undefined);
});

it('a mocked fix is preserved verbatim through the seal', () => {
  // mocked: true must survive canonicalization and the hash, not be normalised away
});
```

Plus a source guard in `tests/platform/honesty-guards.test.ts`:

```ts
it('no screen offers an editable location or timestamp field', () => {
  const results = code('src/screens/ResultsScreen.tsx');
  assert.ok(!/onChangeText=\{set(LocationStr|TimestampStr)\}/.test(results));
  // and no other screen may accept a manual coordinate
  const wizard = code('src/screens/NewTestSetupScreen.tsx');
  assert.ok(!/latitude|longitude/i.test(wizard));
});
```

**Verification gate for Phase 3:**

```bash
npx tsc --noEmit && npm test
```

Manual: open Results. Both the GPS row and the time row are plain text. Tapping them does nothing.
There is no keyboard, no cursor, no paste affordance. Seal a record and confirm the coordinates in
`payload_jcs` match the ones displayed.

---

# PHASE 4 — Location accuracy policy

**Goal:** distinguish a good fix from a bad one, everywhere, honestly.

**Depends on:** Phase 3.

## 4.1 The gap

`src/capture/geotag.ts` uses `expo-location` with `Accuracy.Balanced` and returns whatever it gets.
**There is no accuracy threshold.** A 500-metre fix seals identically to a 3-metre fix, and both are
presented with the same confidence. For a record that will be tendered in court, that is a material
distinction.

## 4.2 Add an explicit policy to `acquireGeoTag`

Do **not** silently discard a poor fix — that would recreate the fabrication problem in a new place.
Return the fix **with its accuracy**, and let the display layer grade it.

Add to `src/capture/geotag.ts`:

```ts
export type GeoQuality = 'GOOD' | 'MARGINAL' | 'POOR' | 'MOCKED' | 'NONE';

/** Rule 10 in spirit: record the achieved measurement quality, never assume it. */
export const GPS_GOOD_ACCURACY_M = 10;    // survey-grade for a handheld phone
export const GPS_POOR_ACCURACY_M = 100;   // beyond this, the fix is a region hint, not a position

export function gradeGeo(geo: FieldTestGps | null): GeoQuality {
  if (!geo) return 'NONE';
  if (geo.mocked) return 'MOCKED';
  const a = geo.accuracy_m;
  if (a == null) return 'MARGINAL';
  if (a <= GPS_GOOD_ACCURACY_M) return 'GOOD';
  if (a <= GPS_POOR_ACCURACY_M) return 'MARGINAL';
  return 'POOR';
}
```

`FieldTestGps` already has `accuracy_m: number | null`, so no contract change is needed.

## 4.3 Render the grade

In `ResultsScreen`, under the GPS row from Phase 3, add one honest line:

```tsx
<Text style={styles.fieldHint}>
  {geoQuality === 'GOOD'      ? 'Position reliable to within 10 m.' :
   geoQuality === 'MARGINAL'  ? 'Approximate position — accuracy is marginal for evidentiary use.' :
   geoQuality === 'POOR'      ? 'Position is a region hint only. Do not treat as a seizure location.' :
   geoQuality === 'MOCKED'    ? 'Coordinates came from a mock provider — not a real GNSS fix.' :
                                'No fix obtained. Coordinates are absent, not zero.'}
</Text>
```

`MOCKED` must be visually distinct — a mocked fix presented like a real one is a misrepresentation
regardless of the 3 m/500 m question.

## 4.4 Replace the hardcoded badge

Phase 0 step 0.3 made `CaptureScreen.tsx:367` honest; this step makes it *graded*. Replace the string
with a grade-driven line using the same `gradeGeo` helper, and show `POOR`/`MOCKED` in a warning
colour.

## 4.5 Add the constant to the server

Export `GPS_GOOD_ACCURACY_M` / `GPS_POOR_ACCURACY_M` from the shared contract
([src/contracts/field-test-record.ts](src/contracts/field-test-record.ts)) so the server and the app
use **one** set of thresholds. If they drift, the dashboard's grading will disagree with the phone's.

Tests: unit-test `gradeGeo` across the boundaries (exactly 10, exactly 100, null accuracy, mocked true,
null geo) in `tests/contracts/`.

**Verification gate:**

```bash
npx tsc --noEmit && npm run typecheck:server && npm test
```

---

# PHASE 5 — Geotag provenance inside the sealed payload

**Goal:** make it auditable *after the fact* whether a coordinate came from a real GNSS receiver.

**Depends on:** Phases 3, 4.

## 5.1 Why

`FieldTestGps.mocked` already exists and is already in the payload — so a mocked fix **is** already
distinguishable from a real one by anyone reading the sealed record. That part works.

What does **not** work: there is no record of the *device-side* provenance — whether the OS returned
a real fix or whether the app is running in a simulator/Expo Go, where `expo-location` can return
synthetic values with `mocked` semantics the app cannot fully control.

## 5.2 Add a provenance marker

Extend the GPS object with one field. **This is a contract change — it requires a new
`FIELD_TEST_SCHEMA_VERSION` value and coordinated changes on both sides.** Read this before starting.

Current state:
- `src/contracts/field-test-record.ts` pins `FIELD_TEST_SCHEMA_VERSION = 'parinaam-field-record-v1'`.
- `server/src/verify.ts:76-80` enforces **exact-keys**: the record must have exactly 29 keys. Adding
  one to `gps` requires the server to know about it in the same change.
- Existing stored records do **not** have the new key. The verifier must accept both shapes or a
  fresh install will not be able to read its own history.

Recommended approach — **additive and backward compatible**, avoiding a schema version bump:

```ts
// In FieldTestGps
export interface FieldTestGps {
  lat: number;
  lon: number;
  accuracy_m: number | null;
  mocked: boolean;
  source?: 'expo-location' | 'simulator' | 'manual';   // optional, additive
}
```

Then in `server/src/verify.ts`, relax the exact-keys check for `gps` specifically so `source` is
permitted and its absence is not an error. **Do not weaken exact-keys for any other object** — it is
a load-bearing integrity control.

Document the decision in `docs/known-gaps.md`: "`gps.source` is optional; records sealed before this
change have no `source` and are treated as `'expo-location'` on read."

## 5.3 Populate it

`acquireGeoTag` sets `source: 'simulator'` when `Constants.isDevice === false` or the platform
reports a development build; otherwise `'expo-location'`. **`'manual'` is deliberately never produced
by the app** — Phase 3 removed manual entry, and this constant exists so that if it ever returns, the
record will say so.

## 5.4 Verify the round trip

```ts
it('gps provenance survives canonicalization and hash verification', () => {
  const payload = sealedPayloadFromCore({ ...core, gps: { lat: 12.9, lon: 77.6, accuracy_m: 8, mocked: false, source: 'simulator' } });
  const jcs = canonicalizeJson(payload);
  assert.ok(jcs.includes('"source":"simulator"'));
  // and the server must accept a record both with and without `source`
});
```

**Verification gate:** `npx tsc --noEmit && npm run typecheck:server && npm test`, plus a live
`POST /api/v1/records` against the running stack with a record carrying `source`.

---

# PHASE 6 — Persist the achieved security level

**Goal:** satisfy AGENTS rule 10 — record what was actually achieved, never a claimed StrongBox.

**Depends on:** Phase 2.

## 6.1 The violation

`src/crypto/hardware-key.ts:112-116`:

```ts
private probeHardwareSecurityLevel(): SecurityLevel {
  // If Android StrongBox keystore feature flag is available
  // For mid-range test phones, default to TrustedEnvironment (TEE)
  return 'TrustedEnvironment';
}
```

It **hardcodes** the answer and never probes. The comment even describes an implementation that does
not exist. Per `AGENTS.md` rule 10 this is a direct violation.

## 6.2 Implement the real probe

Target: `android-key-store` or the existing native module. Check what is already a dependency before
adding anything:

```bash
grep -n "key-store\|keystore\|expo-secure-store" package.json app.json
```

The implementation must attempt, in order, and catch the specific failure:

1. `KeyGenParameterSpec.Builder(…).setIsStrongBoxBacked(true)` → if it throws
   `StrongBoxUnavailableException`, fall through.
2. TEE (`.setIsStrongBoxBacked(false)` with a `TEE` attestation challenge) → returns
   `'TrustedEnvironment'`.
3. If the keystore is unavailable entirely → `'Software'`.

**Record the achieved level inside the sealed record.** `SecurityLevel` already exists
([src/types/domain.ts:18](src/types/domain.ts#L18)) and `field_test.seal_state` already exists on
device — check whether `seal_state` is currently uploaded (it is **not**; it is a device-only column).
If it should be part of the record, that is a contract change like Phase 5.

**Until this is implemented, the honest state is what Phase 0/2 already render:** "DEVICE SEAL
UNAVAILABLE ON THIS BUILD" and "CHAIN-ONLY — NO DEVICE SEAL". Those strings are correct today. Do not
soften them.

## 6.3 Fix the per-record key minting

`src/services/analysis-pipeline.ts:68` constructs `new SealingService()` → `new HardwareKeyManager()`
**per record**, and `hardware-key.ts:126-131` auto-generates a key when the alias is unknown. Keys live
in an in-memory `Map` (`hardware-key.ts:46-55`) and are never persisted or exported.

So even in Node, where the crypto works, **no attestation would be verifiable across records** — each
record gets a different ephemeral key.

Hoist one `SealingService` to module scope and persist the key material (SecureStore on device, a
file in Node). Add a test that two records sealed in sequence share a verifiable key:

```ts
it('the integrity seal is verifiable across records', () => {
  const a = buildSealedRecord(core('a'), genesis, uuid('a'));
  const b = buildSealedRecord(core('b'), a.chainHash, uuid('b'));
  assert.ok(verifySeal(a) && verifySeal(b), 'both must verify against the same persisted key');
});
```

**Verification gate:** `npm test`, and on a real device, confirm the achieved level is read from the
platform and not a literal — `grep -rn "return 'TrustedEnvironment'" src/` must return nothing.

---

# PHASE 7 — Single source of truth for officer roles

**Goal:** the role vocabulary is written in six places; make it one, with a test that keeps it honest.

**Depends on:** nothing. **Must land before Phase 8.**

## 7.1 The duplication

| # | File:line | What it declares |
|---|---|---|
| 1 | `server/src/db.ts:22` | `OFFICER_ROLES` array |
| 2 | `server/src/user-service.ts:8` | `ROLES` array |
| 3 | `src/contracts/field-test-record.ts:36` | `OFFICER_ROLE_VALUES` |
| 4 | `src/state/auth-store.ts:25` | hand-written `OfficerRole` union |
| 5 | `server/src/migrations.ts:19` | `OFFICER_ROLES` Set |
| 6 | `server/src/migrations.ts:219` **and** `:402` | the SQL `CHECK` lists, **twice** (SQLite + Postgres) |

Plus a repair query at `migrations.ts:1379` that re-states the list.

Adding a role is a six-file edit, and the compiler gives **no help on the SQL side** — a role in
`db.ts` that is missing from the `CHECK` fails at INSERT with a raw constraint error.

## 7.2 Create the single module

New file `src/contracts/officer-roles.ts` (kebab-case per `AGENTS.md` §5):

```ts
export const OFFICER_ROLES = ['JUNIOR', 'SENIOR', 'ADMIN', 'SUPERVISOR', 'JUDICIARY'] as const;
export type OfficerRole = (typeof OFFICER_ROLES)[number];

export const PERMISSIONS = [
  'record.ingest', 'record.read.own', 'record.read.all', 'record.verify',
  'case.review', 'case.export', 'analytics.read', 'audit.read',
  'account.manage', 'event.stream',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<OfficerRole, readonly Permission[]>> = {
  JUNIOR:     ['record.ingest', 'record.read.own', 'record.verify', 'analytics.read'],
  SENIOR:     ['record.ingest', 'record.read.all', 'record.verify', 'case.review', 'case.export', 'analytics.read', 'event.stream'],
  SUPERVISOR: ['record.read.all', 'record.verify', 'case.review', 'case.export', 'analytics.read', 'audit.read', 'event.stream'],
  ADMIN:      [...PERMISSIONS],
  JUDICIARY:  ['record.read.all', 'record.verify', 'case.export', 'analytics.read', 'event.stream'],
};

export function can(role: OfficerRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission);
}
```

**This table is a pure refactor of current behaviour.** I verified each row against the live guards
(§1.1 of the RBAC investigation) — every entry corresponds to an existing check. The two deliberate
behaviour changes are in Phase 10.5 and are flagged there; **do not make them here.**

## 7.3 Repoint the other five sites

- `server/src/db.ts:22` → `export { OFFICER_ROLES } from '../src/contracts/officer-roles.ts';`
  (check the relative path; `server/` imports shared contracts already — look at
  `server/src/verify.ts` for the established pattern).
- `server/src/user-service.ts:8` → re-export.
- `src/contracts/field-test-record.ts:36` → derive `OFFICER_ROLE_VALUES` from `OFFICER_ROLES`.
- `src/state/auth-store.ts:25` → `type OfficerRole = SharedOfficerRole`.
- `server/src/migrations.ts:19` → `new Set(OFFICER_ROLES)`.

## 7.4 The SQL CHECK test

The `CHECK` lists are inherently a duplicate — SQL cannot read a TypeScript array. Make it a
**tested** duplicate:

```ts
// tests/server/officer-roles.test.ts
import { readFileSync } from 'node:fs';
import { OFFICER_ROLES, ROLE_PERMISSIONS } from '../../src/contracts/officer-roles.ts';

it('the Postgres CHECK constraint lists every role, and nothing else', () => {
  const src = readFileSync('server/src/migrations.ts', 'utf8');
  const checks = [...src.matchAll(/role IN \(([^)]*)\)/g)].map(m => m[1]);
  assert.ok(checks.length >= 2, 'both the SQLite and Postgres variants must be present');
  for (const list of checks) {
    const inSql = list.split(',').map(s => s.trim().replace(/'/g, ''));
    assert.deepEqual([...inSql].sort(), [...OFFICER_ROLES].sort());
  }
});

it('every role declares its permissions', () => {
  for (const role of OFFICER_ROLES) {
    assert.ok(Array.isArray(ROLE_PERMISSIONS[role]), `${role} has no permission list`);
  }
});
```

The first test fails loudly the moment someone adds a role and forgets the SQL. That is the whole
point.

**Verification gate:** `npm run typecheck:server && npx tsc --noEmit && npm test`.

---

# PHASE 8 — Officer schema columns  🔴 BLOCKING

**Goal:** add the columns that `departmentForOfficer` already queries for, and that the whole RBAC
model needs.

**Depends on:** Phase 7. **Must land AFTER Phase 14** (versioned migrations) — see §2 rule 1.

## 8.1 The known gap this closes

`server/src/record-service.ts:245-259`:

```ts
async function departmentForOfficer(tx: SqlStore, operatorId: string): Promise<string> {
  try {
    const row = await tx.get(`SELECT department FROM officers WHERE officer_code = ?`, operatorId);
    …
  } catch {
    // Column not provisioned yet — absence is reported, never invented.
    return 'UNSPECIFIED';
  }
}
```

**The `officers` table has no `department` column.** The `SELECT` throws, the catch swallows it, and
**every real ingested record and case is stamped `department = 'UNSPECIFIED'`.** I confirmed this
against the live database.

The honest `'UNSPECIFIED'` is the right interim behaviour — the previous hardcoded `'NCB'` was worse,
because it made an unverifiable provenance column look like a captured fact. **Do not revert that.**

The good news: the `SELECT` is already correct, so **adding the column makes the existing code work
with zero changes to `record-service.ts`.**

## 8.2 Live data residue — you must migrate it

The P0 fix only affects *new* ingests. All 15 existing `field_test` rows still carry
`department = 'NCB'` and `location_label = 'Bengaluru courier hub'`, written by `server/src/seed.ts`
at lines 105, 149, 156-157, 196.

Those values are **demo seed data**, not captured facts. Decide and implement one of:

- **(a) Leave them.** They are demo rows; `is_demo` marks them. Document the asymmetry.
- **(b) Backfill** them to `'UNSPECIFIED'` so no row claims a provenance nobody measured.

**Recommend (b)**, implemented as a one-time data migration in the new migration, guarded by
`is_demo`:

```sql
UPDATE field_test SET department = 'UNSPECIFIED' WHERE is_demo AND department = 'NCB';
UPDATE cases     SET department = 'UNSPECIFIED' WHERE department = 'NCB';
```

Run it once, in the migration, and record it in `docs/known-gaps.md`.

## 8.3 The columns

All **additive and nullable**. None of them break the dashboard team, which reads named columns.

| Column | Type | Why |
|---|---|---|
| `rank` | TEXT | Exists in the UI (`auth-store.ts:30`) and in demo records, but is **not in the database**. Exported certificates must print a rank. |
| `department` | TEXT | Closes the `UNSPECIFIED` gap. Controlled vocabulary: `NCB`, `STATE_POLICE`, `CUSTOMS`, `RAILWAYS`. |
| `unit` | TEXT | Station/zone — e.g. `NCB Zonal Office, Delhi`. What `department` deliberately cannot hold. |
| `region_code` | TEXT | Aligns with the `DZU`/`MZU`/`KZU`/`BZU` codes already inside the case refs, so scoping is possible. |
| `service_id` | TEXT | Government service identifier — the statutory anchor. `officer_code` is currently just an app-chosen string. |
| `official_email` | TEXT | `.gov.in`. DPDP-relevant (see §8.7). |
| `phone` | TEXT | Needed if OTP provisioning ever lands. DPDP-relevant. |
| `reporting_officer_code` | TEXT → `officers(officer_code)` | Who countersigned this officer's posting. **Distinct from the existing `approved_by`**, which is the *account* approver. Keep both; name them clearly. |
| `must_change_password` | INTEGER NOT NULL DEFAULT 0 | Force rotation on first login. |
| `password_changed_at` | TEXT | Feeds a rotation policy. |
| `failed_attempts` | INTEGER NOT NULL DEFAULT 0 | Real lockout (Phase 12). |
| `locked_until` | TEXT | Real lockout (Phase 12). |
| `mfa_secret` | TEXT NULL | Reserved for TOTP. Nullable so the demo needs no authenticator app. |
| `pass_algo` | TEXT NOT NULL DEFAULT `'scrypt-v1'` | **Required before any scrypt parameter bump** — without a version tag, old rows become unverifiable. |

## 8.4 Write the migration — both engines

`server/src/migrations.ts` carries **SQLite and Postgres variants side by side** (`:212-225` and
`:395-408` for `officers`). You must add the `ALTER TABLE` for **both**, and a backfill for both.

Read Phase 14 first if you have not executed it — under the current scheme this migration will be
rejected by any already-migrated database. **That is the single most likely way to get this phase
wrong.**

The Postgres `role` CHECK at `migrations.ts:402` and the SQLite one at `:219` are separate literals.
Leave them (Phase 7's test keeps them in sync).

## 8.5 Populate `field_test.officer_code`

The column exists with a foreign key to `officers(officer_code)` and an index
(`migrations.ts:235, 344`) — and **nothing ever writes it.** It is always `NULL`. I verified this
against the live database.

Today, "which account uploaded this record" is answered by a **device-asserted string** protected
only by an equality check (`verify.ts:223`). That is a reasonable control, but it is not referential
integrity.

Set it on ingest, from the **server's** authenticated officer — never from the payload:

```ts
// server/src/record-service.ts, in the field_test INSERT
officer_code: officer.officerCode,   // authenticated, not client-supplied
```

One extra column in an INSERT that already exists. It makes attribution a real FK with
`ON DELETE RESTRICT`, which in turn means **a suspended officer's records cannot be orphaned**.

**Tell the dashboard team this changes their queries:** they currently filter by `operator_id`
because `officer_code` was always null. After this phase, `officer_code` is the reliable column.
This goes in the Phase 17 changelog.

## 8.6 Backfill the new columns for the 7 seeded officers

Run against the live DB to check your migration works:

```bash
docker exec -it parinaam-app-db-1 psql -U parinaam -d parinaam -c \
  "SELECT officer_code, username, role, department FROM officers ORDER BY id;"
```

The Phase 9 seed redesign will set these properly. Until then they are `NULL` and
`departmentForOfficer` still returns `'UNSPECIFIED'` — **which is correct and must be shown as
such.**

## 8.7 DPDP Act 2023 obligations

Adding a roster of names, ranks, units and government email addresses creates real obligations. At
minimum, record these decisions in `docs/known-gaps.md`:

- **s. 5(1) purpose limitation** — the roster exists to attribute sealed records. It must not be
  repurposed for performance analytics. Note: `GET /api/v1/stats` currently exposes an `accounts`
  block (active/pending/suspended counts) to **every** role including `JUNIOR`
  (`read-service.ts:351-370`). **Restrict that to `ADMIN`/`SUPERVISOR`** in this phase.
- **s. 8(5) security safeguards** — `officers` shares a Postgres volume with the evidence. Consider a
  separate DB role so a dashboard query bug cannot dump the credential-adjacent table.
- **s. 17(1)(c)** — the roster must never enter the demo dataset, any analytics export, or any
  model-training path. Same rule as the imagery.
- **Retention** — an officer who leaves the service becomes `SUSPENDED`, never deleted. The Phase 8.5
  FK with `ON DELETE RESTRICT` enforces this once `officer_code` is populated.

**Verification gate:**

```bash
npm run typecheck:server && npm test
docker compose down -v && node scripts/start-local-stack.mjs --lan   # FRESH migration test
docker exec parinaam-app-db-1 psql -U parinaam -d parinaam -c "\d officers"
```

**Also test against an ALREADY-migrated database** — that is the case Phase 14 exists to fix. If you
executed 14 first, confirm an existing volume still boots. If you skipped 14, this is the moment it
will fail, and you should stop and go do 14.

---

# PHASE 9 — Realistic seed and credential hygiene

**Goal:** remove every plaintext password from committed source; make the seed read like real people.

**Depends on:** Phase 8.

## 9.1 What is already good

`server/src/seed.ts:23-31` has **7 plausible officers** across all 5 roles, with rank-convention
codes and 15 demo records over 4 cases that span every lifecycle stage. There are no `mewokes`. Do not
throw this away.

Two more things are already correct and must be preserved:

- `ensureAccount` (`:40-58`) is idempotent and salts each password freshly.
- `seed.ts:79-96` refuses to mix demo and real evidence, checks the ledger head, and runs in one
  transaction. This is well built.

## 9.2 The three real defects

1. **Three of the seven "officers" are role labels, not people** — "System Administrator", "Review
   Supervisor", "Judiciary Reviewer".
2. **All seven passwords are plaintext literals in committed source**, duplicated in
   `docker-compose.yml:57,145` and `.env.example:35`. Four officers share one password.
3. There is **no `rank` field at all** in the database, even though the UI has one.

## 9.3 Remove plaintext passwords — the acceptance check

The roster must carry **identity only**. The type has no password field, so the compiler enforces it.

New file `src/demo/officer-roster.ts` (identity only):

```ts
export interface OfficerRosterEntry {
  username: string;
  officer_code: string;
  display_name: string;
  rank: string;
  role: OfficerRole;
  department: string;
  unit: string;
  region_code: string;
}
export const OFFICER_ROSTER: readonly OfficerRosterEntry[] = [ … ];
```

New file `server/src/seed-officers.ts` — the seeding logic, reading one password from the
environment:

```ts
const password = process.env.PARINAAM_SEED_PASSWORD;
if (!password) {
  throw new Error('PARINAAM_SEED_PASSWORD must be set before seeding (see .env.example)');
}
if (password.length < 12) {
  throw new Error('PARINAAM_SEED_PASSWORD must be at least 12 characters');
}
```

13+ characters clears the 12-char API minimum at `user-service.ts:87`, so seeded and API-created
accounts follow the same rule.

**Delete the literals from:** `server/src/seed.ts:24-30`, `docker-compose.yml:57` and `:145`,
`.env.example:35`. Replace the compose entries with the existing `${VAR:-default}` form
(`docker-compose.yml:57` already uses it) pointing at `PARINAAM_SEED_PASSWORD`.

`.env.example` **keeps** a value (`Parinaam#2026`) — it is a committed, obviously-local development
default, exactly like the existing `POSTGRES_PASSWORD=parinaam` at `.env.example:20`. `.env` itself is
correctly gitignored (`.gitignore:14`) and untracked — leave it that way.

## 9.4 Print a credential card once

On first seed, write the roster to stdout **and** to a gitignored file
(`server/data/` is gitignored at `.gitignore:47`):

```
══ Parinaam demo officers (SYNTHETIC — local demonstration only) ══
All accounts share the demo password from PARINAAM_SEED_PASSWORD.
  gill       JUNIOR      IC-9007    Sukhdev Singh Gill          NCB Zonal Office, Delhi
  …
Full card written to server/data/DEMO-CREDENTIALS.txt (gitignored).
══════════════════════════════════════════════════════════════════
```

**The README documents where the card is, never the values.** A demo operator finds them in five
seconds; a repo clone does not ship a file that looks like a credential dump.

## 9.5 The roster — 10 officers

⚠️ **The four bolded codes must not change.**

| # | username | officer_code | display_name | rank | role | department | unit | region |
|---|---|---|---|---|---|---|---|---|
| 1 | `admin` | `OFFICER-ADMIN` | Anil Kumar Verma | Deputy Commissioner | ADMIN | NCB | NCB Headquarters, New Delhi | DZU |
| 2 | `supervisor` | `OFFICER-SUPERVISOR` | Farah Nasim Qureshi | Joint Director | SUPERVISOR | NCB | NCB Zonal Office, Mumbai | MZU |
| 3 | `iyer` | `AC-7788` | Meenakshi Iyer | Assistant Commissioner | SUPERVISOR | NCB | NCB Zonal Office, Bengaluru | BZU |
| 4 | `sharma` | **`HC-4412`** | Baljinder Singh Sidhu | Head Constable | SENIOR | NCB | NCB Zonal Office, Delhi | DZU |
| 5 | `mukherjee` | **`SI-5521`** | Priya Mukherjee | Sub-Inspector (Narcotics) | SENIOR | RAILWAYS | Kolkata Railway Parcel Intelligence Unit | KZU |
| 6 | `rao` | **`INSP-1044`** | Venkateswara Rao | Inspector | SENIOR | NCB | NCB Intelligence Bureau, Bengaluru | BZU |
| 7 | `kapoor` | `DSP-3310` | Ranjeet Singh Kapoor | Deputy Superintendent of Police | SENIOR | STATE_POLICE | Delhi Police Crime Branch, Central District | DZU |
| 8 | `patel` | `IC-2264` | Hetalben Patel | Inspector of Customs | SENIOR | CUSTOMS | Air Cargo Intelligence Cell, Delhi | DZU |
| 9 | `gill` | **`IC-9007`** | Sukhdev Singh Gill | Intelligence Officer | JUNIOR | NCB | NCB Zonal Office, Delhi | DZU |
| 10 | `reddy` | `JM-5501` | Ananya Reddy | Judicial Magistrate | JUDICIARY | JUDICIARY | Fast Track Court, Hyderabad | HYD |

**Why the four codes are frozen:** `src/demo/demo-dataset.ts` attributes the demo records to
`HC-4412` (`:99`), `IC-9007` (`:109,116,123`), `SI-5521` (`:130,137,144,151`) and `INSP-1044`
(`:171`), and `server/src/verify.ts:223` compares the sealed `operator_id` against the authenticated
officer's `officer_code`. **Renaming any of them breaks demo attribution silently** — the seed still
loads, the records just become unattributable. If you want a `DEMO-` prefix for honesty (I recommend
it, for the same reason as known-gaps 5.3), it must land in `demo-dataset.ts` **in the same commit**,
and both changes must be verified together.

Spanning two departments and three regions is deliberate: it makes a future unit-scoped read filter
demonstrable rather than theoretical.

## 9.6 Fix the misleading demo identity

`src/state/auth-store.ts:36-44`:

```ts
/** The single seeded device profile (admin/adminpass) — honest demo identity. */
export const DEMO_OFFICER: Officer = {
  id: 'OFFICER-ADMIN', name: 'IC-9007 Gill', rank: 'Duty Officer',
  badge: 'IC-9007', role: 'ADMIN', username: 'admin',
};
```

The admin's `id` wearing Gill's badge and name. Harmless today, actively confusing once there is
more than one officer. Make the fields agree.

## 9.7 The acceptance check

This is the verification for the whole phase:

```bash
grep -rn "parinaam-admin-2026\|parinaam-officer-2026\|parinaam-super-2026\|parinaam-jud-2026" \
  server/ src/ scripts/ docker-compose.yml
# MUST return nothing.

grep -n "password" docker-compose.yml | grep -v "PARINAAM_SEED_PASSWORD\|POSTGRES_PASSWORD"
# MUST return nothing (no bare literals).
```

Then reset and re-seed:

```bash
docker compose down -v && node scripts/start-local-stack.mjs --lan
docker exec parinaam-app-db-1 psql -U parinaam -d parinaam -c \
  "SELECT officer_code, display_name, rank, role, department, unit FROM officers ORDER BY id;"
# 10 rows, no NULLs in the new columns, three real departments.
```

**Verify `departmentForOfficer` now works with no code change:** seal a record from the device and
check the new row's `department` is a real value, not `'UNSPECIFIED'`.

---

# PHASE 10 — Consolidate the role guards

**Goal:** one declarative permission table, one guard function, one row-visibility rule.

**Depends on:** Phases 7, 8.

## 10.1 What exists today

Five hand-written guards across three files, plus seven inline row-scope checks:

- `writer()` — `server/src/routes.ts:47-53`
- `requireReviewer()` — `server/src/case-service.ts:16-22`
- `requireAdmin()` — `server/src/case-service.ts:24-28`
- `canReadOfficerRecord()` — `server/src/case-service.ts:46-48`
- `requireAuditRole()` — `server/src/audit-service.ts:6-12`
- row scoping: `read-service.ts:84, 207, 228, 231, 277, 285, 286` and `export-service.ts:30-31`

**The good news:** all of them are real and server-side. I verified there is **zero client-side role
gating** — the only two role references in `src/` are a data stamp (`ResultsScreen.tsx:168`) and a
text label (`SettingsScreen.tsx:182`). The server is the single authority, which is the right
architecture. This phase does not change that; it centralises it.

## 10.2 Create `server/src/rbac.ts`

```ts
import type { AuthedOfficer } from './auth.ts';
import { can, type Permission } from '../src/contracts/officer-roles.ts';
import { ApiError } from '../src/contracts/api-errors.ts';

export function requirePermission(officer: AuthedOfficer | null, permission: Permission): AuthedOfficer {
  if (!officer) throw new ApiError(401, 'AUTH_REQUIRED', 'authentication required');
  if (!can(officer.role, permission)) {
    throw new ApiError(403, 'PERMISSION_DENIED', `this action requires ${permission}`, false, { permission });
  }
  return officer;
}

/** Row-level visibility. ONE place decides what a role can see. */
export function visibilityScope(officer: AuthedOfficer): { sql: string; params: unknown[] } {
  return can(officer.role, 'record.read.all')
    ? { sql: '', params: [] }
    : { sql: ' AND f.operator_id = ?', params: [officer.officerCode] };
}
```

**⚠️ Error-code compatibility.** `PERMISSION_DENIED` is a **new** code. Today each guard raises a
specific one — `INGEST_ROLE_REQUIRED`, `REVIEW_ROLE_REQUIRED`, `ADMIN_REQUIRED`, `AUDIT_ROLE_REQUIRED`,
`STREAM_ROLE_REQUIRED`. **The dashboard team may key off those strings.**

Two options:

- **(a) Safe:** pass the legacy code into `requirePermission` so each route keeps its existing code.
- **(b) Clean:** adopt `PERMISSION_DENIED` and put the legacy code in `details.legacy_code`.

**Recommend (a) for this pass.** The consolidation is a refactor; do not bundle a breaking API change
into a refactor. Phase 17 tells the dashboard team about the structure; a later phase can change the
codes deliberately.

## 10.3 One route→permission map

In `server/src/routes.ts`, next to the route table it describes:

```ts
export const ROUTE_PERMISSIONS: Readonly<Record<string, Permission | null>> = {
  'GET /api/v1/health':                     null,
  'POST /api/v1/auth/login':                null,
  'POST /api/v1/auth/logout':               null,
  'GET /api/v1/auth/me':                    null,
  'POST /api/v1/records':                   'record.ingest',
  'PUT /api/v1/records/:uuid/evidence':     'record.ingest',
  'PATCH /api/v1/cases/:caseRef/status':    'case.review',
  'PATCH /api/v1/cases/:caseRef/panchnama': 'case.review',
  'GET /api/v1/users':                      'account.manage',
  'POST /api/v1/users':                     'account.manage',
  'PATCH /api/v1/users/:username':          'account.manage',
  'GET /api/v1/audit':                      'audit.read',
  // every other authenticated route defaults to 'record.read.own'
};
```

Apply it in `server/src/main.ts`, right after `authenticate()` — one guard replaces the per-handler
calls:

```ts
const needed = ROUTE_PERMISSIONS[routeKey] ?? 'record.read.own';
if (needed) requirePermission(authed, needed, LEGACY_CODE[routeKey]);
```

The SSE stream moves to `requirePermission(authed, 'event.stream')`, which closes the `JUDICIARY`
leak in §10.5 for one line.

## 10.4 The escape-hatch test

The failure mode this prevents is "someone adds a route and forgets the guard". Make it impossible:

```ts
it('every authenticated route declares a permission', () => {
  for (const key of Object.keys(routes)) {
    if (PUBLIC_ROUTES.has(key)) continue;
    assert.ok(key in ROUTE_PERMISSIONS,
      `route ${key} has no declared permission — add it or it ships unguarded`);
  }
});
```

## 10.5 Two deliberate behaviour changes — confirm before shipping

**These need the owner's explicit yes.** Everything else in this phase is behaviour-preserving.

1. **Give `JUDICIARY` `audit.read`.** Today a judicial reviewer gets 403 on `/audit`
   (`audit-service.ts:8`). For the one role whose function is evidentiary transparency, that looks
   wrong. The route returns only `id/actor/action/subject/at/detail` — no message content, no PII
   beyond the actor's own username. **Currently denied; proposed: allowed.**
2. **Deny `JUDICIARY` the SSE stream.** `main.ts:236` excludes only `JUNIOR`, so judiciary currently
   receives global record-ingest and case-status events. `server/README.md:208` calls the stream a
   "reviewer role" capability, and judiciary is not one. **Currently allowed; proposed: denied.**

**If the owner does not answer, keep current behaviour and leave the table in `ROLE_PERMISSIONS`
exactly as Phase 7 wrote it.** The consolidation still works; only the two values differ.

## 10.6 Verify the matrix did not change

Capture the effective matrix before and after, and diff. `tests/server/api.test.ts` already exercises
these paths; run it and confirm no test needed changing except where the two deltas apply.

Add an explicit matrix test that walks `OFFICER_ROLES × every route` and asserts the expected
status code. This is the artefact the dashboard team can read.

**Verification gate:** `npm run typecheck:server && npm test` — **zero** changes to existing
permission tests unless you took one of the two deltas.

---

# PHASE 11 — Make the device gate honest  🔴 P0

**Goal:** the app must stop handing `ADMIN` to anyone who unlocks the phone.

**Depends on:** Phases 8, 10. This is the largest single piece of work in version4.

## 11.1 The defect, verified

`attempt(username, password)` at `src/state/auth-store.ts:198-219` is the **only** caller of
`verifyCredential`. **No screen ever calls it** — only
`tests/auth/credential-auth.test.ts:48` does. I confirmed this with a grep across `src/screens/` and
`src/components/`: zero call sites.

The real login screen (`src/screens/LoginScreen.tsx:38-40`) uses three paths, and **all three succeed
unconditionally**:

| Path | Lines | Behaviour |
|---|---|---|
| `attemptBiometric` | `auth-store.ts:113-153` | **Cannot fail** — no hardware → `'ok'`; not enrolled → `'ok'`; any throw → `'ok'` (catch at `:146`) |
| `attemptMpin` | `auth-store.ts:155-165` | Accepts `savedMpin` **or** `'1234'` **or** `'9007'` |
| `attemptPhoneOtp` | `auth-store.ts:167-190` | Accepts **any** `otp.length >= 4`. No OTP is ever dispatched. |

I read all three. Each one mints a session for the hardcoded `DEMO_OFFICER`, whose `role` is `'ADMIN'`.

Consequences:
- The 5-attempt / 60-second lockout (`auth-store.ts:48-49, 205-213`) is **unreachable**.
- It is also **reset by `restore()`** (`:109`) on every app start.
- `restore()` (`:106`) pre-loads `officer: DEMO_OFFICER` before any unlock.

**The demo credential** is `admin` / `adminpass`
([`src/auth/credential-verifier.ts:22-26`](src/auth/credential-verifier.ts#L22)) — I recomputed the
digest and it matches. The KDF is a single unsalted SHA-256, not scrypt.

## 11.2 The design tension — decide this before you write code

The app is offline-first by charter (`AGENTS.md` §1: 100% offline in flight mode). **Server-enforced
RBAC is worthless offline.** Today that tension is hidden because the device gate grants `ADMIN`
unconditionally — offline implicitly means "always the most privileged role", which is the worst
possible default and is invisible only because the app has no role UI.

Any real fix forces an explicit choice:

- **(a) Offline-capable RBAC.** The server issues a **signed, time-bounded role grant** the app caches
  in SecureStore and verifies offline with a bundled public key. A signature needs only the public key
  on the device, so offline verification works and forgery does not. Lifetime 72 h; a `jti` for
  single revocation; a hard **"CREDENTIALS EXPIRED — RECONNECT REQUIRED"** state; and the grant id
  plus its role must travel **inside the sealed record payload**, so a record sealed offline is
  auditable against the exact grant that authorised it. ~80 lines plus a renewal path.
- **(b) Server-only RBAC.** Honest, and it means an offline officer cannot seal anything — which
  defeats the product's reason to exist.

**Recommendation: (a).** It keeps the offline promise while making the offline role decision
*provable* rather than *asserted*. But **this needs the owner's sign-off**, because it changes what
the sealed payload contains (a contract change, like Phase 5).

**If the owner declines (a), ship the minimum honest version instead:** the gate stops minting
`ADMIN`; it mints whatever the last server-confirmed role was; when offline past the grant lifetime
the app shows **"DEVICE GATE — OFFLINE, NO ROLE GRANT"** and refuses to claim any role. That is
strictly better than today and requires no contract change.

## 11.3 The work (option a)

**Step 1 — remove the bypasses.** In `attemptBiometric`, `attemptMpin`, `attemptPhoneOtp`:

- `attemptBiometric` must **return a failure** when there is no hardware, nothing is enrolled, or the
  check throws. A catch-all that returns `'ok'` is the bug. Change the catch at `:146` to return
  `'bad-credentials'`.
- `attemptMpin` must accept **only** the saved MPIN. Delete the `|| mpin === '1234' || mpin === '9007'`
  at `:157`. If the device has never set one, the default `'1234'` at `:156` must be replaced by a
  **first-run enrolment** that requires the officer to choose a PIN.
- `attemptPhoneOtp` **must not exist in this form.** Accepting any string of length ≥ 4 is not
  authentication. Either implement a real challenge (which needs the server and a real channel — out
  of scope for this phase) or **delete the path and its UI**. **Deleting is correct today.** Remove the
  "Try default demo MPIN: 1234" hint at `LoginScreen.tsx:92` as well.

**Step 2 — wire the dead verifier.** `attempt()` at `:198-219` is written and tested but unreachable.
Either call it from the login screen or delete it. **Call it** — but replace the single-round
SHA-256 KDF at `credential-verifier.ts:36-38` with a real one, or move verification server-side
entirely, which option (a) does.

**Step 3 — make the lockout real.** `MAX_FAILED_ATTEMPTS` / `LOCKOUT_MS` (`:48-49`) must be enforced on
whatever paths remain, and `restore()` (`:109`) must **not** clear `failures`/`lockedUntil`.

**Step 4 — the signed grant.** Server issues; app caches and verifies. Store in SecureStore. Include
`grant_id`, `role`, `issued_at`, `expires_at` in the sealed payload if the owner approves option (a).

**Step 5 — make the state visible.** Add a "DEVICE GATE — DEMO MODE" / "ROLE GRANT EXPIRED" banner
(`StateBanner` from `src/components/ui/evidentiary/EvidenceBits.tsx`). The officer must always be able
to see **which role the app currently believes they have, and when it expires.**

## 11.4 The identity split — fix it here or the demo breaks

`verify.ts:223` requires `record.operator_id === officer.officerCode`. `operator_id` comes from the
**device gate** (`currentOperatorId()`, `auth-store.ts:232-234`, currently always `'OFFICER-ADMIN'`);
`officerCode` comes from the **API bearer token** entered in Settings.

**They agree today only because both default to admin.** The moment a demo operator types `gill` /
`IC-9007` into Settings › Server account, **every upload returns 403 `operator-binding-mismatch` and
the outbox fills with dead letters.** This is the single most likely way this phase will look "broken"
in a live demo.

Fix it: derive `operator_id` from the **server-confirmed** officer identity, not the device gate. This
must land with Phase 11, not after it.

## 11.5 Tests

```ts
it('no unlock path mints a session without verifying a credential', () => {
  // attemptBiometric must not return 'ok' on no-hardware
  // attemptMpin must reject '1234' and '9007'
  // assert no code path sets role:'ADMIN' unconditionally
});

it('the lockout is not cleared by restore()', () => { /* ... */ });

it('an offline role grant expires and is visibly expired', () => { /* ... */ });
```

Add a source guard in `honesty-guards.test.ts` asserting `DEMO_OFFICER` is not assigned a role that
is used as an authorisation input without a grant.

**Verification gate:** `npm test`, plus a manual walk on a real device: wrong MPIN 5× → locked;
restart → still locked; unlock → role shown and sourced from a server grant, not a literal.

---

# PHASE 12 — Session and auth audit hardening

**Goal:** the server must be able to prove who was **denied**, not only who logged in.

**Depends on:** Phase 8.

## 12.1 What is already correct — do not touch

- scrypt `N=16384, r=8, p=1`, 32-byte key, 16-byte random salt (`server/src/db.ts:57-64, 107-120`)
- `timingSafeEqual` comparison (`db.ts:132`)
- tokens are 256-bit random, only `sha256(token)` is stored (`auth.ts:162, 177-184`)
- **dummy-hash constant-time defence** against user enumeration (`auth.ts:55-56, 154-156`) — good, keep
- `status !== 'ACTIVE'` re-checked on every authenticate (`auth.ts:230-233`), so suspension kills live
  tokens immediately
- sessions revoked on password change (`db.ts:387-415`)
- `LAST_ACTIVE_ADMIN` guard (`user-service.ts:152-160`)

I verified the rate limiter works against the live DB: 30 `login-failed` and 5 `login-rate-limited`
rows.

## 12.2 The gaps

**(a) Rate limiting is in-process and is a throttle, not a lockout.** `buckets` is a module-level
`Map` (`auth.ts:57`): **a restart clears every counter**, and it does not survive a second replica.
The key is `(ip, username)`, so an attacker rotating source IPs is entirely unthrottled. There is no
`failed_attempts`/`locked_until` on the officer row, so there is nowhere to put a real lockout until
Phase 8 lands. **Add both columns in Phase 8 (done) and use them here.**

**(b) `logout` is not audited.** `auth.ts:237-239` deletes the session row and writes nothing.

**(c) `authenticate()` failures are not audited.** A bad, expired, or revoked token returns `null` at
`auth.ts:224, 232, 234` and leaves **no trace**.

**(d) 403 authorization denials are not audited.** A `JUNIOR` hammering `/users` leaves no record.

**Net effect: you can prove who logged in and who changed what, but you cannot prove who was denied,
who logged out, or how long a session lived.** `server_audit` is already append-only with triggers, so
these are cheap inserts.

**(e) `/auth/login` does not return `expires_at`.** The client already looks for it
([`src/sync/http-client.ts:78`](src/sync/http-client.ts#L78)) and falls back to guessing 11 h, while
the server TTL is 12 h (`auth.ts:50`). Two sides independently guessing the same number.
**Add `expires_at` to the login response** — one line, and it is a strict improvement. Note it in the
Phase 17 changelog; the dashboard may cache sessions.

**(f) `pass_algo` before any parameter bump.** Phase 8.3 adds the column. If you bump scrypt to
`N=2^17` (current OWASP guidance) in this phase, the tag is mandatory — otherwise old rows become
unverifiable. Re-verify on login and re-hash on success.

## 12.3 Implement

1. Add `failed_attempts` / `locked_until` handling backed by the new `officers` columns. Persisted, so
   it survives restart and is shared across replicas.
2. Audit `logout`.
3. Audit `authenticate()` failures — careful: **do not log the token.** Log the request id, IP, and the
   reason (`missing` / `malformed` / `expired` / `revoked` / `not_active`).
4. Audit 403 denials with the route key and the required permission.
5. Add `expires_at` to the login response.
6. Add a session-cleanup job on `idx_sessions_expiry`.
7. **Optionally** move the rate limiter to the DB entirely, which subsumes (a).

**Audit volume warning:** auditing every failed authenticate could grow `server_audit` quickly under
brute force. It is append-only, so rows can never be deleted by the app. Consider sampling for the
repeat-offender case, or move superseded auth-failure rows to a partitioned table outside the
append-only set.

**Verification gate:** `npm run typecheck:server && npm test`, then:

```bash
docker exec parinaam-app-db-1 psql -U parinaam -d parinaam -c \
  "SELECT action, count(*) FROM server_audit GROUP BY 1 ORDER BY 2 DESC;"
# must now include 'logout', 'auth-failed', 'permission-denied'
```

---

# PHASE 13 — Fix the SQLCipher / sync fork  🔴 P0

**Goal:** encryption and sync must both work. Today they are mutually exclusive.

**Depends on:** nothing. **Must land before Phase 15.**

## 13.1 The fork

Two connections open the same file, `parinaam.db`:

- `src/db/driver.ts:164-190` — the **keyed** connection.
  `openDatabaseAsync('parinaam.db')` followed by `db.execAsync(cipherKeyPragma(keyHex))` where the key
  comes from the SecureStore alias `parinaam_sqlcipher_key`. It probes `PRAGMA cipher_version` to
  report `encryption: 'sqlcipher' | 'none'` honestly.
- `src/sync/db-shim.ts:36` — the **unkeyed** connection.
  `SQLite.openDatabaseSync('parinaam.db')` with **no `PRAGMA key`**.

`app.json:35-37` sets the `expo-sqlite` plugin `useSQLCipher: true`. So on a real build:

- the first query through the shim (`outbox.ts:57`) throws `SQLITE_NOTADB`,
- the throw is swallowed at `sync-store.ts:341`,
- **the outbox never drains.** Sealed records never reach the server.

On Expo Go, where SQLCipher is absent, the same build has a **plaintext ledger** and working sync.

**Either sync is dead, or encryption is dead. Never both.** That is the fork.

**CI does not catch this** because the test suite exercises the `isNode` branch, which uses
`node:sqlite` — no encryption there, so the unkeyed path works and the bug is invisible.

## 13.2 The fix

**Delete the unkeyed connection.** Reuse the already-keyed handle from `openAppDatabase()`.

Make `DbAdapter` satisfy the sync contract, so `db-shim.ts` becomes an adapter over the real driver
rather than a second connection. Look at `src/db/driver.ts:124-142` (`MemoryAdapter`) and
`src/sync/sync-store.ts:126` (`buildEngine()`) for the seam.

Add an **assertion at startup** so this class of bug can never return silently:

```ts
const encryption = await probeEncryption(db);       // driver.ts already has this
if (encryption === 'sqlcipher' && !syncUsesSameHandle) {
  throw new Error('sync connection is not using the SQLCipher-keyed handle — refusing to run');
}
```

Prefer an assertion that **fails loudly** over one that degrades. A silent no-op is how this bug
survived.

## 13.3 Add a test that reproduces it

This is the test CI was missing:

```ts
// tests/sync/sqlcipher-fork.test.ts
it('the sync engine and the ledger use the same connection', () => {
  // If they are different handles, the sync query must throw SQLITE_NOTADB
  // under SQLCipher. Assert it does not, or assert the startup guard rejects it.
});
```

Mock `PRAGMA cipher_version` to return a value. If sync still works against an encrypted handle, the
fork is closed.

## 13.4 Verify on a real device

CI cannot prove this. It requires a SQLCipher build:

```bash
npx expo run:android    # a dev build, NOT Expo Go
```

Then confirm: seal a record → watch the sync indicator → check the row arrived:

```bash
docker exec parinaam-app-db-1 psql -U parinaam -d parinaam -c \
  "SELECT seq, record_uuid, case_ref, outcome FROM field_test ORDER BY seq DESC LIMIT 5;"
```

And confirm the device database is genuinely encrypted (it should fail to read as plain SQLite):

```bash
adb shell "run-as com.parinaam.app sqlite3 databases/parinaam.db 'SELECT count(*) FROM field_test;'"
# MUST fail with "file is not a database" or similar
```

**If that command succeeds, the ledger is plaintext and the device is not secure.** Stop and fix
`app.json` / the key provisioning before doing anything else.

**Verification gate:** `npm test` **and** the on-device check above. This phase is not complete until
both pass.

---

# PHASE 14 — Version the server migrations  🔴 BLOCKING

**Goal:** make schema evolution possible. Today, adding any column bricks every existing database.

**Depends on:** nothing. **Must land before Phase 8.**

## 14.1 The landmine

`server/src/migrations.ts`:

- `migrationChecksum()` (`:1769-1777`) hashes **all current DDL**.
- `readAppliedVersion` (`:1798-1800`) throws
  `schema migration 1 does not match this server build` when the checksum differs.
- `LATEST_SCHEMA_VERSION` is pinned at **1**.

So the moment anyone adds a column — including Phase 8's `officers` additions — **the server refuses
to boot against any already-migrated database.** Migrations do run fine on a *fresh* database
(`:1805-1847`, covered by `tests/sync/e2e-postgres.test.ts`), which is why this has never surfaced.

`pg_advisory_xact_lock(1937001, 1)` at `:1818` is correct and should be kept.

## 14.2 The fix

Convert the single "version 1 = everything" migration into a **numbered sequence**, where each
version's checksum covers only the DDL **it introduced**:

```ts
interface MigrationStep {
  version: number;
  name: string;
  /** Only the DDL this step introduced. A later edit to an earlier step is a bug, not a new migration. */
  sql: (engine: 'sqlite' | 'postgres') => string;
  checksum: () => string;   // sha256 of this step's own SQL
}

const MIGRATIONS: readonly MigrationStep[] = [
  { version: 1, name: 'server_schema_v1',  sql: baseline,   checksum: hashOf(baseline) },
  { version: 2, name: 'officer_profile',  sql: officerCols, checksum: hashOf(officerCols) },
  // …
];
```

Apply in order inside one transaction under the advisory lock. `readAppliedVersion` then validates
only that each already-applied step's checksum still matches — so an edit to version 1 is still caught
(you cannot rewrite history), while a **new** version 2 applies cleanly to an existing database.

Baseline the current DDL as version 1 with today's checksum so existing databases are accepted as-is:
their `schema_migrations` row already records that checksum.

## 14.3 Test both directions

```ts
it('a NEW migration applies to an ALREADY-migrated database', () => {
  // migrate to v1 with the current code, then apply a v2 that adds a column
  // the second migrate must succeed
});

it('an EDITED v1 is still rejected', () => {
  // proves the append-only guarantee for migration history
});
```

The first test is the one that would have caught this. It must run against Postgres
(`tests/sync/e2e-postgres.test.ts` is the right home), because SQLite's migration path is different
and both need coverage.

## 14.4 Add a data-migration mechanism

Phase 8.2 needs a one-time `UPDATE` (backfilling `department` to `'UNSPECIFIED'`). DDL steps cannot do
that. Add an optional `dataSql` field to `MigrationStep`, run in the same transaction, and record
that it ran so it is never applied twice:

```ts
{ version: 3, name: 'clear_unverified_demo_department',
  sql: () => '',                                   // no DDL
  dataSql: `UPDATE field_test SET department='UNSPECIFIED' WHERE is_demo AND department='NCB';` }
```

**These run against append-only tables.** `field_test` has a `BEFORE UPDATE` trigger that raises
`RAISE(ABORT)` (rule 2). **A backfill `UPDATE` on `field_test` will be blocked.**

Options, in order of preference:

1. **Do not backfill `field_test`.** Leave the 15 demo rows as they are. They are demo rows, marked
   `is_demo`. `cases` has **no** append-only trigger, so backfilling `cases` is safe. **Recommend
   this** — it keeps rule 2 absolutely intact.
2. If the demo rows must be corrected, do it by **re-seeding**, never by `UPDATE`.

**Decide this before writing the migration.** Option 1 is strongly preferred.

**Verification gate:** `npm run typecheck:server && npm test`, plus the manual check that a
populated volume still boots after adding a migration.

---

# PHASE 15 — Sync queue correctness

**Goal:** stop re-uploading dead-lettered rows forever; make the pending count truthful.

**Depends on:** Phase 13.

## 15.1 The dead-letter loop

`src/sync/outbox.ts:51-55` — the pending-rows query has **no `dead_lettered_at IS NULL` filter**. I
verified this by reading it.

A dead-lettered row is therefore re-selected on every drain, re-uploaded, rejected, marked
`dead_lettered_at` again, and retried — **forever**, appending an `audit_log` row each time.
Unbounded growth, and a permanently "not clear" outbox.

Note the inconsistency this creates: `src/db/ledger-repository.ts` **does** filter correctly —
`pendingCountDb` (`:359`) and `pendingEntriesDb` (`:375`) both check
`dead_lettered_at IS NULL`. **The repository is right; the outbox is wrong.** Copy the repository's
predicate.

`getPendingCount()` (`outbox.ts:115-117`) counts **all** rows, which contradicts `pendingCountDb()`.
The UI therefore shows records pending that the outbox is not actually retrying.

## 15.2 The fixes

```ts
// outbox.ts:51-55 — add the filter, matching ledger-repository.ts:359
const rows = await db.all<SyncQueueRow>(
  `SELECT * FROM sync_queue
    WHERE next_attempt_at IS NULL OR next_attempt_at <= ?
      AND dead_lettered_at IS NULL
    ORDER BY next_attempt_at ASC`, [now]);
```

```ts
// outbox.ts:115-117 — count only what will actually be retried
export function getPendingCount(): number {
  return db.getSyncQueueCount({ includeDeadLettered: false });
}
```

**Do not delete dead-lettered rows.** `app-migrations.ts:129-138` explains why, and the reason is
excellent: deleting them made an unuploaded record vanish while the ledger still said `queued` and the
UI said "outbox clear" — **evidence loss disguised as success.** Dead-lettered records must stay
visible on the device forever.

## 15.3 Idempotency on enqueue

`outbox.ts:38-43` `queueRecord` lacks `INSERT OR IGNORE`. `sync_queue.record_uuid` and
`idempotency_key` are both `UNIQUE`, so a double-enqueue throws. The requeue path
(`requeueDeadLetteredDb`, `ledger-repository.ts:402`) can race the drain loop. Add `OR IGNORE`.

## 15.4 Backoff is already correct

Exponential, capped at 1 hour, with `PREV_HASH_NOT_STORED` treated as retryable (it is
`retryable: true` at the server, so the client's triage rule
([`http-client.ts:107`](src/sync/http-client.ts#L107)) classifies it as transient). **Leave this
alone** — it is right, and dead-lettering a `PREV_HASH_NOT_STORED` would lose evidence that was
merely ahead of its predecessor.

## 15.5 Sync more tables

Device `audit_log` and `camera_engine_result` never reach the server. Decide per table:

- `audit_log` — **should sync.** It is the officer's local record of what the device did. Leave it
  device-only if it is purely a diagnostic; the server already has its own `server_audit`.
- `camera_engine_result` — **should stay local.** It contains raw engine diagnostics. Uploading it
  risks pushing calibration internals the officer did not observe. Document the decision either way.

**Both are "what actually reaches the server" questions, and the dashboard team will ask.** Phase 17
must answer them explicitly.

**Verification gate:** `npm test`, plus a new test:

```ts
it('a dead-lettered row is never re-uploaded', () => { /* ... */ });
it('getPendingCount() excludes dead-lettered rows', () => { /* ... */ });
```

---

# PHASE 16 — Cloud-deploy hardening

**Goal:** nothing in the default configuration should be unsafe if someone runs this on a cloud VM.

**Depends on:** nothing. Independent of everything else.

## 16.1 The four defaults that ship

```bash
grep -nE "POSTGRES_PASSWORD|PARINAAM_API_ADMIN_PASSWORD|PARINAAM_SEED" docker-compose.yml .env.example
```

I ran this. Current state:

- `docker-compose.yml:23` — `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-parinaam}`
- `docker-compose.yml:55, 144` — `DATABASE_URL: postgres://${POSTGRES_USER:-parinaam}:${POSTGRES_PASSWORD:-parinaam}@db:5432/…`
- `docker-compose.yml:57, 145` — `PARINAAM_API_ADMIN_PASSWORD: ${PARINAAM_API_ADMIN_PASSWORD:-parinaam-admin-2026}`
- `docker-compose.yml:61` — `PARINAAM_SEED: ${PARINAAM_SEED:-1}`
- `.env.example:20, 35, 39` — the same three values

**`PARINAAM_SEED=1` by default means a fresh cloud deployment is silently populated with 15 synthetic
demo records** that look exactly like real evidence. The demo rows are marked `is_demo`, but a
dashboard that does not filter will show them as seizures. For a law-enforcement system this is the
worst possible default.

## 16.2 The fixes

1. **`POSTGRES_PASSWORD` must have no default.** Use `${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}`
   — the `:?` form fails loudly at compose time with a clear message. Remove the fallback.
2. **Same for `PARINAAM_API_ADMIN_PASSWORD`**, and raise the minimum to 16 characters. Note the
   bootstrap path at `main.ts:192` already enforces a 10-char minimum.
3. **Default `PARINAAM_SEED` to `0`.** Demo data must be an explicit opt-in. Document
   `PARINAAM_SEED=1` prominently in `server/README.md`.
4. **Remove the literal `'adminpass'`** at `server/src/db.ts:224` — the `:memory:` fallback. Require
   `PARINAAM_BOOTSTRAP_ADMIN_PASSWORD` even for in-memory databases.
5. **Document the DPDP/section-8(5) separation**: use a separate Postgres role for the officer roster
   so a dashboard query bug cannot dump the credential-adjacent table.
6. **`app.json` sets `usesCleartextTraffic: true`** for the LAN stack. Add a `network_security_config`
   that permits cleartext **only** for the private ranges the local stack uses
   (`10.0.2.2`, `192.168.x.x`, `localhost`), and denies it everywhere else.
7. **`server/data/parinaam-server.db`** — I checked; it is **not** tracked by git, so this is already
   correct. Verify `.gitignore` keeps it that way.

## 16.3 Deployment checklist to add to `server/README.md`

```bash
# minimum before any non-localhost deployment
[ ] POSTGRES_PASSWORD set, 16+ chars, no default in compose
[ ] PARINAAM_API_ADMIN_PASSWORD set, 16+ chars
[ ] PARINAAM_SEED=0                      (or accept synthetic demo data)
[ ] PARINAAM_CORS_ORIGINS set to the real dashboard origin (NOT *)
[ ] TLS terminated upstream; app does NOT use usesCleartextTraffic
[ ] Postgres not exposed to the public interface (db.ports removed or bound to 127.0.0.1)
[ ] Server credentials issued per officer, not the shared demo password
```

**⚠️ The CORS item is a real trap.** `main.ts:50-58` reads `PARINAAM_CORS_ORIGINS`, defaulting to
`http://localhost:8081,http://127.0.0.1:8081`, and a `*` in the list reflects any origin. **The
dashboard team's origin must be in this list or every browser call fails** with a CORS error. Call
this out in Phase 17.

**Verification gate:** `docker compose config` succeeds with the env vars set; `docker compose up`
from scratch produces **zero** seeded records; `curl -s localhost:8571/api/v1/health | jq .records`
returns `0`.

---

# PHASE 17 — Documentation for the dashboard team  🔴

**Goal:** a teammate in a different repository can integrate against this API and this database
without reading any Parinaam source code.

**Depends on:** all documentation-affecting phases above.

## 17.1 The situation

`server/openapi.yaml` **already exists and is good**: valid OpenAPI 3.0.3, 40 KB, 19 paths /
22 operations / 37 schemas, `bearerAuth` defined. I confirmed **every documented endpoint answers
200** against the live stack.

**It is stale.** Last touched at commit `1682b51`, before the 2026-09-25 P0 fixes and the
2026-09-28 teammate merge. It is missing everything from those changes.

`server/README.md` (13 KB) is also good — HTTP conventions, record contract, seed accounts, a worked
curl workflow, verification commands.

**But it overstates one thing:** it claims `server/src/` contains "RBAC". **No such file exists.**
Phase 10 creates `server/src/rbac.ts`, which will make that claim true.

## 17.2 Deliverable A — refresh `openapi.yaml`

Re-verify every operation against the running server and update:

- All error responses added since 2026-09-24 (the P0 batch and the merge).
- The `GET /api/v1/auth/login` response — note `POST /auth/login` returns `{ token, officer: {...} }`
  (nested) while `GET /auth/me` returns the fields **flat**. This asymmetry is a real integration
  trap; make it explicit in the descriptions.
- `expires_at` on the login response, **if Phase 12 landed**.
- The case-status transition graph, with `REVIEWED` marked terminal and `details.allowed[]` documented
  on `INVALID_STATUS_TRANSITION`.
- `POST /api/v1/records` returns **201 on first store and 200 on replay/already-stored** — document
  that clients must read `body.status`, not assume 201.
- `POST /api/v1/records/verify` accepts `{ uuid }` **or** `{ record_uuid }`.

**Verification:** every path in the file answers as documented against the live stack, and a generated
client compiles.

## 17.3 Deliverable B — the database reference (the real ask)  ⭐

**This is the gap.** The owner asked *"what all things are storing in the database?"* and **that is
documented nowhere**, because OpenAPI describes HTTP, not tables.

Create `docs/data-model-reference.md`. It must contain, for all 11 server tables:

1. **Every column**: name, type, nullability, default, and whether it is written.
2. **Constraints**: every CHECK, FK, UNIQUE — verbatim SQL.
3. **Append-only tables**: which of the five (`field_test`, `case_status_history`, `server_audit`,
   `idempotency`, `evidence_blobs`) and what happens on a mutation attempt (SQLite `RAISE(ABORT)`;
   Postgres SQLSTATE `55000`).
4. **Indexes**, and **which are useless** — I verified four index columns that nothing ever populates:
   `field_test.officer_code`, `field_test.region`, `field_test.department`,
   `field_test.location_label`, plus `cases.last_seen`. An index on a permanently-NULL column is a
   pure write cost.
5. **`field_test.body` is the source of truth.** Every rich field comes from `JSON.parse(body)`; the
   scalar columns are a projection used only for filtering. **This is the single most important thing
   the dashboard team must understand** — querying columns instead of the body will eventually
   disagree with the record.
6. **Permanently-NULL columns** — `cases.location`, `first_seen`, `last_seen`,
   `assigned_officer_code`, `reviewer_officer_code`, `review_note`, `reviewed_at`, and
   `field_test.image_ref`. **No code path writes them and no endpoint can set them.** Do not build UI
   on them.
7. **Device-side tables**, and the explicit note that only `field_test` is uploaded — the rest
   (`record_sync_state`, `sync_queue`, `synced_record`, `app_state`, `camera_engine_result`,
   `field_test_fts`, device `audit_log`) never leave the phone.

Generate the table sections from the live database where possible so they cannot drift:

```bash
docker exec parinaam-app-db-1 psql -U parinaam -d parinaam -c '\d+ field_test'
docker exec parinaam-app-db-1 psql -U parinaam -d parinaam -c "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal;"
```

## 17.4 Deliverable C — what the mobile actually sends

Create `docs/mobile-to-server-contract.md`. The owner asked *"what of the data is going to the
database from the mobile app?"* — precisely answered:

- The record wire format: 29 keys, **exact-keys enforced** (extra or missing is a 422). Table of every
  field with its rule.
- The canonicalization: RFC 8785 JCS → `payload_sha256` → `chain_hash = SHA256(prev + payload)`.
- The upload sequence, in order:
  1. `POST /api/v1/records` with `Idempotency-Key: rec:<record_uuid>` (deterministic — a retry
     replays the stored response rather than conflicting).
  2. **Only if `image_sha256` is non-null:** `PUT /api/v1/records/{uuid}/evidence` with raw JPEG bytes.
  3. The record is marked `synced` only when **both** succeed.
- **What never leaves the phone**, itemised: `record_sync_state`, `sync_queue`, `synced_record`,
  `app_state`, `camera_engine_result`, `field_test_fts`, device `audit_log`, the device gate
  PIN/biometric/OTP state, the tamper-demo flag, and every legacy device column
  (`device_model`, `device_serial`, `security_level`, `root_detected`, `play_integrity`, the four
  clocks, `video_sha256`, `rfc3161_token`, `esign_pkcs7`, …).
- **Dead-lettered records never reach the server at all.** So `GET /records` and `GET /stats`
  **under-report what officers actually captured**, and there is no endpoint to query them. If the
  dashboard needs "captured but not uploaded", that data does not exist server-side — say so.

## 17.5 Deliverable D — the integration gotchas

Create `docs/integration-gotchas.md`. These are all verified and all will cost a teammate a day each:

| # | Gotcha |
|---|---|
| 1 | **`department` is `'UNSPECIFIED'`** on real records (the queried column did not exist). Use `officers.department` after Phase 8, or leave it honestly unknown. |
| 2 | **`region` / `location_label` are parsed from the `case_ref` *string*** — `NCB/DZU/…` → `DZU` → `Delhi`. A routing hint, **never** a seizure location. Use `body.gps`. For an unrecognised code, `location_label` falls through to the code itself. |
| 3 | **`panchnama_ref` is `null` on 100% of phone-synced cases** — the server must never infer one. A UI that treats non-null as "processed" will look broken on real data. |
| 4 | **`field_test.officer_code` was always NULL.** After Phase 8.5 it is populated. Filter by `officer_code` after that, `operator_id` before. |
| 5 | `GET /auth/me` is flat; `POST /auth/login` nests under `officer`. |
| 6 | `POST /records` returns 201 **or** 200 — read `body.status`. |
| 7 | **JUNIOR scoping is silent**: a success-shaped response with fewer rows, no 403, no count leak. |
| 8 | `REVIEWED` is **terminal** — a reviewed case can never be escalated or reopened. |
| 9 | **SSE has no `Last-Event-ID` replay** despite the CORS header allowing it, and the bus is
     per-process with zero history. Treat SSE purely as a "go re-fetch" hint; `GET /records` and
     `GET /cases` are the source of truth. |
| 10 | The server **renders no files.** `GET /cases/:ref/export` returns a JSON manifest and an
      explicit instruction that the web client renders the PDF/DOCX/XLSX. |
| 11 | All JSON is `Cache-Control: no-store`. |
| 12 | Evidence is fetched with `GET /records/:uuid/evidence` (raw bytes, `ETag: "sha256:…"`), not
      from a URL column. |
| 13 | **Set `PARINAAM_CORS_ORIGINS`** or every browser call fails. |
| 14 | `is_demo` is `0/1` on SQLite and `false/true` on Postgres — handle both in direct SQL. |
| 15 | Never write the `GENERATED ALWAYS AS` columns (`idempotency.response`, `evidence_blobs.hash`,
     `evidence_blobs.size`) if you ever touch the DB directly. |
| 16 | Default page size is 100, max 200. There is no cursor — paginate with `offset`. |

## 17.6 Deliverable E — update `server/README.md`

- Add a pointer to the three new docs.
- Make the "RBAC" claim true by pointing at `server/src/rbac.ts` (Phase 10).
- Add the deployment checklist from Phase 16.3.
- Document `server/data/DEMO-CREDENTIALS.txt` as the place to find seeded credentials (**never** the
  values themselves).

**Verification gate:** hand `docs/data-model-reference.md` and
`docs/mobile-to-server-contract.md` to someone unfamiliar with the repo and ask them to answer: *"how
do I list every record sealed in case X, and how do I tell whether its image reached the server?"*
If they cannot answer in five minutes, the docs are not done.

---

# PHASE 18 — Retire dead code

**Goal:** delete the code that creates false impressions, so the next contributor does not build on it.

**Depends on:** Phases 13, 15.

Each item below is **verified dead**. Do not delete without re-confirming — re-run the stated grep.

| # | Target | Evidence it is dead | Action |
|---|---|---|---|
| 1 | `src/db/database.ts` | no importers anywhere in `src/` or `App.tsx` | delete |
| 2 | `src/db/migrations.ts` (the 55-column `test_record` spec) | imported **only** by `src/db/database.ts`, which item 1 removes — so `test_record` never runs on device | delete, then repoint `tests/db/schema-triggers.test.ts` at the real `field_test` |
| 3 | `src/db/case-search.ts` | confirm with grep before deleting | delete if dead |
| 4 | `src/export/evidence-bundler.ts` | imported only by `tests/evidentiary/court-bundle.test.ts` and the honesty-guard source scan. **Also imports `node:fs`, so it could never run on a phone.** | delete both the module and its test, or make it reachable — decide explicitly and record the decision in `docs/known-gaps.md` |
| 5 | `db.approveOfficer`, `db.suspendOfficer`, `db.setOfficerPassword` (`server/src/db.ts:336-415`) | not wired to any route. A future contributor will assume they are live API. | wire them, or mark `@deprecated — not routed` with a comment |

⚠️ **Item 2 is a trap.** `tests/db/schema-triggers.test.ts` asserts against the dead `test_record`
table. If you delete the table without repointing the test, you delete the **only** test of the
append-only triggers — a direct rule 2 regression. Repoint to `field_test` (`app-migrations.ts:77-85`)
and confirm `npm test` still catches an `UPDATE`.

⚠️ **Item 4 means the court-bundle generator is unreachable from the app.** If court bundles are meant
to be a deliverable, that is a **product** decision, not a cleanup. Ask the owner before deleting. My
recommendation: the **server** should render bundles (Phase 17.5 gotcha 10 already says the web client
renders from the manifest), so the device-side bundler is genuinely obsolete.

**Also retire, after Phase 6:**

- `probeHardwareSecurityLevel()`'s hardcoded return — once it is a real probe.
- `src/auth/credential-verifier.ts`'s single-round SHA-256 — once the device gate is honest (Phase 11).
- The `attemptPhoneOtp` path — once Phase 11 removes it.

**Verification gate:** `npm test && npx tsc --noEmit && npm run lint`. Test count must **decrease** by
exactly the number of deleted tests — verify that is the only change.

---

# PHASE 19 — Final verification and known-gaps update

**Goal:** prove the whole program landed, and record what is still open.

## 19.1 Full gate

```bash
cd /home/zape/Projects/parinaam-app

npx tsc --noEmit                      # 0 errors
npm run typecheck:server             # clean
npm run lint                          # clean
npm test                              # all pass (count ≥ 259, minus any deliberately deleted tests)

docker compose down -v && node scripts/start-local-stack.mjs --lan
docker exec parinaam-app-camera-engine-1 \
  python -m unittest discover -s /app/service -p "test_*.py" -t /app/service   # 12 OK

docker exec parinaam-app-db-1 psql -U parinaam -d parinaam -c "SELECT count(*) FROM field_test;"
```

## 19.2 The five requests — acceptance tests

Run these manually on a real device with a SQLCipher build. Each maps to one of the owner's requests.

**Request 1 — GPS cannot be edited.**
Open Results. The GPS row and the timestamp row are plain text. No keyboard appears. There is no
"correct" affordance anywhere in the app. Seal a record; the coordinates in `payload_jcs` are exactly
the ones displayed. Tamper test: change one digit of `gps.lat` in the stored row and confirm
verification fails.

**Request 2 — data reaches the database.**
Seal a record on a SQLCipher build. Confirm the device DB is unreadable as plain SQLite. Confirm the
row appears in Postgres. Confirm the image appears in `evidence_blobs`. **This only passes if Phase
13 landed** — it is the test that would have failed before.

**Request 3 — real role-based auth.**
Log in with a wrong MPIN 5× → locked. Restart → still locked. Unlock with the right MPIN → the app
shows **which role it holds and where that came from**. Lock the server, go offline, and confirm the
app says **"ROLE GRANT EXPIRED"** rather than silently claiming `ADMIN`. `grep` the repo for
`parinaam-admin-2026` and friends → **zero hits**. Log in as `JUNIOR` and as `JUDICIARY` and confirm
the server, not the UI, is what denies the call.

**Request 4 — seal/register works.**
Press seal. **A confirmation appears immediately** with a seq, a chain hash, and the honest integrity
line. `RecordDetail` shows the derived state. `CaseLog` shows `CHAIN-ONLY · NO DEVICE SEAL`, not
`PENDING SEAL`. **No screen anywhere offers a button that only navigates while claiming to seal.**

**Request 5 — the docs are usable.**
Hand `docs/data-model-reference.md` and `docs/mobile-to-server-contract.md` to someone unfamiliar with
the repo. Ask them to answer, in five minutes: *"which records exist for case X, and which of their
images actually reached the server?"*

## 19.3 Update `docs/known-gaps.md`

Mark ✅ with the PR for every gap closed:

- **2.3** — `department` / `UNSPECIFIED` (Phase 8, if backfill was done; otherwise mark the column as
  provisioned and the backfill as still open).
- **2.7** — the `db-shim` SQLCipher fork (Phase 13). **This one is the most important single entry in
  the document.**
- **4.1** — the `TrustedEnvironment` hardcode (Phase 6).
- **5.3** — demo identifiers look real (only if the `DEMO-` prefix decision was taken).
- Add new entries for anything Phase 11 could not complete (for example, if the owner declined the
  signed offline grant).

## 19.4 Update `AGENTS.md`

The "V2 officer-app program" block records a completed program. Add a **version4** block recording:
the phases, the two ordering constraints (§2 rules 1 and 2), the baseline, and the final test count.
Follow the style of the existing blocks.

## 19.5 Ship

```bash
git checkout -b feat/v4-final
git add -A
git commit -m "feat(v4): GPS immutability, seal honesty, RBAC, SQLCipher fork fix, dashboard docs"
git push -u origin feat/v4-final
gh pr create --title "v4: five requested programs, 19 phases" --body "…"
gh pr merge --squash
```

---

## 3. Notes for whoever executes this

**3.1 Do not trust this document blindly — verify before you change.** It was written from a
read-only investigation. If a line number has drifted because you executed an earlier phase, re-find
the code by **name** (`handleConfirmAndProceed`, `departmentForOfficer`, `probeHardwareSecurityLevel`),
not by number. The function names are stable; line numbers are not.

**3.2 The three highest-risk items, ranked:**

1. **Phase 13 (SQLCipher fork).** It requires a real device. CI cannot prove it, and getting it wrong
   means encrypted data that never syncs — silently.
2. **Phase 8 (officer columns).** Under the current checksum scheme it **bricks every existing
   database**. Phase 14 must land first. This is the one ordering mistake that will cost you a day.
3. **Phase 14 §14.4 (the backfill).** An `UPDATE` on `field_test` is blocked by the append-only
   trigger. Decide up front whether to backfill only `cases` (recommended) or to re-seed.

**3.3 Three questions for the owner that this document cannot answer for you:**

1. **Is the device gate meant to be a security control, or a speed bump?** If a speed bump, Phase 11
   shrinks enormously — just label it honestly. If a control, the signed offline role grant
   (§11.2) is the cost, and the owner must approve the payload change.
2. **Should `JUDICIARY` be able to read the audit log, and to open the live event stream?** Phase
   10.5 holds both at current behaviour pending an answer.
3. **Should the four frozen officer codes (`HC-4412`, `IC-9007`, `SI-5521`, `INSP-1044`) stay as they
   are, or take a `DEMO-` prefix?** Either is defensible. Changing them requires editing
   `demo-dataset.ts` in the same commit.

**3.4 What this document deliberately does not do.** It does not schedule self-registration or OTP
provisioning — both need a real delivery channel and are tracked separately in `docs/known-gaps.md`
7.5. It does not implement the `PULL` sync path (pulling records back to the device); sync is
one-way push, which is a product decision, not a defect. And it does not implement multi-region
read scoping for `SENIOR`/`SUPERVISOR` (Phase 10.6 / the RBAC matrix) — today every role above
`JUNIOR` sees the entire national ledger, which is the largest privacy exposure in the current model
and the single highest-value control that Phase 8's columns make free. **It deserves its own phase
once the columns are populated, and the owner should decide the scoping policy first.**

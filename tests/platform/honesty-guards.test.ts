/**
 * Honesty guards — "the app must never assert a fact it did not measure".
 *
 * These are source-level regression guards, not behavioural tests. Screens import
 * react-native and cannot be mounted under node:test, so the invariant is enforced where it
 * is actually decided: in the literal values those modules are allowed to contain. Each
 * entry records a fabrication that shipped once (2026-09-25 P0 audit) and would otherwise
 * silently come back in a later refactor.
 *
 * When a real capability is implemented — a hardware keystore that really attests, a
 * calibration-card study that really measures glare — delete its guard here, not the
 * honesty check in the code.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const src = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

/** Comments legitimately name the fabrication they removed, so match against code only. */
const code = (rel: string): string =>
  src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Honesty guards: nothing may assert a fact it did not measure', () => {
  describe('Rule 10 — the achieved security level, never a claimed StrongBox', () => {
    const bunching = code('src/screens/BunchingScreen.tsx');

    it('evaluation presets do not claim a StrongBox hardware keystore', () => {
      assert.ok(
        !/deviceAttestation:\s*'StrongBox/.test(bunching),
        'synthetic rows must not carry a device attestation no device produced'
      );
    });

    it('evaluation presets are never ATTESTED and never marked synced', () => {
      assert.ok(
        !/sealState:\s*'ATTESTED'/.test(bunching),
        'a row with no seal must not claim ATTESTED'
      );
      assert.ok(
        !/syncStatus:\s*'synced'/.test(bunching),
        'a row that was never uploaded must not claim synced'
      );
    });

    it('a simulated selection says so on the screen', () => {
      assert.ok(
        /SIMULATED DATA/.test(bunching),
        'the Bunching screen must disclose that preset packages are synthetic'
      );
    });
  });

  describe('Court export — an unmeasurable fact is left blank, never invented', () => {
    const flow = code('src/services/export-flow.ts');
    const certificate = code('src/export/certificate-generator.ts');
    const bundler = code('src/export/evidence-bundler.ts');

    it('invents no device identity, weight, sample number or batch', () => {
      for (const fabrication of [
        /Pixel 7a/,
        /SIM-SERIAL/,
        /a91f/,
        /batch-2026/,
        /'SO-1'/,
        /'SD-1'/,
        /meas_covariance:\s*'\[\[/,
        /biometric_ok:\s*1/,
        /grossWeightGrams:\s*[0-9]/,
        /netWeightGrams:\s*[0-9]/,
      ]) {
        assert.ok(!fabrication.test(flow), `export-flow must not contain ${fabrication}`);
      }
    });

    it('invents no custodian, agency or court', () => {
      for (const fabrication of [/Head Constable/, /Narcotics Control Bureau/, /Court of Metropolitan Magistrate/]) {
        assert.ok(!fabrication.test(flow), `export-flow must not contain ${fabrication}`);
      }
    });

    it('appoints no forensic expert and invents no registration number', () => {
      for (const fabrication of [/Dr\. V\. K\. Sharma/, /CFSL-/]) {
        assert.ok(!fabrication.test(certificate), `certificate-generator must not contain ${fabrication}`);
        assert.ok(!fabrication.test(bundler), `evidence-bundler must not contain ${fabrication}`);
      }
      assert.ok(src('src/export/certificate-generator.ts').includes('TO_BE_COMPLETED'), 'unknown values must be explicit, not blank');
    });

    it('never certifies a signature or a verification it did not perform', () => {
      assert.ok(!/was verified using/.test(certificate), 'no claim of verifying a hardware signature');
      assert.ok(!/VERIFIED MATCH/.test(certificate), 'no claim of an independent verification match');
    });
  });

  describe('Demo data must never read as a real seizure', () => {
    const results = code('src/screens/ResultsScreen.tsx');
    const home = code('src/screens/HomeScreen.tsx');

    it('isDemo tracks the demo profile only, not the validation status', () => {
      // A real capture against the pending-validation profile is a REAL test event with an
      // unvalidated result. Conflating the two mislabels real evidence as a demo.
      const match = results.match(/isDemo:[^\n]*/);
      assert.ok(match, 'ResultsScreen must set isDemo explicitly');
      assert.ok(
        !/status\s*!==\s*'VALIDATED'/.test(match![0]),
        'isDemo must not depend on the profile validation status'
      );
      assert.ok(/demoMode/.test(match![0]), 'isDemo must depend on profile.demoMode');
    });

    it('the duty board labels demo and rejected records', () => {
      assert.ok(/SIMULATED DEMONSTRATION RECORD/.test(home), 'demo records need a visible tag');
      assert.ok(/SERVER REJECTED/.test(home), 'rejected records need a visible tag');
    });
  });

  describe('Server provenance is measured, not assumed', () => {
    const service = code('server/src/record-service.ts');

    it('does not stamp a hardcoded department on every ingested record', () => {
      assert.ok(!/'\s*NCB\s*'\s*,/.test(service), 'department must come from the account, not a literal');
    });

    it('does not invent a panchnama reference from a case-reference string', () => {
      assert.ok(!/function casePanchnama/.test(service), 'panchnama must never be inferred from a string');
    });
  });

  describe('A rejected record is retained, never deleted', () => {
    const outbox = code('src/state/sync-store.ts');
    const repo = code('src/db/ledger-repository.ts');

    it('the dead-letter sweep marks rows instead of removing them', () => {
      assert.ok(
        !/DELETE FROM sync_queue/.test(outbox),
        'sync_queue rows must not be deleted: an unuploaded record is evidence'
      );
      assert.ok(/dead_lettered_at/.test(repo), 'the ledger must record the dead-letter marker');
    });
  });

  describe('Rule 4/7 — a missing measurement is absent, never defaulted', () => {
    const results = code('src/screens/ResultsScreen.tsx');

    it('does not substitute a neutral-grey CIE-Lab triple for an unmeasured capture', () => {
      assert.ok(
        !/l:\s*50(\.0)?\s*,\s*a:\s*0(\.0)?\s*,\s*b:\s*0(\.0)?/.test(results),
        'a capture the engine could not measure returns normalized_color:null; that absence must be ' +
          'refused, never sealed as {l:50,a:0,b:0}'
      );
    });

    it('never invents a calibration grade', () => {
      assert.ok(
        !/grade:\s*'GOOD'/.test(results),
        "grade 'GOOD' must come from the calibration card result, never from a literal fallback"
      );
    });

    it('never invents a delta-E residual with a numeric fallback', () => {
      assert.ok(
        !/(meanDeltaE|maxDeltaE):[^,}\n]*\?\?\s*\d/.test(results),
        'delta-E residuals must not carry numeric ?? fallbacks — absent is absent'
      );
    });

    it('refuses to seal when no measurement exists', () => {
      assert.ok(
        /!\s*measuredLab\s*\|\|\s*!\s*measuredResidual/.test(results),
        'the seal path must block on a missing Lab measurement or calibration residual'
      );
    });
  });

  describe('Sealing — a control must do what its label says', () => {
    const detail = code('src/screens/RecordDetailScreen.tsx');

    it('offers no control on RecordDetail that claims to seal', () => {
      assert.ok(
        !/accessibilityLabel="[^"]*seal[^"]*"/i.test(detail),
        'a record on RecordDetail was already sealed by ResultsScreen; the screen must not offer a seal action'
      );
      assert.ok(
        !/SEAL EVIDENCE/i.test(detail),
        'the SEAL EVIDENCE & CREATE RECORD button was a pure navigate() stub'
      );
    });

    it('never fabricates a record for an unknown uuid', () => {
      // `CONSISTENT_WITH_REAGENT_POSITIVE` legitimately appears when READING a real record;
      // the fabrication was the fallback object literal built when the uuid was missing.
      assert.ok(
        !/recordFromStore\s*\?\?/.test(detail),
        'a fallback record object makes any stale uuid render as a sealed positive dossier'
      );
      assert.ok(
        !/deltaE:\s*1\.48/.test(detail) && !/confidence:\s*0\.942/.test(detail),
        'the invented ΔE 1.48 / confidence 0.942 must not come back'
      );
      assert.ok(/RECORD NOT FOUND/.test(detail), 'the not-found empty state must exist');
    });

    it('never hardcodes a SEALED label', () => {
      assert.ok(
        !/>\s*SEALED \(SHA-256\)\s*</.test(detail),
        'the integrity line must be derived from deviceAttestation'
      );
    });
  });

  describe('Sealing — a chain-sealed record is never called PENDING SEAL', () => {
    const caseLog = code('src/screens/CaseLogScreen.tsx');
    const home = code('src/screens/HomeScreen.tsx');

    it('the case-log pill is derived from seal state, not a missing attestation', () => {
      assert.ok(
        !/'PENDING SEAL'/.test(caseLog),
        'deviceAttestation is always null on device; a chain-linked record is sealed'
      );
      assert.ok(/CHAIN-ONLY/.test(caseLog), 'the absent device tier must be stated explicitly');
    });

    it('the duty-board SEALED counter counts chain-sealed records', () => {
      assert.ok(
        !/syncStatus === 'synced' \|\| r\.deviceAttestation/.test(home),
        '"sealed" must not mean "uploaded" — a freshly sealed record is sealed before it syncs'
      );
    });
  });

  describe('A failed ledger write is surfaced, not swallowed', () => {
    const store = code('src/state/ledger-store.ts');

    it('persistence failure is recorded on the record and the store', () => {
      assert.ok(
        /persistError/.test(store),
        'appendRecord must attach persistError so the UI can say the record is not on disk'
      );
      assert.ok(
        /const written = await persistRecord/.test(store),
        'persistRecord returns false on a missing adapter; the false branch must be honoured'
      );
    });
  });

  describe('Recorded facts are not form fields', () => {
    const results = code('src/screens/ResultsScreen.tsx');

    it('no screen accepts a typed location or timestamp for the sealed record', () => {
      assert.ok(
        !/setLocationStr|setTimestampStr/.test(results),
        'the GPS/timestamp TextInputs silently discarded what was typed; they are read-only now'
      );
    });

    it('the displayed fix and the sealed fix are the same acquisition', () => {
      const acquisitions = (results.match(/acquireGeoTag\(\)/g) ?? []).length;
      assert.ok(
        acquisitions === 1,
        `acquireGeoTag must be called once; found ${acquisitions} call sites, so display and seal can disagree`
      );
      assert.ok(
        /gps: sealGeo/.test(results),
        'the sealed payload must carry the same fix that was displayed'
      );
    });

    it('the intake wizard offers no manual coordinate entry', () => {
      const wizard = code('src/screens/NewTestSetupScreen.tsx');
      assert.ok(
        !/\blatitude\b|\blongitude\b/i.test(wizard),
        'manual coordinate entry would recreate the discarded-input bug'
      );
    });
  });
});

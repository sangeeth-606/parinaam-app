/**
 * Phase 4 — Court PDF Dossier & Evidence Bundler Tests
 * Covers Task 4.9, Task 4.10, and Milestones M4.9 & CertifyModule contract.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EvidenceBundlerService } from '../../src/export/evidence-bundler.ts';
import { CourtPdfBundleGenerator } from '../../src/export/pdf-bundle.ts';
import { PRESUMPTIVE_DISCLAIMER_VERBATIM } from '../../src/export/certificate-generator.ts';
import type { TestRecordEntity } from '../../src/types/domain.ts';

describe('Phase 4: Court PDF Bundle & Evidence Package Export (Milestone M4.9)', () => {
  const tmpDir = path.join(process.cwd(), 'build', 'test-evidence-bundles');
  const bundler = new EvidenceBundlerService({ outputBaseDir: tmpDir });
  const pdfGen = new CourtPdfBundleGenerator();

  const mockRecord: TestRecordEntity = {
    record_uuid: 'REC-2026-BUNDLE-999',
    package_no: 'P-1',
    lot_no: 'L-1',
    sample_orig_no: 'SO-1',
    sample_dup_no: 'SD-1',
    reagent: 'marquis',
    kit_entry_method: 'ocr',
    corrected_lab_l: 24.0,
    corrected_lab_a: 32.5,
    corrected_lab_b: -14.2,
    calib_residual_mean: 1.0,
    calib_residual_max: 1.6,
    calib_grade: 'GOOD',
    card_version: 'v1.0',
    card_is_self_printed: 1,
    meas_covariance: '[[0.4,0],[0,0.4]]',
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    confidence: 0.98,
    conformal_set: '["POSITIVE"]',
    operator_id: 'OP-048',
    biometric_ok: 1,
    device_model: 'Galaxy-M34',
    security_level: 'TrustedEnvironment',
    image_sha256: 'a'.repeat(64),
    payload_jcs: '{"test":"marquis"}',
    payload_sha256: 'b'.repeat(64),
    prev_hash: '0'.repeat(64),
    chain_hash: 'c'.repeat(64),
    device_attestation: 'd'.repeat(128),
    created_at: '2026-09-13T04:30:00.000Z',
    tz_offset_min: 330,
    gps_mocked: 0,
    mock_provider_flag: 0,
    root_detected: 0,
    dev_settings_on: 0,
  };

  bundler.registerRecord(mockRecord);

  it('Milestone M4.9: Compiles court dossier with embedded base64 images and disclaimers on every page', () => {
    const html = pdfGen.generateCourtBundleHtml({
      record: mockRecord,
      device: {
        make: 'Motorola',
        model: 'Moto G54 5G',
        colour: 'Pearl Blue',
        serialNumber: 'SN-MOTO-2026-01',
        androidId: '12345678abcdef',
        imeiMac: '359123456789012',
        osVersion: 'Android 14',
        appVersion: '1.0.0',
      },
      custodian: {
        officerName: 'S. K. Singh',
        designation: 'Superintendent',
        badgeNumber: 'NCB-SUP-102',
        agency: 'Narcotics Control Bureau',
        station: 'Mumbai Zonal Unit',
      },
      seizure: {
        caseCrimeNo: 'NCB/MZU/CR-02/2026',
        panchnamaRef: 'PCH-002',
        seizingAgency: 'Narcotics Control Bureau',
        seizingOfficer: 'S. K. Singh',
        officerDesignation: 'Superintendent',
        placeOfSeizure: 'JNPT Port, Navi Mumbai',
        dateOfSeizure: '2026-09-13',
        magistrateCourtName: 'Special NDPS Court, Greater Mumbai',
        allegedDescription: 'Presumptive test sample',
        grossWeightGrams: 250,
        netWeightGrams: 240,
      },
      testImage: {
        name: 'test_reaction.png',
        mimeType: 'image/png',
        base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
      },
    });

    assert.ok(html.includes('PARINAAM COURT EVIDENCE DOSSIER'));
    assert.ok(html.includes('data:image/png;base64,iVBORw0KGgoAAA'), 'Image must be embedded as base64 Data URI');
    assert.ok(html.includes(PRESUMPTIVE_DISCLAIMER_VERBATIM));

    // Must have at least 5 disclaimer footers (one per page)
    const disclaimerCount = (html.match(new RegExp(PRESUMPTIVE_DISCLAIMER_VERBATIM, 'g')) || []).length;
    assert.ok(
      disclaimerCount >= 5,
      `Disclaimer should appear on all pages, found ${disclaimerCount} occurrences`
    );
  });

  it('CertifyModule: Generates complete evidence package with MANIFEST.txt and verify.sh', async () => {
    const bundle = await bundler.generateEvidenceBundle('REC-2026-BUNDLE-999');

    assert.ok(fs.existsSync(bundle.partAPdfUri), 'Part A file must exist');
    assert.ok(fs.existsSync(bundle.partBPdfUri), 'Part B file must exist');
    assert.ok(fs.existsSync(bundle.ndpsForm4Uri), 'NDPS Form 4 file must exist');
    assert.ok(fs.existsSync(bundle.ndpsForm5Uri), 'NDPS Form 5 file must exist');
    assert.ok(fs.existsSync(bundle.ndpsForm6Uri), 'NDPS Form 6 file must exist');
    assert.ok(fs.existsSync(bundle.manifestUri), 'MANIFEST.txt must exist');
    assert.ok(fs.existsSync(bundle.verifierScriptUri), 'verify.sh must exist');

    // Read MANIFEST.txt and verify format
    const manifestContent = fs.readFileSync(bundle.manifestUri, 'utf-8');
    assert.ok(manifestContent.includes('BSA_Section_63_Part_A.txt'));
    assert.ok(manifestContent.includes('NDPS_Form_4_Inventory.txt'));
    assert.ok(manifestContent.includes('Court_Evidence_Dossier.html'));
  });
});

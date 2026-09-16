/**
 * Phase 4 — NDPS Statutory Forms Generator Tests
 * Covers Task 4.8 & Milestone M4.8 and Hard Constraints 3, 5, 7.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NdpsFormsGenerator, type SeizureCaseDetails } from '../../src/export/ndps-forms.ts';
import { PRESUMPTIVE_DISCLAIMER_VERBATIM } from '../../src/export/certificate-generator.ts';
import type { TestRecordEntity } from '../../src/types/domain.ts';

describe('Phase 4: NDPS Statutory Forms (Forms 4, 5, 6) (Milestone M4.8)', () => {
  const generator = new NdpsFormsGenerator();

  const mockRecord: TestRecordEntity = {
    record_uuid: 'REC-2026-NDPS-001',
    package_no: 'P-1',
    lot_no: 'L-1',
    sample_orig_no: 'SO-1',
    sample_dup_no: 'SD-1',
    reagent: 'marquis',
    kit_entry_method: 'ocr',
    corrected_lab_l: 24.0,
    corrected_lab_a: 32.5,
    corrected_lab_b: -14.2,
    calib_residual_mean: 1.1,
    calib_residual_max: 1.8,
    calib_grade: 'GOOD',
    card_version: 'v1.0',
    card_is_self_printed: 1,
    meas_covariance: '[[0.5,0],[0,0.5]]',
    outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
    confidence: 0.98,
    conformal_set: '["POSITIVE"]',
    operator_id: 'OP-048',
    biometric_ok: 1,
    device_model: 'Galaxy-M34',
    security_level: 'TrustedEnvironment',
    image_sha256: 'a'.repeat(64),
    payload_jcs: '{"reagent":"marquis"}',
    payload_sha256: 'b'.repeat(64),
    prev_hash: '0'.repeat(64),
    chain_hash: 'c'.repeat(64),
    device_attestation: 'd'.repeat(128),
    device_clock_iso: '2026-09-13T04:30:00.000Z',
    created_at: '2026-09-13T04:30:00.000Z',
    tz_offset_min: 330,
    gps_mocked: 0,
    mock_provider_flag: 0,
    root_detected: 0,
    dev_settings_on: 0,
  };

  const mockSeizure: SeizureCaseDetails = {
    caseCrimeNo: 'NCB/DZU/CR-01/2026',
    panchnamaRef: 'PCH-001',
    seizingAgency: 'Narcotics Control Bureau',
    seizingOfficer: 'Inspector Verma',
    officerDesignation: 'Intelligence Officer',
    placeOfSeizure: 'IGI Airport, New Delhi',
    dateOfSeizure: '2026-09-13',
    magistrateCourtName: 'Court of Special Judge, Patiala House Courts, New Delhi',
    allegedDescription: 'Suspected contraband in powder form',
    grossWeightGrams: 1050.0,
    netWeightGrams: 1000.0,
  };

  it('Milestone M4.8: Auto-populates Form-4, Form-5, and Form-6 from a single test record', () => {
    const bundle = generator.generateForms(mockRecord, mockSeizure);

    // Form 4 (Inventory)
    assert.ok(bundle.form4Text.includes('FORM - 4'));
    assert.ok(bundle.form4Text.includes('Rule 10(2) of the NDPS'));
    assert.ok(bundle.form4Text.includes('Package Number          : P-1'));
    assert.ok(bundle.form4Text.includes('Lot Number (if bunched) : L-1'));
    assert.ok(bundle.form4Text.includes('Gross Weight (Grams)    : 1050 g'));

    // Form 5 (Magistrate Application)
    assert.ok(bundle.form5Text.includes('FORM - 5'));
    assert.ok(bundle.form5Text.includes('Section 52A(2) of the NDPS Act, 1985'));
    assert.ok(bundle.form5Text.includes('Patiala House Courts'));

    // Form 6 (Test Memo in Triplicate)
    assert.ok(bundle.form6Text.includes('FORM - 6'));
    assert.ok(bundle.form6Text.includes('Rule 13 of the NDPS'));
    assert.ok(bundle.form6Text.includes('TO BE PREPARED IN TRIPLICATE'));

    // Mandatory Presumptive Disclaimer verbatim on all forms
    assert.ok(bundle.form4Text.includes(PRESUMPTIVE_DISCLAIMER_VERBATIM));
    assert.ok(bundle.form5Text.includes(PRESUMPTIVE_DISCLAIMER_VERBATIM));
    assert.ok(bundle.form6Text.includes(PRESUMPTIVE_DISCLAIMER_VERBATIM));

    // Hard Constraint 5: Never cite repealed order
    assert.ok(!bundle.form4Text.includes(['Standing', 'Order', '1/88'].join(' ')));
    assert.ok(!bundle.form5Text.includes(['Standing', 'Order', '1/88'].join(' ')));
    assert.ok(!bundle.form6Text.includes(['Standing', 'Order', '1/88'].join(' ')));

    // Hard Constraint 7: Never assert chemical drug identity
    assert.ok(!bundle.form4Text.includes(['Positive', 'for'].join(' ')));
    assert.ok(bundle.form4Text.includes('CONSISTENT_WITH_REAGENT_POSITIVE'));
  });
});

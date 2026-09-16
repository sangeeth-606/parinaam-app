/**
 * Phase 4 — BSA 2023 Section 63(4) Certificate Generator Tests
 * Covers Task 4.7 & Milestone M4.7 and Hard Constraints 3 & 5.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BsaCertificateGenerator,
  formatIstTimestamp,
  PRESUMPTIVE_DISCLAIMER_VERBATIM,
  type DeviceMetadata,
  type CustodianDetails,
} from '../../src/export/certificate-generator.ts';
import type { TestRecordEntity } from '../../src/types/domain.ts';

describe('Phase 4: BSA 2023 Section 63(4) Part A & Part B Certificates (Milestone M4.7)', () => {
  const generator = new BsaCertificateGenerator();

  const mockRecord: TestRecordEntity = {
    record_uuid: 'REC-2026-BSA-001',
    package_no: 'P-1',
    reagent: 'marquis',
    kit_entry_method: 'ocr',
    corrected_lab_l: 24.0,
    corrected_lab_a: 32.5,
    corrected_lab_b: -14.2,
    calib_residual_mean: 1.2,
    calib_residual_max: 2.1,
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
    created_at: '2026-09-13T04:30:00.000Z',
    device_clock_iso: '2026-09-13T04:30:00.000Z',
    tz_offset_min: 330,
    gps_mocked: 0,
    mock_provider_flag: 0,
    root_detected: 0,
    dev_settings_on: 0,
  };

  const mockDevice: DeviceMetadata = {
    make: 'Samsung',
    model: 'Galaxy M34 5G',
    colour: 'Midnight Blue', // Statutory requirement
    serialNumber: 'SM-M346B-9988',
    androidId: '9a8b7c6d5e4f3210',
    imeiMac: '358941029482019',
    osVersion: 'Android 14',
    appVersion: '1.0.0',
  };

  const mockCustodian: CustodianDetails = {
    officerName: 'Inspector Amit Verma',
    designation: 'Sub-Inspector',
    badgeNumber: 'NCB-0982',
    agency: 'Narcotics Control Bureau',
    station: 'Delhi Zone',
  };

  it('formats timestamp into strict 24-hour IST (UTC+05:30) format', () => {
    // 04:30:00 UTC + 5:30 = 10:00:00 IST
    const ist = formatIstTimestamp('2026-09-13T04:30:00.000Z');
    assert.equal(ist, '2026-09-13 10:00:00 [IST]');
  });

  it('Milestone M4.7: Generates Part A and Part B with all statutory fields and correct IST time', () => {
    const bundle = generator.generateCertificates(mockRecord, mockDevice, mockCustodian);

    // Part A text assertions
    assert.ok(bundle.partAText.includes('BHARATIYA SAKSHYA ADHINIYAM (BSA), 2023'));
    assert.ok(bundle.partAText.includes('PART A'));
    assert.ok(bundle.partAText.includes('Midnight Blue'), 'Device colour must be rendered');
    assert.ok(bundle.partAText.includes('Galaxy M34 5G'));
    assert.ok(bundle.partAText.includes('SHA-256 Hash Digest'));
    assert.ok(bundle.partAText.includes('SHA-1 Hash Value        : [EXPLICITLY LEFT BLANK'));
    assert.ok(bundle.partAText.includes('MD-5 Hash Value         : [EXPLICITLY LEFT BLANK'));
    assert.ok(bundle.partAText.includes('2026-09-13 10:00:00 [IST]'));

    // Part B text assertions
    assert.ok(bundle.partBText.includes('PART B'));
    assert.ok(bundle.partBText.includes('Pune Bar Association v. Union of India'));
    assert.ok(bundle.partBText.includes('CONSISTENT_WITH_REAGENT_POSITIVE'));
    assert.ok(bundle.partBText.includes('TrustedEnvironment'));

    // Hard Constraint 3: Mandatory Presumptive Disclaimer verbatim in both parts
    assert.ok(bundle.partAText.includes(PRESUMPTIVE_DISCLAIMER_VERBATIM));
    assert.ok(bundle.partBText.includes(PRESUMPTIVE_DISCLAIMER_VERBATIM));
    assert.ok(bundle.partAHtml.includes(PRESUMPTIVE_DISCLAIMER_VERBATIM));
    assert.ok(bundle.partBHtml.includes(PRESUMPTIVE_DISCLAIMER_VERBATIM));

    // Hard Constraint 5: Never cite repealed Standing Order
    assert.ok(!bundle.partAText.includes(['Standing', 'Order', '1/88'].join(' ')));
    assert.ok(!bundle.partBText.includes(['Standing', 'Order', '1/88'].join(' ')));
    assert.ok(bundle.partAText.includes('Rule 10(2) of the NDPS'));
  });
});

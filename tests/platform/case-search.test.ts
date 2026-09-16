/**
 * Phase 5 — SQLite FTS5 Case Search Tests
 * Covers Task 5.2 & Milestone M5.3.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { CaseSearchService } from '../../src/db/case-search.ts';
import type { TestRecordEntity } from '../../src/types/domain.ts';

describe('Phase 5: SQLite FTS5 Case Search & Multi-Dimensional Filtering (Milestone M5.3)', () => {
  // Initialize in-memory SQLite database using schema.sql
  const db = new DatabaseSync(':memory:');
  const schemaSql = fs.readFileSync(path.join(process.cwd(), 'src', 'db', 'schema.sql'), 'utf-8');
  db.exec(schemaSql);

  const searchService = new CaseSearchService(db);

  // Seed sample records
  const sampleRecords: TestRecordEntity[] = [
    {
      record_uuid: 'REC-001',
      case_ref: 'NCB/DZU/CR-14/2026',
      panchnama_ref: 'PCH-001',
      package_no: 'P-1',
      kit_test_name: 'Marquis Field Test Kit',
      reagent: 'marquis',
      kit_entry_method: 'ocr',
      corrected_lab_l: 24.0,
      corrected_lab_a: 32.5,
      corrected_lab_b: -14.2,
      calib_residual_mean: 1.2,
      calib_residual_max: 1.8,
      calib_grade: 'GOOD',
      card_version: 'v1.0',
      card_is_self_printed: 1,
      meas_covariance: '[]',
      outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      confidence: 0.98,
      conformal_set: '["POSITIVE"]',
      operator_id: 'OFFICER-SHARMA',
      biometric_ok: 1,
      device_model: 'Galaxy-M34',
      security_level: 'TrustedEnvironment',
      image_sha256: 'a'.repeat(64),
      payload_jcs: '{}',
      payload_sha256: 'b'.repeat(64),
      prev_hash: '0'.repeat(64),
      chain_hash: 'c'.repeat(64),
      device_attestation: 'd'.repeat(128),
      device_clock_iso: '2026-09-13T10:00:00Z',
      created_at: '2026-09-13T10:00:00Z',
      tz_offset_min: 330,
      gps_mocked: 0,
      mock_provider_flag: 0,
      root_detected: 0,
      dev_settings_on: 0,
    },
    {
      record_uuid: 'REC-002',
      case_ref: 'NCB/DZU/CR-14/2026',
      panchnama_ref: 'PCH-001',
      package_no: 'P-2',
      kit_test_name: 'Scott Test Cobalt Thiocyanate',
      reagent: 'scott',
      kit_entry_method: 'ocr',
      corrected_lab_l: 35.0,
      corrected_lab_a: -18.5,
      corrected_lab_b: -31.0,
      calib_residual_mean: 1.5,
      calib_residual_max: 2.2,
      calib_grade: 'GOOD',
      card_version: 'v1.0',
      card_is_self_printed: 1,
      meas_covariance: '[]',
      outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      confidence: 0.96,
      conformal_set: '["POSITIVE"]',
      operator_id: 'OFFICER-SHARMA',
      biometric_ok: 1,
      device_model: 'Galaxy-M34',
      security_level: 'TrustedEnvironment',
      image_sha256: 'e'.repeat(64),
      payload_jcs: '{}',
      payload_sha256: 'f'.repeat(64),
      prev_hash: 'c'.repeat(64),
      chain_hash: 'g'.repeat(64),
      device_attestation: 'h'.repeat(128),
      device_clock_iso: '2026-09-13T10:30:00Z',
      created_at: '2026-09-13T10:30:00Z',
      tz_offset_min: 330,
      gps_mocked: 0,
      mock_provider_flag: 0,
      root_detected: 0,
      dev_settings_on: 0,
    },
    {
      record_uuid: 'REC-003',
      case_ref: 'NCB/MZU/CR-02/2026',
      panchnama_ref: 'PCH-002',
      package_no: 'P-1',
      kit_test_name: 'Mecke Reagent Field Kit',
      reagent: 'mecke',
      kit_entry_method: 'ocr',
      corrected_lab_l: 70.0,
      corrected_lab_a: 2.0,
      corrected_lab_b: 8.5,
      calib_residual_mean: 0.9,
      calib_residual_max: 1.4,
      calib_grade: 'GOOD',
      card_version: 'v1.0',
      card_is_self_printed: 1,
      meas_covariance: '[]',
      outcome: 'CONSISTENT_WITH_REAGENT_NEGATIVE',
      confidence: 0.99,
      conformal_set: '["NEGATIVE"]',
      operator_id: 'OFFICER-SINGH',
      biometric_ok: 1,
      device_model: 'Moto-G54',
      security_level: 'TrustedEnvironment',
      image_sha256: 'i'.repeat(64),
      payload_jcs: '{}',
      payload_sha256: 'j'.repeat(64),
      prev_hash: '0'.repeat(64),
      chain_hash: 'k'.repeat(64),
      device_attestation: 'l'.repeat(128),
      device_clock_iso: '2026-09-12T15:00:00Z',
      created_at: '2026-09-12T15:00:00Z',
      tz_offset_min: 330,
      gps_mocked: 0,
      mock_provider_flag: 0,
      root_detected: 0,
      dev_settings_on: 0,
    },
  ];

  // Insert records into SQLite table and FTS index
  const insertStmt = db.prepare(`
    INSERT INTO test_record (
      record_uuid, case_ref, panchnama_ref, package_no, reagent, kit_entry_method,
      corrected_lab_l, corrected_lab_a, corrected_lab_b, calib_residual_mean,
      calib_residual_max, calib_grade, card_version, card_is_self_printed, meas_covariance,
      outcome, confidence, conformal_set, operator_id, biometric_ok, device_model,
      security_level, image_sha256, payload_jcs, payload_sha256, prev_hash, chain_hash,
      device_attestation, tz_offset_min, gps_mocked, mock_provider_flag, root_detected,
      dev_settings_on, device_clock_iso, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  for (const r of sampleRecords) {
    insertStmt.run(
      r.record_uuid, r.case_ref, r.panchnama_ref, r.package_no, r.reagent, r.kit_entry_method,
      r.corrected_lab_l, r.corrected_lab_a, r.corrected_lab_b, r.calib_residual_mean,
      r.calib_residual_max, r.calib_grade, r.card_version, r.card_is_self_printed, r.meas_covariance,
      r.outcome, r.confidence, r.conformal_set, r.operator_id, r.biometric_ok, r.device_model,
      r.security_level, r.image_sha256, r.payload_jcs, r.payload_sha256, r.prev_hash, r.chain_hash,
      r.device_attestation, r.tz_offset_min, r.gps_mocked, r.mock_provider_flag, r.root_detected,
      r.dev_settings_on, r.created_at, r.created_at
    );
    searchService.indexRecord(r);
  }

  it('Milestone M5.3: Searches by FTS query and returns filtered results in < 50ms', () => {
    const res = searchService.searchCases({ query: 'Marquis' });

    assert.equal(res.totalMatches, 1);
    assert.equal(res.results[0].record_uuid, 'REC-001');
    assert.equal(res.results[0].reagent, 'marquis');
    assert.ok(res.executionTimeMs < 50, `Query execution took ${res.executionTimeMs}ms (must be < 50ms)`);
  });

  it('Milestone M5.3: Searches across case reference substring and returns all matching packages', () => {
    const res = searchService.searchCases({ query: 'CR-14/2026' });

    assert.equal(res.totalMatches, 2);
    assert.ok(res.results.some((r) => r.package_no === 'P-1'));
    assert.ok(res.results.some((r) => r.package_no === 'P-2'));
  });

  it('Milestone M5.3: Applies multi-dimensional filtering by outcome, officer, and date range', () => {
    // Filter by officer
    const officerRes = searchService.searchCases({ operatorId: 'OFFICER-SINGH' });
    assert.equal(officerRes.totalMatches, 1);
    assert.equal(officerRes.results[0].record_uuid, 'REC-003');

    // Filter by outcome
    const posRes = searchService.searchCases({ outcome: 'CONSISTENT_WITH_REAGENT_POSITIVE' });
    assert.equal(posRes.totalMatches, 2);

    const negRes = searchService.searchCases({ outcome: 'CONSISTENT_WITH_REAGENT_NEGATIVE' });
    assert.equal(negRes.totalMatches, 1);

    // Filter by date range
    const dateRes = searchService.searchCases({
      startDateIso: '2026-09-13T00:00:00Z',
      endDateIso: '2026-09-13T23:59:59Z',
    });
    assert.equal(dateRes.totalMatches, 2);
  });
});

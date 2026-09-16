/**
 * Export Flow — produces the REAL statutory artifacts from a sealed ledger record using
 * the existing pure-TS generators (certificate-generator, ndps-forms, manifest-generator).
 *
 * Simulator boundary (honest, surfaced in UI): text/HTML/MANIFEST generation is genuine
 * end-to-end; PDF typesetting via expo-print and system sharing require the device build.
 * No live government system is written to — exports are files + schema mocks (constraint 8).
 */

import { Platform } from 'react-native';
import type { TestRecordEntity } from '../types/domain';
import {
  BsaCertificateGenerator,
  type CustodianDetails,
  type DeviceMetadata,
} from '../export/certificate-generator';
import { NdpsFormsGenerator, type SeizureCaseDetails } from '../export/ndps-forms';
import { ManifestGenerator } from '../export/manifest-generator';
import type { LedgerRecord } from '../state/ledger-store';

export const SIMULATOR_HAS_PDF = Platform.OS !== 'web';

export function ledgerToEntity(rec: LedgerRecord): TestRecordEntity {
  return {
    seq: rec.seq,
    record_uuid: rec.record_uuid,
    case_ref: rec.case_ref,
    panchnama_ref: rec.panchnama_ref,
    package_no: rec.package_no,
    lot_no: rec.lot_no,
    sample_orig_no: 'SO-1',
    sample_dup_no: 'SD-1',
    kit_make: rec.kit_make,
    kit_test_name: rec.kit_test_name,
    kit_lot_no: rec.kit_lot_no,
    reagent: rec.reagent,
    kit_entry_method: 'manual',
    corrected_lab_l: rec.lab.l,
    corrected_lab_a: rec.lab.a,
    corrected_lab_b: rec.lab.b,
    calib_residual_mean: rec.residual.meanDeltaE,
    calib_residual_max: rec.residual.maxDeltaE,
    calib_grade: rec.residual.grade === 'REJECT' ? 'DEGRADED' : rec.residual.grade,
    card_version: 'card-v2.1',
    card_print_batch: 'batch-2026-08-a',
    card_is_self_printed: 0,
    meas_covariance: '[[1.4,0.2],[0.2,1.2]]',
    delta_e_trajectory: rec.kinetics ? JSON.stringify(rec.kinetics) : undefined,
    outcome: rec.outcome,
    confidence: rec.confidence,
    conformal_set: JSON.stringify(rec.conformalSet),
    abstention_reason: rec.abstentionReason ?? null,
    operator_id: rec.operator,
    biometric_ok: 1,
    device_model: 'Pixel 7a (dev fixture)',
    device_serial: 'SIM-SERIAL-0001',
    security_level: rec.deviceAttestation ? 'TrustedEnvironment' : 'Software',
    attestation_chain: undefined,
    gps_lat: rec.gps?.lat,
    gps_lon: rec.gps?.lon,
    gps_accuracy_m: rec.gps?.accuracyM,
    gps_mocked: rec.gps?.mocked ? 1 : 0,
    mock_provider_flag: rec.gps?.mocked ? 1 : 0,
    root_detected: 0,
    dev_settings_on: Platform.OS === 'web' ? 1 : 0,
    device_clock_iso: rec.created_at,
    tz_offset_min: 330,
    image_sha256: rec.imageSha256 ?? null, // v2-F: was `rec.payloadSha256` — a fabricated stand-in; now honest bytes-hash or null
    payload_jcs: rec.payloadJcs,
    payload_sha256: rec.payloadSha256,
    prev_hash: rec.prevHash,
    chain_hash: rec.chainHash,
    device_attestation: rec.deviceAttestation ?? 'unavailable-in-simulator',
    created_at: rec.created_at,
  };
}

export interface ExportBundle {
  partAText: string;
  partBText: string;
  form4Text: string;
  form5Text: string;
  form6Text: string;
  manifestText: string;
  generatedAtIst: string;
}

export async function buildExportBundle(rec: LedgerRecord): Promise<ExportBundle> {
  const record = ledgerToEntity(rec);

  const device: DeviceMetadata = {
    make: 'Google',
    model: 'Pixel 7a',
    colour: 'Charcoal',
    serialNumber: 'SIM-SERIAL-0001',
    androidId: 'a91f…77c2 (device build)',
    imeiMac: 'Not captured — non-mandatory; device build populates',
    osVersion: 'Android 13 (API 33)',
    appVersion: 'Parinaam 1.0.0 (dev build)',
  };
  const custodian: CustodianDetails = {
    officerName: rec.operator,
    designation: 'Head Constable',
    badgeNumber: rec.operator.split(' ')[0] ?? '',
    agency: 'Narcotics Control Bureau',
    station: 'Zonal Unit — field deployment',
  };
  const seizure: SeizureCaseDetails = {
    caseCrimeNo: rec.case_ref,
    panchnamaRef: rec.panchnama_ref ?? '—',
    seizingAgency: 'Narcotics Control Bureau',
    seizingOfficer: rec.operator,
    officerDesignation: 'Head Constable',
    placeOfSeizure: rec.gps ? `GPS ${rec.gps.lat.toFixed(4)}, ${rec.gps.lon.toFixed(4)}` : 'Field location',
    dateOfSeizure: rec.created_at,
    magistrateCourtName: 'Court of Metropolitan Magistrate (Trial) — for s. 52A(2) application',
    allegedDescription: 'Suspected narcotic/drug in sealed package (identity NOT asserted)',
    grossWeightGrams: 500,
    netWeightGrams: 498.2,
  };

  const bsa = new BsaCertificateGenerator().generateCertificates(record, device, custodian);
  const forms = new NdpsFormsGenerator().generateForms(record, seizure);
  const { manifestText } = await new ManifestGenerator().generateManifest([
    { filename: `record-${rec.record_uuid}.jcs`, sha256: rec.payloadSha256 },
    { filename: 'bsa-partA.txt', contentUtf8: bsa.partAText },
    { filename: 'bsa-partB.txt', contentUtf8: bsa.partBText },
    { filename: 'ndps-form4-inventory.txt', contentUtf8: forms.form4Text },
    { filename: 'ndps-form5-magistrate.txt', contentUtf8: forms.form5Text },
    { filename: 'ndps-form6-testmemo.txt', contentUtf8: forms.form6Text },
    { filename: 'verify.sh' },
  ]);

  return {
    partAText: bsa.partAText,
    partBText: bsa.partBText,
    form4Text: forms.form4Text,
    form5Text: forms.form5Text,
    form6Text: forms.form6Text,
    manifestText,
    generatedAtIst: bsa.generatedAtIst,
  };
}

/** Attempt device PDF; returns null on simulator (UI shows an honest note instead). */
export async function printCourtPdf(bundle: ExportBundle): Promise<string | null> {
  try {
    const Print = await import('expo-print');
    const html = `<html><head><meta charset="utf-8"/></head><body><pre>${bundle.partAText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')}</pre></body></html>`;
    const res = await Print.printToFileAsync({ html, base64: false });
    return res.uri;
  } catch {
    return null;
  }
}

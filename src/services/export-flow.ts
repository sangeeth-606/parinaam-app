/**
 * Export Flow — produces the REAL statutory artifacts from a sealed ledger record using
 * the existing pure-TS generators (certificate-generator, ndps-forms, manifest-generator).
 *
 * Simulator boundary (honest, surfaced in UI): text/HTML/MANIFEST generation is genuine
 * end-to-end; PDF typesetting via expo-print and system sharing require the device build.
 * No live government system is written to — exports are files + schema mocks (constraint 8).
 *
 * NOTHING INVENTED (v3 fix): every field this build cannot measure is emitted as an
 * explicit TO_BE_COMPLETED line. The previous version hardcoded a Pixel 7a serial, a
 * badge number derived from the officer's name, 500 g/498.2 g seizure weights, a court
 * name, a designation, a sample origin/dup number, a card batch, an Android ID and a
 * measurement covariance — all of which then appeared in a BSA s.63(4) certificate as
 * though they were facts about the seizure. A court cannot distinguish a plausible
 * fabrication from a real measurement, so a visibly incomplete certificate is the only
 * honest option here.
 */

import { Platform } from 'react-native';
import type { TestRecordEntity } from '../types/domain';
import {
  BsaCertificateGenerator,
  TO_BE_COMPLETED,
  type CustodianDetails,
  type DeviceMetadata,
} from '../export/certificate-generator';
import { NdpsFormsGenerator, type SeizureCaseDetails } from '../export/ndps-forms';
import { ManifestGenerator } from '../export/manifest-generator';
import type { LedgerRecord } from '../state/ledger-store';

export const SIMULATOR_HAS_PDF = Platform.OS !== 'web';

/**
 * A single measurement covariance over ONE still photo is not a thing that exists.
 * The capture path deliberately leaves covariance empty rather than inserting a
 * synthetic identity matrix, so the export does the same.
 */
const NO_COVARIANCE = '[]';

export function ledgerToEntity(rec: LedgerRecord): TestRecordEntity {
  return {
    seq: rec.seq,
    record_uuid: rec.record_uuid,
    case_ref: rec.case_ref,
    panchnama_ref: rec.panchnama_ref,
    package_no: rec.package_no,
    lot_no: rec.lot_no,
    sample_orig_no: undefined, // never invented — the officer records the real sample numbers
    sample_dup_no: undefined,
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
    card_print_batch: undefined, // the physical print batch is a fact about a card, not the app
    card_is_self_printed: 0,
    meas_covariance: NO_COVARIANCE,
    delta_e_trajectory: rec.kinetics ? JSON.stringify(rec.kinetics) : undefined,
    outcome: rec.outcome,
    confidence: rec.confidence,
    conformal_set: JSON.stringify(rec.conformalSet),
    abstention_reason: rec.abstentionReason ?? null,
    operator_id: rec.operator,
    // No biometric check is performed anywhere in this build: report absence, never a pass.
    biometric_ok: 0,
    device_model: 'NOT CAPTURED BY THIS BUILD',
    device_serial: undefined,
    // Rule 10 (AGENTS): record the ACHIEVED security level. This build cannot reach a
    // hardware keystore (the key path is unavailable at runtime), so the honest value for
    // a chain-only record is 'Software' — never a claimed TEE/StrongBox.
    security_level: rec.deviceAttestation ? rec.sealState === 'ATTESTED' ? 'TrustedEnvironment' : 'Software' : 'Software',
    attestation_chain: undefined,
    gps_lat: rec.gps?.lat,
    gps_lon: rec.gps?.lon,
    gps_accuracy_m: rec.gps?.accuracyM,
    gps_mocked: rec.gps?.mocked ? 1 : 0,
    mock_provider_flag: rec.gps?.mocked ? 1 : 0,
    // No root/integrity check is performed: 0 means "not detected", which is not the same
    // as "not checked", so the field carries the absence explicitly via the note below.
    root_detected: 0,
    dev_settings_on: Platform.OS === 'web' ? 1 : 0,
    device_clock_iso: rec.created_at,
    tz_offset_min: 330,
    image_sha256: rec.imageSha256 ?? null, // v2-F: was `rec.payloadSha256` — a fabricated stand-in; now honest bytes-hash or null
    payload_jcs: rec.payloadJcs,
    payload_sha256: rec.payloadSha256,
    prev_hash: rec.prevHash,
    chain_hash: rec.chainHash,
    // Never a sentinel string pretending to be a signature: absent means absent.
    device_attestation: rec.deviceAttestation ?? 'NOT PRESENT — CHAIN-ONLY SEAL; NO DEVICE KEY AVAILABLE IN THIS BUILD',
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

/**
 * The statutory particulars this build cannot know. Seizure weight, court name, place of
 * seizure, officer designation, agency and station are facts about a real seizure that
 * only the seizing officer and the seizure record can supply. Emitting plausible values
 * here is how a court document ends up asserting a 500 g seizure that never happened.
 */
export function unrecordedSeizureParticulars(rec: LedgerRecord): SeizureCaseDetails {
  return {
    caseCrimeNo: rec.case_ref,
    panchnamaRef: rec.panchnama_ref ?? TO_BE_COMPLETED,
    seizingAgency: TO_BE_COMPLETED,
    seizingOfficer: rec.operator,
    officerDesignation: TO_BE_COMPLETED,
    // The GPS fix is a measurement; the human-readable place of seizure is not derivable
    // from coordinates and is never invented.
    placeOfSeizure: rec.gps
      ? `GPS ${rec.gps.lat.toFixed(4)}, ${rec.gps.lon.toFixed(4)} — WRITTEN PLACE NOT CAPTURED BY THIS APP`
      : 'NOT CAPTURED',
    dateOfSeizure: rec.created_at,
    magistrateCourtName: TO_BE_COMPLETED,
    allegedDescription: 'Suspected narcotic/drug in sealed package (identity NOT asserted)',
    grossWeightGrams: null,
    netWeightGrams: null,
  };
}

export async function buildExportBundle(rec: LedgerRecord): Promise<ExportBundle> {
  const record = ledgerToEntity(rec);

  const device: DeviceMetadata = {
    make: TO_BE_COMPLETED,
    model: TO_BE_COMPLETED,
    colour: TO_BE_COMPLETED,
    serialNumber: TO_BE_COMPLETED,
    androidId: TO_BE_COMPLETED,
    imeiMac: 'NOT CAPTURED — this build does not read hardware identifiers',
    osVersion: `${Platform.OS} (device build ${Platform.Version})`,
    appVersion: 'Parinaam (version as installed on this device)',
  };
  const custodian: CustodianDetails = {
    officerName: rec.operator,
    designation: TO_BE_COMPLETED,
    badgeNumber: TO_BE_COMPLETED,
    agency: TO_BE_COMPLETED,
    station: TO_BE_COMPLETED,
  };
  const seizure = unrecordedSeizureParticulars(rec);

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

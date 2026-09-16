/**
 * Parinaam — NDPS Statutory Forms Generator (NDPS Rules 2022)
 * Governed by spec/05-phase-4-evidentiary.md (Task 4.8) & spec/legal-constraints.md.
 *
 * Implements:
 * 1. Form-4: Inventory of Seized Packages & Lot Mappings (Rule 10(2) G.S.R. 899(E))
 * 2. Form-5: Application to Magistrate under Section 52A(2) of NDPS Act 1985
 * 3. Form-6: Test Memo (in Triplicate per Rule 13 of NDPS Rules 2022)
 *
 * Mandatory Statutory Guardrails:
 * - Strictly cite Rule 10(2) NDPS Rules 2022 (G.S.R. 899(E)).
 * - Presumptive Disclaimer verbatim on every rendered form.
 * - Strict Presumptive Outcome vocabulary (never assert chemical identity).
 */

import type { TestRecordEntity } from '../types/domain.ts';
import { formatIstTimestamp, PRESUMPTIVE_DISCLAIMER_VERBATIM } from './certificate-generator.ts';

export interface SeizureCaseDetails {
  caseCrimeNo: string;
  panchnamaRef: string;
  seizingAgency: string;
  seizingOfficer: string;
  officerDesignation: string;
  placeOfSeizure: string;
  dateOfSeizure: string;
  magistrateCourtName: string;
  allegedDescription: string; // e.g. "Suspected psychotropic substance/narcotic drug in powder form"
  grossWeightGrams: number;
  netWeightGrams: number;
}

export interface NdpsFormsBundle {
  form4Text: string;
  form4Html: string;
  form5Text: string;
  form5Html: string;
  form6Text: string;
  form6Html: string;
}

export class NdpsFormsGenerator {
  public generateForms(record: TestRecordEntity, seizure: SeizureCaseDetails): NdpsFormsBundle {
    const timestampIst = formatIstTimestamp(record.device_clock_iso || record.created_at);

    return {
      form4Text: this.renderForm4Text(record, seizure, timestampIst),
      form4Html: this.renderForm4Html(record, seizure, timestampIst),
      form5Text: this.renderForm5Text(record, seizure, timestampIst),
      form5Html: this.renderForm5Html(record, seizure, timestampIst),
      form6Text: this.renderForm6Text(record, seizure, timestampIst),
      form6Html: this.renderForm6Html(record, seizure, timestampIst),
    };
  }

  private renderForm4Text(
    record: TestRecordEntity,
    seizure: SeizureCaseDetails,
    timestampIst: string
  ): string {
    return `
================================================================================
FORM - 4
[See Rule 10(2) of the NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022]
INVENTORY OF SEIZED NARCOTICS, DRUGS, PSYCHOTROPIC SUBSTANCES, AND CONVEYANCES
================================================================================

[STATUTORY MANDATORY DISCLAIMER]
"${PRESUMPTIVE_DISCLAIMER_VERBATIM}"

1. CASE PARTICULARS:
   - Case Crime No / FIR No  : ${seizure.caseCrimeNo}
   - Panchnama Reference     : ${seizure.panchnamaRef}
   - Seizing Agency & Unit   : ${seizure.seizingAgency}
   - Place of Seizure        : ${seizure.placeOfSeizure}
   - Date & Time of Seizure  : ${seizure.dateOfSeizure}

2. PACKAGE & SAMPLING IDENTIFICATION (RULE 10(2)):
   - Package Number          : ${record.package_no} (of seized packages)
   - Lot Number (if bunched) : ${record.lot_no ?? 'N/A (Single Package)'}
   - Original Sample Mark    : ${record.sample_orig_no ?? 'SO-1'}
   - Duplicate Sample Mark   : ${record.sample_dup_no ?? 'SD-1'}
   - Gross Weight (Grams)    : ${seizure.grossWeightGrams} g
   - Net Weight (Grams)      : ${seizure.netWeightGrams} g

3. FIELD TEST SPOT SAMPLING & RECORD INTEGRITY:
   - Record UUID             : ${record.record_uuid}
   - Field Reagent Used      : ${record.reagent.toUpperCase()}
   - Presumptive Outcome     : ${record.outcome}
   - Statistical Confidence  : ${(record.confidence * 100).toFixed(1)}%
   - Calibration Residual    : ${record.calib_residual_mean.toFixed(2)} ΔE00 (${record.calib_grade})
   - Digital Payload SHA-256 : ${record.payload_sha256}
   - Cumulative Chain Hash   : ${record.chain_hash}
   - Sealed Ledger Sequence  : #${record.seq ?? 1}

Inventory Certified and Signed:
Officer Name : ${seizure.seizingOfficer} (${seizure.officerDesignation})
Date (IST)   : ${timestampIst}
================================================================================
`.trim();
  }

  private renderForm5Text(
    record: TestRecordEntity,
    seizure: SeizureCaseDetails,
    timestampIst: string
  ): string {
    return `
================================================================================
FORM - 5
[See Rule 11 of the NDPS Rules, 2022 and Section 52A(2) of the NDPS Act, 1985]
APPLICATION TO THE MAGISTRATE FOR CERTIFICATION OF INVENTORY AND SAMPLES
================================================================================

IN THE COURT OF: ${seizure.magistrateCourtName}
Case Reference  : ${seizure.caseCrimeNo} (P.S. / Seizing Unit: ${seizure.seizingAgency})

TO,
THE HON'BLE JUDICIAL MAGISTRATE,

Sir,
The Applicant, ${seizure.seizingOfficer}, ${seizure.officerDesignation}, respectfully submits:
1. That under the NDPS Act, 1985 and in strict adherence to Rule 10(2) of the NDPS
   (Seizure, Storage, Sampling and Disposal) Rules, 2022 (G.S.R. 899(E)), an inventory
   of seized substances under Package Mark: ${record.package_no} has been prepared.
2. That digital photographs and field colorimetric spot test events were captured using
   the tamper-evident Parinaam system with verified hardware key integrity seal
   under Record UUID: ${record.record_uuid}.
3. The preliminary spot test result was: "${record.outcome}"
   [STATUTORY MANDATORY DISCLAIMER: "${PRESUMPTIVE_DISCLAIMER_VERBATIM}"].
4. It is respectfully prayed that this Hon'ble Court may be pleased to:
   (a) Certify the correctness of the Inventory of Seized Substances (Form-4);
   (b) Permit drawing of representative samples in triplicate in the presence of the Court;
   (c) Certify the photographs and digital evidence ledger under Section 52A(2)(a)(b)(c).

Date (IST)   : ${timestampIst}
Applicant    : ${seizure.seizingOfficer} (${seizure.officerDesignation})
Agency       : ${seizure.seizingAgency}
================================================================================
`.trim();
  }

  private renderForm6Text(
    record: TestRecordEntity,
    seizure: SeizureCaseDetails,
    timestampIst: string
  ): string {
    return `
================================================================================
FORM - 6
[See Rule 13 of the NDPS (Seizure, Storage, Sampling and Disposal) Rules, 2022]
TEST MEMO FOR TRANSMITTING SAMPLES TO FORENSIC SCIENCE LABORATORY
(TO BE PREPARED IN TRIPLICATE)
================================================================================

[STATUTORY MANDATORY DISCLAIMER]
"${PRESUMPTIVE_DISCLAIMER_VERBATIM}"

1. MEMO & DISPATCH PARTICULARS:
   - Dispatching Officer     : ${seizure.seizingOfficer}, ${seizure.officerDesignation}
   - Address of Dispatcher   : ${seizure.seizingAgency}, ${seizure.placeOfSeizure}
   - Destination Laboratory  : Central / State Forensic Science Laboratory (Chemical Division)
   - Date of Dispatch (IST)  : ${timestampIst}

2. SAMPLE IDENTIFICATION:
   - Package Reference       : ${record.package_no}
   - Sample Mark (Original)  : ${record.sample_orig_no ?? 'SO-1'}
   - Sample Mark (Duplicate) : ${record.sample_dup_no ?? 'SD-1'}
   - Gross Weight of Sample  : Approx. 5.0 grams per sample envelope
   - Seal Inscription        : NCB / POLICE TAMPER-EVIDENT SEAL

3. PRELIMINARY FIELD SPOT-TEST REPORT (FOR INFORMATION ONLY):
   - Preliminary Test Method : Field Colorimetric Pouch (Reagent: ${record.reagent.toUpperCase()})
   - Preliminary Indication  : ${record.outcome}
   - Confidence / Conformal  : ${(record.confidence * 100).toFixed(1)}% / ${record.conformal_set}
   - Digital Evidence UUID   : ${record.record_uuid}
   - Payload SHA-256 Digest  : ${record.payload_sha256}

4. LABORATORY REQUISITION:
   The Forensic Examiner is requested to conduct quantitative chemical analysis and
   confirmatory testing (GC-MS / HPLC) to determine the chemical identity and percentage
   purity of the active narcotic/psychotropic substance, in accordance with law.

Officer Signature: ___________________________
Designation      : ${seizure.officerDesignation}, ${seizure.seizingAgency}
Date (IST)       : ${timestampIst}
================================================================================
`.trim();
  }

  private renderForm4Html(record: TestRecordEntity, seizure: SeizureCaseDetails, timestampIst: string): string {
    return `
<div class="ndps-form form-4">
  <div class="disclaimer-banner">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
  <h2>FORM - 4</h2>
  <h3>Inventory of Seized Substances (Rule 10(2), NDPS Rules 2022)</h3>
  <table class="form-table">
    <tr><th>Case Crime No</th><td>${seizure.caseCrimeNo}</td><th>Panchnama Ref</th><td>${seizure.panchnamaRef}</td></tr>
    <tr><th>Package No</th><td><strong>${record.package_no}</strong></td><th>Lot No</th><td>${record.lot_no ?? 'N/A'}</td></tr>
    <tr><th>Original Sample No</th><td>${record.sample_orig_no ?? 'SO-1'}</td><th>Duplicate Sample No</th><td>${record.sample_dup_no ?? 'SD-1'}</td></tr>
    <tr><th>Gross / Net Weight</th><td>${seizure.grossWeightGrams}g / ${seizure.netWeightGrams}g</td><th>Place of Seizure</th><td>${seizure.placeOfSeizure}</td></tr>
    <tr><th>Field Test Reagent</th><td>${record.reagent.toUpperCase()}</td><th>Preliminary Outcome</th><td><strong>${record.outcome}</strong></td></tr>
    <tr><th>Confidence Score</th><td>${(record.confidence * 100).toFixed(1)}%</td><th>Calibration Grade</th><td>${record.calib_grade} (${record.calib_residual_mean.toFixed(2)} ΔE00)</td></tr>
    <tr><th>Record UUID</th><td colspan="3"><code>${record.record_uuid}</code></td></tr>
    <tr><th>Digital SHA-256</th><td colspan="3"><code>${record.payload_sha256}</code></td></tr>
  </table>
  <p>Certified by: <strong>${seizure.seizingOfficer}</strong> (${seizure.officerDesignation}) on ${timestampIst}</p>
  <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
</div>
`.trim();
  }

  private renderForm5Html(record: TestRecordEntity, seizure: SeizureCaseDetails, timestampIst: string): string {
    return `
<div class="ndps-form form-5">
  <div class="disclaimer-banner">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
  <h2>FORM - 5</h2>
  <h3>Application to Magistrate under Section 52A(2) of NDPS Act, 1985</h3>
  <p><strong>Court:</strong> ${seizure.magistrateCourtName} | <strong>Case:</strong> ${seizure.caseCrimeNo}</p>
  <p>Application for certification of inventory (Form-4) and drawing of representative samples in triplicate for Package <strong>${record.package_no}</strong> (Record UUID: <code>${record.record_uuid}</code>).</p>
  <p>Preliminary field indication: <em>${record.outcome}</em>.</p>
  <p>Applicant: <strong>${seizure.seizingOfficer}</strong> (${seizure.officerDesignation}) — ${timestampIst}</p>
  <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
</div>
`.trim();
  }

  private renderForm6Html(record: TestRecordEntity, seizure: SeizureCaseDetails, timestampIst: string): string {
    return `
<div class="ndps-form form-6">
  <div class="disclaimer-banner">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
  <h2>FORM - 6</h2>
  <h3>Test Memo in Triplicate (Rule 13, NDPS Rules 2022)</h3>
  <table class="form-table">
    <tr><th>Package Ref</th><td>${record.package_no}</td><th>Sample Mark</th><td>${record.sample_orig_no ?? 'SO-1'}</td></tr>
    <tr><th>Preliminary Field Outcome</th><td colspan="3"><strong>${record.outcome}</strong></td></tr>
    <tr><th>Record UUID</th><td colspan="3"><code>${record.record_uuid}</code></td></tr>
    <tr><th>Payload SHA-256</th><td colspan="3"><code>${record.payload_sha256}</code></td></tr>
  </table>
  <p>Requisition to FSL: For quantitative confirmatory laboratory testing.</p>
  <p>Dispatching Officer: ${seizure.seizingOfficer}, ${seizure.seizingAgency} — ${timestampIst}</p>
  <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
</div>
`.trim();
  }
}

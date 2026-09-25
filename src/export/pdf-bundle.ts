/**
 * Parinaam — prototype PDF evidence bundle
 * Governed by spec/05-phase-4-evidentiary.md (Task 4.9 & Milestone M4.9).
 *
 * Implements:
 * 1. A multi-page local export document combining:
 *    - Executive Summary & Evidence Overview
 *    - BSA 2023 s. 63(4) Certificate Part A (Custodian)
 *    - BSA 2023 s. 63(4) Certificate Part B (Expert)
 *    - NDPS Form-4 (Inventory under Rule 10(2))
 *    - NDPS Form-5 (Magistrate Application s. 52A(2))
 *    - NDPS Form-6 (Test Memo in Triplicate Rule 13)
 *    - High-resolution colorimetric test image & seal impression embedded as base64 Data URIs
 * 2. Mandatory statutory disclaimer on every single page header and footer:
 *    "Presumptive result only — not a substitute for laboratory confirmatory testing."
 */

import type { TestRecordEntity } from '../types/domain.ts';
import {
  BsaCertificateGenerator,
  type CustodianDetails,
  type DeviceMetadata,
  type ExpertDetails,
  PRESUMPTIVE_DISCLAIMER_VERBATIM,
} from './certificate-generator.ts';
import { NdpsFormsGenerator, type SeizureCaseDetails } from './ndps-forms.ts';

export interface ImageAttachment {
  name: string;
  mimeType: string;
  base64Data: string; // Plain base64 data without prefix
  sha256: string;
}

export interface PdfBundleInput {
  record: TestRecordEntity;
  device: DeviceMetadata;
  custodian: CustodianDetails;
  expert?: ExpertDetails;
  seizure: SeizureCaseDetails;
  testImage?: ImageAttachment;
  sealImage?: ImageAttachment;
}

export class CourtPdfBundleGenerator {
  private bsaGenerator: BsaCertificateGenerator;
  private ndpsGenerator: NdpsFormsGenerator;

  constructor() {
    this.bsaGenerator = new BsaCertificateGenerator();
    this.ndpsGenerator = new NdpsFormsGenerator();
  }

  /**
   * Generates complete standalone HTML bundle for offline PDF printing via expo-print.
   */
  public generateCourtBundleHtml(input: PdfBundleInput): string {
    const { record, device, custodian, expert, seizure, testImage, sealImage } = input;

    const bsa = this.bsaGenerator.generateCertificates(record, device, custodian, expert);
    const ndps = this.ndpsGenerator.generateForms(record, seizure);

    const testImgUri = testImage
      ? `data:${testImage.mimeType};base64,${testImage.base64Data}`
      : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="%23eee"/><text x="20" y="80" fill="%23888">Optical Capture Image</text></svg>';

    const sealImgUri = sealImage
      ? `data:${sealImage.mimeType};base64,${sealImage.base64Data}`
      : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="%23eee"/><text x="20" y="80" fill="%23888">Seal Impression Photo</text></svg>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Parinaam Evidence Bundle — ${record.record_uuid}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 15mm 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      line-height: 1.4;
      font-size: 11pt;
      margin: 0;
      padding: 0;
    }
    .page {
      page-break-after: always;
      position: relative;
      min-height: 260mm;
      box-sizing: border-box;
      padding-bottom: 20mm;
    }
    .page:last-child {
      page-break-after: avoid;
    }
    .disclaimer-banner {
      background-color: #fff3cd;
      border: 1.5px solid #856404;
      color: #856404;
      font-weight: bold;
      text-align: center;
      padding: 6px 10px;
      font-size: 9.5pt;
      text-transform: uppercase;
      margin-bottom: 12px;
      letter-spacing: 0.3px;
    }
    .disclaimer-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid #ccc;
      padding-top: 4px;
      font-size: 8pt;
      color: #666;
      text-align: center;
      font-style: italic;
    }
    h1 {
      font-size: 17pt;
      text-align: center;
      margin: 8px 0;
      color: #0b3d91;
      text-transform: uppercase;
    }
    h2 {
      font-size: 13pt;
      border-bottom: 2px solid #0b3d91;
      padding-bottom: 4px;
      color: #0b3d91;
      margin-top: 12px;
    }
    h3 {
      font-size: 11pt;
      color: #444;
      margin: 4px 0 10px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 9.5pt;
    }
    th, td {
      border: 1px solid #b0b0b0;
      padding: 5px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f1f4f8;
      font-weight: 600;
      width: 32%;
    }
    code {
      font-family: "Courier New", Courier, monospace;
      font-size: 8.5pt;
      word-break: break-all;
    }
    .evidence-images {
      display: flex;
      justify-content: space-around;
      margin: 15px 0;
    }
    .image-card {
      border: 1px solid #ccc;
      padding: 8px;
      text-align: center;
      width: 45%;
      box-sizing: border-box;
      background: #fafafa;
    }
    .image-card img {
      max-width: 100%;
      max-height: 180px;
      object-fit: contain;
      border: 1px solid #ddd;
    }
    .sig-block {
      margin-top: 20px;
      padding: 10px;
      border-top: 1px dashed #666;
      font-size: 9.5pt;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: Executive Summary & Evidence Overview -->
  <div class="page">
    <div class="disclaimer-banner">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
    <h1>PARINAAM COURT EVIDENCE DOSSIER</h1>
    <p style="text-align:center; font-size:10pt; color:#555;">Presumptive Narcotics Field Screening & Digital Chain of Custody Record</p>

    <h2>1. Executive Case Summary</h2>
    <table>
      <tr><th>Case Reference</th><td><strong>${seizure.caseCrimeNo}</strong> (Panchnama: ${seizure.panchnamaRef})</td></tr>
      <tr><th>Seizing Agency</th><td>${seizure.seizingAgency} (${seizure.placeOfSeizure})</td></tr>
      <tr><th>Seizing Officer</th><td>${custodian.officerName} (${custodian.designation}, Badge: ${custodian.badgeNumber})</td></tr>
      <tr><th>Date & Place of Seizure</th><td>${seizure.dateOfSeizure}, ${seizure.placeOfSeizure}</td></tr>
      <tr><th>Statutory Seizure Rule</th><td>Rule 10(2) of NDPS Rules 2022 (G.S.R. 899(E))</td></tr>
      <tr><th>Package Number</th><td><strong>${record.package_no}</strong> (Gross: ${seizure.grossWeightGrams}g, Net: ${seizure.netWeightGrams}g)</td></tr>
    </table>

    <h2>2. Field Test Event & Presumptive Outcome</h2>
    <table>
      <tr><th>Reagent Kit Used</th><td>${record.reagent.toUpperCase()} Field Spot Test Pouch</td></tr>
      <tr><th>Presumptive Outcome</th><td><strong style="font-size:11pt; color:#0b3d91;">${record.outcome}</strong></td></tr>
      <tr><th>Measurement confidence</th><td>${(record.confidence * 100).toFixed(1)}% (uncalibrated unless the profile is validated)</td></tr>
      <tr><th>Engine candidate set</th><td>${record.conformal_set}</td></tr>
      <tr><th>Calibration Residual</th><td>${record.calib_residual_mean.toFixed(2)} ΔE00 (${record.calib_grade})</td></tr>
      <tr><th>Normalized CIELAB (L*, a*, b*)</th><td>L*=${record.corrected_lab_l.toFixed(2)}, a*=${record.corrected_lab_a.toFixed(2)}, b*=${record.corrected_lab_b.toFixed(2)}</td></tr>
    </table>

    <h2>3. Captured Forensic Imagery</h2>
    <div class="evidence-images">
      <div class="image-card">
        <img src="${testImgUri}" alt="Reaction Aperture" />
        <p><strong>Reaction Aperture</strong><br/><code>${testImage?.sha256 ? testImage.sha256.slice(0, 24) + '...' : 'Direct Optical Feed'}</code></p>
      </div>
      <div class="image-card">
        <img src="${sealImgUri}" alt="Seal Impression" />
        <p><strong>Physical Seal Impression</strong><br/><code>${sealImage?.sha256 ? sealImage.sha256.slice(0, 24) + '...' : 'Tamper Seal Inscription'}</code></p>
      </div>
    </div>

    <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM} — Page 1 of 5</div>
  </div>

  <!-- PAGE 2: BSA 2023 Section 63(4) Part A -->
  <div class="page">
    ${bsa.partAHtml}
    <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM} — Page 2 of 5</div>
  </div>

  <!-- PAGE 3: BSA 2023 Section 63(4) Part B -->
  <div class="page">
    ${bsa.partBHtml}
    <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM} — Page 3 of 5</div>
  </div>

  <!-- PAGE 4: NDPS Form-4 Inventory & Lot Mappings -->
  <div class="page">
    ${ndps.form4Html}
    <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM} — Page 4 of 5</div>
  </div>

  <!-- PAGE 5: NDPS Form-5 (Magistrate Application) & Form-6 (Test Memo) -->
  <div class="page">
    ${ndps.form5Html}
    <hr style="margin:15px 0; border:0; border-top:1px dashed #aaa;" />
    ${ndps.form6Html}
    <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM} — Page 5 of 5</div>
  </div>

</body>
</html>`.trim();
  }
}

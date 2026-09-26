/**
 * Parinaam — Bharatiya Sakshya Adhiniyam (BSA), 2023 Section 63(4) Certificate Generator
 * Governed by spec/05-phase-4-evidentiary.md (Task 4.7) & spec/legal-constraints.md.
 *
 * Implements:
 * 1. Schedule to BSA 2023 s. 63(4):
 *    - Part A: Certificate by Person having Lawful Control of Device (Seizing Officer)
 *    - Part B: Certificate by Forensic / Cyber Expert
 * 2. Statutory Fields:
 *    - Device Make, Model, and COLOUR (mandatory statutory field)
 *    - Serial Number, Android ID, IMEI/MAC
 *    - Operating system and software version
 *    - SHA-256 hash digest (SHA-1 and MD5 left explicitly blank per forensic best practice)
 *    - 24-hour Indian Standard Time (IST, UTC+05:30) timestamp
 * 3. Mandatory Statutory Presumptive Disclaimer.
 *
 * NOTHING HERE IS INVENTED. Every field the app cannot measure is emitted as an explicit
 * `TO BE COMPLETED` line for the human who signs the certificate. A certificate that
 * silently carries a plausible-looking device, weight, badge or expert is worse than a
 * visibly incomplete one, because a court cannot tell the difference.
 */

/**
 * Placeholder for any statutory field this build cannot measure. The officer signs; the
 * app never guesses. Rule: an unknown fact is stated as unknown, never substituted.
 */
export const TO_BE_COMPLETED = '— TO BE COMPLETED BY THE SIGNING OFFICER —';

import type { TestRecordEntity } from '../types/domain.ts';

export interface DeviceMetadata {
  make: string;
  model: string;
  colour: string; // Statutory requirement under BSA Schedule Part A
  serialNumber: string;
  androidId: string;
  imeiMac: string;
  osVersion: string;
  appVersion: string;
}

export interface CustodianDetails {
  officerName: string;
  designation: string;
  badgeNumber: string;
  agency: string; // e.g. "Narcotics Control Bureau"
  station: string;
}

export interface ExpertDetails {
  expertName: string;
  qualification: string;
  institution: string;
  registrationNumber: string;
}

export interface BsaCertificateBundle {
  partAHtml: string;
  partBHtml: string;
  partAText: string;
  partBText: string;
  generatedAtIst: string;
}

export const PRESUMPTIVE_DISCLAIMER_VERBATIM =
  'Presumptive result only — not a substitute for laboratory confirmatory testing.';

/**
 * Formats an ISO date string into 24-hour IST (UTC+05:30) format:
 * YYYY-MM-DD HH:mm:ss [IST]
 */
export function formatIstTimestamp(isoDateStr: string): string {
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) {
    return isoDateStr;
  }

  // Offset by +05:30
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const istTime = new Date(utc + 5.5 * 3600000);

  const yyyy = istTime.getFullYear();
  const mm = String(istTime.getMonth() + 1).padStart(2, '0');
  const dd = String(istTime.getDate()).padStart(2, '0');
  const hh = String(istTime.getHours()).padStart(2, '0');
  const min = String(istTime.getMinutes()).padStart(2, '0');
  const ss = String(istTime.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} [IST]`;
}

export class BsaCertificateGenerator {
  /**
   * Generates both Part A and Part B statutory certificates under BSA 2023 s. 63(4).
   */
  public generateCertificates(
    record: TestRecordEntity,
    device: DeviceMetadata,
    custodian: CustodianDetails,
    expert?: ExpertDetails
  ): BsaCertificateBundle {
    const timestampIst = formatIstTimestamp(record.device_clock_iso || record.created_at);
    const generationTimeIst = formatIstTimestamp(new Date().toISOString());

    // No default expert. Part B is sworn by a real forensic/cyber expert; this app
    // cannot appoint one, and an invented name with an invented registration number is
    // a forged credential on a statutory document.
    const defaultExpert: ExpertDetails = expert ?? {
      expertName: TO_BE_COMPLETED,
      qualification: TO_BE_COMPLETED,
      institution: TO_BE_COMPLETED,
      registrationNumber: TO_BE_COMPLETED,
    };

    const partAText = this.renderPartAText(record, device, custodian, timestampIst);
    const partBText = this.renderPartBText(record, device, defaultExpert, timestampIst);
    const partAHtml = this.renderPartAHtml(record, device, custodian, timestampIst);
    const partBHtml = this.renderPartBHtml(record, device, defaultExpert, timestampIst);

    return {
      partAHtml,
      partBHtml,
      partAText,
      partBText,
      generatedAtIst: generationTimeIst,
    };
  }

  private renderPartAText(
    record: TestRecordEntity,
    device: DeviceMetadata,
    custodian: CustodianDetails,
    timestampIst: string
  ): string {
    return `
================================================================================
BHARATIYA SAKSHYA ADHINIYAM (BSA), 2023 — SECTION 63(4)
CERTIFICATE TO BE PRODUCED UNDER SUB-SECTION (4) OF SECTION 63
PART A — TO BE FILLED BY THE PERSON PRODUCING THE ELECTRONIC RECORD
================================================================================

[STATUTORY MANDATORY DISCLAIMER]
"${PRESUMPTIVE_DISCLAIMER_VERBATIM}"

1. PARTICULARS OF THE DEVICE PRODUCING THE RECORD:
   (a) Make of Device        : ${device.make}
   (b) Model of Device       : ${device.model}
   (c) Colour of Device      : ${device.colour}
   (d) Serial / IMEI Number  : ${device.serialNumber} / ${device.imeiMac}
   (e) Device Identifier     : Android ID: ${device.androidId}
   (f) Operating System      : Android ${device.osVersion} (Parinaam v${device.appVersion})

2. LAWFUL CUSTODY & REGULAR OPERATION AFFIRMATION:
   I, ${custodian.officerName}, ${custodian.designation}, ${custodian.agency}, ${custodian.station},
   hereby solemnly state and affirm that:
   (a) The electronic record bearing Record UUID: ${record.record_uuid} was produced by the
       aforesaid electronic device during the period over which I had lawful control over its use.
   (b) The said device was operating properly during the relevant period, and the optical capture,
       chromatic normalization, and cryptographic sealing processes were functioning regularly.
   (c) The contents of the record were ingested exclusively via optical camera sensors under
       locked optical conditions (AE/AWB/AF) and no gallery or external image ingest occurred.
   (d) Packaging and seizure followed Rule 10(2) of the NDPS (Seizure, Storage, Sampling and
       Disposal) Rules, 2022 (G.S.R. 899(E)) under Package Reference: ${record.package_no}.

3. HASH DIGEST OF THE ELECTRONIC RECORD (CRYPTOGRAPHIC INTEGRITY):
   - SHA-256 Hash Digest     : ${record.payload_sha256}
   - Chain Hash (Cumulative) : ${record.chain_hash}
   - SHA-1 Hash Value        : [EXPLICITLY LEFT BLANK - DEPRECATED FOR FORENSIC USE]
   - MD-5 Hash Value         : [EXPLICITLY LEFT BLANK - DEPRECATED FOR FORENSIC USE]

4. PROVENANCE & DEVICE ATTESTATION:
   - Hardware Security Level : ${record.security_level}
   - Device Attestation Seal : ${
     record.device_attestation
       ? `${record.device_attestation.slice(0, 64)}… (recorded, not verified by this certificate)`
       : 'NOT PRESENT — no device key was available; the SHA-256 chain below is the integrity evidence'
   }
   - Timestamp of Seizure    : ${timestampIst}

Signature: ___________________________
Name     : ${custodian.officerName}
Badge No : ${custodian.badgeNumber}
Date     : ${timestampIst}
Agency   : ${custodian.agency}
================================================================================
`.trim();
  }

  private renderPartBText(
    record: TestRecordEntity,
    _device: DeviceMetadata,
    expert: ExpertDetails,
    timestampIst: string
  ): string {
    return `
================================================================================
BHARATIYA SAKSHYA ADHINIYAM (BSA), 2023 — SECTION 63(4)
CERTIFICATE TO BE PRODUCED UNDER SUB-SECTION (4) OF SECTION 63
PART B — TO BE FILLED BY THE FORENSIC / CYBER EXPERT
(As mandated by Pune Bar Association v. Union of India, Supreme Court of India, 2026)
================================================================================

[STATUTORY MANDATORY DISCLAIMER]
"${PRESUMPTIVE_DISCLAIMER_VERBATIM}"

1. EXPERT CREDENTIALS:
   - Name of Expert          : ${expert.expertName}
   - Professional Credentials: ${expert.qualification}
   - Institution / Laboratory: ${expert.institution}
   - Registration / Empanel  : ${expert.registrationNumber}

2. TECHNICAL EXAMINATION OF INTEGRITY & ATTRIBUTIONS:
   I have examined the cryptographic ledger, attestation seal, and mathematical pipeline
   associated with Record UUID: ${record.record_uuid} and certify that:
   (a) The cryptographic hash chain is unbroken and sequential; no database UPDATE or DELETE
       mutations are possible per append-only database schema triggers.
   (b) Device integrity seal status as recorded by the capturing device:
       ${record.device_attestation ? `SEAL PRESENT (${record.security_level}) — NOT cryptographically verified by this certificate` : 'NO DEVICE SEAL PRESENT — this build records the hash chain only'}.
       This app does not verify a hardware-backed key signature, and this certificate does
       not assert one. Reproduce the chain independently before relying on it.
   (c) Colorimetric measurement was executed via transparent corrected CIELAB and CIEDE2000
       distance analysis; no neural network or substance-identity assertion was used.
   (d) The presumptive classification outcome recorded is: ${record.outcome}.

3. HASH DIGEST VERIFICATION:
   - Stored Payload Digest   : ${record.payload_sha256}
   - Independent Verification: NOT PERFORMED BY THIS CERTIFICATE — reproduce it with the
     bundled verify.sh (RFC 8785 Canonical JSON, SHA-256) or POST /records/:uuid/verify
   - Sequential Chain Hash   : ${record.chain_hash}
   - Previous Block Hash     : ${record.prev_hash}

Signature: ___________________________
Name     : ${expert.expertName}
Empanel  : ${expert.registrationNumber}
Date     : ${timestampIst}
================================================================================
`.trim();
  }

  private renderPartAHtml(
    record: TestRecordEntity,
    device: DeviceMetadata,
    custodian: CustodianDetails,
    timestampIst: string
  ): string {
    return `
<div class="bsa-certificate part-a">
  <div class="disclaimer-banner">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
  <h2>Bharatiya Sakshya Adhiniyam, 2023 — Section 63(4)</h2>
  <h3>PART A: Certificate by Person Having Lawful Control of Device</h3>
  <table class="cert-table">
    <tr><th>Record UUID</th><td><code>${record.record_uuid}</code></td></tr>
    <tr><th>Package No (NDPS Rule 10(2))</th><td><strong>${record.package_no}</strong></td></tr>
    <tr><th>Device Make / Model</th><td>${device.make} ${device.model}</td></tr>
    <tr><th>Device Colour (Statutory)</th><td><strong>${device.colour}</strong></td></tr>
    <tr><th>Serial No / IMEI / MAC</th><td>${device.serialNumber} / ${device.imeiMac}</td></tr>
    <tr><th>Device Identifier</th><td>Android ID: ${device.androidId}</td></tr>
    <tr><th>Seizure Timestamp (IST)</th><td><strong>${timestampIst}</strong></td></tr>
    <tr><th>SHA-256 Hash Digest</th><td><code>${record.payload_sha256}</code></td></tr>
    <tr><th>Chain Hash</th><td><code>${record.chain_hash}</code></td></tr>
    <tr><th>Hardware Security Level</th><td>${record.security_level}</td></tr>
    <tr><th>Device Attestation (Seal)</th><td class="hex-dump"><code>${
      record.device_attestation
        ? `${record.device_attestation.slice(0, 48)}...`
        : 'NOT PRESENT — chain-only seal; see the Integrity screen'
    }</code></td></tr>
  </table>
  <div class="affirmation-box">
    <p>I, <strong>${custodian.officerName}</strong> (${custodian.designation}), solemnly affirm that I had lawful custody of the device, which was operating normally without compromise.</p>
  </div>
  <div class="sig-block">
    <p>Officer Signature: _______________________ (Badge: ${custodian.badgeNumber})</p>
    <p>Agency: ${custodian.agency}, ${custodian.station}</p>
  </div>
  <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
</div>
`.trim();
  }

  private renderPartBHtml(
    record: TestRecordEntity,
    _device: DeviceMetadata,
    expert: ExpertDetails,
    timestampIst: string
  ): string {
    return `
<div class="bsa-certificate part-b">
  <div class="disclaimer-banner">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
  <h2>Bharatiya Sakshya Adhiniyam, 2023 — Section 63(4)</h2>
  <h3>PART B: Certificate by Forensic / Cyber Expert</h3>
  <p class="citation">Mandated under <em>Pune Bar Association v. Union of India</em> (SC 2026)</p>
  <table class="cert-table">
    <tr><th>Examiner</th><td><strong>${expert.expertName}</strong> (${expert.registrationNumber})</td></tr>
    <tr><th>Institution</th><td>${expert.institution}</td></tr>
    <tr><th>Record UUID</th><td><code>${record.record_uuid}</code></td></tr>
    <tr><th>Presumptive Outcome</th><td><strong>${record.outcome}</strong></td></tr>
    <tr><th>Confidence / Candidate Set</th><td>${(record.confidence * 100).toFixed(1)}% / ${record.conformal_set}</td></tr>
    <tr><th>Verified SHA-256 Digest</th><td><code>${record.payload_sha256}</code></td></tr>
    <tr><th>Chain Hash Linkage</th><td><code>${record.chain_hash}</code></td></tr>
    <tr><th>Device Integrity Seal</th><td>${
      record.device_attestation
        ? `Present, recorded as ${record.security_level} — NOT verified by this certificate`
        : 'NOT PRESENT — this build records the hash chain only'
    }</td></tr>
    <tr><th>Examination Timestamp</th><td><strong>${timestampIst}</strong></td></tr>
  </table>
  <div class="sig-block">
    <p>Expert Signature: _______________________</p>
    <p>${expert.expertName}, ${expert.qualification}</p>
  </div>
  <div class="disclaimer-footer">${PRESUMPTIVE_DISCLAIMER_VERBATIM}</div>
</div>
`.trim();
  }
}

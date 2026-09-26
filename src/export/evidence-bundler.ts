/**
 * Parinaam — Evidence Bundler Service (CertifyModule Implementation)
 * Governed by spec/05-phase-4-evidentiary.md (Task 4.10) & spec/00-overview.md.
 *
 * Implements CertifyModule contract:
 * generateEvidenceBundle(recordUuid: string): Promise<CertifiedBundle>
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CertifiedBundle, CertifyModule } from '../types/contracts.ts';
import type { TestRecordEntity } from '../types/domain.ts';
import {
  BsaCertificateGenerator,
  TO_BE_COMPLETED,
  type CustodianDetails,
  type DeviceMetadata,
  type ExpertDetails,
} from './certificate-generator.ts';
import { NdpsFormsGenerator, type SeizureCaseDetails } from './ndps-forms.ts';
import { CourtPdfBundleGenerator } from './pdf-bundle.ts';
import { ManifestGenerator } from './manifest-generator.ts';

export interface EvidenceBundlerOptions {
  outputBaseDir?: string;
  defaultDevice?: DeviceMetadata;
  defaultCustodian?: CustodianDetails;
  defaultExpert?: ExpertDetails;
  defaultSeizure?: SeizureCaseDetails;
}

export class EvidenceBundlerService implements CertifyModule {
  private outputBaseDir: string;
  private bsaGen: BsaCertificateGenerator;
  private ndpsGen: NdpsFormsGenerator;
  private pdfGen: CourtPdfBundleGenerator;
  private manifestGen: ManifestGenerator;
  private recordStore: Map<string, TestRecordEntity> = new Map();

  constructor(options: EvidenceBundlerOptions = {}) {
    this.outputBaseDir = options.outputBaseDir ?? path.join(process.cwd(), 'build', 'evidence-bundles');
    this.bsaGen = new BsaCertificateGenerator();
    this.ndpsGen = new NdpsFormsGenerator();
    this.pdfGen = new CourtPdfBundleGenerator();
    this.manifestGen = new ManifestGenerator();
  }

  public registerRecord(record: TestRecordEntity): void {
    this.recordStore.set(record.record_uuid, record);
  }

  /**
   * Generates the complete, standalone court evidence bundle for a given test record.
   */
  public async generateEvidenceBundle(recordUuid: string): Promise<CertifiedBundle> {
    const record = this.recordStore.get(recordUuid);
    if (!record) {
      throw new Error(`Test record not found for UUID: ${recordUuid}`);
    }

    const bundleDir = path.join(this.outputBaseDir, recordUuid);
    fs.mkdirSync(bundleDir, { recursive: true });

    // Nothing below is invented. This module writes a bundle from whatever the sealed
    // record actually contains; any statutory particular it cannot know is emitted as an
    // explicit TO_BE_COMPLETED line for the human who signs. The previous version
    // hardcoded a second, contradictory set of facts (a different expert, badge, device,
    // court and 520 g weight) which is exactly the kind of plausible fabrication a court
    // cannot detect.
    const device: DeviceMetadata = {
      make: TO_BE_COMPLETED,
      model: record.device_model || TO_BE_COMPLETED,
      colour: TO_BE_COMPLETED,
      serialNumber: record.device_serial || TO_BE_COMPLETED,
      androidId: TO_BE_COMPLETED,
      imeiMac: 'NOT CAPTURED — this build does not read hardware identifiers',
      osVersion: TO_BE_COMPLETED,
      appVersion: 'Parinaam (version as installed on this device)',
    };

    const custodian: CustodianDetails = {
      officerName: record.operator_id,
      designation: TO_BE_COMPLETED,
      badgeNumber: TO_BE_COMPLETED,
      agency: TO_BE_COMPLETED,
      station: TO_BE_COMPLETED,
    };

    const expert: ExpertDetails = {
      expertName: TO_BE_COMPLETED,
      qualification: TO_BE_COMPLETED,
      institution: TO_BE_COMPLETED,
      registrationNumber: TO_BE_COMPLETED,
    };

    const seizure: SeizureCaseDetails = {
      caseCrimeNo: record.case_ref ?? TO_BE_COMPLETED,
      panchnamaRef: record.panchnama_ref || 'NOT RECORDED',
      seizingAgency: TO_BE_COMPLETED,
      seizingOfficer: custodian.officerName,
      officerDesignation: custodian.designation,
      placeOfSeizure:
        record.gps_lat != null && record.gps_lon != null
          ? `GPS ${record.gps_lat.toFixed(4)}, ${record.gps_lon.toFixed(4)} — WRITTEN PLACE NOT CAPTURED BY THIS APP`
          : 'NOT CAPTURED',
      dateOfSeizure: record.created_at,
      magistrateCourtName: TO_BE_COMPLETED,
      allegedDescription: 'Presumptive colorimetric spot-tested substance in sealed transit package',
      grossWeightGrams: null,
      netWeightGrams: null,
    };

    // 1. Generate BSA Certificates
    const bsaBundle = this.bsaGen.generateCertificates(record, device, custodian, expert);
    const partAPath = path.join(bundleDir, 'BSA_Section_63_Part_A.txt');
    const partBPath = path.join(bundleDir, 'BSA_Section_63_Part_B.txt');
    fs.writeFileSync(partAPath, bsaBundle.partAText, 'utf-8');
    fs.writeFileSync(partBPath, bsaBundle.partBText, 'utf-8');

    // 2. Generate NDPS Forms
    const ndpsBundle = this.ndpsGen.generateForms(record, seizure);
    const form4Path = path.join(bundleDir, 'NDPS_Form_4_Inventory.txt');
    const form5Path = path.join(bundleDir, 'NDPS_Form_5_Magistrate_Application.txt');
    const form6Path = path.join(bundleDir, 'NDPS_Form_6_Test_Memo.txt');
    fs.writeFileSync(form4Path, ndpsBundle.form4Text, 'utf-8');
    fs.writeFileSync(form5Path, ndpsBundle.form5Text, 'utf-8');
    fs.writeFileSync(form6Path, ndpsBundle.form6Text, 'utf-8');

    // 3. Generate Court Dossier HTML (PDF Source)
    const dossierHtml = this.pdfGen.generateCourtBundleHtml({
      record,
      device,
      custodian,
      expert,
      seizure,
    });
    const dossierPath = path.join(bundleDir, 'Court_Evidence_Dossier.html');
    fs.writeFileSync(dossierPath, dossierHtml, 'utf-8');

    // 4. Copy standalone verify.sh
    const srcVerifySh = path.join(process.cwd(), 'scripts', 'verify.sh');
    const bundleVerifySh = path.join(bundleDir, 'verify.sh');
    if (fs.existsSync(srcVerifySh)) {
      fs.copyFileSync(srcVerifySh, bundleVerifySh);
      fs.chmodSync(bundleVerifySh, 0o755);
    }

    // 5. Generate MANIFEST.txt
    const manifestResult = await this.manifestGen.generateManifest([
      { filename: 'BSA_Section_63_Part_A.txt', contentUtf8: bsaBundle.partAText },
      { filename: 'BSA_Section_63_Part_B.txt', contentUtf8: bsaBundle.partBText },
      { filename: 'NDPS_Form_4_Inventory.txt', contentUtf8: ndpsBundle.form4Text },
      { filename: 'NDPS_Form_5_Magistrate_Application.txt', contentUtf8: ndpsBundle.form5Text },
      { filename: 'NDPS_Form_6_Test_Memo.txt', contentUtf8: ndpsBundle.form6Text },
      { filename: 'Court_Evidence_Dossier.html', contentUtf8: dossierHtml },
    ]);
    const manifestPath = path.join(bundleDir, 'MANIFEST.txt');
    fs.writeFileSync(manifestPath, manifestResult.manifestText, 'utf-8');

    return {
      partAPdfUri: partAPath,
      partBPdfUri: partBPath,
      ndpsForm4Uri: form4Path,
      ndpsForm5Uri: form5Path,
      ndpsForm6Uri: form6Path,
      manifestUri: manifestPath,
      verifierScriptUri: bundleVerifySh,
    };
  }
}

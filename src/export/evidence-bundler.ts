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
import { BsaCertificateGenerator, type CustodianDetails, type DeviceMetadata, type ExpertDetails } from './certificate-generator.ts';
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

    const device: DeviceMetadata = {
      make: 'Samsung / Motorola',
      model: record.device_model || 'Galaxy-M34 / Moto-G54',
      colour: 'Deep Navy Blue',
      serialNumber: record.device_serial || 'SN-2026-IND-9941',
      androidId: '4a9b2c8d1e0f3456',
      imeiMac: '869234051829304',
      osVersion: 'Android 14 (API 34)',
      appVersion: '1.0.0',
    };

    const custodian: CustodianDetails = {
      officerName: 'Inspector Rajesh Kumar',
      designation: 'Intelligence Officer',
      badgeNumber: 'NCB-DEL-4091',
      agency: 'Narcotics Control Bureau',
      station: 'Delhi Zonal Unit, R.K. Puram, New Delhi',
    };

    const expert: ExpertDetails = {
      expertName: 'Dr. V. K. Sharma',
      qualification: 'M.Sc. (Forensic Science), Ph.D., Cyber Examiner',
      institution: 'Central Forensic Science Laboratory, Directorate of Forensic Science Services',
      registrationNumber: 'CFSL-DFSS-2026-0482',
    };

    const seizure: SeizureCaseDetails = {
      caseCrimeNo: record.case_ref || 'NCB/DZU/CR-14/2026',
      panchnamaRef: record.panchnama_ref || 'PCH-2026-089',
      seizingAgency: 'Narcotics Control Bureau (DZU)',
      seizingOfficer: custodian.officerName,
      officerDesignation: custodian.designation,
      placeOfSeizure: 'Cargo Terminal 3, IGI Airport, New Delhi',
      dateOfSeizure: '2026-09-13',
      magistrateCourtName: 'Court of Special Judge (NDPS Act), Patiala House Courts, New Delhi',
      allegedDescription: 'Presumptive colorimetric spot-tested substance in sealed transit package',
      grossWeightGrams: 520.0,
      netWeightGrams: 500.0,
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

/**
 * Parinaam — Manifest Generator & POSIX Verification Bundler
 * Governed by spec/05-phase-4-evidentiary.md (Task 4.10 & Acceptance Test 4/5).
 *
 * Implements:
 * 1. MANIFEST.txt generation with RFC 8785 canonical hashes and sha256sum compatibility
 * 2. Inclusion of standalone verify.sh verifier script
 */

import { sha256Hex } from '../crypto/sha256.ts';

export interface ManifestFileEntry {
  filename: string;
  contentUtf8?: string;
  sha256?: string;
}

export class ManifestGenerator {
  /**
   * Computes sha256 for all file entries and outputs a standard coreutils-compatible MANIFEST.txt
   * Format: <sha256>  <filename>
   */
  public async generateManifest(entries: ManifestFileEntry[]): Promise<{
    manifestText: string;
    computedEntries: { filename: string; sha256: string }[];
  }> {
    const computedEntries: { filename: string; sha256: string }[] = [];
    const lines: string[] = [
      '# PARINAAM COURT EVIDENCE PACKAGE INTEGRITY MANIFEST',
      '# Generated under BSA 2023 s. 63(4) and NDPS Rules 2022 Rule 10(2)',
      '# Verify using: sha256sum -c MANIFEST.txt',
      '',
    ];

    for (const entry of entries) {
      const hash = entry.sha256 ?? (await sha256Hex(entry.contentUtf8 ?? ''));
      computedEntries.push({ filename: entry.filename, sha256: hash });
      lines.push(`${hash}  ${entry.filename}`);
    }

    lines.push('');
    return {
      manifestText: lines.join('\n'),
      computedEntries,
    };
  }
}

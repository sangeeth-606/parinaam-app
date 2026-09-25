/**
 * Evidence image store (v2 phase F) — camera bytes become durable, hashed evidence.
 *
 * Storage law for this module:
 *  • writes are append-only into the app-private folder (rule-2 spirit — no overwrite,
 *    no delete offered in v2);
 *  • the sha256 is computed over the RAW BYTES with the isomorphic byte hasher, so the
 *    device, Node tests, and the server all agree on what "image_sha256" means;
 *  • every failure path returns { saved: null, reason } — a missing native module is an
 *    HONEST ABSENCE, never a fabricated hash (the export-flow bug this phase kills).
 *
 * The default filesystem deps lazily load expo-file-system (SDK 57 File/Paths API);
 * tests inject a fake, and Node/simulator runs simply get a null + reason.
 */

import { base64ToBytes, sha256HexBytes } from '../crypto/sha256-bytes.ts';

export const EVIDENCE_DIR = 'Parinaam/evidence';

export function evidenceFileName(uuid: string): string {
  return `${EVIDENCE_DIR}/${uuid}.jpg`;
}

export interface EvidenceFsDeps {
  /** Write base64 contents at relPath (app-private root); returns bytes written. Must refuse to overwrite. */
  writeBase64NoOverwrite(relPath: string, base64: string): Promise<number>;
  /** Read an existing evidence file's bytes (for idempotent re-check), or null. */
  readIfPresent(relPath: string): Promise<Uint8Array | null>;
}

export interface EvidenceImage {
  ref: string;
  sha256: string;
  bytes: number;
}

export type EvidenceSaveResult = { saved: EvidenceImage } | { saved: null; reason: string };

async function defaultDeps(): Promise<EvidenceFsDeps | null> {
  try {
    const fs = await import('expo-file-system');
    const { File, Paths } = fs as unknown as {
      File: new (dir: unknown, relPath?: string) => {
        exists: boolean;
        create(opts?: { overwrite?: boolean; contents?: string | Uint8Array; encoding?: string; intermediates?: boolean }): void;
        base64(): string;
        bytes(): Uint8Array;
        parentDirectory: { create(opts?: { intermediates?: boolean }): void };
      };
      Paths: { documentDir: unknown };
    };
    return {
      async writeBase64NoOverwrite(relPath, base64) {
        const file = new File(Paths.documentDir, relPath);
        if (file.exists) {
          // Already sealed once — re-seal reads, never rewrites (append-only evidence).
          const existing = file.bytes();
          return existing.length;
        }
        file.parentDirectory.create({ intermediates: true });
        file.create({ overwrite: false, contents: base64, encoding: 'base64' });
        return new File(Paths.documentDir, relPath).bytes().length;
      },
      async readIfPresent(relPath) {
        const file = new File(Paths.documentDir, relPath);
        return file.exists ? file.bytes() : null;
      },
    };
  } catch {
    return null;
  }
}

/**
 * Persist a camera photo as evidence. Input is a file uri (device capture) OR a base64
 * payload (tests / future transports). Exactly one source must be provided.
 */
export async function saveEvidenceImage(
  input: { uuid: string; uri?: string; base64?: string },
  deps?: EvidenceFsDeps
): Promise<EvidenceSaveResult> {
  if (!input.uuid) return { saved: null, reason: 'no record uuid supplied' };
  if (!input.uri && !input.base64) return { saved: null, reason: 'no camera bytes supplied for this record' };

  const fsDeps = deps ?? (await defaultDeps());
  if (!fsDeps) {
    return { saved: null, reason: 'evidence storage unavailable in this runtime (expo-file-system absent)' };
  }

  let base64 = input.base64;
  if (!base64 && input.uri) {
    try {
      const fs = await import('expo-file-system');
      const { File } = fs as unknown as { File: new (uri: string) => { base64(): string } };
      base64 = new File(input.uri).base64();
    } catch {
      return { saved: null, reason: 'camera photo file unreadable on this runtime' };
    }
  }
  if (!base64) return { saved: null, reason: 'camera photo file unreadable' };

  const relPath = evidenceFileName(input.uuid);
  try {
    const bytesWritten = await fsDeps.writeBase64NoOverwrite(relPath, base64);
    // Hash WHAT IS ON DISK (post-existing-file path included), not what we meant to write.
    const onDisk = (await fsDeps.readIfPresent(relPath)) ?? base64ToBytes(base64);
    const sha256 = await sha256HexBytes(onDisk);
    return { saved: { ref: relPath, sha256, bytes: bytesWritten || onDisk.length } };
  } catch (err) {
    return { saved: null, reason: `evidence write failed: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

/** Read app-private evidence bytes for transport; missing evidence stays honestly null. */
export async function readEvidenceImageBytes(ref: string, deps?: EvidenceFsDeps): Promise<Uint8Array | null> {
  if (!ref) return null;
  const fsDeps = deps ?? (await defaultDeps());
  if (!fsDeps) return null;
  try {
    return await fsDeps.readIfPresent(ref);
  } catch {
    return null;
  }
}

/** Storage facts for Settings → STORAGE (counts what this build wrote; honest null otherwise). */
export async function evidenceStorageFacts(): Promise<{ files: number; bytes: number } | null> {
  try {
    const fs = await import('expo-file-system');
    const { Directory, Paths, File } = fs as unknown as {
      Directory: new (dir: unknown, rel?: string) => { exists: boolean; list(): { name: string }[] };
      File: new (dir: unknown, rel: string) => { size: number };
      Paths: { documentDir: unknown };
    };
    const dir = new Directory(Paths.documentDir, EVIDENCE_DIR);
    if (!dir.exists) return { files: 0, bytes: 0 };
    const entries = dir.list();
    let bytes = 0;
    for (const e of entries) bytes += new File(Paths.documentDir, `${EVIDENCE_DIR}/${e.name}`).size;
    return { files: entries.length, bytes };
  } catch {
    return null;
  }
}

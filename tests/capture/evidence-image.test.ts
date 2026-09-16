/**
 * F1 — evidence-image store: fake fs proves bytes-on-disk hashing, no-overwrite
 * idempotence (the hash of an already-staled file wins), and the honest null-reason
 * branches (simulated acquisition / missing uuid).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evidenceFileName, saveEvidenceImage, type EvidenceFsDeps } from '../../src/capture/evidence-image.ts';
import { base64ToBytes } from '../../src/crypto/sha256-bytes.ts';

function fakeFs(): { deps: EvidenceFsDeps; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    deps: {
      async writeBase64NoOverwrite(relPath, base64) {
        if (files.has(relPath)) return files.get(relPath)!.length; // refuses rewrite
        const bytes = base64ToBytes(base64);
        files.set(relPath, bytes);
        return bytes.length;
      },
      async readIfPresent(relPath) {
        return files.get(relPath) ?? null;
      },
    },
  };
}

const JPEGISH = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 250, 251, 252]);

describe('phase F — evidence image store', () => {
  it('stores bytes and reports sha256 of the RAW FILE bytes', async () => {
    const { deps, files } = fakeFs();
    const b64 = Buffer.from(JPEGISH).toString('base64');
    const res = await saveEvidenceImage({ uuid: 'REC-F-1', base64: b64 }, deps);
    assert.ok(res.saved);
    assert.equal(res.saved.ref, evidenceFileName('REC-F-1'));
    assert.equal(res.saved.sha256, createHash('sha256').update(Buffer.from(JPEGISH)).digest('hex'));
    assert.equal(res.saved.bytes, JPEGISH.length);
    assert.deepEqual(Array.from(files.get(res.saved.ref)!), Array.from(JPEGISH));
  });

  it('re-seal of the same uuid hashes what IS on disk, never clobbers it', async () => {
    const { deps, files } = fakeFs();
    await saveEvidenceImage({ uuid: 'REC-F-2', base64: Buffer.from(JPEGISH).toString('base64') }, deps);
    const evil = Buffer.from([0xde, 0xad, 0xbe, 0xef]).toString('base64');
    const res = await saveEvidenceImage({ uuid: 'REC-F-2', base64: evil }, deps);
    assert.ok(res.saved);
    assert.equal(res.saved.sha256, createHash('sha256').update(Buffer.from(JPEGISH)).digest('hex'), 'original bytes win');
    assert.equal(files.size, 1);
  });

  it('simulated acquisition → honest null with reason, no exception', async () => {
    const res = await saveEvidenceImage({ uuid: 'REC-F-3' }, fakeFs().deps);
    assert.equal(res.saved, null);
    assert.match(res.reason ?? '', /simulated acquisition/);
  });

  it('no uuid → honest null', async () => {
    const res = await saveEvidenceImage({ uuid: '', base64: 'AAA=' }, fakeFs().deps);
    assert.equal(res.saved, null);
    assert.match(res.reason ?? '', /uuid/i);
  });

  it('write failure → honest null with cause (never a fabricated hash)', async () => {
    const broken: EvidenceFsDeps = {
      async writeBase64NoOverwrite() {
        throw new Error('disk full');
      },
      async readIfPresent() {
        return null;
      },
    };
    const res = await saveEvidenceImage({ uuid: 'REC-F-5', base64: 'AAA=' }, broken);
    assert.equal(res.saved, null);
    assert.match(res.reason ?? '', /disk full/);
  });
});

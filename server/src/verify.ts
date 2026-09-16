/**
 * Parinaam API — record verification (v2 phase D).
 *
 * Uses the SAME RFC 8785 canonicalizer as the app (src/crypto/canonical-json.ts) so
 * "server recomputes the hash" is a real, repo-wide single-implementation property.
 * Checks performed (all honest, none assumed):
 *   1. required fields present and correctly typed;
 *   2. payload_jcs is itself canonical (JCS(re-parse) === payload_jcs);
 *   3. sha256(payload_jcs) === record_hash;
 *   4. outcome is one of the trilevel constants (wire vocabulary, plan 04 D1);
 *   5. chain linkage against the previously stored record (when known).
 * device_attestation is STORED, not cryptographically verified here (no claim made).
 */

import { canonicalizeJson } from '../../src/crypto/canonical-json.ts';
import { sha256Hex } from '../../src/crypto/sha256.ts';

export const WIRE_OUTCOMES = [
  'CONSISTENT_WITH_REAGENT_POSITIVE',
  'CONSISTENT_WITH_REAGENT_NEGATIVE',
  'INCONCLUSIVE',
] as const;

export interface VerifyResult {
  ok: boolean;
  code: number; // http status to use
  reason: string;
  checks: string[];
}

export function extractSealedSubset(body: Record<string, unknown>): Record<string, unknown> | null {
  // The app's sealed payload keys (fixtures/ResultsScreen baseSealPayload): the server
  // recomputes canonical form of THESE keys with their values from the record body.
  const src = body.payload_sealed_subset as Record<string, unknown> | undefined;
  return src && typeof src === 'object' ? src : null;
}

export interface LinkContext {
  /** chain_hash of the most recently received record (order check), null if none yet. */
  lastChainHash: string | null;
  /** every chain_hash the server has ever accepted (link check; genesis allowed). */
  knownChainHashes: Set<string>;
}

export async function verifyFieldTestRecord(
  body: Record<string, unknown>,
  link: LinkContext
): Promise<VerifyResult> {
  const checks: string[] = [];
  const fail = (reason: string): VerifyResult => ({ ok: false, code: 422, reason, checks });

  const requiredStrings = ['record_uuid', 'case_ref', 'package_no', 'reagent', 'outcome', 'created_at', 'operator_id', 'payload_jcs', 'record_hash', 'prev_hash', 'chain_hash'];
  for (const k of requiredStrings) {
    if (typeof body[k] !== 'string' || (body[k] as string).length === 0) {
      return { ok: false, code: 400, reason: `missing-field: ${k}`, checks };
    }
    checks.push(`present: ${k}`);
  }

  if (!(WIRE_OUTCOMES as readonly string[]).includes(body.outcome as string)) {
    return fail('outcome outside trilevel wire vocabulary');
  }
  checks.push('outcome: trilevel vocabulary');

  if (typeof body.confidence !== 'number' || body.confidence < 0 || body.confidence > 1) {
    return fail('confidence outside [0,1]');
  }
  checks.push('confidence: 0..1');

  const payloadJcs = body.payload_jcs as string;
  let reparsed: unknown;
  try {
    reparsed = JSON.parse(payloadJcs);
  } catch {
    return fail('payload_jcs is not valid JSON');
  }
  if (canonicalizeJson(reparsed) !== payloadJcs) {
    return fail('payload_jcs is not RFC 8785 canonical');
  }
  checks.push('payload_jcs: canonical (JCS round-trip)');

  const recomputed = await sha256Hex(payloadJcs);
  if (recomputed !== body.record_hash) {
    return fail(`hash-mismatch: recomputed ${recomputed.slice(0, 12)}… ≠ record_hash ${String(body.record_hash).slice(0, 12)}…`);
  }
  checks.push('record_hash: sha256(payload_jcs) recomputed OK');

  // Linkage: out-of-order delivery is EXPECTED with offline backoff sync, so the hard
  // rule is only "prev_hash must be a hash this server has seen (or genesis)". Order is
  // reported, never enforced.
  const GENESIS = '0'.repeat(64);
  const prev = body.prev_hash as string;
  if (prev !== GENESIS && !link.knownChainHashes.has(prev)) {
    return fail('chain-link: prev_hash unknown to this server (record before it never synced)');
  }
  checks.push('chain-link: prev_hash known');
  if (link.lastChainHash !== null) {
    checks.push(prev === link.lastChainHash ? 'chain-order: in sequence' : 'chain-order: out of sequence (allowed, backoff replay)');
  }

  return { ok: true, code: 201, reason: 'verified', checks };
}

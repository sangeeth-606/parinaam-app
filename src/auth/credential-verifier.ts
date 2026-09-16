/**
 * Auth — credential verifier (v2 §3, phase B)
 *
 * A LOCAL DEVICE-CREDENTIAL GATE: it proves somebody holding this device knows the
 * officer credential. It is NOT statutory identity, NOT a hardware signature, and makes
 * no such claim anywhere in the UI (AGENTS rule 6/10 culture). OTP/biometric/device
 * binding attach in front of this seam later (v2 brief §3; deferred to the Supabase pass).
 *
 * No plaintext storage: the shipped verifier is salt + SHA-256(salt:username:password).
 * Comparison is constant-time.
 */

import { sha256Hex } from '../crypto/sha256.ts';

export interface CredentialVerifier {
  username: string;
  saltHex: string;
  digestHex: string;
}

/** Precomputed at build time; the password itself is nowhere in source. */
export const DEMO_OFFICER_VERIFIER: CredentialVerifier = {
  username: 'admin',
  saltHex: '9f2c41ab77e0d63518bc2f4a0c17de93',
  digestHex: '9b7f3f91b7ec7423a454c259391a3dadf435cecad80a7667d00677ed5c79420f',
};

export async function makeVerifier(
  username: string,
  password: string,
  saltHex: string
): Promise<CredentialVerifier> {
  return { username, saltHex, digestHex: await hashCredential(username, password, saltHex) };
}

async function hashCredential(username: string, password: string, saltHex: string): Promise<string> {
  return sha256Hex(`${saltHex}:${username}:${password}`);
}

/** Constant-time comparison of two equal-domain hex strings. */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyCredential(
  verifier: CredentialVerifier,
  username: string,
  password: string
): Promise<boolean> {
  if (username.trim().toLowerCase() !== verifier.username.toLowerCase()) return false;
  const candidate = await hashCredential(verifier.username, password, verifier.saltHex);
  return constantTimeEquals(candidate, verifier.digestHex);
}

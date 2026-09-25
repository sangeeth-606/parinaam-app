/**
 * Kit Profile Loader & Validator
 *
 * Responsibilities:
 * 1. Parse/validate a KitProfile object (from YAML or a typed object).
 * 2. Enforce the PENDING_VALIDATION guard: a profile with status PENDING_VALIDATION
 *    cannot be upcast to ValidatedKitProfile, and therefore cannot reach
 *    TestResultClassifier (which only accepts ValidatedKitProfile).
 * 3. Provide typed access to profile data.
 *
 * Note on YAML loading: In the React Native app, kit profile YAML files are
 * bundled as static assets and parsed at startup. The engine accepts pre-parsed
 * JS objects (not raw YAML strings) — YAML parsing is done at the boundary
 * (e.g., in captureOrchestrator.ts using a YAML parser such as js-yaml).
 */

import type { KitProfile, ValidatedKitProfile, ExpectedResultColor } from '../types';

// ─── VALIDATION ───────────────────────────────────────────────────────────────

export class KitProfileValidationError extends Error {
  constructor(message: string) {
    super(`KitProfileValidationError: ${message}`);
    this.name = 'KitProfileValidationError';
  }
}

/** Validate a KitProfile object's structural integrity (schema check). */
export function validateKitProfileSchema(profile: KitProfile): void {
  if (!profile.kit_profile_id) throw new KitProfileValidationError('Missing kit_profile_id');
  if (!profile.test_geometry) throw new KitProfileValidationError('Missing test_geometry');
  if (!Array.isArray(profile.expected_result_colors) || profile.expected_result_colors.length === 0) {
    throw new KitProfileValidationError('expected_result_colors must be a non-empty array');
  }
  if (!profile.validity_rules) throw new KitProfileValidationError('Missing validity_rules');
  if (typeof profile.validity_rules.min_confidence_to_classify !== 'number') {
    throw new KitProfileValidationError('min_confidence_to_classify must be a number');
  }
}

/**
 * Attempt to upgrade a KitProfile to a ValidatedKitProfile.
 *
 * This is the TYPE-LEVEL SAFETY BOUNDARY from §21-22 of the spec:
 *   - TestResultClassifier only accepts ValidatedKitProfile.
 *   - This function is the ONLY way to produce one.
 *   - A PENDING_VALIDATION profile CANNOT pass this function → always returns null.
 *   - A profile with any null reference_lab values CANNOT pass → always returns null.
 *
 * Returns null + reason string if validation fails. Never throws for expected failures.
 */
export function validateKitProfile(
  profile: KitProfile
): { profile: ValidatedKitProfile; error: null } | { profile: null; error: string } {
  // Schema check first
  try {
    validateKitProfileSchema(profile);
  } catch (e) {
    return { profile: null, error: (e as Error).message };
  }

  // Status check — PENDING_VALIDATION is never promotable
  if (profile.status === 'PENDING_VALIDATION') {
    return {
      profile: null,
      error: `Kit profile "${profile.kit_profile_id}" has status PENDING_VALIDATION — cannot classify. ` +
             'Populate measured reference_lab values and set status to VALIDATED first.',
    };
  }

  // All expected_result_colors must have non-null reference_lab
  const nullLabOutcome = profile.expected_result_colors.find(
    (c: ExpectedResultColor) => !c.reference_lab || c.reference_lab.L === null || c.reference_lab.a === null || c.reference_lab.b === null
  );
  if (nullLabOutcome) {
    return {
      profile: null,
      error: `outcome_label "${nullLabOutcome.outcome_label}" has null reference_lab — PHYSICAL EXPERIMENT REQUIRED. ` +
             'Measure swatches and fill in Lab values before classifying.',
    };
  }

  // roi_card_relative must be set for HOMOGRAPHY_OFFSET method
  if (
    profile.test_geometry.locator_method === 'HOMOGRAPHY_OFFSET' &&
    profile.test_geometry.roi_card_relative === null
  ) {
    return {
      profile: null,
      error: `test_geometry.roi_card_relative is null for HOMOGRAPHY_OFFSET locator — set after card layout is finalized.`,
    };
  }

  // Profile passes all checks — brand it as ValidatedKitProfile
  return { profile: profile as ValidatedKitProfile, error: null };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Get a kit profile's display name for logging/UI. */
export function kitProfileDisplayName(profile: KitProfile): string {
  return `${profile.kit_name} (${profile.kit_profile_id} v${profile.kit_profile_version})`;
}

/** Check if a kit profile is pending validation (helper for UI display). */
export function isPendingValidation(profile: KitProfile): boolean {
  return profile.status === 'PENDING_VALIDATION';
}

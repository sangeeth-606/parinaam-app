/**
 * The only place where camera-engine diagnostics become Parinaam domain values.
 *
 * The engine's result is evidence about an image. It is not allowed to set an
 * outcome by itself unless the selected profile, quality, and validation policy
 * all agree. Unknown labels and unvalidated profiles fail closed.
 */

import type { CameraEngineResult } from './camera-engine-contract.ts';
import type { CalibrationResidual, DecisionResult, LabValue } from '../types/contracts.ts';
import type { PresumptiveOutcome, ReagentType } from '../types/domain.ts';

export const CAMERA_ENGINE_REAGENT: ReagentType = 'duquenois_levine';

export interface CameraEngineHardFailure {
  code: string;
  message: string;
}

export interface CameraEngineAnalysis {
  lab: LabValue | null;
  residual: CalibrationResidual | null;
  decision: DecisionResult;
  isDemo: boolean;
  hardFailure: CameraEngineHardFailure | null;
  kinetics: null;
}

function inconclusive(
  reagent: ReagentType,
  reason: 'low_margin' | 'novelty_ood' | 'calibration_failed',
  detail: string,
  confidence = 0,
  conformalSet: string[] = [],
): DecisionResult {
  const outcome: PresumptiveOutcome = {
    kind: 'INCONCLUSIVE',
    reagent,
    reason,
    detail,
  };
  return {
    outcome,
    confidence,
    conformalSet,
    abstentionReason: reason,
  };
}

function legalLab(result: CameraEngineResult): LabValue | null {
  const lab = result.normalizedColor?.lab;
  if (!lab) return null;
  return { l: lab.L, a: lab.a, b: lab.b };
}

function residualFromResult(result: CameraEngineResult): CalibrationResidual | null {
  const calibration = result.calibration;
  if (!calibration || calibration.fitResidualDeltaE00 === null || calibration.maxFitResidualDeltaE00 === null) {
    return null;
  }
  return {
    meanDeltaE: calibration.fitResidualDeltaE00,
    maxDeltaE: calibration.maxFitResidualDeltaE00,
    grade: calibration.grade === 'GOOD' ? 'GOOD' : 'DEGRADED',
  };
}

function hardFailureFromResult(result: CameraEngineResult): CameraEngineHardFailure | null {
  if (result.status !== 'FAIL') return null;
  const code = result.quality.failureCodes[0] ?? result.classification.reason ?? 'IMAGE_ANALYSIS_FAILED';
  const message = result.classification.reason === 'TEST_SWATCH_OUTSIDE_FRAME'
    ? 'The external test swatch is outside the captured frame. Include the printed swatch beside the card or recapture the full layout.'
    : `Camera-engine image quality check failed: ${code}. Recapture with the card flat, fully lit, and all markers visible.`;
  return { code, message };
}

function mapClassificationReason(reason: string | null): 'low_margin' | 'novelty_ood' | 'calibration_failed' {
  if (reason === 'NO_CLOSE_MATCH' || reason === 'AMBIGUOUS_MATCH') return 'low_margin';
  if (reason === 'UNSUPPORTED_REAGENT_PROFILE') return 'novelty_ood';
  return 'calibration_failed';
}

/** Adapt a validated engine result into the existing app's legal decision shape. */
export function adaptCameraEngineResult(result: CameraEngineResult, reagent: ReagentType): CameraEngineAnalysis {
  const hardFailure = hardFailureFromResult(result);
  const lab = legalLab(result);
  const residual = residualFromResult(result);
  const isDemo = result.profile.demoMode || result.profile.status !== 'VALIDATED';

  if (hardFailure || !lab || !residual || residual.grade === 'REJECT') {
    return {
      lab,
      residual,
      decision: inconclusive(
        reagent,
        'calibration_failed',
        hardFailure?.message ?? 'The camera-engine could not produce a valid calibrated measurement.',
      ),
      isDemo,
      hardFailure,
      kinetics: null,
    };
  }

  if (reagent !== CAMERA_ENGINE_REAGENT || result.requestedReagent !== CAMERA_ENGINE_REAGENT) {
    return {
      lab,
      residual,
      decision: inconclusive(
        reagent,
        'novelty_ood',
        'The current camera-engine profile does not cover the selected reagent. No presumptive outcome was produced.',
      ),
      isDemo,
      hardFailure: null,
      kinetics: null,
    };
  }

  const classification = result.classification;
  if (classification.outcome === 'INCONCLUSIVE') {
    const reason = mapClassificationReason(classification.reason);
    const margin = classification.marginDeltaE00;
    const detail =
      classification.reason === 'PROFILE_PENDING_VALIDATION'
        ? 'The printed mock profile is not scientifically validated. A legal demo outcome was not produced.'
        : `Camera-engine abstained: ${classification.reason ?? 'no close match'}${margin === null ? '' : ` (margin ΔE00 ${margin.toFixed(2)})`}.`;
    return {
      lab,
      residual,
      decision: inconclusive(
        reagent,
        reason,
        detail,
        classification.confidence,
        reason === 'low_margin'
          ? ['CONSISTENT_WITH_REAGENT_POSITIVE', 'CONSISTENT_WITH_REAGENT_NEGATIVE']
          : [],
      ),
      isDemo,
      hardFailure: null,
      kinetics: null,
    };
  }

  if (classification.outcome !== 'CONSISTENT_WITH_REAGENT_POSITIVE' && classification.outcome !== 'CONSISTENT_WITH_REAGENT_NEGATIVE') {
    return {
      lab,
      residual,
      decision: inconclusive(reagent, 'calibration_failed', 'Camera-engine returned an unknown outcome.'),
      isDemo,
      hardFailure: null,
      kinetics: null,
    };
  }

  if (classification.bestDeltaE00 === null) {
    return {
      lab,
      residual,
      decision: inconclusive(reagent, 'calibration_failed', 'Camera-engine returned no finite ΔE00 distance.'),
      isDemo,
      hardFailure: null,
      kinetics: null,
    };
  }

  const deltaE = classification.bestDeltaE00;
  if (classification.outcome === 'CONSISTENT_WITH_REAGENT_POSITIVE') {
    const outcome: PresumptiveOutcome = {
      kind: 'CONSISTENT_WITH_REAGENT_POSITIVE',
      reagent,
      confidence: classification.confidence,
      deltaE,
    };
    return {
      lab,
      residual,
      decision: { outcome, confidence: classification.confidence, conformalSet: ['CONSISTENT_WITH_REAGENT_POSITIVE'] },
      isDemo,
      hardFailure: null,
      kinetics: null,
    };
  }

  const outcome: PresumptiveOutcome = {
    kind: 'CONSISTENT_WITH_REAGENT_NEGATIVE',
    reagent,
    confidence: classification.confidence,
    deltaE,
  };
  return {
    lab,
    residual,
    decision: { outcome, confidence: classification.confidence, conformalSet: ['CONSISTENT_WITH_REAGENT_NEGATIVE'] },
    isDemo,
    hardFailure: null,
    kinetics: null,
  };
}

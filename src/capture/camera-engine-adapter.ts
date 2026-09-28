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
export const CAMERA_ENGINE_REAGENTS: ReadonlySet<ReagentType> = new Set<ReagentType>([
  'duquenois_levine',
  'marquis',
  'scott',
  'mecke',
  'mandelin',
]);

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

  let message: string;
  switch (code) {
    case 'CALIBRATION_RESIDUAL_HIGH':
      message =
        'Card calibration failed — the card appears tilted or the corner markers are partially obscured ' +
        '(CALIBRATION_RESIDUAL_HIGH).\n\n' +
        'Hold the phone directly above the card, parallel to the table surface. ' +
        'Keep the card flat, well-lit, and all 4 ArUco corner markers clearly visible and unblocked before capturing.';
      break;
    case 'EXCESSIVE_BLUR':
      message =
        'Image is too blurry for reliable colour measurement (EXCESSIVE_BLUR).\n\n' +
        'Hold the phone steady over the card and wait for the camera to focus before tapping Capture.';
      break;
    case 'UNDEREXPOSURE':
      message =
        'Image is too dark — move to a brighter area or turn on room lights (UNDEREXPOSURE).';
      break;
    case 'OVEREXPOSURE':
      message =
        'Image is overexposed — avoid direct sunlight or harsh spotlights directly on the card (OVEREXPOSURE).';
      break;
    case 'TEST_SWATCH_OUTSIDE_FRAME':
    case 'ROI_OUTSIDE_FRAME':
      message =
        'The external test swatch is outside the captured frame. ' +
        'Include the printed swatch beside the card or recapture the full layout.';
      break;
    default:
      message = `Camera-engine image quality check failed: ${code}. Recapture with the card flat, fully lit, and all markers visible.`;
  }

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

  if (reagent !== result.requestedReagent || !CAMERA_ENGINE_REAGENTS.has(reagent)) {
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

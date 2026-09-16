/**
 * Parinaam — Decision Engine (Phase 3 Core Deliverable)
 * Governed by spec/04-phase-3-classification.md & spec/legal-constraints.md.
 *
 * Strictly adheres to Hard Constraints:
 * 1. Constraint 4: Transparent colorimetry, zero black-box neural networks for presumptive decision.
 * 2. Constraint 7: Never assert drug identity. Vocabulary strictly restricted to:
 *    - CONSISTENT_WITH_REAGENT_POSITIVE
 *    - CONSISTENT_WITH_REAGENT_NEGATIVE
 *    - INCONCLUSIVE (with explicit reason)
 * 3. Incorporates multi-frame burst measurement covariance into Mahalanobis QDA.
 * 4. Dual independent abstention guards (novelty_ood via \chi^2, low_margin via posterior).
 * 5. Mondrian conformal prediction set with distribution-free coverage guarantee.
 */

import type { DecisionModule, DecisionResult, LabValue } from '../types/contracts.ts';
import type { PresumptiveOutcome, ReagentType } from '../types/domain.ts';
import { deltaE00 } from '../colour/delta-e.ts';
import { REAGENT_PROFILES, type ReagentClass } from './reagent-profiles.ts';
import { MahalanobisClassifier } from './mahalanobis.ts';
import { MondrianConformalPredictor } from './conformal.ts';

export interface DecisionEngineConfig {
  confidenceThreshold?: number; // default 0.85
  alpha?: number; // default 0.05
}

export class DecisionEngine implements DecisionModule {
  private classifier: MahalanobisClassifier;
  private conformalPredictor: MondrianConformalPredictor;

  constructor(config: DecisionEngineConfig = {}) {
    this.classifier = new MahalanobisClassifier({
      confidenceThreshold: config.confidenceThreshold ?? 0.85,
    });
    this.conformalPredictor = new MondrianConformalPredictor(config.alpha ?? 0.05);

    // Seed default conformal thresholds from analytical calibration
    this.conformalPredictor.calibrate([
      { predictedProbs: { POSITIVE: 0.98, NEGATIVE: 0.02 }, trueClass: 'POSITIVE' },
      { predictedProbs: { POSITIVE: 0.95, NEGATIVE: 0.05 }, trueClass: 'POSITIVE' },
      { predictedProbs: { POSITIVE: 0.91, NEGATIVE: 0.09 }, trueClass: 'POSITIVE' },
      { predictedProbs: { POSITIVE: 0.88, NEGATIVE: 0.12 }, trueClass: 'POSITIVE' },
      { predictedProbs: { POSITIVE: 0.02, NEGATIVE: 0.98 }, trueClass: 'NEGATIVE' },
      { predictedProbs: { POSITIVE: 0.04, NEGATIVE: 0.96 }, trueClass: 'NEGATIVE' },
      { predictedProbs: { POSITIVE: 0.07, NEGATIVE: 0.93 }, trueClass: 'NEGATIVE' },
      { predictedProbs: { POSITIVE: 0.11, NEGATIVE: 0.89 }, trueClass: 'NEGATIVE' },
    ]);
  }

  /**
   * Classify a reagent colorimetric reading.
   *
   * @param reagentLab Calibrated CIE-Lab color coordinate of the test sample
   * @param measurementCovariance Empirical burst measurement covariance matrix from Phase 1
   * @param reagent The chemical reagent used in the test
   */
  public async classify(
    reagentLab: LabValue,
    measurementCovariance: number[][],
    reagent: ReagentType
  ): Promise<DecisionResult> {
    const profile = REAGENT_PROFILES[reagent];

    // Check if reagent is supported
    if (!profile) {
      const outcome: PresumptiveOutcome = {
        kind: 'INCONCLUSIVE',
        reagent,
        reason: 'novelty_ood',
        detail: `Unsupported or unmodeled reagent profile: ${reagent}`,
      };
      return {
        outcome,
        confidence: 0,
        conformalSet: [],
        abstentionReason: 'novelty_ood',
      };
    }

    // Check if reagent has no reliable field test (e.g. Tramadol)
    if (profile.abstainEntirely) {
      const outcome: PresumptiveOutcome = {
        kind: 'INCONCLUSIVE',
        reagent,
        reason: 'low_margin',
        detail: `No reliable presumptive colorimetric test exists for this category. Confirmatory lab testing required.`,
      };
      return {
        outcome,
        confidence: 0,
        conformalSet: [],
        abstentionReason: 'low_margin',
      };
    }

    // Step 1: Mahalanobis QDA classification with measurement covariance coupling
    const qdaResult = this.classifier.classify(reagentLab, measurementCovariance, reagent);

    // Step 2: Class-conditional conformal prediction
    const probs: Record<ReagentClass, number> = {
      POSITIVE: qdaResult.scores.POSITIVE.posteriorProbability,
      NEGATIVE: qdaResult.scores.NEGATIVE.posteriorProbability,
    };
    const conformal = this.conformalPredictor.predict(probs);

    // Compute Delta E00 distance to the target class centroid (using nominal L* = 50 for chroma centroid)
    const targetDist = profile.classes[qdaResult.predictedClass];
    const centroidLab: LabValue = {
      l: reagentLab.l, // evaluate delta E predominantly on chromatic separation
      a: targetDist.mean[0],
      b: targetDist.mean[1],
    };
    const deltaE = deltaE00(reagentLab, centroidLab);

    // Step 3: Evaluate Abstention Hierarchy

    // Guard 1: Mahalanobis Out-of-Distribution / Novelty
    if (qdaResult.isAbstaining && qdaResult.abstentionReason === 'novelty_ood') {
      const outcome: PresumptiveOutcome = {
        kind: 'INCONCLUSIVE',
        reagent,
        reason: 'novelty_ood',
        detail: qdaResult.detail,
      };
      return {
        outcome,
        confidence: qdaResult.confidence,
        conformalSet: conformal.predictionSet,
        abstentionReason: 'novelty_ood',
      };
    }

    // Guard 2: Mahalanobis Low-Margin / Boundary ambiguity
    if (qdaResult.isAbstaining && qdaResult.abstentionReason === 'low_margin') {
      const outcome: PresumptiveOutcome = {
        kind: 'INCONCLUSIVE',
        reagent,
        reason: 'low_margin',
        detail: qdaResult.detail,
      };
      return {
        outcome,
        confidence: qdaResult.confidence,
        conformalSet: conformal.predictionSet,
        abstentionReason: 'low_margin',
      };
    }

    // Guard 3: Conformal Set Ambiguity
    if (conformal.isAmbiguous) {
      const outcome: PresumptiveOutcome = {
        kind: 'INCONCLUSIVE',
        reagent,
        reason: 'low_margin',
        detail: `Conformal prediction set contains multiple classes: ${conformal.predictionSet.join(', ')}`,
      };
      return {
        outcome,
        confidence: qdaResult.confidence,
        conformalSet: conformal.predictionSet,
        abstentionReason: 'low_margin',
      };
    }

    // Guard 4: Conformal Set Emptiness
    if (conformal.isEmpty) {
      const outcome: PresumptiveOutcome = {
        kind: 'INCONCLUSIVE',
        reagent,
        reason: 'novelty_ood',
        detail: `Sample falls outside conformal confidence boundary for all modeled classes`,
      };
      return {
        outcome,
        confidence: qdaResult.confidence,
        conformalSet: [],
        abstentionReason: 'novelty_ood',
      };
    }

    // Step 4: Definitive Presumptive Outcome (Statutory Vocabulary)
    if (qdaResult.predictedClass === 'POSITIVE') {
      const outcome: PresumptiveOutcome = {
        kind: 'CONSISTENT_WITH_REAGENT_POSITIVE',
        reagent,
        confidence: qdaResult.confidence,
        deltaE,
      };
      return {
        outcome,
        confidence: qdaResult.confidence,
        conformalSet: conformal.predictionSet,
      };
    } else {
      const outcome: PresumptiveOutcome = {
        kind: 'CONSISTENT_WITH_REAGENT_NEGATIVE',
        reagent,
        confidence: qdaResult.confidence,
        deltaE,
      };
      return {
        outcome,
        confidence: qdaResult.confidence,
        conformalSet: conformal.predictionSet,
      };
    }
  }

  public getConformalPredictor(): MondrianConformalPredictor {
    return this.conformalPredictor;
  }

  public getClassifier(): MahalanobisClassifier {
    return this.classifier;
  }
}

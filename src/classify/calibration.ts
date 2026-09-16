/**
 * Parinaam — Expected Calibration Error (ECE) & Reliability Diagrams
 * Governed by spec/04-phase-3-classification.md (Task 3.6 & Milestone M3.8).
 *
 * Implements:
 * 1. Binned evaluation of predicted confidence vs empirical accuracy across M bins (default 10)
 * 2. ECE = \sum_{m=1}^M (|B_m| / N) * |acc(B_m) - conf(B_m)|
 * 3. Maximum Calibration Error (MCE) = max_m |acc(B_m) - conf(B_m)|
 * 4. Structured reliability diagram data generator
 */

export interface PredictionEvaluation {
  confidence: number; // Predicted confidence [0, 1]
  isCorrect: boolean; // Whether the prediction matched ground truth
}

export interface ReliabilityBin {
  binIndex: number;
  rangeStart: number;
  rangeEnd: number;
  sampleCount: number;
  averageConfidence: number;
  accuracy: number;
  calibrationError: number; // |accuracy - averageConfidence|
}

export interface CalibrationReport {
  numBins: number;
  totalSamples: number;
  expectedCalibrationError: number; // ECE [0, 1]
  maximumCalibrationError: number;  // MCE [0, 1]
  bins: ReliabilityBin[];
}

export class CalibrationEvaluator {
  private numBins: number;

  constructor(numBins: number = 10) {
    this.numBins = Math.max(2, numBins);
  }

  /**
   * Evaluate predictions and compute ECE, MCE, and binned reliability metrics.
   */
  public evaluate(predictions: PredictionEvaluation[]): CalibrationReport {
    const N = predictions.length;
    if (N === 0) {
      return {
        numBins: this.numBins,
        totalSamples: 0,
        expectedCalibrationError: 0,
        maximumCalibrationError: 0,
        bins: [],
      };
    }

    // Initialize bins
    const binWidth = 1.0 / this.numBins;
    const bins: {
      confidences: number[];
      correctCount: number;
      rangeStart: number;
      rangeEnd: number;
    }[] = [];

    for (let m = 0; m < this.numBins; m++) {
      bins.push({
        confidences: [],
        correctCount: 0,
        rangeStart: m * binWidth,
        rangeEnd: (m + 1) * binWidth,
      });
    }

    // Assign predictions to bins
    for (const p of predictions) {
      const conf = Math.max(0, Math.min(1.0, p.confidence));
      // For conf = 1.0, clamp to the highest bin index
      let binIdx = Math.floor(conf / binWidth);
      if (binIdx >= this.numBins) {
        binIdx = this.numBins - 1;
      }

      bins[binIdx].confidences.push(conf);
      if (p.isCorrect) {
        bins[binIdx].correctCount++;
      }
    }

    // Calculate metrics per bin
    let ece = 0;
    let mce = 0;
    const reliabilityBins: ReliabilityBin[] = [];

    for (let m = 0; m < this.numBins; m++) {
      const b = bins[m];
      const count = b.confidences.length;

      if (count === 0) {
        reliabilityBins.push({
          binIndex: m,
          rangeStart: b.rangeStart,
          rangeEnd: b.rangeEnd,
          sampleCount: 0,
          averageConfidence: (b.rangeStart + b.rangeEnd) / 2,
          accuracy: 0,
          calibrationError: 0,
        });
        continue;
      }

      const avgConf = b.confidences.reduce((sum, v) => sum + v, 0) / count;
      const acc = b.correctCount / count;
      const error = Math.abs(acc - avgConf);

      ece += (count / N) * error;
      if (error > mce) {
        mce = error;
      }

      reliabilityBins.push({
        binIndex: m,
        rangeStart: b.rangeStart,
        rangeEnd: b.rangeEnd,
        sampleCount: count,
        averageConfidence: avgConf,
        accuracy: acc,
        calibrationError: error,
      });
    }

    return {
      numBins: this.numBins,
      totalSamples: N,
      expectedCalibrationError: ece,
      maximumCalibrationError: mce,
      bins: reliabilityBins,
    };
  }
}

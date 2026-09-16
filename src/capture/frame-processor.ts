/**
 * Parinaam — VisionCamera Worklet Frame Processor Pipeline
 * Conforms to spec/02-phase-1-guided-capture.md Task 1.2.
 *
 * Runs lightweight downsampled analysis (320x240) off the JS thread
 * to maintain >= 10 FPS without thermal throttling or UI starvation.
 */

import { evaluateFullQuality } from './quality-gates.ts';
import type { DetailedQualityResult, CardFramingMetrics } from './quality-gates.ts';

export interface FrameAnalysisOptions {
  sampleIntervalMs?: number;
  baselineLaplacianVariance?: number;
  framingMetrics?: CardFramingMetrics;
}

export class FrameProcessorController {
  private lastEvaluationTime: number = 0;
  private readonly sampleIntervalMs: number;
  private readonly baselineVariance: number;

  constructor(options: FrameAnalysisOptions = {}) {
    this.sampleIntervalMs = options.sampleIntervalMs ?? 100; // 10 FPS target
    this.baselineVariance = options.baselineLaplacianVariance ?? 100.0;
  }

  shouldEvaluate(currentTimeMs: number): boolean {
    if (currentTimeMs - this.lastEvaluationTime >= this.sampleIntervalMs) {
      this.lastEvaluationTime = currentTimeMs;
      return true;
    }
    return false;
  }

  processFrame(params: {
    luminancePixels: Uint8Array | number[];
    rgbPixels: Uint8Array | number[];
    width: number;
    height: number;
    currentTimeMs: number;
    framingMetrics?: CardFramingMetrics;
  }): DetailedQualityResult | null {
    if (!this.shouldEvaluate(params.currentTimeMs)) {
      return null;
    }

    return evaluateFullQuality({
      luminancePixels: params.luminancePixels,
      rgbPixels: params.rgbPixels,
      width: params.width,
      height: params.height,
      framingMetrics: params.framingMetrics,
      baselineVariance: this.baselineVariance,
    });
  }
}

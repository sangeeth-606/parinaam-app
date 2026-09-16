import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ColourPipelineService } from '../../src/colour/pipeline.ts';
import type { CardPatchObservation } from '../../src/colour/pipeline.ts';
import { labToLinearRgb } from '../../src/colour/colour-space.ts';
import { deltaE00 } from '../../src/colour/delta-e.ts';
import type { LabValue } from '../../src/types/contracts.ts';
import refData from '../../src/colour/reference-values.json' with { type: 'json' };

describe('Phase 2: Colour Pipeline, Exposure Invariance & Master Residual Gate', () => {
  const service = new ColourPipelineService();
  const patches = refData.patches;

  function generateObservations(
    illuminationScale: number = 1.0,
    noiseStd: number = 0.0
  ): { observations: CardPatchObservation[]; reagentRgb: [number, number, number] } {
    const toDigital = (linearVal: number) => {
      const clamped = Math.max(0, linearVal * illuminationScale);
      const gamma = Math.pow(clamped, 1 / 2.2);
      const noise = (Math.random() - 0.5) * noiseStd;
      return Math.min(255, Math.max(5, Math.round(gamma * 255 + noise)));
    };

    const observations: CardPatchObservation[] = patches.map((p: { id: string; l: number; a: number; b: number }) => {
      const gtLab: LabValue = { l: p.l, a: p.a, b: p.b };
      const linear = labToLinearRgb(gtLab);

      const r = toDigital(linear.r);
      const g = toDigital(linear.g);
      const b = toDigital(linear.b);

      return {
        id: p.id,
        measuredRgb: [r, g, b],
        groundTruthLab: gtLab,
      };
    });

    // Known target reagent: Marquis purple
    const reagentTargetLab: LabValue = { l: 18.5, a: 34.2, b: -12.0 };
    const reagentLinear = labToLinearRgb(reagentTargetLab);
    const reagentRgb: [number, number, number] = [
      toDigital(reagentLinear.r),
      toDigital(reagentLinear.g),
      toDigital(reagentLinear.b),
    ];

    return { observations, reagentRgb };
  }

  it('evaluates Master Calibration Residual Gate as GOOD on well-calibrated card', () => {
    const { observations, reagentRgb } = generateObservations(1.0);
    const result = service.calibrateObservations(observations, reagentRgb);

    assert.ok(result.residual.meanDeltaE <= 2.5);
    assert.equal(result.residual.grade, 'GOOD');
  });

  it('Milestone M2.6: Proves exposure invariance across 2 stops (< 2 ΔE00 shift)', () => {
    // 0.25x (-1 stop), 0.5x (nominal), 1.0x (+1 stop) = 4x ratio = 2 stops total variance without clipping
    const normal = generateObservations(0.5);
    const underexposed = generateObservations(0.25);
    const overexposed = generateObservations(1.0);

    const resNormal = service.calibrateObservations(normal.observations, normal.reagentRgb);
    const resUnder = service.calibrateObservations(underexposed.observations, underexposed.reagentRgb);
    const resOver = service.calibrateObservations(overexposed.observations, overexposed.reagentRgb);

    const shiftUnder = deltaE00(resNormal.calibratedReagentLab, resUnder.calibratedReagentLab);
    const shiftOver = deltaE00(resNormal.calibratedReagentLab, resOver.calibratedReagentLab);

    assert.ok(
      shiftUnder < 2.0,
      `Exposure variance (underexposed) caused ΔE00 = ${shiftUnder} >= 2.0`
    );
    assert.ok(
      shiftOver < 2.0,
      `Exposure variance (overexposed) caused ΔE00 = ${shiftOver} >= 2.0`
    );
  });

  it('Acceptance Test 7 & M2.7: Master Residual Gate REJECTS corrupted/distorted illumination (> 4.0 ΔE00)', () => {
    const { observations, reagentRgb } = generateObservations(1.0);

    // Artificially corrupt measurements (e.g. extreme colored shadow / faded patches)
    for (let i = 0; i < observations.length; i++) {
      if (i % 2 === 0) {
        observations[i].measuredRgb[0] = Math.min(255, observations[i].measuredRgb[0] + 90);
        observations[i].measuredRgb[2] = Math.max(10, observations[i].measuredRgb[2] - 80);
      }
    }

    const result = service.calibrateObservations(observations, reagentRgb);
    assert.ok(
      result.residual.meanDeltaE > 4.0,
      `Corrupted illumination should produce mean ΔE00 > 4.0, got ${result.residual.meanDeltaE}`
    );
    assert.equal(result.residual.grade, 'REJECT');
  });
});

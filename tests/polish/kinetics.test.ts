/**
 * Phase 6 — Reaction Kinetics (Kineticolor) Tests
 * Covers Task 6.1 & Milestones M6.1 & M6.2.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReactionKineticsTracker } from '../../src/capture/kinetics.ts';
import type { LabValue } from '../../src/types/contracts.ts';

describe('Phase 6: Reaction Kinetics Tracking & Analytical Discrimination (Milestones M6.1 & M6.2)', () => {
  it('Milestone M6.1: Tracks dynamic Delta E(t) curve and computes kinetic parameters', () => {
    const tracker = new ReactionKineticsTracker();
    const initialLab: LabValue = { l: 75.0, a: -1.5, b: 11.8 }; // Unreacted pale yellow

    tracker.startSession(initialLab);

    // Simulate 10-second fast-onset reaction trajectory (e.g. rapid conversion to deep purple)
    // t=0: initialLab
    // t=1000: Lab starts shifting
    // t=2000: rapidly turning purple
    // t=5000+: fully stabilized purple
    const timepoints = [
      { t: 500, lab: { l: 65.0, a: 5.0, b: 6.0 } },
      { t: 1000, lab: { l: 50.0, a: 15.0, b: -2.0 } },
      { t: 2000, lab: { l: 30.0, a: 28.0, b: -11.0 } },
      { t: 3000, lab: { l: 24.5, a: 32.0, b: -14.0 } },
      { t: 5000, lab: { l: 24.0, a: 32.5, b: -14.2 } },
      { t: 10000, lab: { l: 24.0, a: 32.5, b: -14.2 } },
    ];

    for (const tp of timepoints) {
      tracker.addSample(tp.t, tp.lab);
    }

    const analysis = tracker.analyze();

    assert.equal(analysis.trajectory.length, 7); // t=0 + 6 samples
    assert.equal(analysis.durationMs, 10000);
    assert.ok(analysis.plateauDeltaE > 30.0, 'Plateau Delta E should reflect full color transition');
    assert.ok(analysis.t50Ms <= 3000, 'Fast reaction should reach half-maximum within 3 seconds');
    assert.ok(analysis.initialVelocity > 5.0, 'Initial velocity should reflect rapid rate of change');
    assert.ok(analysis.auc > 0, 'Area under curve should be positive');
    assert.equal(analysis.kineticProfile, 'FAST_SPIKE');
  });

  it('Milestone M6.2: Kinetics discrimination separates classes with identical resting endpoint colors', () => {
    const initialLab: LabValue = { l: 75.0, a: -1.5, b: 11.8 };
    const commonEndpointLab: LabValue = { l: 24.0, a: 32.5, b: -14.2 };

    // Substance A: Fast Spike reaction (e.g. Heroin on Marquis — immediate deep purple in < 2 sec)
    const trackerFast = new ReactionKineticsTracker();
    trackerFast.startSession(initialLab);
    trackerFast.addSample(1000, { l: 30.0, a: 28.0, b: -10.0 });
    trackerFast.addSample(2000, commonEndpointLab);
    trackerFast.addSample(10000, commonEndpointLab);
    trackerFast.addSample(30000, commonEndpointLab);
    const resultFast = trackerFast.analyze();

    // Substance B: Slow Gradual reaction (e.g. slow oxidation or cutting agent — takes 25s to reach same endpoint)
    const trackerSlow = new ReactionKineticsTracker();
    trackerSlow.startSession(initialLab);
    trackerSlow.addSample(5000, { l: 65.0, a: 5.0, b: 6.0 });
    trackerSlow.addSample(15000, { l: 50.0, a: 15.0, b: -2.0 });
    trackerSlow.addSample(25000, { l: 30.0, a: 28.0, b: -10.0 });
    trackerSlow.addSample(30000, commonEndpointLab);
    const resultSlow = trackerSlow.analyze();

    // Both reached the exact same static endpoint color
    assert.equal(resultFast.plateauDeltaE, resultSlow.plateauDeltaE);

    // BUT kinetic velocity and t50 clearly separate them!
    assert.ok(
      resultFast.t50Ms < resultSlow.t50Ms,
      `Fast reaction t50 (${resultFast.t50Ms}ms) must be much lower than slow reaction t50 (${resultSlow.t50Ms}ms)`
    );
    assert.ok(
      resultFast.initialVelocity > resultSlow.initialVelocity,
      `Fast reaction initial velocity (${resultFast.initialVelocity}) must exceed slow reaction (${resultSlow.initialVelocity})`
    );

    assert.equal(resultFast.kineticProfile, 'FAST_SPIKE');
    assert.equal(resultSlow.kineticProfile, 'SLOW_GRADUAL');
  });
});

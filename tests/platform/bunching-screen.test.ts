/**
 * Unit tests for BunchingScreen business logic and Rule 10(2) pairwise evaluation thresholds.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deltaE00 } from '../../src/colour/delta-e.ts';
import { PRESUMPTIVE_DISCLAIMER_VERBATIM } from '../../src/export/certificate-generator.ts';

describe('BunchingScreen: Rule 10(2) Pairwise Thresholds & Evidentiary Categorization', () => {
  function categorizeDeltaE(dE: number): 'identical' | 'marginal' | 'different' {
    if (dE < 5.0) return 'identical';
    if (dE <= 15.0) return 'marginal';
    return 'different';
  }

  it('correctly categorizes Delta E < 5.0 as identical', () => {
    assert.equal(categorizeDeltaE(0.0), 'identical');
    assert.equal(categorizeDeltaE(1.42), 'identical');
    assert.equal(categorizeDeltaE(4.99), 'identical');
  });

  it('correctly categorizes Delta E between 5.0 and 15.0 as marginal', () => {
    assert.equal(categorizeDeltaE(5.0), 'marginal');
    assert.equal(categorizeDeltaE(10.2), 'marginal');
    assert.equal(categorizeDeltaE(15.0), 'marginal');
  });

  it('correctly categorizes Delta E > 15.0 as different', () => {
    assert.equal(categorizeDeltaE(15.01), 'different');
    assert.equal(categorizeDeltaE(22.4), 'different');
  });

  it('computes realistic deltaE00 between nearly identical swatches < 5.0', () => {
    const swatchA = { l: 24.1, a: 32.5, b: -14.2 };
    const swatchB = { l: 24.3, a: 32.7, b: -14.0 };
    const dE = deltaE00(swatchA, swatchB);
    assert.ok(dE < 5.0);
    assert.equal(categorizeDeltaE(dE), 'identical');
  });

  it('computes realistic deltaE00 between divergent swatches > 15.0', () => {
    const swatchA = { l: 24.1, a: 32.5, b: -14.2 };
    const swatchC = { l: 52.0, a: 11.2, b: 8.5 };
    const dE = deltaE00(swatchA, swatchC);
    assert.ok(dE > 15.0);
    assert.equal(categorizeDeltaE(dE), 'different');
  });

  it('verifies statutory presumptive disclaimer text verbatim', () => {
    assert.equal(
      PRESUMPTIVE_DISCLAIMER_VERBATIM,
      'Presumptive result only — not a substitute for laboratory confirmatory testing.'
    );
  });
});

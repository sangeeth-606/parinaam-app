import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  linearRgbToXyz,
  xyzToLinearRgb,
  xyzToLab,
  labToXyz,
  linearRgbToLab,
  labToLinearRgb,
  calculateChromaDistance,
  D65_WHITE_POINT,
} from '../../src/colour/colour-space.ts';

describe('Phase 2: Colour Space Transformations (sRGB, XYZ, CIELAB)', () => {
  it('converts D65 white point accurately', () => {
    // 1.0 linear sRGB should produce D65 white point in XYZ
    const whiteXyz = linearRgbToXyz({ r: 1.0, g: 1.0, b: 1.0 });
    assert.ok(Math.abs(whiteXyz.x - D65_WHITE_POINT.x) < 1e-4);
    assert.ok(Math.abs(whiteXyz.y - D65_WHITE_POINT.y) < 1e-4);
    assert.ok(Math.abs(whiteXyz.z - D65_WHITE_POINT.z) < 1e-4);

    // D65 white point in CIELAB should have L* = 100, a* = 0, b* = 0
    const whiteLab = xyzToLab(whiteXyz);
    assert.ok(Math.abs(whiteLab.l - 100.0) < 1e-4);
    assert.ok(Math.abs(whiteLab.a - 0.0) < 1e-4);
    assert.ok(Math.abs(whiteLab.b - 0.0) < 1e-4);
  });

  it('roundtrips linear sRGB -> XYZ -> linear sRGB with zero drift', () => {
    const original = { r: 0.35, g: 0.65, b: 0.15 };
    const xyz = linearRgbToXyz(original);
    const recovered = xyzToLinearRgb(xyz);

    assert.ok(Math.abs(original.r - recovered.r) < 1e-6);
    assert.ok(Math.abs(original.g - recovered.g) < 1e-6);
    assert.ok(Math.abs(original.b - recovered.b) < 1e-6);
  });

  it('roundtrips CIELAB -> XYZ -> CIELAB with zero drift', () => {
    const originalLab = { l: 45.2, a: 32.1, b: -18.4 };
    const xyz = labToXyz(originalLab);
    const recoveredLab = xyzToLab(xyz);

    assert.ok(Math.abs(originalLab.l - recoveredLab.l) < 1e-6);
    assert.ok(Math.abs(originalLab.a - recoveredLab.a) < 1e-6);
    assert.ok(Math.abs(originalLab.b - recoveredLab.b) < 1e-6);
  });

  it('roundtrips linearRGB -> CIELAB -> linearRGB accurately', () => {
    const original = { r: 0.4, g: 0.5, b: 0.6 };
    const lab = linearRgbToLab(original);
    const recovered = labToLinearRgb(lab);

    assert.ok(Math.abs(original.r - recovered.r) < 1e-4);
    assert.ok(Math.abs(original.g - recovered.g) < 1e-4);
    assert.ok(Math.abs(original.b - recovered.b) < 1e-4);
  });

  it('calculates equichromatic chroma distance ΔE_ab correctly', () => {
    const c1 = { l: 50.0, a: 10.0, b: 20.0 };
    const c2 = { l: 80.0, a: 13.0, b: 24.0 };
    // Δa = 3, Δb = 4 -> sqrt(9 + 16) = 5.0 (independent of ΔL = 30)
    const dist = calculateChromaDistance(c1, c2);
    assert.ok(Math.abs(dist - 5.0) < 1e-6);
  });
});

/**
 * Parinaam — Tone-Curve Linearization via Grey Ramp Spline
 * Conforms to spec/colour-pipeline-algorithm.md Step 2.
 */

export interface GreyRampMeasurement {
  patchId: string; // 'G1' to 'G6'
  measuredDigitalValue: number; // [0, 255]
  targetLuminance: number; // [0, 1] relative linear Y
}

/**
 * Standard IEC 61966-2-1 sRGB Electro-Optical Transfer Function (EOTF).
 * Maps non-linear sRGB [0, 255] to linear sRGB [0, 1].
 */
export function srgbEotf(digitalVal: number): number {
  const v = Math.max(0, Math.min(255, digitalVal)) / 255;
  if (v <= 0.04045) {
    return v / 12.92;
  }
  return Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Monotonic piecewise linear / spline mapping using grey ramp calibration points.
 * Ensures monotonicity: brighter inputs strictly produce equal or higher linear outputs.
 */
export function fitMonotonicToneCurve(
  measurements: GreyRampMeasurement[]
): (val: number) => number {
  if (measurements.length < 2) {
    return srgbEotf;
  }

  // Sort by measured digital value
  const sorted = [...measurements].sort(
    (a, b) => a.measuredDigitalValue - b.measuredDigitalValue
  );

  // Prepend (0, 0) and append (255, 1) if not already bounded
  const xs: number[] = [];
  const ys: number[] = [];

  if (sorted[0].measuredDigitalValue > 0) {
    xs.push(0);
    ys.push(0);
  }

  for (const m of sorted) {
    // Ensure strict monotonicity in Y
    const prevY = ys.length > 0 ? ys[ys.length - 1] : 0;
    const clampedY = Math.max(prevY, Math.min(1.0, m.targetLuminance));
    xs.push(m.measuredDigitalValue);
    ys.push(clampedY);
  }

  if (xs[xs.length - 1] < 255) {
    xs.push(255);
    ys.push(1.0);
  }

  // Piecewise linear monotonic evaluation
  return (val: number): number => {
    const v = Math.max(0, Math.min(255, val));
    if (v <= xs[0]) return ys[0];
    if (v >= xs[xs.length - 1]) return ys[ys.length - 1];

    // Binary search / segment lookup
    for (let i = 0; i < xs.length - 1; i++) {
      if (v >= xs[i] && v <= xs[i + 1]) {
        const dx = xs[i + 1] - xs[i];
        if (dx === 0) return ys[i];
        const t = (v - xs[i]) / dx;
        return ys[i] + t * (ys[i + 1] - ys[i]);
      }
    }

    return srgbEotf(v);
  };
}

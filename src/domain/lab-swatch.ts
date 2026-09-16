/** Approximate sRGB hex for display of a calibrated Lab value (UI swatch ONLY).
 *  This is presentation, never measurement: ΔE work always uses the colour pipeline. */

import { labToLinearRgb } from '../colour/colour-space';

function gammaEncode(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function to255(channel: number): number {
  return Math.round(gammaEncode(channel) * 255);
}

export function labToHex(lab: { l: number; a: number; b: number }): string {
  const rgb = labToLinearRgb({ l: lab.l, a: lab.a, b: lab.b });
  const r = to255(rgb.r).toString(16).padStart(2, '0');
  const g = to255(rgb.g).toString(16).padStart(2, '0');
  const b = to255(rgb.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

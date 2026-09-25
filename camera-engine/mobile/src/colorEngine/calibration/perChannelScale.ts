/**
 * Per-Channel Scale (Diagonal) Regression — Benchmark Floor
 *
 * Method 1 from spec §14.1. Cannot correct cross-channel hue errors —
 * included only as the floor baseline in the §15 comparison.
 * Model: [r*kr, g*kg, b*kb] ≈ [X, Y, Z]  (purely diagonal)
 */

import { xyzToLab, WHITE_POINT_D50 } from '../colorSpace/xyzLab';
import { deltaE00 } from '../colorSpace/deltaE';
import type { LinearRGB, XYZColor, LabColor } from '../types';

export interface PerChannelModel {
  kr: number; kg: number; kb: number;
  fit_residual_delta_e00: number;
}

export function fitPerChannelScale(observed: LinearRGB[], reference: XYZColor[]): PerChannelModel {
  // Least-squares per channel independently (scalar regression: sum(obs_i*ref_i)/sum(obs_i^2))
  let srR = 0, srG = 0, srB = 0, so2R = 0, so2G = 0, so2B = 0;
  for (let i = 0; i < observed.length; i++) {
    srR += observed[i].r * reference[i].X;
    srG += observed[i].g * reference[i].Y;
    srB += observed[i].b * reference[i].Z;
    so2R += observed[i].r ** 2;
    so2G += observed[i].g ** 2;
    so2B += observed[i].b ** 2;
  }
  const kr = so2R > 0 ? srR / so2R : 1;
  const kg = so2G > 0 ? srG / so2G : 1;
  const kb = so2B > 0 ? srB / so2B : 1;

  let total = 0;
  for (let i = 0; i < observed.length; i++) {
    const fLab = xyzToLab({ X: observed[i].r * kr, Y: observed[i].g * kg, Z: observed[i].b * kb }, WHITE_POINT_D50);
    total += deltaE00(fLab, xyzToLab(reference[i], WHITE_POINT_D50));
  }
  return { kr, kg, kb, fit_residual_delta_e00: total / observed.length };
}

export function applyPerChannelScale(model: PerChannelModel, rgb: LinearRGB): XYZColor {
  return { X: rgb.r * model.kr, Y: rgb.g * model.kg, Z: rgb.b * model.kb };
}

export function applyPerChannelToLab(model: PerChannelModel, rgb: LinearRGB): LabColor {
  return xyzToLab(applyPerChannelScale(model, rgb), WHITE_POINT_D50);
}

export function serializePerChannel(model: PerChannelModel): number[] {
  return [model.kr, model.kg, model.kb];
}

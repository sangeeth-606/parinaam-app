/**
 * Parinaam — CIEDE2000 (ΔE00) Implementation
 * ISO 11664-6 / CIE 142-2001.
 * Matches Gaurav Sharma, Wencheng Wu, Edul N. Dalal (2005) reference implementation.
 */

import type { LabValue } from '../types/contracts.ts';

/**
 * Calculates CIEDE2000 total color difference between two CIELAB coordinates.
 * Optional weighting factors kL, kC, kH default to 1.0.
 */
export function deltaE00(
  lab1: LabValue,
  lab2: LabValue,
  kL: number = 1.0,
  kC: number = 1.0,
  kH: number = 1.0
): number {
  const lStd = lab1.l;
  const aStd = lab1.a;
  const bStd = lab1.b;
  const cStd = Math.sqrt(aStd * aStd + bStd * bStd);

  const lSmp = lab2.l;
  const aSmp = lab2.a;
  const bSmp = lab2.b;
  const cSmp = Math.sqrt(aSmp * aSmp + bSmp * bSmp);

  const cAvg = (cStd + cSmp) / 2;

  const G =
    0.5 *
    (1 -
      Math.sqrt(
        Math.pow(cAvg, 7) / (Math.pow(cAvg, 7) + Math.pow(25, 7))
      ));

  const apStd = aStd * (1 + G);
  const apSmp = aSmp * (1 + G);

  const cpStd = Math.sqrt(apStd * apStd + bStd * bStd);
  const cpSmp = Math.sqrt(apSmp * apSmp + bSmp * bSmp);

  let hpStd =
    Math.abs(apStd) + Math.abs(bStd) === 0
      ? 0
      : Math.atan2(bStd, apStd);
  hpStd += (hpStd < 0 ? 1 : 0) * 2 * Math.PI;

  let hpSmp =
    Math.abs(apSmp) + Math.abs(bSmp) === 0
      ? 0
      : Math.atan2(bSmp, apSmp);
  hpSmp += (hpSmp < 0 ? 1 : 0) * 2 * Math.PI;

  const dL = lSmp - lStd;
  const dC = cpSmp - cpStd;

  let dhp = cpStd * cpSmp === 0 ? 0 : hpSmp - hpStd;
  dhp -= (dhp > Math.PI ? 1 : 0) * 2 * Math.PI;
  dhp += (dhp < -Math.PI ? 1 : 0) * 2 * Math.PI;

  const dH = 2 * Math.sqrt(cpStd * cpSmp) * Math.sin(dhp / 2);

  const Lp = (lStd + lSmp) / 2;
  const Cp = (cpStd + cpSmp) / 2;

  let hp: number;
  if (cpStd * cpSmp === 0) {
    hp = hpStd + hpSmp;
  } else {
    hp = (hpStd + hpSmp) / 2;
    hp -= (Math.abs(hpStd - hpSmp) > Math.PI ? 1 : 0) * Math.PI;
    hp += (hp < 0 ? 1 : 0) * 2 * Math.PI;
  }

  const Lpm50 = Math.pow(Lp - 50, 2);
  const T =
    1 -
    0.17 * Math.cos(hp - Math.PI / 6) +
    0.24 * Math.cos(2 * hp) +
    0.32 * Math.cos(3 * hp + Math.PI / 30) -
    0.20 * Math.cos(4 * hp - (63 * Math.PI) / 180);

  const Sl = 1 + (0.015 * Lpm50) / Math.sqrt(20 + Lpm50);
  const Sc = 1 + 0.045 * Cp;
  const Sh = 1 + 0.015 * Cp * T;

  const deltaTheta =
    ((30 * Math.PI) / 180) *
    Math.exp(-1 * Math.pow(((180 / Math.PI) * hp - 275) / 25, 2));

  const Rc =
    2 *
    Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));

  const Rt = -1 * Math.sin(2 * deltaTheta) * Rc;

  const termL = dL / (kL * Sl);
  const termC = dC / (kC * Sc);
  const termH = dH / (kH * Sh);

  return Math.sqrt(
    Math.max(
      0,
      termL * termL +
      termC * termC +
      termH * termH +
      Rt * termC * termH
    )
  );
}

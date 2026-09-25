/**
 * Color Difference Metrics
 *
 * Primary: CIEDE2000 (ΔE00)
 *   Reference: Luo, Cui & Rigg (2001). "The development of the CIE 2000
 *   colour-difference formula: CIEDE2000." Color Research & Application 26(5):340–350.
 *   This is the CIE-recommended metric, correcting known CIE76/94 weaknesses
 *   particularly in saturated/blue regions (directly relevant: reagent endpoint
 *   colors are often saturated blues/violets).
 *
 * Also provided: ΔE76, ΔE94 for audit/comparability with older literature.
 * Neither is used for any engine decision — ΔE00 only.
 */

import type { LabColor } from '../types';

const DEG_TO_RAD = Math.PI / 180;

/**
 * CIEDE2000 color difference.
 *
 * @param lab1 - First Lab color (CIE L*a*b*, D50)
 * @param lab2 - Second Lab color (CIE L*a*b*, D50)
 * @returns ΔE00 — perceptually uniform color difference (0 = identical)
 */
export function deltaE00(lab1: LabColor, lab2: LabColor): number {
  // Step 1: calculate C'ab and h'ab
  const C1 = Math.sqrt(lab1.a ** 2 + lab1.b ** 2);
  const C2 = Math.sqrt(lab2.a ** 2 + lab2.b ** 2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;

  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));

  const a1p = lab1.a * (1 + G);
  const a2p = lab2.a * (1 + G);

  const C1p = Math.sqrt(a1p ** 2 + lab1.b ** 2);
  const C2p = Math.sqrt(a2p ** 2 + lab2.b ** 2);

  let h1p = Math.atan2(lab1.b, a1p) / DEG_TO_RAD;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(lab2.b, a2p) / DEG_TO_RAD;
  if (h2p < 0) h2p += 360;

  // Step 2: calculate ΔL', ΔC', Δh', ΔH'
  const dLp = lab2.L - lab1.L;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG_TO_RAD);

  // Step 3: calculate CIEDE2000
  const Lbarp = (lab1.L + lab2.L) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG_TO_RAD) +
    0.24 * Math.cos(2 * hbarp * DEG_TO_RAD) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG_TO_RAD) -
    0.20 * Math.cos((4 * hbarp - 63) * DEG_TO_RAD);

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));

  const SL = 1 + 0.015 * ((Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * DEG_TO_RAD) * RC;

  return Math.sqrt(
    (dLp / SL) ** 2 +
    (dCp / SC) ** 2 +
    (dHp / SH) ** 2 +
    RT * (dCp / SC) * (dHp / SH)
  );
}

/**
 * CIE76 color difference (Euclidean distance in Lab space).
 * Reported for comparability with older literature — NOT used for engine decisions.
 */
export function deltaE76(lab1: LabColor, lab2: LabColor): number {
  return Math.sqrt(
    (lab2.L - lab1.L) ** 2 +
    (lab2.a - lab1.a) ** 2 +
    (lab2.b - lab1.b) ** 2
  );
}

/**
 * CIE94 color difference.
 * Reported for comparability with older literature — NOT used for engine decisions.
 * kL=1, K1=0.045, K2=0.015 (graphic-arts application)
 */
export function deltaE94(lab1: LabColor, lab2: LabColor): number {
  const dL = lab2.L - lab1.L;
  const C1 = Math.sqrt(lab1.a ** 2 + lab1.b ** 2);
  const C2 = Math.sqrt(lab2.a ** 2 + lab2.b ** 2);
  const dC = C1 - C2;
  const da = lab2.a - lab1.a;
  const db = lab2.b - lab1.b;
  const dH2 = Math.max(0, da ** 2 + db ** 2 - dC ** 2);
  const SL = 1;
  const SC = 1 + 0.045 * C1;
  const SH = 1 + 0.015 * C1;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + dH2 / SH ** 2);
}

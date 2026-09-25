"""
Color Difference Metrics — Python Reference Implementation
Mirrors mobile/src/colorEngine/colorSpace/deltaE.ts exactly.
Primary: CIEDE2000 (ΔE00). Reference: Luo, Cui & Rigg (2001).
"""

import numpy as np

DEG_TO_RAD = np.pi / 180


def delta_e00(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """CIEDE2000. Accepts (..., 3) shaped arrays or 1D [L,a,b]."""
    lab1 = np.asarray(lab1, dtype=float)
    lab2 = np.asarray(lab2, dtype=float)

    L1, a1, b1 = lab1[..., 0], lab1[..., 1], lab1[..., 2]
    L2, a2, b2 = lab2[..., 0], lab2[..., 1], lab2[..., 2]

    C1 = np.sqrt(a1**2 + b1**2)
    C2 = np.sqrt(a2**2 + b2**2)
    Cbar = (C1 + C2) / 2
    Cbar7 = Cbar**7
    G = 0.5 * (1 - np.sqrt(Cbar7 / (Cbar7 + 25**7)))

    a1p = a1 * (1 + G); a2p = a2 * (1 + G)
    C1p = np.sqrt(a1p**2 + b1**2); C2p = np.sqrt(a2p**2 + b2**2)

    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360

    dLp = L2 - L1; dCp = C2p - C1p
    no_chroma = C1p * C2p == 0
    abs_h_diff = np.abs(h2p - h1p)
    dhp = np.where(no_chroma, 0,
          np.where(abs_h_diff <= 180, h2p - h1p,
          np.where(h2p - h1p > 180, h2p - h1p - 360, h2p - h1p + 360)))
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(dhp / 2 * DEG_TO_RAD)

    Lbarp = (L1 + L2) / 2; Cbarp = (C1p + C2p) / 2
    hbarp = np.where(no_chroma, h1p + h2p,
            np.where(abs_h_diff <= 180, (h1p + h2p) / 2,
            np.where(h1p + h2p < 360, (h1p + h2p + 360) / 2, (h1p + h2p - 360) / 2)))

    T = (1 - 0.17 * np.cos((hbarp - 30) * DEG_TO_RAD)
           + 0.24 * np.cos(2 * hbarp * DEG_TO_RAD)
           + 0.32 * np.cos((3 * hbarp + 6) * DEG_TO_RAD)
           - 0.20 * np.cos((4 * hbarp - 63) * DEG_TO_RAD))

    dTheta = 30 * np.exp(-((hbarp - 275) / 25)**2)
    Cbarp7 = Cbarp**7
    RC = 2 * np.sqrt(Cbarp7 / (Cbarp7 + 25**7))

    SL = 1 + 0.015 * (Lbarp - 50)**2 / np.sqrt(20 + (Lbarp - 50)**2)
    SC = 1 + 0.045 * Cbarp
    SH = 1 + 0.015 * Cbarp * T
    RT = -np.sin(2 * dTheta * DEG_TO_RAD) * RC

    return np.sqrt(
        (dLp / SL)**2 + (dCp / SC)**2 + (dHp / SH)**2 +
        RT * (dCp / SC) * (dHp / SH)
    )


def delta_e76(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """CIE76 — for audit/comparability only, not used for decisions."""
    d = np.asarray(lab2) - np.asarray(lab1)
    return np.sqrt((d**2).sum(axis=-1))

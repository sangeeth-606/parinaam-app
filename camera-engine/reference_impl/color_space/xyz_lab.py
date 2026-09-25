"""
CIE XYZ ↔ Lab ↔ LCh Conversions — Python Reference Implementation
Mirrors mobile/src/colorEngine/colorSpace/xyzLab.ts exactly.
"""

import numpy as np

# White points (CIE 2° observer)
D50 = np.array([0.96429, 1.00000, 0.82510])
D65 = np.array([0.95047, 1.00000, 1.08883])

# sRGB → XYZ D65 (IEC 61966-2-1 Annex A)
SRGB_TO_XYZ_D65 = np.array([
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.0721750],
    [0.0193339, 0.1191920, 0.9503041],
])

# Bradford D65 → D50
BRADFORD_D65_TO_D50 = np.array([
    [ 1.0478112,  0.0228866, -0.0501270],
    [ 0.0295424,  0.9904844, -0.0170491],
    [-0.0092345,  0.0150436,  0.7521316],
])

LAB_EPSILON = 0.008856
LAB_KAPPA   = 903.3


def linear_rgb_to_xyz_d65(rgb: np.ndarray) -> np.ndarray:
    """Linearized sRGB [0,1] → CIE XYZ D65. rgb shape: (..., 3)."""
    return rgb @ SRGB_TO_XYZ_D65.T


def adapt_d65_to_d50(xyz: np.ndarray) -> np.ndarray:
    """Bradford chromatic adaptation: XYZ D65 → XYZ D50."""
    return xyz @ BRADFORD_D65_TO_D50.T


def linear_rgb_to_xyz_d50(rgb: np.ndarray) -> np.ndarray:
    """Linearized sRGB → XYZ D50 (primary path)."""
    return adapt_d65_to_d50(linear_rgb_to_xyz_d65(rgb))


def _lab_f(t: np.ndarray) -> np.ndarray:
    return np.where(t > LAB_EPSILON, np.cbrt(t), (LAB_KAPPA * t + 16) / 116)


def xyz_to_lab(xyz: np.ndarray, wp: np.ndarray = D50) -> np.ndarray:
    """XYZ → CIE L*a*b*. xyz and output shape: (..., 3)."""
    f = _lab_f(xyz / wp)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


def lab_to_xyz(lab: np.ndarray, wp: np.ndarray = D50) -> np.ndarray:
    """CIE L*a*b* → XYZ. lab and output shape: (..., 3)."""
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16) / 116
    fx = a / 500 + fy
    fz = fy - b / 200
    xr = np.where(fx > LAB_EPSILON ** (1/3), fx ** 3, (116 * fx - 16) / LAB_KAPPA)
    yr = np.where(L > LAB_KAPPA * LAB_EPSILON, ((L + 16) / 116) ** 3, L / LAB_KAPPA)
    zr = np.where(fz > LAB_EPSILON ** (1/3), fz ** 3, (116 * fz - 16) / LAB_KAPPA)
    return np.stack([xr * wp[0], yr * wp[1], zr * wp[2]], axis=-1)


def xyz_to_chromaticity(xyz: np.ndarray) -> np.ndarray:
    """XYZ → CIE xy chromaticity. Returns shape (..., 2)."""
    total = xyz[..., 0] + xyz[..., 1] + xyz[..., 2]
    x = np.where(total > 0, xyz[..., 0] / total, 1/3)
    y = np.where(total > 0, xyz[..., 1] / total, 1/3)
    return np.stack([x, y], axis=-1)


def linear_rgb_to_lab_d50(rgb: np.ndarray) -> np.ndarray:
    """Linearized sRGB → CIE Lab D50 (primary path)."""
    return xyz_to_lab(linear_rgb_to_xyz_d50(rgb), D50)

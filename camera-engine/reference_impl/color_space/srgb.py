"""
sRGB Linearization / Encoding
Standard: IEC 61966-2-1

Mirrors mobile/src/colorEngine/colorSpace/srgb.ts exactly.
Numerical consistency test: same input must produce same output within 1e-6.
"""

import numpy as np


def srgb_byte_to_linear(c: np.ndarray | float) -> np.ndarray | float:
    """
    Apply sRGB EOTF: 8-bit sRGB value [0-255] → linear light [0, 1].
    Accepts scalars or numpy arrays.
    """
    c_norm = np.asarray(c, dtype=float) / 255.0
    return np.where(
        c_norm <= 0.04045,
        c_norm / 12.92,
        ((c_norm + 0.055) / 1.055) ** 2.4
    )


def linear_to_srgb_normalized(c: np.ndarray | float) -> np.ndarray | float:
    """Linear [0, 1] → encoded sRGB [0, 1]."""
    c = np.clip(np.asarray(c, dtype=float), 0, 1)
    return np.where(
        c <= 0.0031308,
        12.92 * c,
        1.055 * (c ** (1.0 / 2.4)) - 0.055
    )


def linear_to_srgb_byte(c: np.ndarray | float) -> np.ndarray:
    """Linear [0, 1] → 8-bit sRGB integer [0-255]."""
    return np.round(linear_to_srgb_normalized(c) * 255).astype(int)

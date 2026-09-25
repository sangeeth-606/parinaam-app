"""Deterministic, image-consuming camera-engine analysis core.

The TypeScript engine consumes live native frame payloads and is not an image-file
adapter.  This module is the small, deep image seam used by both the Docker HTTP
adapter and the legacy CLI: bytes in, one explicit JSON-compatible result out.

Important scientific boundary:
  * The card references in ``card_v1_geometry.yaml`` are scanner-derived and are
    not spectrophotometer measurements.
  * The current kit profile is explicitly PENDING_VALIDATION.  Classification
    is therefore blocked unless the operator has deliberately enabled the
    demo-profile mode.  Demo mode is surfaced in the response and must be
    surfaced by the mobile app; it is never called laboratory validation.
  * A missing external test swatch is a real inconclusive measurement, not a
    reason to invent a colour or silently classify the calibration card.
"""

from __future__ import annotations

import hashlib
import io
import math
import os
import time
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np
import yaml
from PIL import Image, ImageOps, UnidentifiedImageError

SCHEMA_VERSION = "parinaam-camera-engine-v1"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
MIN_MARKERS = 3
REQUIRED_MARKERS = (0, 1, 2, 3)
BLUR_MIN = 100.0
GLARE_MAX_CHANNEL = 250
GLARE_MAX_FRACTION = 0.15
MIN_VALID_PATCH_FRACTION = 0.50
# Keep this aligned with camera-engine/config/quality_gate_thresholds.yaml.
# The value is an engineering default, not a validated acceptance threshold.
CALIBRATION_RESIDUAL_MAX = 5.0
AMBIGUITY_MARGIN_MIN = 3.0
MAD_ZSCORE_CUTOFF = 3.0
MAD_SIGMA_DIVISOR = 0.6745
PREFERENCE_SIZE = "256x256"
REFERENCE_LIGHT_D50 = np.asarray([96.422, 100.000, 82.521], dtype=np.float64)
SUPPORTED_REAGENT = "duquenois_levine"
OUTCOME_POSITIVE = "CONSISTENT_WITH_REAGENT_POSITIVE"
OUTCOME_NEGATIVE = "CONSISTENT_WITH_REAGENT_NEGATIVE"
OUTCOME_INCONCLUSIVE = "INCONCLUSIVE"

JPEG_MAGIC = b"\xff\xd8\xff"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class AnalysisInputError(ValueError):
    """The supplied image cannot be accepted by the engine."""


class ConfigurationError(ValueError):
    """The canonical engine assets are incomplete or invalid."""


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(float(value))


def _float(value: Any) -> float:
    if not _finite(value):
        raise ConfigurationError(f"non-finite numeric value: {value!r}")
    result = float(value)
    return 0.0 if result == 0 else result


def _json_number(value: Any) -> float | int | None:
    """Return JSON-safe finite numbers, never NaN/Infinity."""
    if not _finite(value):
        return None
    result = float(value)
    if result == 0:
        return 0.0
    return round(result, 8)


def _safe_lab(value: dict[str, Any] | None) -> dict[str, float] | None:
    if not value:
        return None
    result = {k: _float(value[k]) for k in ("L", "a", "b")}
    return result


def _lab_value(lab: np.ndarray | tuple[float, float, float]) -> dict[str, float]:
    values = np.asarray(lab, dtype=np.float64).reshape(3)
    return {"L": _float(values[0]), "a": _float(values[1]), "b": _float(values[2])}


def _image_bytes(image: bytes | bytearray | memoryview) -> bytes:
    data = bytes(image)
    if not data:
        raise AnalysisInputError("EMPTY_IMAGE")
    if len(data) > MAX_IMAGE_BYTES:
        raise AnalysisInputError("IMAGE_TOO_LARGE")
    if not (data.startswith(JPEG_MAGIC) or data.startswith(PNG_MAGIC)):
        raise AnalysisInputError("UNSUPPORTED_IMAGE_FORMAT")
    return data


def _decode_image(data: bytes) -> tuple[np.ndarray, int, int]:
    """Validate dimensions before handing pixels to OpenCV."""
    try:
        with Image.open(io.BytesIO(data)) as opened:
            width, height = opened.size
            if width < 1 or height < 1:
                raise AnalysisInputError("EMPTY_IMAGE")
            if width * height > MAX_IMAGE_PIXELS:
                raise AnalysisInputError("IMAGE_TOO_MANY_PIXELS")
            # verify() validates the container without retaining a writable path.
            opened.verify()
        with Image.open(io.BytesIO(data)) as opened:
            normalized = ImageOps.exif_transpose(opened).convert("RGB")
            rgb = np.asarray(normalized, dtype=np.uint8)
    except AnalysisInputError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise AnalysisInputError("CORRUPT_IMAGE") from exc

    if rgb.ndim != 3 or rgb.shape[2] != 3:
        raise AnalysisInputError("CORRUPT_IMAGE")
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    return np.ascontiguousarray(bgr), int(rgb.shape[1]), int(rgb.shape[0])


def _load_geometry(path: str | os.PathLike[str]) -> dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            geometry = yaml.safe_load(handle)
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigurationError(f"cannot load geometry: {exc}") from exc
    if not isinstance(geometry, dict):
        raise ConfigurationError("geometry root must be a mapping")

    required = ("card_width_mm", "card_height_mm", "fiducial_layout", "patch_layout", "mvp_test1_kit_profile")
    missing = [key for key in required if key not in geometry]
    if missing:
        raise ConfigurationError(f"geometry missing: {', '.join(missing)}")
    for key in ("card_width_mm", "card_height_mm"):
        _float(geometry[key])
    if not isinstance(geometry["fiducial_layout"], list) or not isinstance(geometry["patch_layout"], list):
        raise ConfigurationError("fiducial_layout and patch_layout must be lists")
    if len(geometry["patch_layout"]) != 16:
        raise ConfigurationError("exactly 16 reference patches are required")

    profile = geometry["mvp_test1_kit_profile"]
    if not isinstance(profile, dict):
        raise ConfigurationError("mvp_test1_kit_profile must be a mapping")
    for patch in geometry["patch_layout"]:
        if not isinstance(patch, dict) or "reference_lab" not in patch:
            raise ConfigurationError("every reference patch needs reference_lab")
        _safe_lab(patch["reference_lab"])
    return geometry


def _profile_info(geometry: dict[str, Any], demo_mode: bool) -> dict[str, Any]:
    profile = geometry["mvp_test1_kit_profile"]
    status = str(profile.get("status", "PENDING_VALIDATION")).upper()
    expected = profile.get("expected_result_colors")
    if not isinstance(expected, list) or len(expected) < 2:
        raise ConfigurationError("profile has no two result colours")
    colors: list[dict[str, Any]] = []
    for item in expected:
        if not isinstance(item, dict):
            raise ConfigurationError("result colour entry must be a mapping")
        lab = _safe_lab(item.get("reference_lab"))
        if lab is None or not _finite(item.get("tolerance_radius_de00")):
            raise ConfigurationError("result colour is missing Lab or tolerance")
        colors.append(
            {
                "label": str(item.get("outcome_label", "UNSPECIFIED")),
                "lab": lab,
                "tolerance_delta_e00": _float(item["tolerance_radius_de00"]),
                "source": str(item.get("source", "unspecified")),
            }
        )
    roi = profile.get("test_geometry", {}).get("roi_card_relative") if isinstance(profile.get("test_geometry"), dict) else None
    if not isinstance(roi, dict):
        raise ConfigurationError("profile has no test swatch ROI")
    for key in ("x_mm", "y_mm", "width_mm", "height_mm"):
        _float(roi.get(key))
    if _float(roi["width_mm"]) <= 0 or _float(roi["height_mm"]) <= 0:
        raise ConfigurationError("test swatch ROI must have positive size")
    return {
        "kit_profile_id": str(profile.get("kit_profile_id", "mvp_test1_mock_cannabinoid")),
        "test_name": str(profile.get("test_name", "unnamed mock profile")),
        "status": status,
        "demo_mode": bool(demo_mode),
        "classification_capable": status == "VALIDATED" or bool(demo_mode),
        "model_version": str(profile.get("model_version", "unknown")),
        "expected_result_colors": colors,
        "roi_card_relative": {
            "x_mm": _float(roi["x_mm"]),
            "y_mm": _float(roi["y_mm"]),
            "width_mm": _float(roi["width_mm"]),
            "height_mm": _float(roi["height_mm"]),
        },
        "validity_rules": profile.get("validity_rules") if isinstance(profile.get("validity_rules"), dict) else {},
    }


def _detector() -> tuple[Any, Any]:
    aruco = getattr(cv2, "aruco", None)
    if aruco is None:
        raise ConfigurationError("OpenCV ArUco support is unavailable")
    dictionary = aruco.getPredefinedDictionary(aruco.DICT_4X4_50)
    parameters = aruco.DetectorParameters()
    if hasattr(aruco, "ArucoDetector"):
        return dictionary, aruco.ArucoDetector(dictionary, parameters)
    return dictionary, None


def _detect_markers(gray: np.ndarray) -> tuple[dict[int, np.ndarray], int]:
    dictionary, detector = _detector()
    if detector is not None:
        corners, ids, rejected = detector.detectMarkers(gray)
    else:  # OpenCV versions that expose only the legacy helper.
        cv2.aruco.detectMarkers(gray, dictionary, None, None)
        corners, ids, rejected = cv2.aruco.detectMarkers(gray, dictionary)
    if ids is None or corners is None:
        return {}, 0
    found: dict[int, np.ndarray] = {}
    for index, marker_id in enumerate(ids.flatten()):
        marker = int(marker_id)
        if 0 <= index < len(corners) and marker in REQUIRED_MARKERS:
            found[marker] = np.asarray(corners[index][0], dtype=np.float32)
    return found, len(found)


def _fit_homography(
    image: np.ndarray, fiducials: list[dict[str, Any]], found: dict[int, np.ndarray]
) -> tuple[np.ndarray | None, dict[str, Any]]:
    points_mm: list[list[float]] = []
    points_px: list[list[float]] = []
    for marker in fiducials:
        marker_id = int(marker.get("id", -1))
        if marker_id not in found:
            continue
        x = _float(marker["x_mm"])
        y = _float(marker["y_mm"])
        size = _float(marker["size_mm"])
        corners = found[marker_id]
        if corners.shape != (4, 2):
            continue
        points_mm.extend(
            [[x, y], [x + size, y], [x + size, y + size], [x, y + size]]
        )
        points_px.extend(corners.astype(float).tolist())
    if len(points_mm) < MIN_MARKERS * 4:
        return None, {"marker_count": len(found), "inlier_ratio": 0.0, "reprojection_error_px": None}

    src = np.asarray(points_mm, dtype=np.float32)
    dst = np.asarray(points_px, dtype=np.float32)
    homography, inliers = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    if homography is None or not np.isfinite(homography).all():
        return None, {"marker_count": len(found), "inlier_ratio": 0.0, "reprojection_error_px": None}
    projected = cv2.perspectiveTransform(src.reshape(-1, 1, 2), homography).reshape(-1, 2)
    error = np.linalg.norm(projected - dst, axis=1)
    inlier_mask = inliers.reshape(-1).astype(bool) if inliers is not None else np.ones(len(error), dtype=bool)
    if not inlier_mask.any():
        return None, {"marker_count": len(found), "inlier_ratio": 0.0, "reprojection_error_px": None}
    ratio = float(inlier_mask.mean())
    mean_error = float(error[inlier_mask].mean())
    if ratio < 0.60 or mean_error > 8.0:
        return None, {
            "marker_count": len(found),
            "inlier_ratio": ratio,
            "reprojection_error_px": mean_error,
        }
    return homography, {
        "marker_count": len(found),
        "inlier_ratio": ratio,
        "reprojection_error_px": mean_error,
    }


def _transform_roi(homography: np.ndarray, rect: dict[str, float], image_shape: tuple[int, ...]) -> np.ndarray:
    x = _float(rect["x_mm"])
    y = _float(rect["y_mm"])
    w = _float(rect["width_mm"])
    h = _float(rect["height_mm"])
    corners_mm = np.asarray([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], dtype=np.float32)
    corners_px = cv2.perspectiveTransform(corners_mm.reshape(-1, 1, 2), homography).reshape(-1, 2)
    height, width = image_shape[:2]
    if (
        corners_px[:, 0].max() < 0
        or corners_px[:, 1].max() < 0
        or corners_px[:, 0].min() > width
        or corners_px[:, 1].min() > height
    ):
        raise ValueError("ROI_OUTSIDE_FRAME")
    return corners_px


def _sample_roi(
    image: np.ndarray, homography: np.ndarray, rect: dict[str, float], label: str
) -> dict[str, Any]:
    # Match the native CardDetectorPlugin: erode in design-mm space first,
    # then sample the transformed bounding rectangle. Sampling a polygon mask
    # here can accidentally include neighbouring patches under perspective.
    inner_rect = {
        "x_mm": _float(rect["x_mm"]) + _float(rect["width_mm"]) * 0.25,
        "y_mm": _float(rect["y_mm"]) + _float(rect["height_mm"]) * 0.25,
        "width_mm": _float(rect["width_mm"]) * 0.50,
        "height_mm": _float(rect["height_mm"]) * 0.50,
    }
    polygon = _transform_roi(homography, inner_rect, image.shape)
    height, width = image.shape[:2]
    min_x = max(0, int(math.floor(float(polygon[:, 0].min()))))
    max_x = min(width, int(math.ceil(float(polygon[:, 0].max()))) + 1)
    min_y = max(0, int(math.floor(float(polygon[:, 1].min()))))
    max_y = min(height, int(math.ceil(float(polygon[:, 1].max()))) + 1)
    if max_x <= min_x or max_y <= min_y:
        raise ValueError("ROI_OUTSIDE_FRAME")

    roi = image[min_y:max_y, min_x:max_x]
    pixels = roi.reshape(-1, 3)
    if pixels.size == 0:
        raise ValueError("ROI_EMPTY")
    total = float(pixels.shape[0])
    glare_pixels = (pixels.max(axis=1) >= GLARE_MAX_CHANNEL)
    glare_fraction = float(glare_pixels.mean())
    valid = pixels[~glare_pixels]
    valid_fraction = float(valid.shape[0] / total)
    if valid_fraction < MIN_VALID_PATCH_FRACTION or glare_fraction > GLARE_MAX_FRACTION:
        raise ValueError("ROI_GLARE")
    if valid.shape[0] < 20:
        raise ValueError("ROI_TOO_SMALL")

    # Linearize individual pixels before averaging. This matches the native
    # engine and avoids bias from averaging gamma-encoded sRGB values.
    srgb = valid[:, ::-1].astype(np.float64) / 255.0
    linear_pixels = np.where(
        srgb <= 0.04045,
        srgb / 12.92,
        ((srgb + 0.055) / 1.055) ** 2.4,
    )
    luminance = linear_pixels @ np.asarray([0.2126, 0.7152, 0.0722], dtype=np.float64)
    median_luminance = float(np.median(luminance))
    mad = float(np.median(np.abs(luminance - median_luminance)))
    if mad > 0.0:
        mad_mask = np.abs(luminance - median_luminance) <= (MAD_ZSCORE_CUTOFF * mad / MAD_SIGMA_DIVISOR)
        if int(mad_mask.sum()) >= 20:
            linear_pixels = linear_pixels[mad_mask]
            luminance = luminance[mad_mask]
    low, high = np.percentile(luminance, [10.0, 90.0])
    if high > low:
        trim_mask = (luminance >= low) & (luminance <= high)
        if int(trim_mask.sum()) >= 20:
            linear_pixels = linear_pixels[trim_mask]
    mean_linear = np.mean(linear_pixels, axis=0)
    if not np.isfinite(mean_linear).all():
        raise ValueError("ROI_NON_FINITE")
    # Retain a BGR representation for diagnostics/backward compatibility; the
    # fit and normalizer use mean_linear_rgb directly.
    linear_to_srgb = np.where(
        mean_linear <= 0.0031308,
        12.92 * mean_linear,
        1.055 * np.power(np.clip(mean_linear, 0.0, 1.0), 1.0 / 2.4) - 0.055,
    )
    mean_bgr = np.asarray([linear_to_srgb[2], linear_to_srgb[0], linear_to_srgb[1]]) * 255.0
    return {
        "label": label,
        "mean_bgr": [float(x) for x in mean_bgr],
        "mean_linear_rgb": [float(x) for x in mean_linear],
        "pixel_count": int(pixels.shape[0]),
        "valid_fraction": valid_fraction,
        "glare_fraction": glare_fraction,
        "roi_px": [[float(x), float(y)] for x, y in polygon.tolist()],
    }


def _linear_rgb_from_bgr(mean_bgr: Iterable[float]) -> np.ndarray:
    bgr = np.asarray(list(mean_bgr), dtype=np.float64)
    rgb = np.asarray([bgr[2], bgr[0], bgr[1]], dtype=np.float64) / 255.0
    linear = np.where(
        rgb <= 0.04045,
        rgb / 12.92,
        ((rgb + 0.055) / 1.055) ** 2.4,
    )
    return np.clip(linear, 0.0, 1.0)


def _xyz_from_linear_rgb(rgb: np.ndarray) -> np.ndarray:
    matrix = np.asarray(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ],
        dtype=np.float64,
    )
    matrix /= np.sum(matrix, axis=1, keepdims=True)
    return matrix @ rgb


def _expand_root_poly2(rgb: Iterable[float]) -> np.ndarray:
    r, g, b = np.clip(np.asarray(list(rgb), dtype=np.float64), 0.0, 1.0)
    return np.asarray(
        [r, g, b, math.sqrt(float(r * g)), math.sqrt(float(r * b)), math.sqrt(float(g * b))],
        dtype=np.float64,
    )


def _lab_to_xyz_d50(lab: dict[str, float] | np.ndarray) -> np.ndarray:
    values = np.asarray([lab["L"], lab["a"], lab["b"]], dtype=np.float64) if isinstance(lab, dict) else np.asarray(lab, dtype=np.float64)
    l_value, a_value, b_value = values
    fy = (l_value + 16.0) / 116.0
    fx = fy + a_value / 500.0
    fz = fy - b_value / 200.0
    delta = 6.0 / 29.0

    def inverse(value: float) -> float:
        return value**3 if value > delta else 3 * delta**2 * (value - 4.0 / 29.0)

    return np.asarray([inverse(fx), inverse(fy), inverse(fz)], dtype=np.float64) * REFERENCE_LIGHT_D50 / 100.0


def _lab_from_xyz(xyz: np.ndarray) -> np.ndarray:
    normalized = xyz * 100.0 / REFERENCE_LIGHT_D50
    delta = 6.0 / 29.0
    f = np.where(
        normalized > delta**3,
        np.cbrt(normalized),
        normalized / (3 * delta**2) + 4.0 / 29.0,
    )
    return np.asarray(
        [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])],
        dtype=np.float64,
    )


def _delta_e00(lab1: dict[str, float] | np.ndarray, lab2: dict[str, float] | np.ndarray) -> float:
    if isinstance(lab1, dict):
        first = np.asarray([lab1["L"], lab1["a"], lab1["b"]], dtype=np.float64)
    else:
        first = np.asarray(lab1, dtype=np.float64)
    if isinstance(lab2, dict):
        second = np.asarray([lab2["L"], lab2["a"], lab2["b"]], dtype=np.float64)
    else:
        second = np.asarray(lab2, dtype=np.float64)
    l1, a1, b1 = first
    l2, a2, b2 = second
    c1 = math.hypot(a1, b1)
    c2 = math.hypot(a2, b2)
    c_bar = (c1 + c2) / 2.0
    g = 0.5 * (1 - math.sqrt(c_bar**7 / (c_bar**7 + 25.0**7))) if c_bar != 0 else 0.5
    a1p = (1 + g) * a1
    a2p = (1 + g) * a2
    c1p = math.hypot(a1p, b1)
    c2p = math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if (a1p or b1) else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if (a2p or b2) else 0.0
    dlp = l2 - l1
    dcp = c2p - c1p
    if c1p * c2p == 0:
        dhp = 0.0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p <= h1p:
        dhp = h2p - h1p + 360
    else:
        dhp = h2p - h1p - 360
    dhp = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dhp / 2))
    lbar = (l1 + l2) / 2
    cbarp = (c1p + c2p) / 2
    if c1p * c2p == 0:
        hbarp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbarp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hbarp = (h1p + h2p + 360) / 2
    else:
        hbarp = (h1p + h2p - 360) / 2
    t = (
        1
        - 0.17 * math.cos(math.radians(hbarp - 30))
        + 0.24 * math.cos(math.radians(2 * hbarp))
        + 0.32 * math.cos(math.radians(3 * hbarp + 6))
        - 0.20 * math.cos(math.radians(4 * hbarp - 63))
    )
    d_theta = 30 * math.exp(-(((hbarp - 275) / 25) ** 2))
    rc = 2 * math.sqrt(cbarp**7 / (cbarp**7 + 25**7)) if cbarp != 0 else 0.0
    sl = 1 + (0.015 * (lbar - 50) ** 2) / math.sqrt(20 + (lbar - 50) ** 2)
    sc = 1 + 0.045 * cbarp
    sh = 1 + 0.015 * cbarp * t
    rt = -math.sin(math.radians(2 * d_theta)) * rc
    return math.sqrt((dlp / sl) ** 2 + (dcp / sc) ** 2 + (dhp / sh) ** 2 + rt * (dcp / sc) * (dhp / sh))


def _fit_calibration(samples: list[dict[str, Any]], geometry: dict[str, Any]) -> dict[str, Any]:
    # Root-polynomial correction: observed sRGB-linear values -> reference Lab.
    # The design is deliberately simple and inspectable; the quality gate below
    # prevents a partial or glare-contaminated fit from becoming a result.
    # Finlayson–Mackiewicz–Hurlbert degree-2 root-polynomial correction.
    # The six terms are linear in exposure, unlike the old plain quadratic
    # basis that failed the supplied phone-photo fixture.
    design = []
    target_xyz = []
    target_lab = []
    for sample in samples:
        linear = np.asarray(sample.get("mean_linear_rgb", _linear_rgb_from_bgr(sample["mean_bgr"])), dtype=np.float64)
        design.append(_expand_root_poly2(linear))
        reference_lab = sample["reference_lab"]
        target_xyz.append(_lab_to_xyz_d50(reference_lab))
        target_lab.append(reference_lab)
    a = np.asarray(design, dtype=np.float64)
    y = np.asarray(target_xyz, dtype=np.float64)
    try:
        coefficients, _, rank, _ = np.linalg.lstsq(a, y, rcond=None)
    except np.linalg.LinAlgError as exc:
        raise ValueError("CALIBRATION_SOLVE_FAILED") from exc
    if rank < 6 or not np.isfinite(coefficients).all():
        raise ValueError("CALIBRATION_DEGENERATE")
    predicted_xyz = a @ coefficients
    predicted_lab = np.asarray([_lab_from_xyz(row) for row in predicted_xyz], dtype=np.float64)
    residuals = [
        _delta_e00(predicted_lab[index], target_lab[index])
        for index in range(len(target_lab))
    ]
    residual_mean = float(np.mean(residuals))
    residual_max = float(np.max(residuals))
    if not math.isfinite(residual_mean) or not math.isfinite(residual_max):
        raise ValueError("CALIBRATION_NON_FINITE")
    if residual_mean > CALIBRATION_RESIDUAL_MAX:
        raise ValueError("CALIBRATION_RESIDUAL_HIGH")
    return {
        "method": "ROOT_POLYNOMIAL_SRGB_LINEAR_V1",
        "rank": int(rank),
        "coefficients": [[_json_number(x) for x in row] for row in coefficients],
        "fit_residual_delta_e00": _json_number(residual_mean),
        "max_fit_residual_delta_e00": _json_number(residual_max),
        "patch_count": len(samples),
        "grade": "GOOD" if residual_mean <= 2.5 else "DEGRADED",
    }


def _normalise_test_lab(sample: dict[str, Any], calibration: dict[str, Any]) -> tuple[dict[str, float], dict[str, float]]:
    linear = np.asarray(sample.get("mean_linear_rgb", _linear_rgb_from_bgr(sample["mean_bgr"])), dtype=np.float64)
    xyz = _xyz_from_linear_rgb(linear)
    observed = _lab_from_xyz(xyz)
    coefficients = np.asarray(calibration["coefficients"], dtype=np.float64)
    features = _expand_root_poly2(linear)
    corrected_xyz = features @ coefficients
    corrected = _lab_from_xyz(corrected_xyz)
    if not np.isfinite(corrected).all():
        raise ValueError("NORMALIZED_COLOUR_NON_FINITE")
    return _lab_value(observed), _lab_value(corrected)


def _classify(
    profile: dict[str, Any], normalized_lab: dict[str, float], quality_status: str
) -> dict[str, Any]:
    if quality_status != "PASS":
        return {
            "status": "INCONCLUSIVE",
            "outcome": OUTCOME_INCONCLUSIVE,
            "reason": "IMAGE_QUALITY_FAILED",
            "confidence": 0.0,
            "confidence_uncalibrated": True,
            "best_delta_e00": None,
            "margin_delta_e00": None,
            "distances": [],
        }
    if not profile["classification_capable"]:
        return {
            "status": "BLOCKED",
            "outcome": OUTCOME_INCONCLUSIVE,
            "reason": "PROFILE_PENDING_VALIDATION",
            "confidence": 0.0,
            "confidence_uncalibrated": True,
            "best_delta_e00": None,
            "margin_delta_e00": None,
            "distances": [],
        }

    distances: list[dict[str, Any]] = []
    for target in profile["expected_result_colors"]:
        distance = _delta_e00(normalized_lab, target["lab"])
        distances.append(
            {
                "label": (
                    OUTCOME_POSITIVE
                    if target["label"] == "POSITIVE_CANNABINOID"
                    else OUTCOME_NEGATIVE
                    if target["label"] == "NEGATIVE"
                    else OUTCOME_INCONCLUSIVE
                ),
                "delta_e00": _json_number(distance),
                "tolerance_delta_e00": _json_number(target["tolerance_delta_e00"]),
                "within_tolerance": distance <= target["tolerance_delta_e00"],
            }
        )
    distances.sort(
        key=lambda item: float("inf")
        if item["delta_e00"] is None
        else float(item["delta_e00"])
    )
    best = distances[0]
    second = distances[1]
    best_distance = float("inf") if best["delta_e00"] is None else float(best["delta_e00"])
    second_distance = float("inf") if second["delta_e00"] is None else float(second["delta_e00"])
    margin = second_distance - best_distance
    min_confidence = _float(profile.get("validity_rules", {}).get("min_confidence_to_classify", 0.5))
    confidence = max(0.0, min(1.0, 1.0 - best_distance / max(float(best["tolerance_delta_e00"]), 1.0)))
    if (
        not bool(best["within_tolerance"])
        or margin < AMBIGUITY_MARGIN_MIN
        or (confidence < min_confidence and not profile["demo_mode"])
    ):
        return {
            "status": "INCONCLUSIVE",
            "outcome": OUTCOME_INCONCLUSIVE,
            "reason": "NO_CLOSE_MATCH" if not bool(best["within_tolerance"]) else "AMBIGUOUS_MATCH",
            "confidence": _json_number(confidence) or 0.0,
            "confidence_uncalibrated": True,
            "best_delta_e00": _json_number(best_distance),
            "margin_delta_e00": _json_number(margin),
            "distances": distances,
        }
    label = str(best["label"])
    outcome = (
        OUTCOME_POSITIVE
        if label in {OUTCOME_POSITIVE, "POSITIVE_CANNABINOID"}
        else OUTCOME_NEGATIVE
        if label in {OUTCOME_NEGATIVE, "NEGATIVE"}
        else OUTCOME_INCONCLUSIVE
    )
    return {
        "status": "MATCH" if outcome != OUTCOME_INCONCLUSIVE else "INCONCLUSIVE",
        "outcome": outcome,
        "reason": None if outcome != OUTCOME_INCONCLUSIVE else "UNKNOWN_PROFILE_LABEL",
        "confidence": _json_number(confidence) or 0.0,
        "confidence_uncalibrated": True,
        "best_delta_e00": _json_number(best_distance),
        "margin_delta_e00": _json_number(margin),
        "distances": distances,
    }


def _failure_result(
    *,
    data: bytes,
    geometry: dict[str, Any],
    profile: dict[str, Any],
    requested_reagent: str,
    demo_mode: bool,
    failure_codes: list[str],
    started: float,
    diagnostics: dict[str, Any] | None = None,
    classification_reason: str | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "status": "FAIL",
        "image": {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)},
        "profile": {
            "kit_profile_id": profile["kit_profile_id"],
            "status": profile["status"],
            "demo_mode": demo_mode,
            "classification_capable": profile["classification_capable"],
            "source": "card_v1_geometry.yaml",
        },
        "requested_reagent": requested_reagent,
        "quality": {
            "status": "FAIL",
            "failure_codes": sorted(set(failure_codes)),
            "diagnostics": diagnostics or {},
        },
        "calibration": None,
        "raw_color": None,
        "normalized_color": None,
        "classification": {
            "status": "INCONCLUSIVE",
            "outcome": OUTCOME_INCONCLUSIVE,
            "reason": classification_reason or "IMAGE_QUALITY_FAILED",
            "confidence": 0.0,
            "confidence_uncalibrated": True,
            "best_delta_e00": None,
            "margin_delta_e00": None,
            "distances": [],
        },
        "diagnostics": {"processing_time_ms": _json_number((time.perf_counter() - started) * 1000)},
    }


def analyze_image_bytes(
    image: bytes | bytearray | memoryview,
    geometry_path: str | os.PathLike[str],
    *,
    requested_reagent: str = SUPPORTED_REAGENT,
    demo_mode: bool = False,
) -> dict[str, Any]:
    """Analyze one JPEG/PNG and return a JSON-serialisable result.

    This is the canonical image interface.  It never writes an output image and
    never returns a fabricated classification when the test swatch or profile
    is unavailable.
    """
    started = time.perf_counter()
    data = _image_bytes(image)
    geometry = _load_geometry(geometry_path)
    profile = _profile_info(geometry, demo_mode=demo_mode)
    if requested_reagent != SUPPORTED_REAGENT:
        # Calibration is still useful evidence, but the current profile has no
        # scientifically valid reference matrix for other reagents.
        requested_reagent = str(requested_reagent or "unknown")
    try:
        image_bgr, width, height = _decode_image(data)
    except AnalysisInputError as exc:
        return _failure_result(
            data=data,
            geometry=geometry,
            profile=profile,
            requested_reagent=requested_reagent,
            demo_mode=demo_mode,
            failure_codes=[str(exc)],
            started=started,
        )

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    found, marker_count = _detect_markers(gray)
    missing = [marker_id for marker_id in REQUIRED_MARKERS if marker_id not in found]
    quality_codes: list[str] = []
    if blur_score < BLUR_MIN:
        quality_codes.append("EXCESSIVE_BLUR")
    if width * height < 300_000:
        quality_codes.append("IMAGE_TOO_SMALL")
    if marker_count < MIN_MARKERS:
        quality_codes.append("INSUFFICIENT_MARKERS")
    if missing and marker_count >= MIN_MARKERS:
        quality_codes.append("MISSING_CARD_MARKER")
    homography, homography_diagnostics = _fit_homography(image_bgr, geometry["fiducial_layout"], found)
    if homography is None and "INSUFFICIENT_MARKERS" not in quality_codes:
        quality_codes.append("HOMOGRAPHY_UNSTABLE")
    quality_diagnostics: dict[str, Any] = {
        "width_px": width,
        "height_px": height,
        "blur_laplacian_variance": _json_number(blur_score),
        "mean_luminance": _json_number(float(gray.mean())),
        "glare_fraction": 0.0,
        "detected_marker_ids": sorted(found),
        "missing_marker_ids": missing,
        "homography": homography_diagnostics,
    }
    if quality_codes or homography is None:
        return _failure_result(
            data=data,
            geometry=geometry,
            profile=profile,
            requested_reagent=requested_reagent,
            demo_mode=demo_mode,
            failure_codes=quality_codes or ["HOMOGRAPHY_UNSTABLE"],
            started=started,
            diagnostics=quality_diagnostics,
        )

    # A card-only diagnostic image can have valid markers while the external
    # test swatch is completely outside the captured frame. Detect that before
    # patch sampling so the result states the actual missing ROI instead of
    # reporting an incidental glare failure from the card patches.
    try:
        _transform_roi(homography, profile["roi_card_relative"], image_bgr.shape)
    except ValueError as exc:
        if str(exc) == "ROI_OUTSIDE_FRAME":
            quality_diagnostics["test_swatch"] = "outside_frame"
            return _failure_result(
                data=data,
                geometry=geometry,
                profile=profile,
                requested_reagent=requested_reagent,
                demo_mode=demo_mode,
                failure_codes=["TEST_SWATCH_OUTSIDE_FRAME"],
                started=started,
                diagnostics=quality_diagnostics,
                classification_reason="TEST_SWATCH_OUTSIDE_FRAME",
            )
        raise

    # All 16 patches are mandatory.  A partial calibration is not a calibration.
    samples: list[dict[str, Any]] = []
    patch_failures: list[str] = []
    for patch in geometry["patch_layout"]:
        try:
            sample = _sample_roi(image_bgr, homography, patch["design_rect"], str(patch["patch_id"]))
            sample["reference_lab"] = _safe_lab(patch["reference_lab"])
            samples.append(sample)
        except (ValueError, KeyError, TypeError) as exc:
            patch_failures.append(f"{patch.get('patch_id', 'PATCH')}:{exc}")

    if patch_failures or len(samples) != 16:
        quality_codes.extend(patch_failures or ["REFERENCE_CARD_PATCH_COUNT"])
        quality_diagnostics["patch_failures"] = patch_failures
        return _failure_result(
            data=data,
            geometry=geometry,
            profile=profile,
            requested_reagent=requested_reagent,
            demo_mode=demo_mode,
            failure_codes=quality_codes,
            started=started,
            diagnostics=quality_diagnostics,
        )

    try:
        calibration = _fit_calibration(samples, geometry)
    except ValueError as exc:
        quality_codes.append(str(exc))
        return _failure_result(
            data=data,
            geometry=geometry,
            profile=profile,
            requested_reagent=requested_reagent,
            demo_mode=demo_mode,
            failure_codes=quality_codes,
            started=started,
            diagnostics=quality_diagnostics,
        )

    # The external swatch is intentionally separate from the card calibration
    # patches.  A rectified calibration card without that swatch cannot be
    # classified, and the result must say so plainly.
    try:
        test_sample = _sample_roi(
            image_bgr,
            homography,
            profile["roi_card_relative"],
            "TEST_SWATCH",
        )
    except ValueError as exc:
        return {
            "schema_version": SCHEMA_VERSION,
            "status": "FAIL",
            "image": {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)},
            "profile": {
                "kit_profile_id": profile["kit_profile_id"],
                "status": profile["status"],
                "demo_mode": demo_mode,
                "classification_capable": profile["classification_capable"],
                "source": "card_v1_geometry.yaml",
            },
            "requested_reagent": requested_reagent,
            "quality": {
                "status": "PASS",
                "failure_codes": [],
                "diagnostics": quality_diagnostics,
            },
            "calibration": calibration,
            "raw_color": None,
            "normalized_color": None,
            "classification": {
                "status": "INCONCLUSIVE",
                "outcome": OUTCOME_INCONCLUSIVE,
                "reason": "TEST_SWATCH_OUTSIDE_FRAME" if str(exc) == "ROI_OUTSIDE_FRAME" else "TEST_SWATCH_UNREADABLE",
                "confidence": 0.0,
                "confidence_uncalibrated": True,
                "best_delta_e00": None,
                "margin_delta_e00": None,
                "distances": [],
            },
            "diagnostics": {"processing_time_ms": _json_number((time.perf_counter() - started) * 1000)},
        }

    raw_lab, normalized_lab = _normalise_test_lab(test_sample, calibration)
    classification = _classify(profile, normalized_lab, "PASS")
    if requested_reagent != SUPPORTED_REAGENT:
        classification = {
            **classification,
            "status": "BLOCKED",
            "outcome": OUTCOME_INCONCLUSIVE,
            "reason": "UNSUPPORTED_REAGENT_PROFILE",
            "confidence": 0.0,
        }
    return {
        "schema_version": SCHEMA_VERSION,
        "status": "PASS",
        "image": {
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
            "width_px": width,
            "height_px": height,
        },
        "profile": {
            "kit_profile_id": profile["kit_profile_id"],
            "status": profile["status"],
            "demo_mode": demo_mode,
            "classification_capable": profile["classification_capable"],
            "source": "card_v1_geometry.yaml",
        },
        "requested_reagent": requested_reagent,
        "quality": {
            "status": "PASS",
            "failure_codes": [],
            "diagnostics": quality_diagnostics,
        },
        "calibration": calibration,
        "raw_color": {
            "lab": raw_lab,
            "linear_rgb": [float(x) for x in test_sample.get("mean_linear_rgb", _linear_rgb_from_bgr(test_sample["mean_bgr"]))],
            "sampling": {k: v for k, v in test_sample.items() if k != "mean_bgr"},
        },
        "normalized_color": {"lab": normalized_lab, "delta_e00_to_card_mean": None},
        "classification": classification,
        "diagnostics": {
            "processing_time_ms": _json_number((time.perf_counter() - started) * 1000),
            "preferred_working_profile": PREFERENCE_SIZE,
            "calibration_patch_count": len(samples),
        },
    }


def readiness(geometry_path: str | os.PathLike[str], *, demo_mode: bool = False) -> dict[str, Any]:
    """Return process readiness without pretending pending validation is done."""
    try:
        geometry = _load_geometry(geometry_path)
        profile = _profile_info(geometry, demo_mode=demo_mode)
        return {
            "ok": True,
            "schema_version": SCHEMA_VERSION,
            "profile": {
                "kit_profile_id": profile["kit_profile_id"],
                "status": profile["status"],
                "demo_mode": demo_mode,
                "classification_capable": profile["classification_capable"],
            },
            "engine": {"name": "parinaam-camera-engine", "version": "image-file-v1"},
        }
    except (ConfigurationError, OSError) as exc:
        return {
            "ok": False,
            "schema_version": SCHEMA_VERSION,
            "error": str(exc),
            "engine": {"name": "parinaam-camera-engine", "version": "image-file-v1"},
        }


def read_geometry_hash(geometry_path: str | os.PathLike[str]) -> str:
    with open(geometry_path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


if __name__ == "__main__":  # pragma: no cover - used by the legacy CLI wrapper
    print(readiness(os.environ.get("CAMERA_ENGINE_GEOMETRY", "card_v1_geometry.yaml"), demo_mode=os.environ.get("CAMERA_ENGINE_DEMO_MODE", "0") == "1"))

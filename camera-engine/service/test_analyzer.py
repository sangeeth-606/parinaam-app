"""Small pure tests for the image analyzer's validation and fail-closed policy."""

from __future__ import annotations

import io
import os
import unittest
from pathlib import Path

import yaml
from PIL import Image

from analyzer import AnalysisInputError, _classify, analyze_image_bytes, readiness


GEOMETRY = os.environ.get(
    "CAMERA_ENGINE_GEOMETRY",
    str(Path(__file__).resolve().parent.parent / "card_v1_geometry.yaml"),
)
THRESHOLDS = Path(__file__).resolve().parent.parent / "config" / "quality_gate_thresholds.yaml"


class AnalyzerContractTests(unittest.TestCase):
    def test_rejects_empty_and_non_image_bytes(self) -> None:
        with self.assertRaises(AnalysisInputError):
            analyze_image_bytes(b"", GEOMETRY)
        with self.assertRaises(AnalysisInputError):
            analyze_image_bytes(b"not an image", GEOMETRY)

    def test_readiness_keeps_pending_profile_explicit(self) -> None:
        state = readiness(GEOMETRY, demo_mode=False)
        self.assertTrue(state["ok"])
        self.assertEqual(state["profile"]["status"], "PENDING_VALIDATION")
        self.assertFalse(state["profile"]["classification_capable"])

    def test_threshold_manifest_has_explicit_reviewed_values(self) -> None:
        with THRESHOLDS.open("r", encoding="utf-8") as handle:
            values = yaml.safe_load(handle)
        self.assertEqual(values["patch_mad_zscore_cutoff"], 3.0)
        self.assertEqual(values["patch_mad_sigma_divisor"], 0.6745)
        self.assertEqual(values["calibration_fit_residual_de00_max"], 5.0)
        self.assertEqual(values["ambiguity_margin_de00"], 3.0)
        self.assertEqual(values["abstention_confidence_threshold"], 0.4)

    def test_classification_maps_internal_targets_to_legal_outcomes(self) -> None:
        profile = {
            "demo_mode": True,
            "classification_capable": True,
            "validity_rules": {"min_confidence_to_classify": 0.4},
            "expected_result_colors": [
                {"label": "POSITIVE_CANNABINOID", "lab": {"L": 42, "a": 25, "b": -39}, "tolerance_delta_e00": 8.0},
                {"label": "NEGATIVE", "lab": {"L": 37, "a": -6, "b": -39}, "tolerance_delta_e00": 8.0},
            ],
        }
        result = _classify(profile, {"L": 42, "a": 25, "b": -39}, "PASS")
        self.assertEqual(result["outcome"], "CONSISTENT_WITH_REAGENT_POSITIVE")
        self.assertNotIn("POSITIVE_CANNABINOID", {item["label"] for item in result["distances"]})

    def test_pending_profile_is_blocked_even_for_a_perfect_colour(self) -> None:
        profile = {
            "demo_mode": False,
            "classification_capable": False,
            "validity_rules": {"min_confidence_to_classify": 0.4},
            "expected_result_colors": [
                {"label": "POSITIVE_CANNABINOID", "lab": {"L": 42, "a": 25, "b": -39}, "tolerance_delta_e00": 8.0},
                {"label": "NEGATIVE", "lab": {"L": 37, "a": -6, "b": -39}, "tolerance_delta_e00": 8.0},
            ],
        }
        result = _classify(profile, {"L": 42, "a": 25, "b": -39}, "PASS")
        self.assertEqual(result["status"], "BLOCKED")
        self.assertEqual(result["outcome"], "INCONCLUSIVE")
        self.assertEqual(result["reason"], "PROFILE_PENDING_VALIDATION")


    def test_card_only_fixture_is_explicitly_inconclusive(self) -> None:
        # The checked-in rectified card is a real card-only fixture.  Even when
        # a caller supplies it, a missing external ROI must not be classified.
        fixture = Path(__file__).resolve().parent.parent / "card_rectified_view.png"
        try:
            with open(fixture, "rb") as handle:
                image = handle.read()
        except FileNotFoundError:
            self.skipTest("fixture is not present in this build context")
        result = analyze_image_bytes(image, GEOMETRY, demo_mode=True)
        self.assertEqual(result["classification"]["outcome"], "INCONCLUSIVE")
        self.assertIn(
            result["classification"]["reason"],
            {"TEST_SWATCH_OUTSIDE_FRAME", "TEST_SWATCH_UNREADABLE", "IMAGE_QUALITY_FAILED"},
        )

    def test_response_is_json_shaped_for_corrupt_input(self) -> None:
        # The HTTP layer turns input errors into 4xx; the pure core raises
        # before a response exists.  This guards against accidentally returning
        # a result for an empty upload.
        with self.assertRaises(AnalysisInputError):
            analyze_image_bytes(b"", GEOMETRY)

    def test_hough_well_detection_and_shared_calibration(self) -> None:
        fixture = Path(__file__).resolve().parent.parent / "photo-phone-camera" / "parinaam-app-2.jpeg"
        if not fixture.exists():
            self.skipTest("phone photo fixture not present")
        with open(fixture, "rb") as handle:
            data = handle.read()
        result = analyze_image_bytes(data, GEOMETRY, demo_mode=True)
        self.assertEqual(result["status"], "PASS")
        self.assertIn("wells", result)
        self.assertEqual(len(result["wells"]), 3)
        for idx, well in enumerate(result["wells"], 1):
            self.assertEqual(well["well_index"], idx)
            self.assertEqual(len(well["center_px"]), 2)
            self.assertGreater(well["radius_px"], 0)
            self.assertIn("raw_color", well)
            self.assertIn("normalized_color", well)
            self.assertIn("L", well["normalized_color"]["lab"])
        # Quality diagnostics must contain well and mixed lighting metrics
        diag = result["quality"]["diagnostics"]
        self.assertEqual(diag["detected_wells_count"], 3)
        self.assertLessEqual(diag["mixed_lighting_delta"], 0.15)
        self.assertIn("card_mean_luminance", diag)
        self.assertIn("well_region_luminance", diag)

    def test_mixed_lighting_quality_gate_triggers(self) -> None:
        from analyzer import _check_mixed_lighting, MIXED_LIGHTING_DELTA_MAX
        import numpy as np

        # Linear luminance of sRGB 200:
        val_srgb = 200.0 / 255.0
        val_lin = ((val_srgb + 0.055) / 1.055) ** 2.4

        # Card samples matching sRGB 200
        card_samples = [
            {"mean_linear_rgb": [val_lin, val_lin, val_lin], "mean_bgr": [200, 200, 200]}
            for _ in range(16)
        ]
        # Dark well image (sRGB 30) -> should exceed delta
        dark_img = np.full((1200, 1600, 3), 30, dtype=np.uint8)
        wells = [(1300, 500, 70), (1300, 650, 70), (1300, 800, 70)]

        card_lum, well_lum, delta, exceeded = _check_mixed_lighting(
            card_samples, dark_img, wells, threshold_max=MIXED_LIGHTING_DELTA_MAX
        )
        self.assertTrue(exceeded)
        self.assertGreater(delta, MIXED_LIGHTING_DELTA_MAX)

        # Uniform lighting (sRGB 200) -> should pass
        uniform_img = np.full((1200, 1600, 3), 200, dtype=np.uint8)
        card_lum_u, well_lum_u, delta_u, exceeded_u = _check_mixed_lighting(
            card_samples, uniform_img, wells, threshold_max=MIXED_LIGHTING_DELTA_MAX
        )
        self.assertFalse(exceeded_u)
        self.assertLessEqual(delta_u, MIXED_LIGHTING_DELTA_MAX)


if __name__ == "__main__":
    unittest.main()

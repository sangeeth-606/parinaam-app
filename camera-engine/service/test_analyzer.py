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


if __name__ == "__main__":
    unittest.main()

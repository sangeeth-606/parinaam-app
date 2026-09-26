"""HTTP contract tests for the self-hosted image adapter."""

from __future__ import annotations

import io
import unittest

from PIL import Image

from app import app, MAX_IMAGE_BYTES


class HttpContractTests(unittest.TestCase):
    def setUp(self) -> None:
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_liveness_and_readiness_expose_pending_profile_truthfully(self) -> None:
        live = self.client.get("/livez")
        self.assertEqual(live.status_code, 200)
        ready = self.client.get("/readyz")
        self.assertEqual(ready.status_code, 200)
        self.assertEqual(ready.get_json()["profile"]["status"], "PENDING_VALIDATION")
        self.assertFalse(ready.get_json()["profile"]["classification_capable"])

    def test_multipart_requires_exactly_one_image(self) -> None:
        response = self.client.post(
            "/v1/analyze",
            data={"image": [(io.BytesIO(b"one"), "one.jpg"), (io.BytesIO(b"two"), "two.jpg")]},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "EXPECTED_ONE_IMAGE")

    def test_wrong_magic_bytes_are_415(self) -> None:
        response = self.client.post(
            "/v1/analyze",
            data=b"not-an-image",
            content_type="image/jpeg",
        )
        self.assertEqual(response.status_code, 415)
        self.assertEqual(response.get_json()["error"], "UNSUPPORTED_IMAGE_FORMAT")

    def test_valid_but_unreadable_card_image_is_a_structured_result(self) -> None:
        output = io.BytesIO()
        Image.new("RGB", (64, 64), (255, 255, 255)).save(output, format="PNG")
        response = self.client.post(
            "/v1/analyze",
            data=output.getvalue(),
            content_type="image/png",
        )
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["schema_version"], "parinaam-camera-engine-v1")
        self.assertEqual(body["status"], "FAIL")
        self.assertEqual(body["classification"]["outcome"], "INCONCLUSIVE")
        self.assertIn("bytes", body["image"])

    def test_oversized_request_is_413(self) -> None:
        # Derived from the module limit so raising the cap cannot silently turn
        # this contract test into a different (format) assertion.
        response = self.client.post(
            "/v1/analyze",
            data=b"x" * (MAX_IMAGE_BYTES + 1),
            content_type="image/jpeg",
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.get_json()["error"], "IMAGE_TOO_LARGE")


if __name__ == "__main__":
    unittest.main()

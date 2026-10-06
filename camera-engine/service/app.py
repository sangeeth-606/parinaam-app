"""HTTP adapter for the Dockerized camera-engine image analyzer.

The HTTP surface is intentionally small.  It accepts one JPEG/PNG image and
returns the structured result produced by ``analyzer.analyze_image_bytes``.
There is no database, filesystem output, CORS surface, or runtime download.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

from analyzer import (
    MAX_IMAGE_BYTES,
    SCHEMA_VERSION,
    AnalysisInputError,
    analyze_image_bytes,
    readiness,
    read_geometry_hash,
)

_LOCAL_GEOMETRY = Path(__file__).resolve().parent.parent / "card_v1_geometry.yaml"
GEOMETRY_PATH = os.environ.get(
    "CAMERA_ENGINE_GEOMETRY",
    str(_LOCAL_GEOMETRY if _LOCAL_GEOMETRY.exists() else "/app/config/card_v1_geometry.yaml"),
)
DEMO_MODE = os.environ.get("CAMERA_ENGINE_DEMO_MODE", "0") == "1"
MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES


def _requested_reagent() -> str:
    return (request.form.get("reagent") or request.headers.get("X-Reagent") or "duquenois_levine").strip()


def _is_demo_mode() -> bool:
    if DEMO_MODE:
        return True
    req_demo = (request.form.get("demo") or request.headers.get("X-Demo-Mode") or "").strip().lower()
    return req_demo in ("1", "true", "yes")


def _extract_image() -> tuple[bytes, str | None]:
    """Read exactly one image part, or one raw image body."""
    if request.files:
        parts = request.files.getlist("image")
        if len(request.files) != 1 or len(parts) != 1:
            raise AnalysisInputError("EXPECTED_ONE_IMAGE")
        part = parts[0]
        return part.read(), part.content_type
    if request.mimetype == "multipart/form-data" or request.form:
        # A multipart body with no image is invalid; do not interpret a form
        # field containing a base64 string as an image.  In particular, do not
        # fall through to the raw-body path and turn this into a misleading
        # unsupported-media response.
        raise AnalysisInputError("EXPECTED_ONE_IMAGE")
    return request.get_data(cache=False), request.content_type


@app.errorhandler(413)
def too_large(_error: Any):
    return jsonify({"error": "IMAGE_TOO_LARGE", "max_bytes": MAX_IMAGE_BYTES}), 413


@app.get("/livez")
def livez():
    return jsonify({"ok": True, "schema_version": SCHEMA_VERSION})


@app.get("/health")
@app.get("/readyz")
def health():
    state = readiness(GEOMETRY_PATH, demo_mode=DEMO_MODE)
    if not state["ok"]:
        return jsonify(state), 503
    # Include the asset digest so a deployment can prove which card geometry it
    # baked.  Readiness is about processing assets, not scientific validation.
    state["geometry_sha256"] = read_geometry_hash(GEOMETRY_PATH)
    state["max_image_bytes"] = MAX_IMAGE_BYTES
    state["max_image_pixels"] = 20_000_000
    return jsonify(state)


@app.post("/v1/analyze")
def analyze():
    try:
        image, _content_type = _extract_image()
        result = analyze_image_bytes(
            image,
            GEOMETRY_PATH,
            requested_reagent=_requested_reagent(),
            demo_mode=_is_demo_mode(),
        )
    except AnalysisInputError as exc:
        status = 400
        code = str(exc)
        if code == "UNSUPPORTED_IMAGE_FORMAT":
            status = 415
        elif code == "IMAGE_TOO_LARGE":
            status = 413
        return jsonify({"error": code}), status
    except RequestEntityTooLarge:
        # Werkzeug raises this lazily while the multipart body is parsed, which
        # happens inside _extract_image(). It must be reported as "too large",
        # never as a generic processing failure.
        return jsonify({"error": "IMAGE_TOO_LARGE", "max_bytes": MAX_IMAGE_BYTES}), 413
    except Exception:
        # Do not expose stack traces or image data to a mobile client.
        app.logger.exception("camera-engine analysis failed")
        return jsonify({"error": "ENGINE_PROCESSING_ERROR"}), 500
    return jsonify(result), 200


if __name__ == "__main__":  # pragma: no cover - used only for local debugging
    app.run(host="0.0.0.0", port=int(os.environ.get("ENGINE_PORT", "8572")), threaded=False)

"""CLI adapter for the canonical camera-engine image analyzer.

The original verifier was a print-only side-effecting script.  Keep its
historical positional invocation, but make it a thin caller of the structured
image module so the CLI and Docker adapter cannot drift.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_DIR = SCRIPT_DIR.parent.parent / "service"
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from analyzer import SCHEMA_VERSION, analyze_image_bytes  # noqa: E402


def test_image(
    image_path: str,
    yaml_path: str,
    *,
    demo_mode: bool = False,
    requested_reagent: str = "duquenois_levine",
) -> dict[str, Any]:
    """Return the same structured result exposed by the Docker endpoint."""
    with open(image_path, "rb") as handle:
        image = handle.read()
    return analyze_image_bytes(
        image,
        yaml_path,
        requested_reagent=requested_reagent,
        demo_mode=demo_mode,
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analyze a Parinaam reference-card photo")
    parser.add_argument("image_path", help="JPEG/PNG card photo")
    parser.add_argument(
        "geometry_path",
        nargs="?",
        default=str(SCRIPT_DIR.parent.parent / "card_v1_geometry.yaml"),
        help="canonical card geometry/profile YAML",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="print one machine-readable JSON result (default: human summary)",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="allow the explicitly unvalidated mock profile classification",
    )
    parser.add_argument("--reagent", default="duquenois_levine")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = test_image(
            args.image_path,
            args.geometry_path,
            demo_mode=args.demo,
            requested_reagent=args.reagent,
        )
    except (OSError, ValueError) as exc:
        print(f"[CARD VERIFIER] {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))
    else:
        profile = result["profile"]
        quality = result["quality"]
        classification = result["classification"]
        print(f"schema: {SCHEMA_VERSION}")
        print(f"image: {result['image'].get('sha256', 'unavailable')}")
        print(f"profile: {profile['kit_profile_id']} ({profile['status']}, demo={profile['demo_mode']})")
        print(f"quality: {quality['status']} {', '.join(quality['failure_codes'])}")
        if result.get("calibration"):
            print(
                "calibration: "
                f"{result['calibration']['grade']} "
                f"mean dE00={result['calibration']['fit_residual_delta_e00']}"
            )
        wells = result.get("wells", [])
        if wells:
            print(f"wells detected: {len(wells)}")
            for w in wells:
                w_lab = w.get("normalized_color", {}).get("lab", {})
                print(f"  Well {w.get('well_index')}: r={w.get('radius_px')}px, Calibrated Lab: {w_lab}")
        if result.get("normalized_color"):
            print(f"normalized Lab (Reaction Well): {result['normalized_color']['lab']}")
        print(
            f"classification: {classification['outcome']} "
            f"({classification['status']}; {classification['reason'] or 'no reason'})"
        )

    # A quality failure or an unclassified print is not a successful verifier
    # result.  The previous script returned 0 for both, which hid failures.
    return 0 if result["status"] == "PASS" and result["classification"]["outcome"] != "INCONCLUSIVE" else 2


if __name__ == "__main__":
    raise SystemExit(main())

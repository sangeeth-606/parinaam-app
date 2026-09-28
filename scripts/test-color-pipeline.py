#!/usr/bin/env python3
"""
Parinaam — Color Pipeline Test Utility
Evaluates calibration and classification on phone photos in camera-engine/photo-phone-camera.
"""

import argparse
import sys
from pathlib import Path

# Add camera-engine/service to sys.path so we can import analyzer
REPO_ROOT = Path(__file__).resolve().parent.parent
SERVICE_DIR = REPO_ROOT / "camera-engine" / "service"
sys.path.insert(0, str(SERVICE_DIR))

from analyzer import analyze_image_bytes

def evaluate_image(image_path: Path, geometry_path: Path, demo_mode: bool = True):
    data = image_path.read_bytes()
    res = analyze_image_bytes(data, str(geometry_path), demo_mode=demo_mode)
    return res

def main():
    parser = argparse.ArgumentParser(description="Test Parinaam Color Pipeline on test images")
    parser.add_argument(
        "--image",
        type=str,
        default=None,
        help="Path to a specific image file (default: runs on all photos in photo-phone-camera)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Run with demo_mode=False to verify profile validation guardrails",
    )
    args = parser.parse_args()

    demo_mode = not args.strict
    geometry_path = REPO_ROOT / "camera-engine" / "card_v1_geometry.yaml"
    photos_dir = REPO_ROOT / "camera-engine" / "photo-phone-camera"

    if not geometry_path.exists():
        print(f"[-] Geometry file not found at {geometry_path}", file=sys.stderr)
        sys.exit(1)

    if args.image:
        image_files = [Path(args.image)]
    else:
        image_files = sorted(photos_dir.glob("*.jpeg")) + sorted(photos_dir.glob("*.jpg"))

    if not image_files:
        print(f"[-] No test images found in {photos_dir}", file=sys.stderr)
        sys.exit(1)

    print("=" * 86)
    print(f"PARINAAM COLOR PIPELINE TEST (Demo Mode: {demo_mode})")
    print("=" * 86)

    for img_path in image_files:
        if not img_path.exists():
            print(f"[-] File not found: {img_path}")
            continue

        res = evaluate_image(img_path, geometry_path, demo_mode=demo_mode)
        img_info = res.get("image", {})
        qual = res.get("quality", {})
        diag = qual.get("diagnostics", {})
        calib = res.get("calibration")
        cls = res.get("classification", {})
        norm = res.get("normalized_color")

        print(f"\n[PHOTO] {img_path.name}")
        w_px = img_info.get("width_px") or diag.get("width_px")
        h_px = img_info.get("height_px") or diag.get("height_px")
        res_str = f"{w_px}x{h_px} px" if w_px and h_px else "N/A"
        print(f"  Size: {img_info.get('bytes', 0) / (1024*1024):.2f} MB | Resolution: {res_str}")
        
        # Quality gates
        qual_status = qual.get("status")
        fail_codes = qual.get("failure_codes", [])
        blur = diag.get("blur_laplacian_variance")
        markers = diag.get("detected_marker_ids", [])
        mixed_delta = diag.get("mixed_lighting_delta")
        print(f"  Quality Gate: {qual_status}" + (f" (Failures: {', '.join(fail_codes)})" if fail_codes else " (PASS)"))
        print(f"    - Laplacian Blur Variance: {blur} (Threshold: >= 100.0)")
        print(f"    - Markers Detected: {markers} / Required: [0, 1, 2, 3]")
        if mixed_delta is not None:
            mixed_gate = "PASS" if mixed_delta <= 0.15 else "FAIL (MIXED_LIGHTING)"
            print(f"    - Mixed Lighting Delta: {mixed_delta:.4f} (Threshold: <= 0.15) -> {mixed_gate}")

        # Calibration
        if calib:
            fit_de00 = calib.get("fit_residual_delta_e00")
            max_de00 = calib.get("max_fit_residual_delta_e00")
            grade = calib.get("grade")
            print(f"  Calibration: Grade = {grade}")
            print(f"    - Mean Residual: {fit_de00:.4f} dE00 (Threshold: <= 5.0 in production, <= 10.0 in demo)")
            print(f"    - Max Residual:  {max_de00:.4f} dE00")
        else:
            print(f"  Calibration: SKIPPED (Quality gate failed)")

        # Detected Wells (Hough Circle Detection)
        wells = res.get("wells", [])
        if wells:
            print(f"  Detected Wells ({len(wells)} found directly via HoughCircles):")
            for w in wells:
                w_idx = w.get("well_index")
                cx, cy = w.get("center_px", [0, 0])
                r = w.get("radius_px", 0)
                raw_l = w.get("raw_color", {}).get("lab", {})
                norm_l = w.get("normalized_color", {}).get("lab", {})
                w_cls = w.get("classification", {}).get("outcome", "N/A")
                print(f"    - Well {w_idx}: Center=({cx}, {cy}), r={r}px")
                print(f"        Raw Lab:        L*={raw_l.get('L', 0):.2f}, a*={raw_l.get('a', 0):.2f}, b*={raw_l.get('b', 0):.2f}")
                print(f"        Calibrated Lab: L*={norm_l.get('L', 0):.2f}, a*={norm_l.get('a', 0):.2f}, b*={norm_l.get('b', 0):.2f}")
                print(f"        Outcome:        {w_cls}")

        # Primary Reaction Well (Normalized Color)
        if norm and norm.get("lab"):
            lab = norm["lab"]
            print(f"  Primary Reaction Well (Well 3): L*={lab['L']:.2f}, a*={lab['a']:.2f}, b*={lab['b']:.2f}")

        # Classification
        outcome = cls.get("outcome")
        status = cls.get("status")
        reason = cls.get("reason")
        best_de = cls.get("best_delta_e00")
        margin = cls.get("margin_delta_e00")
        print(f"  Final Classification: [{outcome}] (Status: {status})")
        if reason:
            print(f"    - Abstention Reason: {reason}")
        if best_de is not None:
            print(f"    - Best Match Distance: {best_de:.4f} dE00")
        if margin is not None:
            print(f"    - Ambiguity Margin: {margin:.4f} dE00")

    print("\n" + "=" * 86)
    print("Test run completed.")
    print("=" * 86)

if __name__ == "__main__":
    main()

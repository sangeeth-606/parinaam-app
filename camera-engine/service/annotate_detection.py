#!/usr/bin/env python3
"""
Generate a comprehensive visual annotation of the camera engine's detection:
- Card boundary & ArUco markers
- 16 reference card patches
- Non-card region & Hough circle well detection (3 wells)
- Inner core sampling radius (0.4r)
- Per-well raw Lab and calibrated Lab values
- Mixed lighting region and delta
"""

import sys
from pathlib import Path
import cv2
import numpy as np

# Ensure camera-engine/service is in sys.path
SERVICE_DIR = Path(__file__).resolve().parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

import analyzer


def annotate_image(image_path: Path, geometry_path: Path, output_path: Path):
    data = image_path.read_bytes()
    geometry = analyzer._load_geometry(geometry_path)
    res = analyzer.analyze_image_bytes(data, str(geometry_path), demo_mode=True)

    image_bgr, width, height = analyzer._decode_image(data)
    annotated = image_bgr.copy()

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    found_markers, _ = analyzer._detect_markers(gray)
    homography, _ = analyzer._fit_homography(image_bgr, geometry["fiducial_layout"], found_markers)

    # 1. Draw Card Polygon & Markers
    if homography is not None:
        w_mm = analyzer._float(geometry["card_width_mm"])
        h_mm = analyzer._float(geometry["card_height_mm"])
        corners_mm = np.asarray([[[0, 0], [w_mm, 0], [w_mm, h_mm], [0, h_mm]]], dtype=np.float32)
        card_poly = cv2.perspectiveTransform(corners_mm, homography).astype(np.int32)
        cv2.polylines(annotated, card_poly, isClosed=True, color=(0, 230, 0), thickness=3)
        cv2.putText(
            annotated, "REFERENCE CARD", (card_poly[0][0][0] + 10, card_poly[0][0][1] + 30),
            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 230, 0), 2, cv2.LINE_AA
        )

        # Draw ArUco markers
        for m_id, corners in found_markers.items():
            pts = corners.astype(np.int32)
            cv2.polylines(annotated, [pts], isClosed=True, color=(0, 140, 255), thickness=2)
            cx, cy = int(pts[:, 0].mean()), int(pts[:, 1].mean())
            cv2.circle(annotated, (cx, cy), 4, (0, 140, 255), -1)
            cv2.putText(annotated, f"M{m_id}", (cx - 15, cy - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 140, 255), 2)

        # Draw 16 Card Patches
        for patch in geometry["patch_layout"]:
            try:
                rect = patch["design_rect"]
                inner_rect = {
                    "x_mm": analyzer._float(rect["x_mm"]) + analyzer._float(rect["width_mm"]) * 0.25,
                    "y_mm": analyzer._float(rect["y_mm"]) + analyzer._float(rect["height_mm"]) * 0.25,
                    "width_mm": analyzer._float(rect["width_mm"]) * 0.50,
                    "height_mm": analyzer._float(rect["height_mm"]) * 0.50,
                }
                poly = analyzer._transform_roi(homography, inner_rect, image_bgr.shape).astype(np.int32)
                cv2.polylines(annotated, [poly], isClosed=True, color=(255, 200, 0), thickness=1)
                px = int(poly[:, 0].min())
                py = int(poly[:, 1].min())
                cv2.putText(annotated, patch["patch_id"], (px, py - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 220, 50), 1)
            except Exception:
                pass

    # 2. Draw Detected Wells
    wells = res.get("wells", [])
    if wells:
        # Draw Cassette Mixed Lighting Region (bounding box of wells)
        min_x = min(w["center_px"][0] - w["radius_px"] for w in wells)
        max_x = max(w["center_px"][0] + w["radius_px"] for w in wells)
        min_y = min(w["center_px"][1] - w["radius_px"] for w in wells)
        max_y = max(w["center_px"][1] + w["radius_px"] for w in wells)
        margin = int(np.mean([w["radius_px"] for w in wells]) * 0.5)
        bx1, bx2 = max(0, min_x - margin), min(width, max_x + margin)
        by1, by2 = max(0, min_y - margin), min(height, max_y + margin)
        cv2.rectangle(annotated, (bx1, by1), (bx2, by2), (255, 100, 0), 2, cv2.LINE_AA)
        cv2.putText(
            annotated, "CASSETTE ROI (Lighting Check)", (bx1, by1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 150, 50), 2, cv2.LINE_AA
        )

        for w in wells:
            cx, cy = w["center_px"]
            r = w["radius_px"]
            sample_r = max(5, int(r * 0.40))
            idx = w["well_index"]
            raw_lab = w["raw_color"]["lab"]
            cal_lab = w["normalized_color"]["lab"]

            # Outer detected circle
            cv2.circle(annotated, (cx, cy), r, (0, 255, 255), 3, cv2.LINE_AA)
            # Inner sampled circle
            cv2.circle(annotated, (cx, cy), sample_r, (0, 0, 255), 2, cv2.LINE_AA)
            # Center point
            cv2.circle(annotated, (cx, cy), 4, (0, 0, 255), -1)

            # Annotation Callout Box to the right or left of the well
            box_x = cx + r + 25 if cx + r + 280 < width else cx - r - 290
            box_y = cy - 35
            box_w = 280
            box_h = 75

            # Semi-transparent overlay for text box
            sub_roi = annotated[max(0, box_y):min(height, box_y + box_h), max(0, box_x):min(width, box_x + box_w)]
            overlay = sub_roi.copy()
            overlay[:] = (20, 20, 20)
            cv2.addWeighted(overlay, 0.75, sub_roi, 0.25, 0, sub_roi)
            cv2.rectangle(annotated, (box_x, box_y), (box_x + box_w, box_y + box_h), (0, 255, 255), 1)

            well_name = f"Well {idx} (Reaction)" if idx == 3 else f"Well {idx}"
            cv2.putText(annotated, f"{well_name} [r={r}px, sample={sample_r}px]", (box_x + 8, box_y + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(annotated, f"Raw:   L*={raw_lab['L']:.1f}, a*={raw_lab['a']:.1f}, b*={raw_lab['b']:.1f}", (box_x + 8, box_y + 38), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1, cv2.LINE_AA)
            cv2.putText(annotated, f"Calib: L*={cal_lab['L']:.1f}, a*={cal_lab['a']:.1f}, b*={cal_lab['b']:.1f}", (box_x + 8, box_y + 58), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (50, 255, 50), 1, cv2.LINE_AA)

            # Connecting line from well center to label box
            cv2.line(annotated, (cx + r, cy), (box_x, cy), (0, 255, 255), 1, cv2.LINE_AA)

    # 3. Top Banner Header (Diagnostic summary)
    header_h = 95
    header_roi = annotated[0:header_h, 0:width]
    header_overlay = header_roi.copy()
    header_overlay[:] = (15, 15, 15)
    cv2.addWeighted(header_overlay, 0.85, header_roi, 0.15, 0, header_roi)
    cv2.line(annotated, (0, header_h), (width, header_h), (0, 200, 200), 2)

    calib = res.get("calibration", {}) or {}
    diag = res.get("quality", {}).get("diagnostics", {})
    cls = res.get("classification", {})
    mixed_delta = diag.get("mixed_lighting_delta", 0.0)

    cv2.putText(annotated, f"PARINAAM COLOR ENGINE - DERIVED OUTPUT ({image_path.name})", (20, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(annotated, f"Card Fit: mean dE00 = {calib.get('fit_residual_delta_e00', 'N/A')} (Grade: {calib.get('grade', 'N/A')}) | Mixed Lighting Delta: {mixed_delta:.4f} (<= 0.15 PASS)", (20, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (220, 220, 220), 1, cv2.LINE_AA)

    norm = res.get("normalized_color", {}) or {}
    norm_lab = norm.get("lab", {})
    reaction_str = f"Reaction Well (Well 3) Calibrated Lab: L*={norm_lab.get('L', 0):.2f}, a*={norm_lab.get('a', 0):.2f}, b*={norm_lab.get('b', 0):.2f}"
    cls_str = f"Outcome: {cls.get('outcome')} ({cls.get('reason') or 'MATCH'})"
    cv2.putText(annotated, f"{reaction_str} | {cls_str}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (50, 255, 120), 1, cv2.LINE_AA)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), annotated, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"[SUCCESS] Saved derived annotated image to: {output_path}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Annotate camera engine detection on phone photos")
    parser.add_argument("--image", type=str, default=None, help="Specific photo to annotate")
    parser.add_argument("--all", action="store_true", help="Annotate all photos in photo-phone-camera")
    args = parser.parse_args()

    photos_dir = SERVICE_DIR.parent / "photo-phone-camera"
    geom_path = SERVICE_DIR.parent / "card_v1_geometry.yaml"

    if args.all:
        targets = [p for p in sorted(photos_dir.glob("parinaam-app-*.jpeg")) if not p.name.startswith("derived_")]
    elif args.image:
        targets = [Path(args.image)]
    else:
        targets = [photos_dir / "parinaam-app-2.jpeg"]

    for target_img in targets:
        if not target_img.exists():
            continue
        out_img = photos_dir / f"derived_output_{target_img.stem}.jpg"
        annotate_image(target_img, geom_path, out_img)

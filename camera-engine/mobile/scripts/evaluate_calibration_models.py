import sys, os
sys.path.insert(0, os.path.abspath('.'))
"""
evaluate_calibration_models.py
Rigorous validation of color calibration models on real phone photo data.
Compares:
  1. 6-term Root-Polynomial (Finlayson 2015 deg-2) - OLS in XYZ
  2. 13-term Root-Polynomial (Finlayson 2015 deg-3) - OLS in XYZ
  3. 6-term Weighted Least Squares (WLS in XYZ, weighted by Lab Jacobian dL/dY)
  4. 6-term Direct Perceptual Lab Optimization (Non-linear least squares in Lab)
  5. 13-term Regularized Ridge Regression

Validation:
  - Full Training Set Fit (16 patches)
  - 4-Fold Stratified Leave-4-Out Cross Validation (held-out test generalization error)
  - Leave-One-Out (16-fold LOOCV) Cross Validation
"""

import sys
import os
import yaml
import numpy as np
import cv2
from scipy.optimize import least_squares
from mobile.scripts.verify_card_photo import (
    srgb_to_linear, lab_to_xyz_d50, xyz_to_lab_d50,
    expand_root_poly2, ciede2000
)

def de76(lab1, lab2):
    return float(np.linalg.norm(lab1 - lab2))

def expand_root_poly3(r, g, b):
    r, g, b = max(0.0, float(r)), max(0.0, float(g)), max(0.0, float(b))
    e2 = [r, g, b, np.sqrt(r * g), np.sqrt(r * b), np.sqrt(g * b)]
    e3 = [
        np.cbrt(r**2 * g), np.cbrt(r**2 * b),
        np.cbrt(g**2 * r), np.cbrt(g**2 * b),
        np.cbrt(b**2 * r), np.cbrt(b**2 * g),
        np.cbrt(r * g * b)
    ]
    return np.array(e2 + e3)

# 1. Load geometry and image
yaml_path = "card_v1_geometry.yaml"
with open(yaml_path, "r", encoding="utf-8") as f:
    geo = yaml.safe_load(f)

img_path = "photo-phone-camera/IMG_20260914_234901.jpg.jpeg"
img = cv2.imread(img_path)
h_img, w_img = img.shape[:2]
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
aruco_params = cv2.aruco.DetectorParameters()
detector = cv2.aruco.ArucoDetector(aruco_dict, aruco_params)
corners, ids, rejected = detector.detectMarkers(gray)
detected_ids = [int(x) for x in ids.flatten()]

fid_map = {f["id"]: f for f in geo["fiducial_layout"]}
src_points, dst_points = [], []
for i, m_id in enumerate(detected_ids):
    if m_id in fid_map:
        c = corners[i][0]
        f_info = fid_map[m_id]
        x_mm, y_mm, s_mm = float(f_info["x_mm"]), float(f_info["y_mm"]), float(f_info["size_mm"])
        for c_idx, mm in enumerate([[x_mm, y_mm], [x_mm + s_mm, y_mm], [x_mm + s_mm, y_mm + s_mm], [x_mm, y_mm + s_mm]]):
            src_points.append(mm)
            dst_points.append(c[c_idx])

H, _ = cv2.findHomography(np.array(src_points, dtype=np.float32), np.array(dst_points, dtype=np.float32), cv2.RANSAC, 3.0)

# Sample 16 patches
erosion_frac = 0.25
trim_frac = 0.10
glare_threshold = 250

sampled_rgbs = []
ref_xyz_list = []
ref_lab_list = []

for patch in geo["patch_layout"]:
    rect = patch["design_rect"]
    px_mm, py_mm, pw_mm, ph_mm = float(rect["x_mm"]), float(rect["y_mm"]), float(rect["width_mm"]), float(rect["height_mm"])
    ex, ey = pw_mm * erosion_frac, ph_mm * erosion_frac
    in_x, in_y, in_w, in_h = px_mm + ex, py_mm + ey, pw_mm - 2*ex, ph_mm - 2*ey
    mm_c = np.array([[in_x, in_y], [in_x + in_w, in_y], [in_x + in_w, in_y + in_h], [in_x, in_y + in_h]], dtype=np.float32).reshape(-1, 1, 2)
    px_c = cv2.perspectiveTransform(mm_c, H).reshape(-1, 2)
    min_x, max_x = max(0, int(np.min(px_c[:, 0]))), min(w_img, int(np.max(px_c[:, 0])))
    min_y, max_y = max(0, int(np.min(px_c[:, 1]))), min(h_img, int(np.max(px_c[:, 1])))
    roi = img[min_y:max_y, min_x:max_x].reshape(-1, 3)
    valid = roi[~np.any(roi >= glare_threshold, axis=1)]
    lin = srgb_to_linear(valid[:, [2, 1, 0]] / 255.0)
    lums = 0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]
    sort_idx = np.argsort(lums)
    n = len(sort_idx)
    tn = int(n * trim_frac)
    trimmed = sort_idx[tn:n-tn] if n > 2*tn else sort_idx
    mean_rgb = np.mean(lin[trimmed], axis=0)

    ref_lab = np.array([patch["reference_lab"]["L"], patch["reference_lab"]["a"], patch["reference_lab"]["b"]])
    ref_xyz = lab_to_xyz_d50(ref_lab)
    sampled_rgbs.append(mean_rgb)
    ref_xyz_list.append(ref_xyz)
    ref_lab_list.append(ref_lab)

sampled_rgbs = np.array(sampled_rgbs)
ref_xyz = np.array(ref_xyz_list)
ref_lab = np.array(ref_lab_list)

Phi6_all = np.array([expand_root_poly2(rgb[0], rgb[1], rgb[2]) for rgb in sampled_rgbs])
Phi13_all = np.array([expand_root_poly3(rgb[0], rgb[1], rgb[2]) for rgb in sampled_rgbs])

# --- MODEL DEFINITIONS ---

def fit_ols(Phi, Y):
    return np.linalg.lstsq(Phi, Y, rcond=None)[0]

def fit_wls(Phi, Y, ref_Y_lums):
    # Weight inversely to Y^(1/3) to match Lab cube-root Jacobian
    weights = 1.0 / np.cbrt(np.clip(ref_Y_lums, 0.01, 1.0))
    W = np.diag(weights)
    return np.linalg.lstsq(W @ Phi, W @ Y, rcond=None)[0]

def fit_direct_lab(Phi, ref_labs):
    # Initialize with OLS in XYZ
    # Convert ref_labs to XYZ
    ref_xyz_arr = np.array([lab_to_xyz_d50(l) for l in ref_labs])
    M_init = fit_ols(Phi, ref_xyz_arr)

    def residuals(params):
        M = params.reshape(Phi.shape[1], 3)
        pred_xyz = Phi @ M
        res = []
        for i in range(len(Phi)):
            pred_l = xyz_to_lab_d50(pred_xyz[i])
            diff = pred_l - ref_labs[i]
            res.extend(diff)
        return np.array(res)

    res = least_squares(residuals, M_init.flatten(), method='lm', max_nfev=500)
    return res.x.reshape(Phi.shape[1], 3)

def fit_ridge(Phi, Y, alpha=0.01):
    I = np.eye(Phi.shape[1])
    return np.linalg.inv(Phi.T @ Phi + alpha * I) @ Phi.T @ Y

# -------------------------------------------------------------
# EXPERIMENT 1: Full-Set Training Fit (16 patches)
# -------------------------------------------------------------
print("=========================================================================================")
print("EXPERIMENT 1: Training-Set Fit (16 patches, no held-out validation)")
print("=========================================================================================")

models = {
    "1. 6-Term OLS (Current)": lambda tr_P6, tr_P13, tr_xyz, tr_lab: fit_ols(tr_P6, tr_xyz),
    "2. 13-Term OLS (Deg-3)": lambda tr_P6, tr_P13, tr_xyz, tr_lab: fit_ols(tr_P13, tr_xyz),
    "3. 6-Term WLS (Inverse Lum)": lambda tr_P6, tr_P13, tr_xyz, tr_lab: fit_wls(tr_P6, tr_xyz, tr_xyz[:, 1]),
    "4. 6-Term Direct Lab Opt": lambda tr_P6, tr_P13, tr_xyz, tr_lab: fit_direct_lab(tr_P6, tr_lab),
    "5. 13-Term Ridge (alpha=0.01)": lambda tr_P6, tr_P13, tr_xyz, tr_lab: fit_ridge(tr_P13, tr_xyz, alpha=0.01)
}

for name, fit_fn in models.items():
    is_13 = "13" in name
    Phi = Phi13_all if is_13 else Phi6_all
    M = fit_fn(Phi6_all, Phi13_all, ref_xyz, ref_lab)
    pred_xyz = Phi @ M
    d76s, d00s = [], []
    for i in range(16):
        pred_l = xyz_to_lab_d50(pred_xyz[i])
        d76s.append(de76(pred_l, ref_lab[i]))
        d00s.append(ciede2000(pred_l, ref_lab[i]))
    print(f"{name:<30}: Mean dE76 = {np.mean(d76s):5.2f} | Mean dE00 = {np.mean(d00s):5.2f} | Max dE76 = {np.max(d76s):5.2f}")

# -------------------------------------------------------------
# EXPERIMENT 2: 4-Fold Stratified Cross-Validation (Leave-4-Out)
# -------------------------------------------------------------
print("\n=========================================================================================")
print("EXPERIMENT 2: 4-Fold Stratified Cross-Validation (HELD-OUT ERROR ON 4 UNSEEN PATCHES)")
print("=========================================================================================")
# Folds: hold out 1 patch per column (P01..P04, P05..P08, etc.)
# Fold 0: [0, 4, 8, 12]  (P01, P05, P09, P13)
# Fold 1: [1, 5, 9, 13]  (P02, P06, P10, P14)
# Fold 2: [2, 6, 10, 14] (P03, P07, P11, P15)
# Fold 3: [3, 7, 11, 15] (P04, P08, P12, P16)
folds = [
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
    [3, 7, 11, 15]
]

for name, fit_fn in models.items():
    is_13 = "13" in name
    Phi_all = Phi13_all if is_13 else Phi6_all

    all_heldout_d76 = []
    all_heldout_d00 = []
    per_patch_d76 = [0.0]*16
    per_patch_d00 = [0.0]*16

    for fold_idx, test_idx in enumerate(folds):
        train_idx = [i for i in range(16) if i not in test_idx]

        tr_P6 = Phi6_all[train_idx]
        tr_P13 = Phi13_all[train_idx]
        tr_xyz = ref_xyz[train_idx]
        tr_lab = ref_lab[train_idx]

        te_Phi = Phi_all[test_idx]
        te_lab = ref_lab[test_idx]

        M = fit_fn(tr_P6, tr_P13, tr_xyz, tr_lab)
        pred_xyz = te_Phi @ M

        for k, p_idx in enumerate(test_idx):
            pred_l = xyz_to_lab_d50(pred_xyz[k])
            err_76 = de76(pred_l, te_lab[k])
            err_00 = ciede2000(pred_l, te_lab[k])
            all_heldout_d76.append(err_76)
            all_heldout_d00.append(err_00)
            per_patch_d76[p_idx] = err_76
            per_patch_d00[p_idx] = err_00

    print(f"{name:<30}: HELD-OUT Mean dE76 = {np.mean(all_heldout_d76):5.2f} | HELD-OUT Mean dE00 = {np.mean(all_heldout_d00):5.2f} | HELD-OUT Max dE76 = {np.max(all_heldout_d76):5.2f}")
    if name == "1. 6-Term OLS (Current)" or name == "2. 13-Term OLS (Deg-3)" or name == "4. 6-Term Direct Lab Opt":
        p_str = ", ".join([f"P{i+1:02d}:{per_patch_d76[i]:.1f}" for i in [3, 4, 5, 13, 14]])
        print(f"   Held-out dE76 for problem patches [{p_str}]")

# -------------------------------------------------------------
# EXPERIMENT 3: Leave-One-Out Cross-Validation (LOOCV)
# -------------------------------------------------------------
print("\n=========================================================================================")
print("EXPERIMENT 3: Leave-One-Out Cross-Validation (16 Folds - 15 Train, 1 Test)")
print("=========================================================================================")

for name, fit_fn in models.items():
    is_13 = "13" in name
    Phi_all = Phi13_all if is_13 else Phi6_all

    loocv_d76 = []
    loocv_d00 = []

    for test_idx in range(16):
        train_idx = [i for i in range(16) if i != test_idx]

        tr_P6 = Phi6_all[train_idx]
        tr_P13 = Phi13_all[train_idx]
        tr_xyz = ref_xyz[train_idx]
        tr_lab = ref_lab[train_idx]

        te_Phi = Phi_all[test_idx:test_idx+1]
        te_lab = ref_lab[test_idx]

        M = fit_fn(tr_P6, tr_P13, tr_xyz, tr_lab)
        pred_xyz = te_Phi @ M
        pred_l = xyz_to_lab_d50(pred_xyz[0])

        loocv_d76.append(de76(pred_l, te_lab))
        loocv_d00.append(ciede2000(pred_l, te_lab))

    print(f"{name:<30}: LOOCV Mean dE76 = {np.mean(loocv_d76):5.2f} | LOOCV Mean dE00 = {np.mean(loocv_d00):5.2f} | LOOCV Max dE76 = {np.max(loocv_d76):5.2f}")

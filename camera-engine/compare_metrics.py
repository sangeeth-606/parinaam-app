import cv2
import numpy as np
import yaml
from mobile.scripts.verify_card_photo import *

with open('card_v1_geometry.yaml', 'r', encoding='utf-8') as f:
    geo = yaml.safe_load(f)

img = cv2.imread('photo-phone-camera/IMG_20260914_234901.jpg.jpeg')
h_img, w_img = img.shape[:2]
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
aruco_params = cv2.aruco.DetectorParameters()
detector = cv2.aruco.ArucoDetector(aruco_dict, aruco_params)
corners, ids, rejected = detector.detectMarkers(gray)
detected_ids = [int(x) for x in ids.flatten()]

fid_map = {f['id']: f for f in geo['fiducial_layout']}
src_points = []
dst_points = []
for i, m_id in enumerate(detected_ids):
    if m_id in fid_map:
        c = corners[i][0]
        f_info = fid_map[m_id]
        x_mm, y_mm, s_mm = float(f_info['x_mm']), float(f_info['y_mm']), float(f_info['size_mm'])
        for c_idx, mm in enumerate([[x_mm, y_mm], [x_mm + s_mm, y_mm], [x_mm + s_mm, y_mm + s_mm], [x_mm, y_mm + s_mm]]):
            src_points.append(mm)
            dst_points.append(c[c_idx])

H, _ = cv2.findHomography(np.array(src_points, dtype=np.float32), np.array(dst_points, dtype=np.float32), cv2.RANSAC, 3.0)

erosion_frac = 0.25
trim_frac = 0.10
glare_threshold = 250

sampled_rgbs = []
ref_xyz_list = []
ref_lab_list = []

for patch in geo['patch_layout']:
    rect = patch['design_rect']
    px_mm, py_mm, pw_mm, ph_mm = float(rect['x_mm']), float(rect['y_mm']), float(rect['width_mm']), float(rect['height_mm'])
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
    
    ref_lab = np.array([patch['reference_lab']['L'], patch['reference_lab']['a'], patch['reference_lab']['b']])
    ref_xyz = lab_to_xyz_d50(ref_lab)
    sampled_rgbs.append(mean_rgb)
    ref_xyz_list.append(ref_xyz)
    ref_lab_list.append(ref_lab)

Phi = np.array([expand_root_poly2(rgb[0], rgb[1], rgb[2]) for rgb in sampled_rgbs])
Y = np.array(ref_xyz_list)
M_calib, _, _, _ = np.linalg.lstsq(Phi, Y, rcond=None)

def de76(l1, l2):
    return float(np.linalg.norm(l1 - l2))

print(f"{'ID':<5} | {'Raw Lab':<20} | {'Calib Lab':<20} | {'Ref Lab':<20} | {'Raw dE76':<8} | {'Cal dE76':<8} | {'Raw dE00':<8} | {'Cal dE00':<8}")
print("-" * 115)

raw_dE76_all, cal_dE76_all = [], []
raw_dE00_all, cal_dE00_all = [], []

for i, p in enumerate(geo['patch_layout']):
    p_id = p['patch_id']
    rgb = sampled_rgbs[i]
    ref_lab = ref_lab_list[i]
    
    raw_xyz = np.dot(np.array([[0.4124, 0.3576, 0.1805],[0.2126, 0.7152, 0.0722],[0.0193, 0.1192, 0.9505]]), rgb)
    raw_lab = xyz_to_lab_d50(raw_xyz)
    
    cal_xyz = np.dot(Phi[i], M_calib)
    cal_lab = xyz_to_lab_d50(cal_xyz)
    
    r_76 = de76(raw_lab, ref_lab)
    c_76 = de76(cal_lab, ref_lab)
    r_00 = ciede2000(raw_lab, ref_lab)
    c_00 = ciede2000(cal_lab, ref_lab)
    
    raw_dE76_all.append(r_76); cal_dE76_all.append(c_76)
    raw_dE00_all.append(r_00); cal_dE00_all.append(c_00)
    
    raw_s = f"({raw_lab[0]:.1f}, {raw_lab[1]:.1f}, {raw_lab[2]:.1f})"
    cal_s = f"({cal_lab[0]:.1f}, {cal_lab[1]:.1f}, {cal_lab[2]:.1f})"
    ref_s = f"({ref_lab[0]:.1f}, {ref_lab[1]:.1f}, {ref_lab[2]:.1f})"
    print(f"{p_id:<5} | {raw_s:<20} | {cal_s:<20} | {ref_s:<20} | {r_76:<8.2f} | {c_76:<8.2f} | {r_00:<8.2f} | {c_00:<8.2f}")

print("-" * 115)
print(f"{'MEAN':<5} | {'':<20} | {'':<20} | {'':<20} | {np.mean(raw_dE76_all):<8.2f} | {np.mean(cal_dE76_all):<8.2f} | {np.mean(raw_dE00_all):<8.2f} | {np.mean(cal_dE00_all):<8.2f}")
worst_idx = np.argmax(cal_dE76_all)
print(f"Worst calibrated dE76: {geo['patch_layout'][worst_idx]['patch_id']} = {cal_dE76_all[worst_idx]:.2f}")
import cv2
import numpy as np
import yaml
import os

with open("card_v1_geometry.yaml", "r", encoding="utf-8") as f:
    geo = yaml.safe_load(f)

scale = 10 # 10 px per mm
w = int(geo["card_width_mm"] * scale) # 1000
h = int(geo["card_height_mm"] * scale) # 800

# White card canvas
card = np.ones((h, w, 3), dtype=np.uint8) * 255

aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)

# 1. Draw ArUco markers
for f in geo["fiducial_layout"]:
    m_id = f["id"]
    x = int(f["x_mm"] * scale)
    y = int(f["y_mm"] * scale)
    s = int(f["size_mm"] * scale)
    marker_img = cv2.aruco.generateImageMarker(aruco_dict, m_id, s)
    marker_bgr = cv2.cvtColor(marker_img, cv2.COLOR_GRAY2BGR)
    card[y:y+s, x:x+s] = marker_bgr

# 2. Draw 16 Patches
for p in geo["patch_layout"]:
    r = p["design_rect"]
    x = int(r["x_mm"] * scale)
    y = int(r["y_mm"] * scale)
    pw = int(r["width_mm"] * scale)
    ph = int(r["height_mm"] * scale)
    hex_c = p["print_target_hex"].lstrip("#")
    r8, g8, b8 = int(hex_c[0:2], 16), int(hex_c[2:4], 16), int(hex_c[4:6], 16)
    # BGR
    card[y:y+ph, x:x+pw] = (b8, g8, r8)

# 3. Draw Data Matrix placeholder
dm = geo.get("data_matrix", {"x_mm": 30, "y_mm": 64, "size_mm": 8})
dm_x, dm_y, dm_s = int(dm["x_mm"]*scale), int(dm["y_mm"]*scale), int(dm["size_mm"]*scale)
cv2.rectangle(card, (dm_x, dm_y), (dm_x+dm_s, dm_y+dm_s), (0, 0, 0), -1)

# Save clean rendered card
cv2.imwrite("card_v1_clean_render.png", card)
print("Saved card_v1_clean_render.png (1000x800)")

# 4. Create a simulated phone photo on a wooden table with perspective tilt
photo_h, photo_w = 1440, 1920
# Background: warm wooden desk tone
table = np.zeros((photo_h, photo_w, 3), dtype=np.uint8)
table[:, :] = (80, 110, 160)

# Perspective quad for card placed on desk viewed from angle
src_quad = np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.float32)
dst_quad = np.array([[420, 320], [1480, 260], [1560, 1120], [350, 1180]], dtype=np.float32)

H_tilt = cv2.getPerspectiveTransform(src_quad, dst_quad)
warped_card = cv2.warpPerspective(card, H_tilt, (photo_w, photo_h))
mask = cv2.warpPerspective(np.ones((h, w), dtype=np.uint8)*255, H_tilt, (photo_w, photo_h))

# Composite card onto table
inv_mask = cv2.bitwise_not(mask)
bg = cv2.bitwise_and(table, table, mask=inv_mask)
fg = cv2.bitwise_and(warped_card, warped_card, mask=mask)
photo = cv2.add(bg, fg)

# Add slight realistic illumination gradient and subtle sensor noise
y_coords, x_coords = np.mgrid[0:photo_h, 0:photo_w]
light_grad = 0.85 + 0.25 * (x_coords / photo_w) - 0.1 * (y_coords / photo_h)
photo = np.clip(photo.astype(np.float32) * light_grad[:, :, np.newaxis], 0, 255).astype(np.uint8)

cv2.imwrite("test_phone_photo_mock.jpg", photo)
print("Saved test_phone_photo_mock.jpg (1920x1440 with realistic perspective tilt & lighting)")
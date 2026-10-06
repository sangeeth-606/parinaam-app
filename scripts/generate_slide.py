#!/usr/bin/env python3
"""
Generate a professional, human-designed presentation slide (16:9, 2560x1440)
for Parinaam's 5-step field testing pipeline using REAL photos, real CV detections,
and real app UI screenshots.
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH = 2560
HEIGHT = 1440

# Fonts
FONT_BOLD_PATH = "C:\\Windows\\Fonts\\segoeuib.ttf"
FONT_REG_PATH = "C:\\Windows\\Fonts\\segoeui.ttf"
FONT_MONO_PATH = "C:\\Windows\\Fonts\\consola.ttf"

font_title = ImageFont.truetype(FONT_BOLD_PATH, 54)
font_subtitle = ImageFont.truetype(FONT_REG_PATH, 24)
font_brand = ImageFont.truetype(FONT_BOLD_PATH, 18)

font_card_step = ImageFont.truetype(FONT_BOLD_PATH, 16)
font_card_title = ImageFont.truetype(FONT_BOLD_PATH, 32)
font_card_sub = ImageFont.truetype(FONT_REG_PATH, 18)
font_bullet = ImageFont.truetype(FONT_REG_PATH, 16)
font_bullet_bold = ImageFont.truetype(FONT_BOLD_PATH, 16)
font_arrow = ImageFont.truetype(FONT_BOLD_PATH, 28)

# Color Palette
BG_COLOR = (11, 19, 43)          # Dark navy slate
CARD_BG = (19, 28, 49)           # Card surface
CARD_BORDER = (35, 48, 77)       # Card border
TEXT_WHITE = (248, 250, 252)
TEXT_MUTED = (148, 163, 184)
TEXT_CYAN = (56, 189, 248)

STEP_ACCENTS = [
    (14, 165, 233),   # Step 1: Sky Blue
    (59, 130, 246),   # Step 2: Royal Blue
    (139, 92, 246),   # Step 3: Purple
    (16, 185, 129),   # Step 4: Emerald Green
    (245, 158, 11),   # Step 5: Amber Gold
]

# Real Image Previews
# 1. Guided camera capture
img_capture = Image.open('ui-reference/Guided capture.png')
crop_capture = img_capture.crop((20, 150, 405, 590))

# 2. Reference Card
img_card = Image.open('src/demo-photos/photo1.jpg')
crop_card = img_card.crop((210, 180, 1220, 930))

# 3. CV Analysis (derived output)
img_analyze = Image.open('camera-engine/photo-phone-camera/derived_output_photo1.jpg')
# crop both the card patches and the cassette wells together
crop_analyze = img_analyze.crop((700, 160, 1580, 960))

# 4. Result Screen (Positive / Negative / Inconclusive & Colorimetry Match)
img_classify = Image.open('ui-reference/Evidence Detail & Result.png')
# crop the compound identification + colorimetric normalization section
crop_classify = img_classify.crop((15, 120, 410, 560))

# 5. Ledger / Record Screen (Timestamp + GPS + Operator ID + Hash Seal)
img_record = Image.open('ui-reference/Evidence Detail & Result.png')
# crop the cryptographic vault record header with operator, time, gps, and seal
crop_record = img_record.crop((15, 60, 410, 500))

real_crops = [crop_capture, crop_card, crop_analyze, crop_classify, crop_record]

steps_data = [
    {
        "step_num": "STEP 01",
        "title": "CAPTURE",
        "subtitle": "Guided Camera Capture",
        "bullets": [
            "Real-time fiducial alignment brackets",
            "Keystone & perspective tilt detection",
            "Dark-viewfinder glare prevention",
            "High-resolution 12MP+ camera stream",
        ],
    },
    {
        "step_num": "STEP 02",
        "title": "CALIBRATE",
        "subtitle": "Reference-Card Correction",
        "bullets": [
            "4 ArUco DICT_4X4_50 optical fiducials",
            "Perspective homography rectification",
            "16-patch calibrated target matrix",
            "Specular glare exclusion algorithm",
        ],
    },
    {
        "step_num": "STEP 03",
        "title": "ANALYZE",
        "subtitle": "Computer Vision & Colorimetry",
        "bullets": [
            "Hough circle reaction well detection",
            "Cassette mixed lighting consistency gate",
            "Sub-pixel CIE L*a*b* core sampling",
            "Root-polynomial transformation fit",
        ],
    },
    {
        "step_num": "STEP 04",
        "title": "CLASSIFY",
        "subtitle": "Presumptive Outcome",
        "bullets": [
            "Positive / Negative / Inconclusive",
            "Delta E00 color distance to reference",
            "Chemical confidence score quantification",
            "Multi-reagent spectrum profile matching",
        ],
    },
    {
        "step_num": "STEP 05",
        "title": "RECORD",
        "subtitle": "Cryptographic Custody Seal",
        "bullets": [
            "Tamper-evident SHA-256 payload sealing",
            "RFC 8785 Canonical JSON hashing",
            "Append-only blockchain hash chain",
            "GPS coordinate geotag & operator ID",
        ],
    },
]

# Create Canvas
canvas = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
draw = ImageDraw.Draw(canvas)

# Subtle background header bar
draw.rectangle([(0, 0), (WIDTH, 170)], fill=(15, 23, 42))
draw.line([(0, 170), (WIDTH, 170)], fill=(30, 41, 59), width=2)

# Top Brand Badge
badge_text = "PARINAAM  ·  FORENSIC COLORIMETRIC VERIFICATION ARCHITECTURE"
draw.text((100, 36), badge_text, fill=TEXT_CYAN, font=font_brand)

# Main Title & Subtitle
draw.text((100, 68), "Field-Testing Presumptive Analysis Pipeline", fill=TEXT_WHITE, font=font_title)
draw.text((100, 130), "End-to-end computer vision processing: from real optical capture to tamper-evident ledger sealing.", fill=TEXT_MUTED, font=font_subtitle)

# Layout geometry
margin_x = 90
gap_x = 35
total_w = WIDTH - 2 * margin_x
card_w = int((total_w - 4 * gap_x) / 5)
card_h = 1200
card_y = 205

img_box_w = card_w - 36
img_box_h = 430

for i, data in enumerate(steps_data):
    cx = margin_x + i * (card_w + gap_x)
    cy = card_y
    accent = STEP_ACCENTS[i]

    # Draw Card Background with rounded corners
    draw.rounded_rectangle([(cx, cy), (cx + card_w, cy + card_h)], radius=18, fill=CARD_BG, outline=CARD_BORDER, width=2)
    # Top card accent line
    draw.rounded_rectangle([(cx + 2, cy + 2), (cx + card_w - 2, cy + 8)], radius=3, fill=accent)

    # Step Pill
    pill_w = 90
    pill_h = 28
    pill_x = cx + 20
    pill_y = cy + 26
    draw.rounded_rectangle([(pill_x, pill_y), (pill_x + pill_w, pill_y + pill_h)], radius=14, fill=(accent[0]//5, accent[1]//5, accent[2]//5), outline=accent, width=1)
    draw.text((pill_x + 14, pill_y + 4), data["step_num"], fill=accent, font=font_card_step)

    # Card Title & Subtitle
    draw.text((cx + 20, cy + 64), data["title"], fill=TEXT_WHITE, font=font_card_title)
    draw.text((cx + 20, cy + 106), data["subtitle"], fill=TEXT_CYAN, font=font_card_sub)

    # Image Container Frame
    img_x = cx + 18
    img_y = cy + 145
    draw.rounded_rectangle([(img_x, img_y), (img_x + img_box_w, img_y + img_box_h)], radius=12, fill=(10, 15, 26), outline=(30, 41, 59), width=1)

    # Resize and place real crop inside container
    crop = real_crops[i]
    crop_aspect = crop.width / crop.height
    target_aspect = (img_box_w - 8) / (img_box_h - 8)

    # Fit into image box maintaining aspect ratio
    max_w = img_box_w - 12
    max_h = img_box_h - 12
    if crop_aspect > max_w / max_h:
        new_w = max_w
        new_h = int(new_w / crop_aspect)
    else:
        new_h = max_h
        new_w = int(new_h * crop_aspect)

    resized_crop = crop.resize((new_w, new_h), Image.Resampling.LANCZOS)
    paste_x = img_x + (img_box_w - new_w) // 2
    paste_y = img_y + (img_box_h - new_h) // 2
    canvas.paste(resized_crop, (paste_x, paste_y))

    # Real Photo / UI Label Tag
    tag_label = "REAL CAMERA CAPTURE" if i == 0 else "PHYSICAL CALIBRATION CARD" if i == 1 else "CV HOUGH DETECTION" if i == 2 else "APP PRESUMPTIVE RESULT" if i == 3 else "BLOCKCHAIN AUDIT LOG"
    tag_font = ImageFont.truetype(FONT_MONO_PATH, 12)
    draw.rectangle([(img_x, img_y + img_box_h - 24), (img_x + img_box_w, img_y + img_box_h)], fill=(15, 23, 42, 220))
    draw.text((img_x + 10, img_y + img_box_h - 20), f"[ {tag_label} ]", fill=(148, 163, 184), font=tag_font)

    # Technical Specifications / Bullet Points Header
    divider_y = img_y + img_box_h + 24
    draw.line([(cx + 20, divider_y), (cx + card_w - 20, divider_y)], fill=(30, 41, 59), width=1)
    draw.text((cx + 20, divider_y + 16), "FORENSIC SPECIFICATIONS", fill=TEXT_MUTED, font=ImageFont.truetype(FONT_BOLD_PATH, 13))

    # Bullet Points
    by = divider_y + 44
    for bullet in data["bullets"]:
        # Small accent bullet marker
        draw.ellipse([(cx + 22, by + 6), (cx + 28, by + 12)], fill=accent)
        draw.text((cx + 36, by), bullet, fill=TEXT_WHITE, font=font_bullet)
        by += 32

    # Draw Connecting Arrow between cards
    if i < 4:
        arrow_x = cx + card_w + (gap_x - 24) // 2
        arrow_y = cy + 280
        # glowing circle background for arrow
        draw.ellipse([(arrow_x, arrow_y), (arrow_x + 28, arrow_y + 28)], fill=(20, 30, 55), outline=(56, 189, 248), width=2)
        draw.text((arrow_x + 8, arrow_y - 2), ">", fill=(56, 189, 248), font=font_arrow)

# Save high-res output
output_path = "docs/parinaam_pipeline_flow.jpg"
os.makedirs("docs", exist_ok=True)
canvas.save(output_path, "JPEG", quality=96)
print(f"[SUCCESS] High-res realistic flow slide generated at: {output_path}")

# Also copy to artifacts directory for inspection
artifact_path = "C:\\Users\\eemai\\.gemini\\antigravity-ide\\brain\\f72ca6ff-59e1-42b2-afa0-7c0fba91689e\\parinaam_pipeline_flow_realistic.jpg"
canvas.save(artifact_path, "JPEG", quality=96)
print(f"[SUCCESS] Saved to artifacts at: {artifact_path}")

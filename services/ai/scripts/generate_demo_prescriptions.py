# ruff: noqa: E501
"""Generate 5 realistic synthetic demo prescriptions using real generic drugs.

Saves PNG images and matching ground-truth JSON to demo/ (root and services/ai/demo/).
Uses real generic medicines:
- Metformin 500 mg
- Atorvastatin 10 mg
- Amlodipine 5 mg
- Pantoprazole 40 mg
- Paracetamol 650 mg

Language breakdown:
- rx_demo_001: English
- rx_demo_002: English
- rx_demo_003: Bilingual (English + Tamil)
- rx_demo_004: Bilingual (English + Tamil)
- rx_demo_005: Tamil-heavy
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.schemas.common import ExtractedField, Metrics, OcrLine  # noqa: E402
from app.schemas.prescription import (  # noqa: E402
    DocumentSource,
    ExtractionResult,
    FrequencyNormalized,
    Medicine,
    OcrResult,
    PatientInfo,
    PrescriberInfo,
)

ROOT_DIR = BASE_DIR.parent.parent
TARGET_DIRS = [
    ROOT_DIR / "demo",
    BASE_DIR / "demo",
]

CANVAS_WIDTH = 1200
CANVAS_HEIGHT = 1600
PAPER_BG = (252, 250, 245)


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidate_paths = [
        "C:/Windows/Fonts/Nirmala.ttc",
        "C:/Windows/Fonts/NirmalaB.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansTamil-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    if bold:
        candidate_paths.insert(0, "C:/Windows/Fonts/NirmalaB.ttc")

    for path_str in candidate_paths:
        p = Path(path_str)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=size)
            except Exception:
                continue

    return ImageFont.load_default()


def add_image_artifacts(image: Image.Image, rotate_deg: float) -> Image.Image:
    # 1. Subtle rotation
    if abs(rotate_deg) > 0.01:
        image = image.rotate(
            rotate_deg,
            resample=Image.Resampling.BILINEAR,
            expand=False,
            fillcolor=PAPER_BG,
        )

    # 2. Subtle Gaussian blur
    image = image.filter(ImageFilter.GaussianBlur(radius=0.25))

    # 3. Paper grain
    pixels = image.load()
    width, height = image.size
    for _ in range(width * height // 70):
        rx = random.randint(0, width - 1)
        ry = random.randint(0, height - 1)
        noise = random.randint(-8, 8)
        r, g, b = pixels[rx, ry]
        pixels[rx, ry] = (
            max(0, min(255, r + noise)),
            max(0, min(255, g + noise)),
            max(0, min(255, b + noise)),
        )

    return image


DEMO_CONFIGS = [
    {
        "id": 1,
        "language": "en",
        "clinic_name": "ARUNODHAYAM COMMUNITY HEALTH CLINIC",
        "clinic_addr": "42 Gandhi Road, Salem - 636007 | Ph: 0427-2410293",
        "doctor_name": "Dr. R. Senthamilselvan, MBBS, MD (Gen Med)",
        "doc_reg": "TN-MC-10293",
        "patient_name": "R. Murugan",
        "patient_age": "54",
        "patient_sex": "M",
        "date": "14-Oct-2026",
        "patient_line": "Patient: R. Murugan    Age: 54 M    Date: 14-Oct-2026",
        "follow_up_text": "Follow-up: Review in 1 month with fasting blood sugar and lipid profile.",
        "rotate_deg": 0.2,
        "meds": [
            {
                "name": "Metformin",
                "strength": "500mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-1",
                "timing": "after food",
                "duration": "30 days",
                "instructions": "Take 1 tablet after meals twice daily with water.",
                "prescription_line": "1. Tab Metformin 500mg - 1-0-1 after food x 30 days",
                "instruction_line": "    Directions: Take 1 tablet after meals twice daily with water.",
                "slots": ["morning", "night"],
                "as_needed": False,
                "times_per_day": 2,
            },
            {
                "name": "Atorvastatin",
                "strength": "10mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "0-0-1",
                "timing": "night after food",
                "duration": "30 days",
                "instructions": "Take 1 tablet at bedtime after dinner.",
                "prescription_line": "2. Tab Atorvastatin 10mg - 0-0-1 night after food x 30 days",
                "instruction_line": "    Directions: Take 1 tablet at bedtime after dinner.",
                "slots": ["night"],
                "as_needed": False,
                "times_per_day": 1,
            },
            {
                "name": "Amlodipine",
                "strength": "5mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-0",
                "timing": "morning before food",
                "duration": "30 days",
                "instructions": "Take 1 tablet once daily in the morning with water.",
                "prescription_line": "3. Tab Amlodipine 5mg - 1-0-0 morning before food x 30 days",
                "instruction_line": "    Directions: Take 1 tablet once daily in the morning with water.",
                "slots": ["morning"],
                "as_needed": False,
                "times_per_day": 1,
            },
        ],
    },
    {
        "id": 2,
        "language": "en",
        "clinic_name": "VASANTHAM FAMILY MEDICAL CENTRE",
        "clinic_addr": "15 Anna Salai, Madurai - 625001 | Ph: 0452-2531092",
        "doctor_name": "Dr. K. Anbazhagan, MBBS, DNB (Family Med)",
        "doc_reg": "TN-MC-28401",
        "patient_name": "S. Revathi",
        "patient_age": "38",
        "patient_sex": "F",
        "date": "15-Oct-2026",
        "patient_line": "Patient: S. Revathi    Age: 38 F    Date: 15-Oct-2026",
        "follow_up_text": "Follow-up: Review after 2 weeks or SOS if symptoms persist.",
        "rotate_deg": -0.25,
        "meds": [
            {
                "name": "Pantoprazole",
                "strength": "40mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-0",
                "timing": "empty stomach morning",
                "duration": "15 days",
                "instructions": "Take 1 tablet in morning on empty stomach 30 mins before breakfast.",
                "prescription_line": "1. Tab Pantoprazole 40mg - 1-0-0 empty stomach morning x 15 days",
                "instruction_line": "    Directions: Take 1 tablet in morning on empty stomach 30 mins before breakfast.",
                "slots": ["morning"],
                "as_needed": False,
                "times_per_day": 1,
            },
            {
                "name": "Metformin",
                "strength": "500mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-1",
                "timing": "after food",
                "duration": "30 days",
                "instructions": "Take 1 tablet twice daily after meals.",
                "prescription_line": "2. Tab Metformin 500mg - 1-0-1 after food x 30 days",
                "instruction_line": "    Directions: Take 1 tablet twice daily after meals with water.",
                "slots": ["morning", "night"],
                "as_needed": False,
                "times_per_day": 2,
            },
            {
                "name": "Paracetamol",
                "strength": "650mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "SOS",
                "timing": "after food as needed",
                "duration": "5 days",
                "instructions": "Take 1 tablet as needed for fever or pain (maximum 3 tablets per day).",
                "prescription_line": "3. Tab Paracetamol 650mg - SOS after food as needed x 5 days",
                "instruction_line": "    Directions: Take 1 tablet as needed for fever or pain (maximum 3 tablets/day).",
                "slots": [],
                "as_needed": True,
                "times_per_day": None,
            },
        ],
    },
    {
        "id": 3,
        "language": "bilingual",
        "clinic_name": "SENTHAMIZH WELFARE CLINIC / செந்தமிழ் நலவாழ்வு மையம்",
        "clinic_addr": "204 Velachery Main Road, Chennai - 600042 | Ph: 044-22441920",
        "doctor_name": "Dr. V. Malathi, MBBS, MD (Internal Med)",
        "doc_reg": "TN-MC-39182",
        "patient_name": "K. Lakshmi",
        "patient_age": "62",
        "patient_sex": "F",
        "date": "15-Oct-2026",
        "patient_line": "நோயாளி / Patient: K. Lakshmi    வயது / Age: 62 F    தேதி / Date: 15-Oct-2026",
        "follow_up_text": "அடுத்த பரிசோதனை / Follow-up: 1 மாதத்திற்குப் பின் இரத்த அழுத்த அட்டவணையுடன் வரவும் (Review in 1 month).",
        "rotate_deg": 0.15,
        "meds": [
            {
                "name": "Metformin",
                "strength": "500mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-1",
                "timing": "உணவுக்குப் பின் / after food",
                "duration": "30 days",
                "instructions": "உணவுக்குப் பின் ஒரு மாத்திரை / 1 tab after food twice daily.",
                "prescription_line": "1. Tab Metformin 500mg - 1-0-1 உணவுக்குப் பின் / after food x 30 days",
                "instruction_line": "    விவரம்: உணவுக்குப் பின் ஒரு மாத்திரை / 1 tab after food twice daily.",
                "slots": ["morning", "night"],
                "as_needed": False,
                "times_per_day": 2,
            },
            {
                "name": "Amlodipine",
                "strength": "5mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-0",
                "timing": "காலை உணவுக்கு முன் / morning before food",
                "duration": "30 days",
                "instructions": "தினமும் காலையில் தண்ணீருடன் உட்கொள்ளவும் / Take 1 tab morning before food.",
                "prescription_line": "2. Tab Amlodipine 5mg - 1-0-0 காலை உணவுக்கு முன் / morning before food x 30 days",
                "instruction_line": "    விவரம்: தினமும் காலையில் ஒரு மாத்திரை / Take 1 tab morning before food.",
                "slots": ["morning"],
                "as_needed": False,
                "times_per_day": 1,
            },
            {
                "name": "Atorvastatin",
                "strength": "10mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "0-0-1",
                "timing": "இரவு உணவுக்குப் பின் / night after food",
                "duration": "30 days",
                "instructions": "இரவு உணவுக்குப் பின் உட்கொள்ளவும் / Take 1 tab at bedtime after food.",
                "prescription_line": "3. Tab Atorvastatin 10mg - 0-0-1 இரவு உணவுக்குப் பின் / night after food x 30 days",
                "instruction_line": "    விவரம்: இரவு உணவுக்குப் பின் தூங்கும் முன் / Take 1 tab at bedtime after dinner.",
                "slots": ["night"],
                "as_needed": False,
                "times_per_day": 1,
            },
        ],
    },
    {
        "id": 4,
        "language": "bilingual",
        "clinic_name": "KURUNJI RURAL HEALTH DISPENSARY / குறிஞ்சி மருந்தகம்",
        "clinic_addr": "88 Thanjavur Main Road, Trichy - 620001 | Ph: 0431-2701824",
        "doctor_name": "Dr. S. Meenakshi, MBBS",
        "doc_reg": "TN-MC-51042",
        "patient_name": "P. Alagappan",
        "patient_age": "68",
        "patient_sex": "M",
        "date": "16-Oct-2026",
        "patient_line": "நோயாளி / Patient: P. Alagappan    வயது / Age: 68 M    தேதி / Date: 16-Oct-2026",
        "follow_up_text": "அடுத்த பரிசோதனை / Next review: 15 நாட்கள் கழித்து மீண்டும் வரவும் (Review in 15 days).",
        "rotate_deg": -0.18,
        "meds": [
            {
                "name": "Pantoprazole",
                "strength": "40mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-0",
                "timing": "காலை வெறும் வயிற்றில் / empty stomach morning",
                "duration": "15 days",
                "instructions": "காலை உணவு உண்பதற்கு 30 நிமிடம் முன் / 30 mins before breakfast.",
                "prescription_line": "1. Tab Pantoprazole 40mg - 1-0-0 காலை வெறும் வயிற்றில் / empty stomach morning x 15 days",
                "instruction_line": "    விவரம்: காலை உணவுக்கு 30 நிமிடம் முன் / Take 30 mins before breakfast.",
                "slots": ["morning"],
                "as_needed": False,
                "times_per_day": 1,
            },
            {
                "name": "Atorvastatin",
                "strength": "10mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "0-0-1",
                "timing": "இரவு உணவுக்குப் பின் / night after food",
                "duration": "30 days",
                "instructions": "இரவு படுக்கைக்கு முன் உட்கொள்ளவும் / Take 1 tab at bedtime after food.",
                "prescription_line": "2. Tab Atorvastatin 10mg - 0-0-1 இரவு உணவுக்குப் பின் / night after food x 30 days",
                "instruction_line": "    விவரம்: இரவு உணவுக்குப் பின் படுக்கைக்கு முன் / Take 1 tab at bedtime.",
                "slots": ["night"],
                "as_needed": False,
                "times_per_day": 1,
            },
            {
                "name": "Paracetamol",
                "strength": "650mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "SOS",
                "timing": "தேவைப்படும் போது / as needed",
                "duration": "5 days",
                "instructions": "காய்ச்சல் அல்லது வலி ஏற்படும் போது / Take as needed for fever or pain.",
                "prescription_line": "3. Tab Paracetamol 650mg - SOS தேவைப்படும் போது / as needed x 5 days",
                "instruction_line": "    விவரம்: காய்ச்சல் அல்லது உடல் வலிக்கு / For fever or body pain.",
                "slots": [],
                "as_needed": True,
                "times_per_day": None,
            },
        ],
    },
    {
        "id": 5,
        "language": "ta",
        "clinic_name": "அருணோதயம் சமுதாய நல மையம்",
        "clinic_addr": "42 காந்தி சாலை, சேலம் - 636007 | தொலைபேசி: 0427-2410293",
        "doctor_name": "மருத்துவர் பி. சுந்தரமூர்த்தி, MBBS, MD",
        "doc_reg": "TN-MC-62391",
        "patient_name": "டி. பானுமதி",
        "patient_age": "41",
        "patient_sex": "F",
        "date": "16-அக்டோபர்-2026",
        "patient_line": "நோயாளி: டி. பானுமதி    வயது: 41 பெண்    தேதி: 16-அக்டோபர்-2026",
        "follow_up_text": "அடுத்த பரிசோதனை: 30 நாட்கள் கழித்து இரத்த அழுத்தம் மற்றும் சர்க்கரை அளவு சரிபார்க்க வரவும்.",
        "rotate_deg": 0.22,
        "meds": [
            {
                "name": "Metformin",
                "strength": "500mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-1",
                "timing": "உணவுக்குப் பின்",
                "duration": "30 days",
                "instructions": "தினமும் இருவேளை உணவுக்குப் பின் ஒரு மாத்திரை உட்கொள்ளவும்.",
                "prescription_line": "1. Tab Metformin 500mg - 1-0-1 உணவுக்குப் பின் x 30 நாட்கள்",
                "instruction_line": "    வழிமுறை: தினமும் இருவேளை உணவுக்குப் பின் ஒரு மாத்திரை உட்கொள்ளவும்.",
                "slots": ["morning", "night"],
                "as_needed": False,
                "times_per_day": 2,
            },
            {
                "name": "Amlodipine",
                "strength": "5mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-0",
                "timing": "காலை உணவுக்கு முன்",
                "duration": "30 days",
                "instructions": "தினமும் காலையில் உணவுக்கு முன் தண்ணீர் குடித்து உட்கொள்ளவும்.",
                "prescription_line": "2. Tab Amlodipine 5mg - 1-0-0 காலை உணவுக்கு முன் x 30 நாட்கள்",
                "instruction_line": "    வழிமுறை: தினமும் காலையில் உணவுக்கு முன் தண்ணீர் குடித்து உட்கொள்ளவும்.",
                "slots": ["morning"],
                "as_needed": False,
                "times_per_day": 1,
            },
            {
                "name": "Pantoprazole",
                "strength": "40mg",
                "form": "tablet",
                "dose": "1",
                "frequency": "1-0-0",
                "timing": "காலை வெறும் வயிற்றில்",
                "duration": "15 days",
                "instructions": "காலை உணவுக்கு அரை மணி நேரம் முன் வெறும் வயிற்றில் உட்கொள்ளவும்.",
                "prescription_line": "3. Tab Pantoprazole 40mg - 1-0-0 காலை வெறும் வயிற்றில் x 15 நாட்கள்",
                "instruction_line": "    வழிமுறை: காலை உணவுக்கு அரை மணி நேரம் முன் வெறும் வயிற்றில் உட்கொள்ளவும்.",
                "slots": ["morning"],
                "as_needed": False,
                "times_per_day": 1,
            },
        ],
    },
]


def render_demo_prescription(
    cfg: dict[str, Any],
) -> tuple[Image.Image, ExtractionResult, dict[str, Any]]:
    idx = cfg["id"]
    doc_id = f"doc-demo-rx-{idx:03d}"
    req_id = f"req-demo-{idx:03d}"

    image = Image.new("RGB", (CANVAS_WIDTH, CANVAS_HEIGHT), PAPER_BG)
    draw = ImageDraw.Draw(image)

    title_font = get_font(34, bold=True)
    header_font = get_font(22, bold=False)
    doctor_font = get_font(24, bold=True)
    body_bold = get_font(22, bold=True)
    rx_font = get_font(42, bold=True)
    med_font = get_font(22, bold=True)
    dir_font = get_font(18, bold=False)

    lines: list[OcrLine] = []
    line_counter = 1

    def render_line(
        x: int, y: int, text: str, font: Any, color: tuple = (20, 20, 20)
    ) -> tuple[str, tuple[int, int, int, int]]:
        nonlocal line_counter
        draw.text((x, y), text, font=font, fill=color)
        bbox = draw.textbbox((x, y), text, font=font)
        w = max(10, bbox[2] - bbox[0])
        h = max(10, bbox[3] - bbox[1])
        lid = f"L{line_counter}"
        ocr_item = OcrLine(
            id=lid,
            text=text,
            bbox=[x, y, w, h],
            page=1,
            conf=0.98,
        )
        lines.append(ocr_item)
        line_counter += 1
        return (lid, (x, y, w, h))

    # Header
    lid_clinic, _ = render_line(120, 70, cfg["clinic_name"], title_font, (15, 45, 95))
    render_line(120, 115, cfg["clinic_addr"], header_font, (80, 80, 80))

    # Doctor row (name and registration number)
    doc_line_text = f"{cfg['doctor_name']}    Reg: {cfg['doc_reg']}"
    lid_doc, _ = render_line(120, 165, doc_line_text, doctor_font, (30, 30, 30))
    lid_reg = lid_doc

    draw.line([(100, 210), (1100, 210)], fill=(180, 180, 180), width=2)

    # Patient info
    lid_pat, _ = render_line(120, 230, cfg["patient_line"], body_bold, (30, 30, 30))

    draw.line([(100, 275), (1100, 275)], fill=(180, 180, 180), width=2)

    # Rx Symbol
    draw.text((120, 290), "℞", font=rx_font, fill=(15, 45, 95))

    medicines: list[Medicine] = []
    y_cursor = 370

    for m_idx, med_cfg in enumerate(cfg["meds"]):
        med_id = f"med-{m_idx + 1}"
        lid_rx_line, _ = render_line(
            120, y_cursor, med_cfg["prescription_line"], med_font, (20, 20, 20)
        )
        y_cursor += 36
        lid_instr_line, _ = render_line(
            120, y_cursor, med_cfg["instruction_line"], dir_font, (60, 60, 60)
        )
        y_cursor += 54

        evidence_ids = [lid_rx_line, lid_instr_line]

        freq_norm = FrequencyNormalized(
            times_per_day=med_cfg["times_per_day"],
            slots=med_cfg["slots"],
            as_needed=med_cfg["as_needed"],
        )

        med_obj = Medicine(
            id=med_id,
            name=ExtractedField(
                value=med_cfg["name"],
                raw=med_cfg["name"],
                status="found",
                confidence=0.98,
                evidence_line_ids=[lid_rx_line],
            ),
            strength=ExtractedField(
                value=med_cfg["strength"],
                raw=med_cfg["strength"],
                status="found",
                confidence=0.98,
                evidence_line_ids=[lid_rx_line],
            ),
            form=ExtractedField(
                value=med_cfg["form"],
                raw="Tab",
                status="found",
                confidence=0.98,
                evidence_line_ids=[lid_rx_line],
            ),
            dose=ExtractedField(
                value=med_cfg["dose"],
                raw="1 tab",
                status="found",
                confidence=0.98,
                evidence_line_ids=[lid_rx_line],
            ),
            frequency=ExtractedField(
                value=med_cfg["frequency"],
                raw=med_cfg["frequency"],
                status="found",
                confidence=0.98,
                evidence_line_ids=[lid_rx_line],
            ),
            timing=ExtractedField(
                value=med_cfg["timing"],
                raw=med_cfg["timing"],
                status="found",
                confidence=0.98,
                evidence_line_ids=[lid_rx_line],
            ),
            duration=ExtractedField(
                value=med_cfg["duration"],
                raw=med_cfg["duration"],
                status="found",
                confidence=0.98,
                evidence_line_ids=[lid_rx_line],
            ),
            instructions=ExtractedField(
                value=med_cfg["instructions"],
                raw=med_cfg["instructions"],
                status="found",
                confidence=0.98,
                evidence_line_ids=evidence_ids,
            ),
            frequency_normalized=freq_norm,
            suggestions=[],
            status="verified_by_rules",
        )
        medicines.append(med_obj)

    # Follow-up
    draw.line([(100, y_cursor + 20), (1100, y_cursor + 20)], fill=(200, 200, 200), width=1)
    lid_follow, _ = render_line(120, y_cursor + 40, cfg["follow_up_text"], body_bold, (40, 40, 40))

    # Doctor signature placeholder
    draw.text(
        (820, y_cursor + 120), "Signature & Seal / கையொப்பம்", font=dir_font, fill=(100, 100, 100)
    )
    draw.line([(800, y_cursor + 110), (1050, y_cursor + 110)], fill=(80, 80, 80), width=1)

    # Footer note
    footer_text = "Synthetic demo prescription generated for CareBridge AI. Not real patient data."
    render_line(120, 1530, footer_text, dir_font, (120, 120, 120))

    # Add realistic scanner noise/blur/rotation
    image = add_image_artifacts(image, cfg["rotate_deg"])

    extraction_result = ExtractionResult(
        request_id=req_id,
        document_id=doc_id,
        source=DocumentSource(type="image", page_count=1),
        ocr=OcrResult(engine="synthetic_ground_truth", lines=lines),
        prescriber=PrescriberInfo(
            name=ExtractedField(
                value=cfg["doctor_name"],
                raw=cfg["doctor_name"],
                status="found",
                confidence=0.99,
                evidence_line_ids=[lid_doc],
            ),
            registration_no=ExtractedField(
                value=cfg["doc_reg"],
                raw=cfg["doc_reg"],
                status="found",
                confidence=0.99,
                evidence_line_ids=[lid_reg],
            ),
            hospital=ExtractedField(
                value=cfg["clinic_name"],
                raw=cfg["clinic_name"],
                status="found",
                confidence=0.99,
                evidence_line_ids=[lid_clinic],
            ),
            date=ExtractedField(
                value=cfg["date"],
                raw=cfg["date"],
                status="found",
                confidence=0.99,
                evidence_line_ids=[lid_pat],
            ),
        ),
        patient=PatientInfo(
            name=ExtractedField(
                value=cfg["patient_name"],
                raw=cfg["patient_name"],
                status="found",
                confidence=0.99,
                evidence_line_ids=[lid_pat],
            ),
            age=ExtractedField(
                value=cfg["patient_age"],
                raw=cfg["patient_age"],
                status="found",
                confidence=0.99,
                evidence_line_ids=[lid_pat],
            ),
        ),
        medicines=medicines,
        follow_up=ExtractedField(
            value=cfg["follow_up_text"],
            raw=cfg["follow_up_text"],
            status="found",
            confidence=0.98,
            evidence_line_ids=[lid_follow],
        ),
        flags=[],
        overall_status="ready",
        review_reasons=[],
        metrics=Metrics(
            latency_ms=0.0,
            model="demo_generator",
            tokens_in=0,
            tokens_out=0,
            gpu="CPU",
        ),
    )

    manifest_record = {
        "id": doc_id,
        "image_file": f"rx_demo_{idx:03d}.png",
        "json_file": f"rx_demo_{idx:03d}.json",
        "language": cfg["language"],
        "medicines_count": len(medicines),
        "medicines": [m.name.value for m in medicines],
        "overall_status": "ready",
        "is_corrupted": False,
    }

    return image, extraction_result, manifest_record


def main() -> None:
    print("Generating 5 synthetic prescriptions with real generic drugs under demo/...")

    for target_dir in TARGET_DIRS:
        target_dir.mkdir(parents=True, exist_ok=True)

    manifest_entries: list[dict[str, Any]] = []

    for cfg in DEMO_CONFIGS:
        idx = cfg["id"]
        image, result, manifest_item = render_demo_prescription(cfg)

        png_name = f"rx_demo_{idx:03d}.png"
        json_name = f"rx_demo_{idx:03d}.json"

        # Save to all target directories
        for target_dir in TARGET_DIRS:
            png_path = target_dir / png_name
            json_path = target_dir / json_name

            image.save(png_path, "PNG", optimize=True)
            with open(json_path, "w", encoding="utf-8") as f:
                f.write(result.model_dump_json(indent=2))

        manifest_entries.append(manifest_item)
        print(
            f"Generated {png_name} and {json_name} ({manifest_item['language']}) - Meds: {manifest_item['medicines']}"
        )

    manifest = {
        "dataset_name": "carebridge_demo_prescriptions_real_generics",
        "description": "5 synthetic demo prescriptions using real generic drugs for demonstration and OCR CER benchmarks.",
        "total_prescriptions": len(manifest_entries),
        "language_breakdown": {
            "english": 2,
            "bilingual": 2,
            "tamil_heavy": 1,
        },
        "drugs_included": [
            "Metformin 500 mg",
            "Atorvastatin 10 mg",
            "Amlodipine 5 mg",
            "Pantoprazole 40 mg",
            "Paracetamol 650 mg",
        ],
        "prescriptions": manifest_entries,
    }

    for target_dir in TARGET_DIRS:
        manifest_path = target_dir / "manifest.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        print(f"Manifest saved to: {manifest_path}")

    print("Demo prescription generation complete!")


if __name__ == "__main__":
    main()

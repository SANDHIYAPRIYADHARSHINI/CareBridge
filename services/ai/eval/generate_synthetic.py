"""Synthetic prescription image and ground-truth JSON generator for CareBridge AI.

Renders 30 realistic synthetic prescriptions (PNG) using PIL and produces matching
ground-truth JSON adhering strictly to ExtractionResult schema.
- Mix of English, Tamil, and bilingual layouts.
- Real text line bounding boxes (OcrLine).
- Image augmentations: rotation, noise, blur, and ink smudges.
- 10 deliberately corrupted prescriptions with ground-truth corruption tracking.
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

from app.schemas.common import ExtractedField, Flag, Metrics, OcrLine  # noqa: E402
from app.schemas.prescription import (  # noqa: E402
    DocumentSource,
    ExtractionResult,
    FrequencyNormalized,
    Medicine,
    OcrResult,
    PatientInfo,
    PrescriberInfo,
)

DRUGS_PATH = BASE_DIR / "data" / "reference" / "drugs.json"
OUTPUT_DIR = BASE_DIR / "eval" / "data"

CANVAS_WIDTH = 1200
CANVAS_HEIGHT = 1600
PAPER_BG = (252, 250, 245)

CLINICS = [
    {
        "name_en": "ARUNODHAYAM COMMUNITY HEALTH CLINIC",
        "name_ta": "அருணோதயம் சமுதாய நல மையம்",
        "address_en": "42 Gandhi Road, Salem - 636007 | Ph: 0427-2410293",
        "address_ta": "42 காந்தி சாலை, சேலம் - 636007",
    },
    {
        "name_en": "VASANTHAM FAMILY MEDICAL CENTRE",
        "name_ta": "வசந்தம் குடும்ப நல மருத்துவமனை",
        "address_en": "15 Anna Salai, Madurai - 625001 | Ph: 0452-2531092",
        "address_ta": "15 அண்ணா சாலை, மதுரை - 625001",
    },
    {
        "name_en": "KURUNJI RURAL HEALTH DISPENSARY",
        "name_ta": "குறிஞ்சி கிராமப்புற மருந்தகம்",
        "address_en": "88 Thanjavur Main Road, Trichy - 620001 | Ph: 0431-2701824",
        "address_ta": "88 தஞ்சாவூர் மெயின் ரோடு, திருச்சி - 620001",
    },
    {
        "name_en": "SENTHAMIZH WELFARE CLINIC",
        "name_ta": "செந்தமிழ் நலவாழ்வு மையம்",
        "address_en": "204 Velachery Main Road, Chennai - 600042 | Ph: 044-22441920",
        "address_ta": "204 வேளச்சேரி மெயின் ரோடு, சென்னை - 600042",
    },
    {
        "name_en": "MARUTHAM PRIMARY HEALTH CENTRE",
        "name_ta": "மருதம் ஆரம்ப சுகாதார நிலையம்",
        "address_en": "12 Coimbatore Bypass, Erode - 638001 | Ph: 0424-2218491",
        "address_ta": "12 கோயம்புத்தூர் பைபாஸ், ஈரோடு - 638001",
    },
]

DOCTORS = [
    ("Dr. R. Senthamilselvan, MBBS, MD (Gen Med)", "TN-MC-10293"),
    ("Dr. K. Anbazhagan, MBBS, DNB (Family Med)", "TN-MC-28401"),
    ("Dr. V. Malathi, MBBS, MD", "TN-MC-39182"),
    ("Dr. S. Meenakshi, MBBS", "TN-MC-51042"),
    ("Dr. P. Sundaramoorthy, MBBS, MD", "TN-MC-62391"),
]

PATIENTS = [
    ("R. Murugan", "54", "M"),
    ("K. Lakshmi", "62", "F"),
    ("M. Saravanan", "45", "M"),
    ("S. Revathi", "38", "F"),
    ("P. Alagappan", "68", "M"),
    ("T. Valli", "51", "F"),
    ("G. Natarajan", "72", "M"),
    ("D. Banumathi", "41", "F"),
    ("N. Kumar", "29", "M"),
    ("A. Selvi", "60", "F"),
]


def load_drug_catalog() -> list[dict[str, Any]]:
    with open(DRUGS_PATH, encoding="utf-8") as f:
        return json.load(f)


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
    image = image.filter(ImageFilter.GaussianBlur(radius=0.35))

    # 3. Paper grain / noise
    pixels = image.load()
    width, height = image.size
    for _ in range(width * height // 60):
        rx = random.randint(0, width - 1)
        ry = random.randint(0, height - 1)
        noise = random.randint(-12, 12)
        r, g, b = pixels[rx, ry]
        pixels[rx, ry] = (
            max(0, min(255, r + noise)),
            max(0, min(255, g + noise)),
            max(0, min(255, b + noise)),
        )

    return image


def draw_smudge(image: Image.Image, bbox: list[int]) -> None:
    # Overlay an ink smudge patch over the bounding box
    overlay = Image.new("RGBA", image.size, (255, 255, 255, 0))
    draw_overlay = ImageDraw.Draw(overlay)
    x, y, w, h = bbox
    pad = 4
    for _ in range(8):
        jitter_x = random.randint(-3, 3)
        jitter_y = random.randint(-2, 2)
        draw_overlay.ellipse(
            [
                x - pad + jitter_x,
                y - pad + jitter_y,
                x + w + pad + jitter_x,
                y + h + pad + jitter_y,
            ],
            fill=(25, 28, 35, random.randint(140, 200)),
        )
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=1.5))
    image.paste(overlay, (0, 0), overlay)


def generate_single_prescription(
    idx: int,
    drug_catalog: list[dict[str, Any]],
    corruption_type: str | None = None,
) -> tuple[Image.Image, ExtractionResult, dict[str, Any]]:
    req_id = f"req-syn-{idx:03d}"
    doc_id = f"doc-syn-rx-{idx:03d}"

    image = Image.new("RGB", (CANVAS_WIDTH, CANVAS_HEIGHT), PAPER_BG)
    draw = ImageDraw.Draw(image)

    # Fonts
    title_font = get_font(34, bold=True)
    header_font = get_font(22, bold=False)
    doctor_font = get_font(24, bold=True)
    body_bold = get_font(22, bold=True)
    rx_font = get_font(42, bold=True)
    small_font = get_font(18, bold=False)

    lines: list[OcrLine] = []
    line_counter = 1

    def render_line(
        x: int, y: int, text: str, font: Any, color: tuple = (20, 20, 20)
    ) -> tuple[int, int, int, int]:
        nonlocal line_counter
        draw.text((x, y), text, font=font, fill=color)
        bbox = draw.textbbox((x, y), text, font=font)
        w = max(10, bbox[2] - bbox[0])
        h = max(10, bbox[3] - bbox[1])
        ocr_item = OcrLine(
            id=f"L{line_counter}",
            text=text,
            bbox=[x, y, w, h],
            page=1,
            conf=0.96,
        )
        lines.append(ocr_item)
        line_counter += 1
        return (x, y, w, h)

    # Pick clinic, doctor, patient
    clinic = CLINICS[(idx - 1) % len(CLINICS)]
    doctor_name, doc_reg = DOCTORS[(idx - 1) % len(DOCTORS)]
    pat_name, pat_age, pat_sex = PATIENTS[(idx - 1) % len(PATIENTS)]
    date_str = f"{10 + (idx % 18):02d}-Oct-2026"

    is_tamil = idx in (9, 10, 11, 12, 13, 14)
    is_bilingual = idx in (15, 16, 17, 18, 19, 20, 24, 25)

    # 1. Header Section
    clinic_title = clinic["name_ta"] if is_tamil else clinic["name_en"]
    render_line(120, 70, clinic_title, title_font, (15, 45, 95))
    render_line(
        120,
        115,
        clinic["address_ta"] if is_tamil else clinic["address_en"],
        header_font,
        (80, 80, 80),
    )

    # Doctor row
    render_line(120, 165, doctor_name, doctor_font, (30, 30, 30))
    render_line(780, 165, f"Reg: {doc_reg}", header_font, (50, 50, 50))

    # Divider line
    draw.line([(100, 210), (1100, 210)], fill=(180, 180, 180), width=2)

    # 2. Patient Details Row
    patient_text = (
        f"நோயாளி / Patient: {pat_name}    வயது / Age: {pat_age} {pat_sex}    தேதி / Date: {date_str}"
        if (is_tamil or is_bilingual)
        else f"Patient: {pat_name}    Age: {pat_age} {pat_sex}    Date: {date_str}"
    )
    render_line(120, 230, patient_text, body_bold, (30, 30, 30))

    draw.line([(100, 275), (1100, 275)], fill=(180, 180, 180), width=2)

    # Rx symbol
    draw.text((120, 290), "℞", font=rx_font, fill=(15, 45, 95))

    # 3. Select 2 to 4 medicines
    num_meds = 2 if idx % 3 == 0 else (4 if idx % 4 == 0 else 3)
    if corruption_type == "duplicate_drug":
        num_meds = max(2, num_meds)

    selected_drugs: list[dict[str, Any]] = []
    base_pool = list(drug_catalog)
    random.seed(idx * 42)
    random.shuffle(base_pool)
    for m in range(num_meds):
        selected_drugs.append(base_pool[m % len(base_pool)])

    if corruption_type == "duplicate_drug":
        # Make drug 1 and last drug identical
        selected_drugs[-1] = selected_drugs[0]

    medicines: list[Medicine] = []
    y_cursor = 370
    smudge_bbox: list[int] | None = None

    flags: list[Flag] = []
    review_reasons: list[str] = []
    corrupted_fields: list[str] = []

    for m_idx, drug in enumerate(selected_drugs):
        med_id = f"med-{m_idx + 1}"
        drug_name_str = drug["name"]
        drug_form = drug["forms"][0]
        strength_str = drug["strengths"][0]
        freq_str = drug["common_frequency"]
        timing_str = drug["timing_ta"] if is_tamil else drug["timing_en"]
        duration_days = 30 if "1-0-1" in freq_str or "0-0-1" in freq_str else 15
        duration_str = f"{duration_days} days"
        instructions_str = drug["instructions_ta"] if is_tamil else drug["instructions_en"]
        qty = 60 if freq_str == "1-0-1" else 30

        is_this_med_corrupted = False
        medicine_status = "verified_by_rules"

        # Apply specific corruption rules
        if corruption_type == "missing_strength" and m_idx == 0:
            is_this_med_corrupted = True
            strength_val = None
            strength_status = "missing"
            strength_conf = 0.0
            line_text = (
                f"{m_idx + 1}. Tab {drug_name_str} - {freq_str} {timing_str} x {duration_str}"
            )
            flags.append(
                Flag(
                    id=f"flag-missing-strength-{med_id}",
                    severity="warn",
                    code="MISSING_STRENGTH",
                    message=f"Missing drug strength on {drug_name_str}.",
                    field_path=f"medicines[{m_idx}].strength",
                    evidence_line_ids=[f"L{line_counter}"],
                )
            )
            review_reasons.append(f"Missing strength for medicine #{m_idx + 1} ({drug_name_str}).")
            corrupted_fields.append(f"medicines[{m_idx}].strength")
            medicine_status = "needs_review"
        elif corruption_type == "smudged_frequency" and m_idx == 0:
            is_this_med_corrupted = True
            strength_val = strength_str
            strength_status = "found"
            strength_conf = 0.96
            line_text = (
                f"{m_idx + 1}. Tab {drug_name_str} {strength_str} - "
                f"[???] {timing_str} x {duration_str}"
            )
            flags.append(
                Flag(
                    id=f"flag-unclear-freq-{med_id}",
                    severity="warn",
                    code="UNREADABLE_FREQUENCY",
                    message=f"Frequency illegible or smudged for {drug_name_str}.",
                    field_path=f"medicines[{m_idx}].frequency",
                    evidence_line_ids=[f"L{line_counter}"],
                )
            )
            review_reasons.append(f"Frequency smudged and unreadable for {drug_name_str}.")
            corrupted_fields.append(f"medicines[{m_idx}].frequency")
            medicine_status = "needs_review"
        elif corruption_type == "quantity_duration_conflict" and m_idx == 0:
            is_this_med_corrupted = True
            strength_val = strength_str
            strength_status = "found"
            strength_conf = 0.96
            qty_conflict = 15  # Conflicts with 60 required
            line_text = (
                f"{m_idx + 1}. Tab {drug_name_str} {strength_str} - "
                f"{freq_str} {timing_str} x {duration_str} (Qty: {qty_conflict} tabs)"
            )
            flags.append(
                Flag(
                    id=f"flag-qty-conflict-{med_id}",
                    severity="warn",
                    code="QUANTITY_DURATION_CONFLICT",
                    message=(
                        f"Frequency ({freq_str}) for {duration_str} requires {qty} units, "
                        f"conflicts with written Qty: {qty_conflict}."
                    ),
                    field_path=f"medicines[{m_idx}].duration",
                    evidence_line_ids=[f"L{line_counter}"],
                )
            )
            review_reasons.append(
                f"Conflict between duration/frequency and written quantity for {drug_name_str}."
            )
            corrupted_fields.append(f"medicines[{m_idx}].duration")
            medicine_status = "needs_review"
        elif corruption_type == "duplicate_drug" and m_idx == len(selected_drugs) - 1:
            is_this_med_corrupted = True
            strength_val = strength_str
            strength_status = "found"
            strength_conf = 0.96
            line_text = (
                f"{m_idx + 1}. Tab {drug_name_str} {strength_str} - "
                f"{freq_str} {timing_str} x {duration_str}"
            )
            flags.append(
                Flag(
                    id=f"flag-duplicate-drug-{med_id}",
                    severity="warn",
                    code="DUPLICATE_DRUG",
                    message=(
                        f"Duplicate drug entry detected: {drug_name_str} prescribed multiple times."
                    ),
                    field_path=f"medicines[{m_idx}].name",
                    evidence_line_ids=[f"L{line_counter}"],
                )
            )
            review_reasons.append(f"Duplicate prescription entry for {drug_name_str}.")
            corrupted_fields.append(f"medicines[{m_idx}].name")
            medicine_status = "needs_review"
        else:
            strength_val = strength_str
            strength_status = "found"
            strength_conf = 0.96
            line_text = (
                f"{m_idx + 1}. Tab {drug_name_str} {strength_str} - "
                f"{freq_str} {timing_str} x {duration_str}"
            )

        # Render medicine line 1
        line1_bbox = render_line(120, y_cursor, line_text, body_bold, (25, 25, 25))
        evidence_line_id = f"L{line_counter - 1}"

        if corruption_type == "smudged_frequency" and is_this_med_corrupted:
            smudge_bbox = [line1_bbox[0] + 320, line1_bbox[1] - 4, 160, line1_bbox[3] + 8]

        # Render instruction line 2
        y_cursor += 36
        inst_text = f"    Instructions: {instructions_str}"
        render_line(120, y_cursor, inst_text, small_font, (80, 80, 80))
        y_cursor += 54

        # Calculate normalized frequency
        freq_norm = None
        if freq_str == "1-0-1":
            freq_norm = FrequencyNormalized(
                times_per_day=2, slots=["morning", "night"], as_needed=False
            )
        elif freq_str == "0-0-1":
            freq_norm = FrequencyNormalized(times_per_day=1, slots=["night"], as_needed=False)
        elif freq_str == "1-0-0":
            freq_norm = FrequencyNormalized(times_per_day=1, slots=["morning"], as_needed=False)
        elif freq_str == "1-1-1":
            freq_norm = FrequencyNormalized(
                times_per_day=3, slots=["morning", "noon", "night"], as_needed=False
            )
        elif freq_str == "SOS":
            freq_norm = FrequencyNormalized(times_per_day=None, slots=[], as_needed=True)

        med_obj = Medicine(
            id=med_id,
            name=ExtractedField(
                value=drug_name_str,
                raw=drug_name_str,
                status="found",
                confidence=0.98,
                evidence_line_ids=[evidence_line_id],
            ),
            strength=ExtractedField(
                value=strength_val,
                raw=strength_val,
                status=strength_status,
                confidence=strength_conf,
                evidence_line_ids=[evidence_line_id] if strength_val else [],
            ),
            form=ExtractedField(
                value=drug_form,
                raw="Tab",
                status="found",
                confidence=0.97,
                evidence_line_ids=[evidence_line_id],
            ),
            dose=ExtractedField(
                value="1 unit",
                raw="1",
                status="found",
                confidence=0.95,
                evidence_line_ids=[evidence_line_id],
            ),
            frequency=ExtractedField(
                value=None
                if (corruption_type == "smudged_frequency" and is_this_med_corrupted)
                else freq_str,
                raw="[???]"
                if (corruption_type == "smudged_frequency" and is_this_med_corrupted)
                else freq_str,
                status="unclear"
                if (corruption_type == "smudged_frequency" and is_this_med_corrupted)
                else "found",
                confidence=0.2
                if (corruption_type == "smudged_frequency" and is_this_med_corrupted)
                else 0.95,
                evidence_line_ids=[evidence_line_id],
            ),
            timing=ExtractedField(
                value=timing_str,
                raw=timing_str,
                status="found",
                confidence=0.93,
                evidence_line_ids=[evidence_line_id],
            ),
            duration=ExtractedField(
                value=duration_str,
                raw=duration_str,
                status="conflict"
                if (corruption_type == "quantity_duration_conflict" and is_this_med_corrupted)
                else "found",
                confidence=0.95,
                evidence_line_ids=[evidence_line_id],
            ),
            instructions=ExtractedField(
                value=instructions_str,
                raw=instructions_str,
                status="found",
                confidence=0.92,
                evidence_line_ids=[evidence_line_id],
            ),
            frequency_normalized=freq_norm,
            suggestions=[],
            status=medicine_status,
        )
        medicines.append(med_obj)

    # 4. Follow-up Footer
    y_cursor = max(y_cursor + 40, 1150)
    draw.line([(100, y_cursor), (1100, y_cursor)], fill=(180, 180, 180), width=1)
    y_cursor += 30

    follow_up_text = (
        "மறுபரிசோதனை: 4 வாரங்களுக்குப் பின் ஆய்வக அறிக்கைகளுடன் வரவும் / Follow up in 4 weeks."
        if (is_tamil or is_bilingual)
        else "Follow up in 4 weeks with fasting lab reports."
    )
    render_line(120, y_cursor, follow_up_text, body_bold, (40, 40, 40))
    follow_up_line_id = f"L{line_counter - 1}"

    # Signature line
    draw.line([(850, 1420), (1080, 1420)], fill=(80, 80, 80), width=1)
    render_line(860, 1430, "Doctor's Signature / முத்திரை", small_font, (90, 90, 90))

    # Apply ink smudge if requested
    if smudge_bbox:
        draw_smudge(image, smudge_bbox)

    # Apply image transformations (rotation & noise)
    rotation_angle = random.uniform(-2.2, 2.2) if idx % 2 == 0 else 0.0
    image = add_image_artifacts(image, rotation_angle)

    # 5. Assemble ExtractionResult
    overall_status = "needs_review" if flags else "ready"

    corruption_meta: dict[str, Any] | None = None
    if corruption_type:
        corruption_meta = {
            "is_corrupted": True,
            "type": corruption_type,
            "corrupted_fields": corrupted_fields,
            "description": f"Deliberate test defect: {corruption_type}",
        }

    extraction_result = ExtractionResult(
        request_id=req_id,
        document_id=doc_id,
        source=DocumentSource(type="image", page_count=1),
        ocr=OcrResult(engine="synthetic_ground_truth", lines=lines),
        prescriber=PrescriberInfo(
            name=ExtractedField(
                value=doctor_name.split(",")[0],
                raw=doctor_name,
                status="found",
                confidence=0.98,
                evidence_line_ids=["L3"],
            ),
            registration_no=ExtractedField(
                value=doc_reg,
                raw=doc_reg,
                status="found",
                confidence=0.99,
                evidence_line_ids=["L4"],
            ),
            hospital=ExtractedField(
                value=clinic["name_en"],
                raw=clinic_title,
                status="found",
                confidence=0.97,
                evidence_line_ids=["L1"],
            ),
            date=ExtractedField(
                value=date_str,
                raw=date_str,
                status="found",
                confidence=0.97,
                evidence_line_ids=["L5"],
            ),
        ),
        patient=PatientInfo(
            name=ExtractedField(
                value=pat_name,
                raw=pat_name,
                status="found",
                confidence=0.98,
                evidence_line_ids=["L5"],
            ),
            age=ExtractedField(
                value=pat_age,
                raw=pat_age,
                status="found",
                confidence=0.98,
                evidence_line_ids=["L5"],
            ),
        ),
        medicines=medicines,
        follow_up=ExtractedField(
            value=follow_up_text,
            raw=follow_up_text,
            status="found",
            confidence=0.94,
            evidence_line_ids=[follow_up_line_id],
        ),
        flags=flags,
        overall_status=overall_status,
        review_reasons=review_reasons,
        metrics=Metrics(
            latency_ms=0.0,
            model="synthetic_generator",
            tokens_in=0,
            tokens_out=0,
            gpu="CPU",
        ),
        corruption_details=corruption_meta,
    )

    manifest_record = {
        "id": doc_id,
        "image_file": f"rx_{idx:03d}.png",
        "json_file": f"rx_{idx:03d}.json",
        "language": "ta" if is_tamil else ("bilingual" if is_bilingual else "en"),
        "medicines_count": len(medicines),
        "overall_status": overall_status,
        "is_corrupted": bool(corruption_type),
        "corruption_type": corruption_type,
        "corrupted_fields": corrupted_fields,
    }

    return image, extraction_result, manifest_record


def main() -> None:
    print("CareBridge: Generating 30 synthetic prescriptions...")
    drug_catalog = load_drug_catalog()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 10 Corrupted allocations:
    # 21, 22, 23 -> missing_strength (3)
    # 24, 25 -> smudged_frequency (2)
    # 26, 27, 28 -> quantity_duration_conflict (3)
    # 29, 30 -> duplicate_drug (2)
    corruption_map: dict[int, str] = {
        21: "missing_strength",
        22: "missing_strength",
        23: "missing_strength",
        24: "smudged_frequency",
        25: "smudged_frequency",
        26: "quantity_duration_conflict",
        27: "quantity_duration_conflict",
        28: "quantity_duration_conflict",
        29: "duplicate_drug",
        30: "duplicate_drug",
    }

    manifest_entries: list[dict[str, Any]] = []

    for i in range(1, 31):
        corr_type = corruption_map.get(i)
        image, result, manifest_item = generate_single_prescription(i, drug_catalog, corr_type)

        png_path = OUTPUT_DIR / f"rx_{i:03d}.png"
        json_path = OUTPUT_DIR / f"rx_{i:03d}.json"

        # Save PNG
        image.save(png_path, "PNG", optimize=True)

        # Save JSON
        with open(json_path, "w", encoding="utf-8") as f:
            f.write(result.model_dump_json(indent=2))

        manifest_entries.append(manifest_item)
        status_tag = f"[CORRUPTED: {corr_type}]" if corr_type else "[CLEAN]"
        lang_str = manifest_item["language"]
        print(f"Generated {png_path.name} & {json_path.name} {status_tag} ({lang_str})")

    manifest = {
        "dataset_name": "carebridge_synthetic_rx_v1",
        "total_prescriptions": len(manifest_entries),
        "clean_count": sum(1 for m in manifest_entries if not m["is_corrupted"]),
        "corrupted_count": sum(1 for m in manifest_entries if m["is_corrupted"]),
        "corruption_breakdown": {
            "missing_strength": 3,
            "smudged_frequency": 2,
            "quantity_duration_conflict": 3,
            "duplicate_drug": 2,
        },
        "prescriptions": manifest_entries,
    }

    manifest_path = OUTPUT_DIR / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\nSynthetic generation complete! 30 prescriptions saved to {OUTPUT_DIR}")
    print(f"Manifest index: {manifest_path}")


if __name__ == "__main__":
    main()

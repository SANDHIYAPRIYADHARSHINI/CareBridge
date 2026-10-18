"""Prescription extraction orchestrator for CareBridge AI.

Connects Tesseract OCR, vision LLM extraction, evidence gating, frequency normalization,
and clinical verification rules to produce an ExtractionResult (RX-3 to RX-8).
"""

from __future__ import annotations

import io
import logging
import time
import uuid
from pathlib import Path
from typing import Any

from PIL import Image

from app.config import Settings, get_settings
from app.core.frequency import normalize_frequency
from app.core.llm import LLMClient
from app.core.ocr import extract_ocr_lines
from app.core.verification import apply_evidence_gate, verify_prescription_rules
from app.schemas.common import ExtractedField, Flag, Metrics, OcrLine
from app.schemas.prescription import (
    DocumentSource,
    ExtractionResult,
    ImageDimensions,
    Medicine,
    OcrResult,
    PatientInfo,
    PrescriberInfo,
)

logger = logging.getLogger("carebridge.ai.extraction")


def _read_prompt_template(settings: Settings) -> str:
    """Reads system prompt from app/prompts/extraction.md."""
    prompt_file = settings.PROMPTS_DIR / "extraction.md"
    if prompt_file.exists():
        try:
            return prompt_file.read_text(encoding="utf-8")
        except Exception as exc:
            logger.warning("Could not read prompt from %s: %s", prompt_file, exc)

    return (
        "You extract structured data from a medical prescription. You receive the page image "
        "and numbered OCR lines (L1, L2, …). Output only valid JSON matching the schema."
    )


def parse_extracted_field(data: Any) -> ExtractedField:
    """Safely normalizes arbitrary LLM dictionary or string output into an ExtractedField."""
    if isinstance(data, dict):
        status = data.get("status", "missing")
        if status not in ("found", "missing", "unclear", "conflict"):
            status = "found" if data.get("value") else "missing"

        val = data.get("value")
        val_str = str(val).strip() if val is not None else None
        if val_str == "":
            val_str = None

        raw = data.get("raw")
        raw_str = str(raw).strip() if raw is not None else val_str

        conf = 0.5
        try:
            conf = float(data.get("confidence", 0.5))
            conf = max(0.0, min(1.0, conf))
        except (ValueError, TypeError):
            conf = 0.5

        raw_ev = data.get("evidence_line_ids", [])
        if isinstance(raw_ev, list):
            evidence_ids = [str(x).strip() for x in raw_ev if str(x).strip()]
        elif isinstance(raw_ev, str) and raw_ev.strip():
            evidence_ids = [s.strip() for s in raw_ev.replace(",", " ").split() if s.strip()]
        else:
            evidence_ids = []

        return ExtractedField(
            value=val_str,
            raw=raw_str,
            status=status,
            confidence=round(conf, 2),
            evidence_line_ids=evidence_ids,
        )

    if isinstance(data, (str, int, float)) and str(data).strip():
        clean_s = str(data).strip()
        return ExtractedField(
            value=clean_s,
            raw=clean_s,
            status="found",
            confidence=0.8,
            evidence_line_ids=[],
        )

    return ExtractedField(
        value=None,
        raw=None,
        status="missing",
        confidence=0.0,
        evidence_line_ids=[],
    )


def _parse_llm_json_to_extraction(
    parsed: dict[str, Any],
    ocr_lines: list[OcrLine],
) -> tuple[PrescriberInfo, PatientInfo, list[Medicine], ExtractedField]:
    """Parses raw JSON dictionary from LLM into structured schema entities with synonyms."""
    # 1. Prescriber
    pr_data = parsed.get("prescriber", {}) if isinstance(parsed.get("prescriber"), dict) else {}
    doc_details = (
        parsed.get("doctor_details", {})
        if isinstance(parsed.get("doctor_details"), dict)
        else {}
    )
    clinic_details = (
        parsed.get("clinic_details", {})
        if isinstance(parsed.get("clinic_details"), dict)
        else {}
    )

    pr_name_raw = (
        pr_data.get("name")
        or pr_data.get("doctor_name")
        or doc_details.get("doctor_name")
    )
    pr_reg_raw = (
        pr_data.get("registration_no")
        or pr_data.get("registration_number")
        or pr_data.get("reg_no")
        or doc_details.get("registration_number")
    )
    pr_hosp_raw = (
        pr_data.get("hospital")
        or pr_data.get("clinic_name")
        or pr_data.get("clinic")
        or clinic_details.get("clinic_name")
    )
    pr_date_raw = (
        pr_data.get("date")
        or parsed.get("date")
        or (
            parsed.get("patient", {}).get("date")
            if isinstance(parsed.get("patient"), dict)
            else None
        )
    )

    prescriber = PrescriberInfo(
        name=parse_extracted_field(pr_name_raw),
        registration_no=parse_extracted_field(pr_reg_raw),
        hospital=parse_extracted_field(pr_hosp_raw),
        date=parse_extracted_field(pr_date_raw),
    )

    # 2. Patient
    pa_data = parsed.get("patient", {}) if isinstance(parsed.get("patient"), dict) else {}
    pat_details = (
        parsed.get("patient_details", {})
        if isinstance(parsed.get("patient_details"), dict)
        else {}
    )
    pa_name_raw = (
        pa_data.get("name")
        or pa_data.get("patient_name")
        or pat_details.get("patient_name")
    )
    pa_age_raw = pa_data.get("age") or pat_details.get("age")

    patient = PatientInfo(
        name=parse_extracted_field(pa_name_raw),
        age=parse_extracted_field(pa_age_raw),
    )

    # 3. Follow-up
    raw_fu = parsed.get("follow_up")
    if isinstance(raw_fu, dict):
        if "instructions" in raw_fu and isinstance(raw_fu["instructions"], (dict, str)):
            follow_up = parse_extracted_field(raw_fu["instructions"])
        elif "value" in raw_fu:
            follow_up = parse_extracted_field(raw_fu)
        else:
            fu_parts = [str(v) for k, v in raw_fu.items() if v and isinstance(v, (str, int))]
            follow_up = parse_extracted_field(" ".join(fu_parts) if fu_parts else None)
    else:
        follow_up = parse_extracted_field(raw_fu)

    # 4. Medicines
    raw_meds = parsed.get("medicines") or parsed.get("prescriptions") or []
    medicines: list[Medicine] = []
    if isinstance(raw_meds, list):
        for idx, m_dict in enumerate(raw_meds):
            if not isinstance(m_dict, dict):
                continue

            med_id = str(m_dict.get("id") or f"med-{idx + 1}")
            med_name = (
                m_dict.get("name")
                or m_dict.get("drug_name")
                or m_dict.get("medicine_name")
                or m_dict.get("medication")
            )
            med_form = m_dict.get("form") or m_dict.get("route") or m_dict.get("dosage_form")
            med_dose = m_dict.get("dose") or m_dict.get("dosage")
            med_instr = m_dict.get("instructions") or m_dict.get("directions")

            med = Medicine(
                id=med_id,
                name=parse_extracted_field(med_name),
                strength=parse_extracted_field(m_dict.get("strength")),
                form=parse_extracted_field(med_form),
                dose=parse_extracted_field(med_dose),
                frequency=parse_extracted_field(m_dict.get("frequency")),
                timing=parse_extracted_field(m_dict.get("timing")),
                duration=parse_extracted_field(m_dict.get("duration")),
                instructions=parse_extracted_field(med_instr),
                frequency_normalized=None,
                suggestions=[],
                status="needs_review",
            )
            medicines.append(med)

    return prescriber, patient, medicines, follow_up


async def extract_prescription(
    image_input: Image.Image | str | Path | bytes,
    language_hint: str | None = "auto",
    settings: Settings | None = None,
    llm_client: LLMClient | None = None,
    request_id: str | None = None,
) -> ExtractionResult:
    """Runs the complete end-to-end prescription extraction pipeline.

    Steps:
    1. Real Tesseract OCR (eng+tam) line extraction with deskewing.
    2. VLM / LLM extraction with OCR line citations.
    3. Evidence gate fuzzy verification.
    4. Frequency normalization (OD, BD, 1-0-1, Tamil phrases).
    5. Conflict rules & reference formulary verification.
    """
    start_time = time.perf_counter()
    cfg = settings or get_settings()
    req_id = request_id or f"req-{uuid.uuid4().hex[:12]}"
    doc_id = f"doc-{uuid.uuid4().hex[:12]}"

    # Determine image dimensions from input
    if isinstance(image_input, (str, Path)):
        _img_probe = Image.open(image_input)
    elif isinstance(image_input, bytes):
        _img_probe = Image.open(io.BytesIO(image_input))
    else:
        _img_probe = image_input

    image_dimensions = ImageDimensions(width=_img_probe.width, height=_img_probe.height)

    # Step 1: OCR line extraction
    ocr_lines, detected_skew = extract_ocr_lines(
        image_input,
        lang=cfg.OCR_LANGS,
        deskew=True,
    )

    if not ocr_lines:
        logger.warning("No OCR text detected on image")
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        return ExtractionResult(
            request_id=req_id,
            document_id=doc_id,
            source=DocumentSource(type="image", page_count=1),
            ocr=OcrResult(engine="tesseract", lines=[]),
            prescriber=PrescriberInfo(
                name=ExtractedField(status="missing", confidence=0.0),
                registration_no=ExtractedField(status="missing", confidence=0.0),
                hospital=ExtractedField(status="missing", confidence=0.0),
                date=ExtractedField(status="missing", confidence=0.0),
            ),
            patient=PatientInfo(
                name=ExtractedField(status="missing", confidence=0.0),
                age=ExtractedField(status="missing", confidence=0.0),
            ),
            medicines=[],
            follow_up=ExtractedField(status="missing", confidence=0.0),
            flags=[
                Flag(
                    id="flag-ocr-empty",
                    severity="block",
                    code="OCR_EMPTY",
                    message="Tesseract OCR extracted zero text lines from this document.",
                    field_path=None,
                    evidence_line_ids=[],
                )
            ],
            overall_status="unreadable",
            review_reasons=["Document is unreadable: zero text lines extracted."],
            image=image_dimensions,
            metrics=Metrics(
                latency_ms=round(elapsed_ms, 2),
                model=cfg.LLM_MODEL,
                tokens_in=0,
                tokens_out=0,
            ),
        )

    # Step 2: Format prompt with OCR lines
    ocr_lines_text = "\n".join(f"{line.id}: {line.text}" for line in ocr_lines)
    system_prompt = _read_prompt_template(cfg)

    user_prompt = (
        f"Language hint: {language_hint or 'auto'}\n\n"
        f"Numbered OCR Lines extracted from page:\n"
        f"{ocr_lines_text}\n\n"
        "Extract the prescription fields according to the schema. "
        "For each field, cite the exact evidence_line_ids (e.g. ['L1', 'L2']) where it appears. "
        "Return pure JSON."
    )

    # Step 3: LLM generation
    should_close_client = False
    client = llm_client
    if client is None:
        client = LLMClient(cfg)
        should_close_client = True

    try:
        response = await client.generate_vision(
            prompt=user_prompt,
            image=image_input,
            system_prompt=system_prompt,
            json_mode=True,
            max_tokens=3500,
        )
    finally:
        if should_close_client:
            await client.close()

    parsed_json = response.parsed_json or {}

    # Step 4: Schema mapping
    prescriber, patient, medicines, follow_up = _parse_llm_json_to_extraction(
        parsed_json, ocr_lines
    )

    # Step 5: Evidence gate validation
    ocr_lines_by_id = {line.id: line for line in ocr_lines}

    prescriber.name = apply_evidence_gate(prescriber.name, ocr_lines_by_id, "prescriber.name")
    prescriber.registration_no = apply_evidence_gate(
        prescriber.registration_no, ocr_lines_by_id, "prescriber.registration_no"
    )
    prescriber.hospital = apply_evidence_gate(
        prescriber.hospital, ocr_lines_by_id, "prescriber.hospital"
    )
    prescriber.date = apply_evidence_gate(prescriber.date, ocr_lines_by_id, "prescriber.date")

    patient.name = apply_evidence_gate(patient.name, ocr_lines_by_id, "patient.name")
    patient.age = apply_evidence_gate(patient.age, ocr_lines_by_id, "patient.age")

    follow_up = apply_evidence_gate(follow_up, ocr_lines_by_id, "follow_up")

    for idx, med in enumerate(medicines):
        med.name = apply_evidence_gate(med.name, ocr_lines_by_id, f"medicines[{idx}].name")
        med.strength = apply_evidence_gate(
            med.strength, ocr_lines_by_id, f"medicines[{idx}].strength"
        )
        med.form = apply_evidence_gate(med.form, ocr_lines_by_id, f"medicines[{idx}].form")
        med.dose = apply_evidence_gate(med.dose, ocr_lines_by_id, f"medicines[{idx}].dose")
        med.frequency = apply_evidence_gate(
            med.frequency, ocr_lines_by_id, f"medicines[{idx}].frequency"
        )
        med.timing = apply_evidence_gate(med.timing, ocr_lines_by_id, f"medicines[{idx}].timing")
        med.duration = apply_evidence_gate(
            med.duration, ocr_lines_by_id, f"medicines[{idx}].duration"
        )
        med.instructions = apply_evidence_gate(
            med.instructions, ocr_lines_by_id, f"medicines[{idx}].instructions"
        )

        # Step 6: Normalize frequency
        if med.frequency.value:
            med.frequency_normalized = normalize_frequency(med.frequency.value)

    # Step 7: Clinical conflict rules & formulary validation
    medicines, flags, overall_status, review_reasons = verify_prescription_rules(
        medicines=medicines,
        ocr_lines=ocr_lines,
    )

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0

    return ExtractionResult(
        request_id=req_id,
        document_id=doc_id,
        source=DocumentSource(type="image", page_count=1),
        ocr=OcrResult(engine="tesseract", lines=ocr_lines),
        prescriber=prescriber,
        patient=patient,
        medicines=medicines,
        follow_up=follow_up,
        flags=flags,
        overall_status=overall_status,
        review_reasons=review_reasons,
        image=image_dimensions,
        metrics=Metrics(
            latency_ms=round(elapsed_ms, 2),
            model=response.metrics.model,
            tokens_in=response.metrics.tokens_in,
            tokens_out=response.metrics.tokens_out,
            gpu=response.metrics.gpu,
        ),
    )

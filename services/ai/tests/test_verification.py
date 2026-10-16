import pytest

from app.core.verification import (
    apply_evidence_gate,
    verify_prescription_rules,
)
from app.schemas.common import ExtractedField, OcrLine
from app.schemas.prescription import FrequencyNormalized, Medicine


def make_field(
    val: str | None,
    status: str = "found",
    conf: float = 0.9,
    evidence: list[str] | None = None,
) -> ExtractedField:
    return ExtractedField(
        value=val,
        raw=val,
        status=status,
        confidence=conf,
        evidence_line_ids=evidence or [],
    )


def test_evidence_gate_supported():
    ocr_lines = {
        "L1": OcrLine(
            id="L1", text="Tab Glucostop 500mg", bbox=[10, 10, 100, 20], page=1, conf=0.95
        ),
        "L2": OcrLine(
            id="L2", text="1-0-1 after food 10 days", bbox=[10, 40, 100, 20], page=1, conf=0.90
        ),
    }

    # Exact match
    field = make_field("Glucostop", evidence=["L1"])
    verified = apply_evidence_gate(field, ocr_lines, "med.name")
    assert verified.status == "found"
    assert verified.value == "Glucostop"

    # Numeric + unit match
    field_str = make_field("500mg", evidence=["L1"])
    verified_str = apply_evidence_gate(field_str, ocr_lines, "med.strength")
    assert verified_str.status == "found"
    assert verified_str.value == "500mg"


def test_evidence_gate_unsupported_downgrade():
    ocr_lines = {
        "L1": OcrLine(
            id="L1", text="Tab Glucostop 500mg", bbox=[10, 10, 100, 20], page=1, conf=0.95
        ),
    }

    # Wrong drug hallucinated by LLM
    field = make_field("Amoxicillin", evidence=["L1"])
    verified = apply_evidence_gate(field, ocr_lines, "med.name")
    assert verified.status == "unclear"
    assert verified.value is None
    assert verified.confidence <= 0.4


def test_evidence_gate_empty_evidence_downgrade():
    ocr_lines = {
        "L1": OcrLine(
            id="L1", text="Tab Glucostop 500mg", bbox=[10, 10, 100, 20], page=1, conf=0.95
        ),
    }

    # Found field without evidence IDs
    field = make_field("Glucostop", evidence=[])
    verified = apply_evidence_gate(field, ocr_lines, "med.name")
    assert verified.status == "unclear"
    assert verified.value is None


def test_evidence_gate_invalid_line_id():
    ocr_lines = {
        "L1": OcrLine(
            id="L1", text="Tab Glucostop 500mg", bbox=[10, 10, 100, 20], page=1, conf=0.95
        ),
    }

    field = make_field("Glucostop", evidence=["L999"])
    verified = apply_evidence_gate(field, ocr_lines, "med.name")
    assert verified.status == "unclear"
    assert verified.value is None


# ---------------------------------------------------------------------------
# Conflict Rules Table-driven tests
# ---------------------------------------------------------------------------


def make_medicine(
    med_id: str,
    name: str,
    strength: str | None = "500mg",
    strength_status: str = "found",
    frequency: str = "1-0-1",
    duration: str = "10 days",
    instructions: str = "Take with water",
    freq_norm: FrequencyNormalized | None = None,
) -> Medicine:
    return Medicine(
        id=med_id,
        name=make_field(name, evidence=["L1"]),
        strength=make_field(strength, status=strength_status, evidence=["L1"] if strength else []),
        form=make_field("tablet", evidence=["L1"]),
        dose=make_field("1 tab", evidence=["L2"]),
        frequency=make_field(frequency, evidence=["L2"]),
        timing=make_field("after food", evidence=["L2"]),
        duration=make_field(duration, evidence=["L2"]),
        instructions=make_field(instructions, evidence=["L2"]),
        frequency_normalized=freq_norm
        or FrequencyNormalized(times_per_day=2, slots=["morning", "night"], as_needed=False),
        suggestions=[],
        status="needs_review",
    )


@pytest.mark.parametrize(
    "qty_str,times_per_day,duration_str,should_flag",
    [
        ("Total 20 tablets", 2, "10 days", False),  # 2 * 10 = 20 -> Matches
        ("Qty: 10", 2, "10 days", True),  # 2 * 10 = 20, but qty 10 -> Conflict!
        ("Qty: 30", 2, "10 days", True),  # 2 * 10 = 20, but qty 30 -> Conflict!
        ("10 tablets", 1, "10 days", False),  # 1 * 10 = 10 -> Matches
        ("Qty: 15", 3, "5 days", False),  # 3 * 5 = 15 -> Matches
        ("Qty: 10", None, "5 days", False),  # Frequency not structured -> No crash/flag
    ],
)
def test_quantity_vs_frequency_duration_conflict(
    qty_str: str,
    times_per_day: int | None,
    duration_str: str,
    should_flag: bool,
):
    ocr_lines = [OcrLine(id="L1", text="Sample", bbox=[0, 0, 10, 10], page=1, conf=0.9)]
    freq_norm = (
        FrequencyNormalized(times_per_day=times_per_day, slots=["morning"], as_needed=False)
        if times_per_day
        else None
    )
    med = make_medicine(
        med_id="m1",
        name="Glucostop",
        duration=duration_str,
        instructions=qty_str,
        freq_norm=freq_norm,
    )

    updated_meds, flags, overall_status, review_reasons = verify_prescription_rules(
        [med], ocr_lines
    )
    has_qty_flag = any(f.code == "QUANTITY_DURATION_MISMATCH" for f in flags)
    assert has_qty_flag == should_flag


def test_duplicate_drug_rule():
    ocr_lines = [OcrLine(id="L1", text="Sample", bbox=[0, 0, 10, 10], page=1, conf=0.9)]
    med1 = make_medicine("m1", name="Glucostop", strength="500mg")
    med2 = make_medicine("m2", name="Glucostop", strength="850mg")  # Duplicate!

    updated_meds, flags, overall_status, review_reasons = verify_prescription_rules(
        [med1, med2], ocr_lines
    )
    dup_flags = [f for f in flags if f.code == "DUPLICATE_DRUG"]
    assert len(dup_flags) == 1
    assert "Glucostop" in dup_flags[0].message
    assert overall_status == "needs_review"
    assert any("DUPLICATE_DRUG" in reason for reason in review_reasons)


def test_missing_or_unclear_strength_rule():
    ocr_lines = [OcrLine(id="L1", text="Sample", bbox=[0, 0, 10, 10], page=1, conf=0.9)]
    # Missing strength
    med1 = make_medicine("m1", name="Cardiovin", strength=None, strength_status="missing")
    updated_meds, flags, overall_status, review_reasons = verify_prescription_rules(
        [med1], ocr_lines
    )
    str_flags = [f for f in flags if f.code == "MISSING_STRENGTH"]
    assert len(str_flags) == 1
    assert overall_status == "needs_review"

    # Unclear strength
    med2 = make_medicine("m2", name="Cardiovin", strength=None, strength_status="unclear")
    updated_meds, flags, overall_status, review_reasons = verify_prescription_rules(
        [med2], ocr_lines
    )
    str_flags = [f for f in flags if f.code == "MISSING_STRENGTH"]
    assert len(str_flags) == 1


def test_unusual_strength_vs_reference():
    ocr_lines = [OcrLine(id="L1", text="Sample", bbox=[0, 0, 10, 10], page=1, conf=0.9)]
    # Glucostop standard strengths in drugs.json: 500mg, 850mg, 1000mg
    med_unusual = make_medicine("m1", name="Glucostop", strength="5000mg")
    updated_meds, flags, overall_status, review_reasons = verify_prescription_rules(
        [med_unusual], ocr_lines
    )
    unusual_flags = [f for f in flags if f.code == "UNUSUAL_STRENGTH"]
    assert len(unusual_flags) == 1
    assert "5000mg" in unusual_flags[0].message


def test_clean_prescription_verified_ready():
    ocr_lines = [OcrLine(id="L1", text="Sample", bbox=[0, 0, 10, 10], page=1, conf=0.9)]
    med1 = make_medicine(
        "m1", name="Glucostop", strength="500mg", duration="10 days", instructions="Qty: 20"
    )
    med2 = make_medicine(
        "m2", name="Cardiovin", strength="20mg", duration="30 days", instructions="Qty: 60"
    )

    updated_meds, flags, overall_status, review_reasons = verify_prescription_rules(
        [med1, med2], ocr_lines
    )
    assert len(flags) == 0
    assert overall_status == "ready"
    assert len(review_reasons) == 0
    assert all(m.status == "verified_by_rules" for m in updated_meds)

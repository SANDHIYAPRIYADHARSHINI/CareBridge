import json
from pathlib import Path

from PIL import Image

from app.schemas.prescription import ExtractionResult

DATA_DIR = Path(__file__).resolve().parent.parent / "eval" / "data"


def test_manifest_structure_and_counts():
    manifest_path = DATA_DIR / "manifest.json"
    assert manifest_path.exists(), "manifest.json not found in eval/data"

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest["total_prescriptions"] == 30
    assert manifest["clean_count"] == 20
    assert manifest["corrupted_count"] == 10
    assert manifest["corruption_breakdown"] == {
        "missing_strength": 3,
        "smudged_frequency": 2,
        "quantity_duration_conflict": 3,
        "duplicate_drug": 2,
    }
    assert len(manifest["prescriptions"]) == 30


def test_all_images_generated_and_valid():
    for i in range(1, 31):
        png_path = DATA_DIR / f"rx_{i:03d}.png"
        assert png_path.exists(), f"Image {png_path.name} missing"
        assert png_path.stat().st_size > 10_000, f"Image {png_path.name} too small"

        with Image.open(png_path) as img:
            assert img.size == (1200, 1600), f"Incorrect dimensions for {png_path.name}"
            assert img.format == "PNG"


def test_all_json_validate_extraction_result():
    for i in range(1, 31):
        json_path = DATA_DIR / f"rx_{i:03d}.json"
        assert json_path.exists(), f"JSON {json_path.name} missing"

        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)

        result = ExtractionResult.model_validate(data)
        assert result.request_id == f"req-syn-{i:03d}"
        assert result.document_id == f"doc-syn-rx-{i:03d}"
        assert 2 <= len(result.medicines) <= 4
        assert len(result.ocr.lines) >= 7

        line_ids = {line.id for line in result.ocr.lines}
        for med in result.medicines:
            for eid in med.name.evidence_line_ids:
                assert eid in line_ids, f"Evidence line {eid} not in OCR lines for {json_path.name}"


def test_clean_prescriptions_contract():
    for i in range(1, 21):
        json_path = DATA_DIR / f"rx_{i:03d}.json"
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        result = ExtractionResult.model_validate(data)

        assert result.overall_status == "ready"
        assert len(result.flags) == 0
        assert len(result.review_reasons) == 0
        assert result.corruption_details is None
        for med in result.medicines:
            assert med.status == "verified_by_rules"


def test_corrupted_prescriptions_contract():
    expected_types = {
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

    for i, exp_type in expected_types.items():
        json_path = DATA_DIR / f"rx_{i:03d}.json"
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        result = ExtractionResult.model_validate(data)

        assert result.overall_status == "needs_review"
        assert len(result.flags) >= 1
        assert len(result.review_reasons) >= 1
        assert result.corruption_details is not None
        assert result.corruption_details["is_corrupted"] is True
        assert result.corruption_details["type"] == exp_type
        assert len(result.corruption_details["corrupted_fields"]) >= 1

        # Check flag codes
        flag_codes = [f.code for f in result.flags]
        if exp_type == "missing_strength":
            assert "MISSING_STRENGTH" in flag_codes
        elif exp_type == "smudged_frequency":
            assert "UNREADABLE_FREQUENCY" in flag_codes
        elif exp_type == "quantity_duration_conflict":
            assert "QUANTITY_DURATION_CONFLICT" in flag_codes
        elif exp_type == "duplicate_drug":
            assert "DUPLICATE_DRUG" in flag_codes

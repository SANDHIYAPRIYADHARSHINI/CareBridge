from pathlib import Path

from PIL import Image

from app.core.ocr import extract_ocr_lines, map_box_to_original
from app.schemas.prescription import ExtractionResult, ImageDimensions

DEMO_DIR = Path(__file__).resolve().parent.parent.parent.parent / "demo"


def test_map_box_to_original_identity():
    box = [100, 200, 300, 50]
    mapped = map_box_to_original(box, angle=0.0, orig_size=(1200, 1600), rot_size=(1200, 1600))
    assert mapped == box


def test_map_box_to_original_small_angle():
    box = [100, 200, 300, 50]
    # Small detected rotation of 2 degrees
    mapped = map_box_to_original(box, angle=2.0, orig_size=(1200, 1600), rot_size=(1250, 1650))
    assert len(mapped) == 4
    assert mapped[0] >= 0
    assert mapped[1] >= 0
    assert mapped[2] > 0
    assert mapped[3] > 0
    assert mapped[0] + mapped[2] <= 1200
    assert mapped[1] + mapped[3] <= 1600


def test_ocr_extraction_on_rotated_demo_image():
    demo_img_path = DEMO_DIR / "rx_demo_001.png"
    assert demo_img_path.exists(), f"Demo image missing at {demo_img_path}"

    orig_img = Image.open(demo_img_path).convert("RGB")
    orig_w, orig_h = orig_img.size
    assert orig_w == 1200
    assert orig_h == 1600

    # Create a rotated copy
    rotated_img = orig_img.rotate(3, expand=True)
    rot_w, rot_h = rotated_img.size

    # Run OCR with deskew
    lines, angle = extract_ocr_lines(rotated_img, deskew=True)
    assert len(lines) > 0

    # All bounding boxes must stay within the uploaded image boundary
    for line in lines:
        x, y, w, h = line.bbox
        assert x >= 0, f"x={x} out of bounds"
        assert y >= 0, f"y={y} out of bounds"
        assert x + w <= rot_w + 10, f"x+w={x+w} exceeds image width {rot_w}"
        assert y + h <= rot_h + 10, f"y+h={y+h} exceeds image height {rot_h}"


def test_extraction_result_image_dimensions():
    sample_field = {
        "value": "Test",
        "raw": "Test",
        "status": "found",
        "confidence": 1.0,
        "evidence_line_ids": [],
    }
    missing_field = {
        "value": None,
        "raw": None,
        "status": "missing",
        "confidence": 0.0,
        "evidence_line_ids": [],
    }
    result = ExtractionResult.model_validate({
        "request_id": "req-test-dims",
        "document_id": "doc-test-dims",
        "source": {"type": "image", "page_count": 1},
        "ocr": {"engine": "tesseract", "lines": []},
        "prescriber": {
            "name": sample_field,
            "registration_no": missing_field,
            "hospital": sample_field,
            "date": sample_field,
        },
        "patient": {
            "name": sample_field,
            "age": sample_field,
        },
        "medicines": [],
        "follow_up": missing_field,
        "flags": [],
        "overall_status": "ready",
        "review_reasons": [],
        "image": {"width": 1200, "height": 1600},
        "metrics": {"latency_ms": 10.0, "model": "mock", "gpu": "none"},
    })

    assert result.image is not None
    assert isinstance(result.image, ImageDimensions)
    assert result.image.width == 1200
    assert result.image.height == 1600

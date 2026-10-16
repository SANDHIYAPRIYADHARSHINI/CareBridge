from pathlib import Path

from PIL import Image

from app.core.ocr import (
    compute_ocr_statistics,
    deskew_image,
    extract_ocr_lines,
    is_tamil_text,
)
from app.schemas.common import OcrLine

DATA_DIR = Path(__file__).resolve().parent.parent / "eval" / "data"


def test_is_tamil_text():
    assert is_tamil_text("வணக்கம்") is True
    assert is_tamil_text("அருணோதயம் சமுதாய நல மையம்") is True
    assert is_tamil_text("Tab Metformin 500mg") is False
    assert is_tamil_text("Glucostop (குளுகோஸ்டாப்)") is True
    assert is_tamil_text("12345 !@#") is False


def test_deskew_image_preserves_dimensions():
    img = Image.new("RGB", (400, 300), color="white")
    deskewed, angle = deskew_image(img)
    assert isinstance(deskewed, Image.Image)
    assert isinstance(angle, float)


def test_extract_ocr_lines_from_synthetic():
    sample_img_path = DATA_DIR / "rx_001.png"
    assert sample_img_path.exists(), "rx_001.png missing from eval/data"

    lines, angle = extract_ocr_lines(sample_img_path, deskew=True)
    assert len(lines) >= 5
    assert all(isinstance(line, OcrLine) for line in lines)
    assert lines[0].id == "L1"
    assert all(len(line.bbox) == 4 for line in lines)
    assert all(line.bbox[2] > 0 and line.bbox[3] > 0 for line in lines)
    assert all(0.0 <= line.conf <= 1.0 for line in lines)


def test_compute_ocr_statistics():
    lines1 = [
        OcrLine(id="L1", text="Clinic Name", bbox=[10, 10, 100, 20], page=1, conf=0.9),
        OcrLine(id="L2", text="Tab Glucostop", bbox=[10, 40, 100, 20], page=1, conf=0.8),
    ]
    lines2 = [
        OcrLine(id="L1", text="அருணோதயம்", bbox=[10, 10, 100, 20], page=1, conf=0.95),
        OcrLine(id="L2", text="1-0-1 உணவுக்குப் பின்", bbox=[10, 40, 100, 20], page=1, conf=0.85),
    ]

    stats = compute_ocr_statistics([lines1, lines2])
    assert stats["total_prescriptions"] == 2
    assert stats["total_lines"] == 4
    assert stats["mean_confidence"] == 0.875
    assert stats["tamil_lines_count"] == 2
    assert stats["tamil_lines_pct"] == 50.0

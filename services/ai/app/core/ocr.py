"""Optical Character Recognition (OCR) module for CareBridge AI.

Performs Tesseract OCR (eng+tam) line-level extraction, bounding box computation,
image deskewing, and Tamil Unicode script detection.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any

from PIL import Image

try:
    import pytesseract
except ImportError:
    pytesseract = None  # type: ignore

from app.schemas.common import OcrLine

logger = logging.getLogger("carebridge.ai.ocr")

# Tamil Unicode range: U+0B80 to U+0BFF
TAMIL_CHAR_PATTERN = re.compile(r"[\u0B80-\u0BFF]")

STANDARD_TESSERACT_WINDOWS_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
]


def find_tesseract_binary() -> str | None:
    """Finds tesseract executable on the host system.

    Checks TESSERACT_CMD in environment or Settings first, then system PATH,
    and finally common Windows installation paths.
    """
    env_cmd = os.environ.get("TESSERACT_CMD")
    if not env_cmd:
        try:
            from app.config import get_settings

            env_cmd = get_settings().TESSERACT_CMD
        except Exception:
            pass

    if env_cmd and Path(env_cmd).exists():
        return str(Path(env_cmd).resolve())

    which_cmd = shutil.which("tesseract")
    if which_cmd:
        return which_cmd

    for candidate in STANDARD_TESSERACT_WINDOWS_PATHS:
        if Path(candidate).exists():
            return candidate

    return None


def init_tesseract() -> bool:
    """Initializes pytesseract with the discovered binary."""
    if pytesseract is None:
        return False

    bin_path = find_tesseract_binary()
    if bin_path:
        pytesseract.pytesseract.tesseract_cmd = bin_path
        return True
    return False


def validate_tesseract(lang: str = "eng+tam") -> str:
    """Validates that Tesseract OCR binary and requested language packs are present.

    Raises:
        RuntimeError: If Tesseract is not installed, binary is not found,
                      or any required language pack (such as 'tam') is missing.

    Returns:
        str: Installed Tesseract engine version string.
    """
    if pytesseract is None:
        raise RuntimeError(
            "The 'pytesseract' package is not installed. "
            "Please install it with 'pip install pytesseract'."
        )

    bin_path = find_tesseract_binary()
    if not bin_path:
        raise RuntimeError(
            "Tesseract OCR binary not found. Set TESSERACT_CMD in environment or .env, "
            "or ensure Tesseract is installed and available in PATH."
        )

    pytesseract.pytesseract.tesseract_cmd = bin_path

    try:
        engine_version = str(pytesseract.get_tesseract_version())
    except Exception as exc:
        raise RuntimeError(f"Failed to execute Tesseract binary at '{bin_path}': {exc}") from exc

    try:
        installed_langs = pytesseract.get_languages()
    except Exception as exc:
        raise RuntimeError(
            f"Failed to query available languages from Tesseract at '{bin_path}': {exc}"
        ) from exc

    required_langs = [item.strip() for item in lang.split("+") if item.strip()]
    missing_langs = [item for item in required_langs if item not in installed_langs]

    if missing_langs:
        raise RuntimeError(
            f"Tesseract is missing required language pack(s): {missing_langs}. "
            f"Installed languages: {installed_langs}. "
            f"Please install the missing language pack (e.g., 'tam' for Tamil)."
        )

    return engine_version


def is_tamil_text(text: str) -> bool:
    """Returns True if the string contains at least one Tamil Unicode character."""
    return bool(TAMIL_CHAR_PATTERN.search(text))


def deskew_image(image: Image.Image) -> tuple[Image.Image, float]:
    """Detects image orientation/skew and returns (deskewed_image, angle_degrees)."""
    has_tess = init_tesseract()
    angle = 0.0

    if has_tess and pytesseract is not None:
        try:
            # Use Tesseract Orientation and Script Detection (OSD)
            osd = pytesseract.image_to_osd(image)
            for line in osd.splitlines():
                if "Rotate:" in line or "Orientation in degrees:" in line:
                    angle = float(line.split(":")[-1].strip())
                    break
        except Exception as exc:
            logger.debug("OSD deskew detection skipped: %s", exc)

    if abs(angle) > 0.5:
        # Rotate back by the detected angle
        deskewed = image.rotate(-angle, resample=Image.Resampling.BILINEAR, expand=True)
        return deskewed, angle

    return image, 0.0


def extract_ocr_lines(
    image_input: Image.Image | str | Path,
    lang: str = "eng+tam",
    deskew: bool = True,
) -> tuple[list[OcrLine], float]:
    """Runs OCR on an image and returns (list[OcrLine], detected_skew_angle).

    Each OcrLine has a sequential ID (L1, L2, ...), combined text, merged bounding box,
    and average word confidence.

    Raises:
        RuntimeError: If Tesseract binary or required language pack is missing.
    """
    validate_tesseract(lang=lang)

    if isinstance(image_input, (str, Path)):
        image = Image.open(image_input).convert("RGB")
    else:
        image = image_input.convert("RGB")

    detected_angle = 0.0
    if deskew:
        image, detected_angle = deskew_image(image)

    data = pytesseract.image_to_data(
        image,
        lang=lang,
        output_type=pytesseract.Output.DICT,
    )

    # Aggregate words into lines using (block_num, par_num, line_num)
    line_groups: dict[tuple[int, int, int], list[dict[str, Any]]] = {}
    n_boxes = len(data["text"])

    for i in range(n_boxes):
        text = str(data["text"][i]).strip()
        if not text:
            continue

        block = int(data["block_num"][i])
        par = int(data["par_num"][i])
        line = int(data["line_num"][i])
        key = (block, par, line)

        item = {
            "text": text,
            "left": int(data["left"][i]),
            "top": int(data["top"][i]),
            "width": int(data["width"][i]),
            "height": int(data["height"][i]),
            "conf": max(0.0, float(data["conf"][i])),
        }
        line_groups.setdefault(key, []).append(item)

    ocr_lines: list[OcrLine] = []
    line_idx = 1

    for _key, words in line_groups.items():
        if not words:
            continue

        combined_text = " ".join(w["text"] for w in words).strip()
        if not combined_text:
            continue

        min_x = min(w["left"] for w in words)
        min_y = min(w["top"] for w in words)
        max_x = max(w["left"] + w["width"] for w in words)
        max_y = max(w["top"] + w["height"] for w in words)

        bbox = [min_x, min_y, max(1, max_x - min_x), max(1, max_y - min_y)]
        avg_conf = sum(w["conf"] for w in words) / (len(words) * 100.0)
        avg_conf = round(min(1.0, max(0.0, avg_conf)), 2)

        ocr_lines.append(
            OcrLine(
                id=f"L{line_idx}",
                text=combined_text,
                bbox=bbox,
                page=1,
                conf=avg_conf,
            )
        )
        line_idx += 1

    return ocr_lines, detected_angle


def compute_ocr_statistics(
    all_prescription_lines: list[list[OcrLine]],
    engine_version: str | None = None,
) -> dict[str, Any]:
    """Computes summary metrics across a collection of prescription OCR outputs."""
    total_prescriptions = len(all_prescription_lines)
    all_lines = [line for lines in all_prescription_lines for line in lines]
    total_lines = len(all_lines)
    zero_line_images_count = sum(1 for lines in all_prescription_lines if len(lines) == 0)

    if total_lines == 0:
        res: dict[str, Any] = {
            "total_prescriptions": total_prescriptions,
            "total_lines": 0,
            "mean_confidence": 0.0,
            "tamil_lines_count": 0,
            "tamil_lines_pct": 0.0,
            "zero_line_images_count": zero_line_images_count,
        }
        if engine_version:
            res["engine_version"] = engine_version
        return res

    mean_conf = sum(line_item.conf for line_item in all_lines) / total_lines
    tamil_lines = [line_item for line_item in all_lines if is_tamil_text(line_item.text)]
    tamil_count = len(tamil_lines)
    tamil_pct = (tamil_count / total_lines) * 100.0

    res = {
        "total_prescriptions": total_prescriptions,
        "total_lines": total_lines,
        "mean_confidence": round(mean_conf, 4),
        "tamil_lines_count": tamil_count,
        "tamil_lines_pct": round(tamil_pct, 2),
        "zero_line_images_count": zero_line_images_count,
    }
    if engine_version:
        res["engine_version"] = engine_version
    return res

#!/usr/bin/env python3
"""Overlay verification script for CareBridge AI.

Runs real Tesseract OCR on the 5 demo prescription PNGs, draws every OCR line box onto a
copy of the image, saves the copies to services/ai/eval/results/overlay/, and computes
the Intersection-over-Union (IoU) of each ground-truth line against its best-matching OCR line.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

# Add services/ai to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.core.ocr import extract_ocr_lines  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("overlay_check")

DEMO_DIR = BASE_DIR.parent.parent / "demo"
OUTPUT_DIR = BASE_DIR / "eval" / "results" / "overlay"


def compute_iou(box_a: list[int], box_b: list[int]) -> float:
    """Computes Intersection over Union between two [x, y, w, h] boxes."""
    xa1, ya1, wa, ha = box_a
    xb1, yb1, wb, hb = box_b

    xa2, ya2 = xa1 + wa, ya1 + ha
    xb2, yb2 = xb1 + wb, yb1 + hb

    inter_x1 = max(xa1, xb1)
    inter_y1 = max(ya1, yb1)
    inter_x2 = min(xa2, xb2)
    inter_y2 = min(ya2, yb2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = max(1, wa * ha)
    area_b = max(1, wb * hb)
    union_area = area_a + area_b - inter_area

    return round(inter_area / union_area, 4) if union_area > 0 else 0.0


def run_overlay_check() -> dict[str, Any]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    demo_indices = ["001", "002", "003", "004", "005"]
    summary_report: dict[str, Any] = {
        "prescriptions": [],
        "overall_mean_iou": 0.0,
    }
    all_ious: list[float] = []

    print("=" * 80)
    print("CareBridge AI - Real Tesseract OCR Overlay & IoU Verification")
    print("=" * 80)

    # Try to load a truetype font or fallback to default
    try:
        font = ImageFont.truetype("arial.ttf", 16)
        label_font = ImageFont.truetype("arial.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
        label_font = ImageFont.load_default()

    for idx_str in demo_indices:
        png_path = DEMO_DIR / f"rx_demo_{idx_str}.png"
        json_path = DEMO_DIR / f"rx_demo_{idx_str}.json"

        if not png_path.exists() or not json_path.exists():
            logger.warning("Skipping missing demo file: %s", png_path)
            continue

        with open(json_path, encoding="utf-8") as f:
            gt_data = json.load(f)

        gt_lines: list[dict[str, Any]] = gt_data.get("ocr", {}).get("lines", [])
        orig_img = Image.open(png_path).convert("RGB")
        w_orig, h_orig = orig_img.size

        # Run real Tesseract OCR
        detected_lines, skew_angle = extract_ocr_lines(png_path, lang="eng+tam", deskew=True)

        # Create overlay image
        overlay_img = orig_img.copy()
        draw = ImageDraw.Draw(overlay_img)

        # Draw detected OCR line boxes (amber outline with yellow highlighter fill)
        for d_line in detected_lines:
            dx, dy, dw, dh = d_line.bbox
            # Semi-transparent highlighter fill
            draw.rectangle(
                [dx, dy, dx + dw, dy + dh],
                outline=(11, 95, 90, 255),  # Teal border
                width=2,
            )

        # Compare ground truth lines with detected lines
        line_results = []
        for gt in gt_lines:
            gt_box = gt["bbox"]
            best_iou = 0.0
            best_det_text = ""
            best_det_id = ""

            for det in detected_lines:
                iou = compute_iou(gt_box, det.bbox)
                if iou > best_iou:
                    best_iou = iou
                    best_det_text = det.text
                    best_det_id = det.id

            all_ious.append(best_iou)
            line_results.append({
                "gt_id": gt["id"],
                "gt_text": gt["text"],
                "gt_bbox": gt_box,
                "best_det_id": best_det_id,
                "best_det_text": best_det_text,
                "iou": best_iou,
            })

            # Draw ground-truth label in small badge
            gx, gy, gw, gh = gt_box
            draw.rectangle(
                [gx - 3, gy - 16, gx + 45, gy],
                fill=(255, 213, 74, 230),  # Yellow highlighter tag
            )
            draw.text((gx, gy - 15), gt["id"], fill=(23, 35, 31), font=label_font)

        mean_rx_iou = sum(lr["iou"] for lr in line_results) / max(1, len(line_results))

        # Save annotated image
        out_overlay_path = OUTPUT_DIR / f"rx_demo_{idx_str}_overlay.png"
        overlay_img.save(out_overlay_path)

        rx_summary = {
            "prescription": f"rx_demo_{idx_str}.png",
            "image_size": [w_orig, h_orig],
            "skew_detected": skew_angle,
            "gt_line_count": len(gt_lines),
            "detected_line_count": len(detected_lines),
            "mean_iou": round(mean_rx_iou, 4),
            "overlay_path": str(out_overlay_path),
            "lines": line_results,
        }
        summary_report["prescriptions"].append(rx_summary)

        print(f"\n[rx_demo_{idx_str}.png] ({w_orig}x{h_orig}) - Mean Line IoU: {mean_rx_iou:.2%}")
        print("-" * 80)
        print(f"{'Line':<6} | {'GT Text':<36} | {'Best Match':<24} | {'IoU':<6}")
        print("-" * 80)
        for lr in line_results:
            gt_t = (lr['gt_text'][:33] + '...') if len(lr['gt_text']) > 36 else lr['gt_text']
            dt_t = (lr['best_det_text'][:21] + '...') if len(lr['best_det_text']) > 24 else lr['best_det_text']
            print(f"{lr['gt_id']:<6} | {gt_t:<36} | {dt_t:<24} | {lr['iou']:.2f}")

    overall_mean = sum(all_ious) / max(1, len(all_ious))
    summary_report["overall_mean_iou"] = round(overall_mean, 4)

    # Save JSON report
    report_path = OUTPUT_DIR / "overlay_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(summary_report, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 80)
    print(f"Overall Mean IoU across all demo lines: {overall_mean:.2%}")
    print(f"Saved 5 overlay images and report to: {OUTPUT_DIR}")
    print("=" * 80)

    return summary_report


if __name__ == "__main__":
    run_overlay_check()

"""OCR evaluation script across all 30 synthetic prescriptions.

Runs OCR extraction on eval/data/rx_001.png ... rx_030.png, tracks lines,
bounding boxes, and Tamil Unicode lines, and computes mean OCR confidence.
Saves results to eval/results/ocr_eval.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core.ocr import (  # noqa: E402
    compute_ocr_statistics,
    extract_ocr_lines,
    is_tamil_text,
)
from app.schemas.common import OcrLine  # noqa: E402

DATA_DIR = BASE_DIR / "eval" / "data"
RESULTS_DIR = BASE_DIR / "eval" / "results"


def evaluate_dataset() -> dict[str, Any]:
    print("=" * 70)
    print("CareBridge AI: OCR Evaluation across 30 Synthetic Prescriptions")
    print("=" * 70)

    if not DATA_DIR.exists():
        print(f"Error: Dataset directory {DATA_DIR} does not exist.")
        sys.exit(1)

    all_prescriptions_lines: list[list[OcrLine]] = []
    per_image_results: list[dict[str, Any]] = []

    header = (
        f"{'Image':<12} | {'Lines':<6} | {'Mean Conf':<10} | "
        f"{'Tamil Lines':<12} | {'Skew (deg)':<10}"
    )
    print(header)
    print("-" * 60)

    for i in range(1, 31):
        img_name = f"rx_{i:03d}.png"
        img_path = DATA_DIR / img_name

        if not img_path.exists():
            print(f"Warning: {img_name} not found, skipping.")
            continue

        lines, skew_angle = extract_ocr_lines(img_path, deskew=True)
        all_prescriptions_lines.append(lines)

        tamil_lines = [line_item for line_item in lines if is_tamil_text(line_item.text)]
        mean_conf = (
            sum(line_item.conf for line_item in lines) / len(lines) if lines else 0.0
        )

        item_result = {
            "image": img_name,
            "total_lines": len(lines),
            "mean_confidence": round(mean_conf, 4),
            "tamil_lines": len(tamil_lines),
            "detected_skew_deg": round(skew_angle, 2),
        }
        per_image_results.append(item_result)

        print(
            f"{img_name:<12} | {len(lines):<6} | {mean_conf:<10.3f} | "
            f"{len(tamil_lines):<12} | {skew_angle:<10.1f}"
        )

    summary_stats = compute_ocr_statistics(all_prescriptions_lines)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    report_payload = {
        "summary": summary_stats,
        "details": per_image_results,
    }

    out_file = RESULTS_DIR / "ocr_eval.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report_payload, f, indent=2, ensure_ascii=False)

    print("=" * 70)
    print("SUMMARY OCR EVALUATION METRICS:")
    print(f"Total Prescriptions Evaluated: {summary_stats['total_prescriptions']}")
    print(f"Total Lines Extracted:         {summary_stats['total_lines']}")
    mean_pct = summary_stats['mean_confidence'] * 100
    print(f"Overall Mean OCR Confidence:   {mean_pct:.2f}% ({summary_stats['mean_confidence']})")
    tam_cnt = summary_stats['tamil_lines_count']
    tot_lines = summary_stats['total_lines']
    print(f"Tamil Lines Count:             {tam_cnt} / {tot_lines}")
    print(f"Tamil Lines Percentage:        {summary_stats['tamil_lines_pct']:.2f}%")
    print(f"Results saved to:              {out_file}")
    print("=" * 70)

    return summary_stats


if __name__ == "__main__":
    evaluate_dataset()

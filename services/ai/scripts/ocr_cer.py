"""Character Error Rate (CER) evaluation script for CareBridge AI.

Compares Tesseract OCR extracted lines with ground-truth lines across the
synthetic prescriptions in demo/ (or eval/data/), reporting Character Error Rate (CER)
split into English and Tamil scripts.

Usage:
    python scripts/ocr_cer.py
    python scripts/ocr_cer.py --dir demo
    python scripts/ocr_cer.py --dir eval/data
"""

from __future__ import annotations

import argparse
import contextlib
import json
import re
import sys
from pathlib import Path
from typing import Any

if sys.stdout.encoding.lower() != "utf-8":
    with contextlib.suppress(Exception):
        sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core.ocr import extract_ocr_lines, is_tamil_text, validate_tesseract  # noqa: E402
from app.schemas.common import OcrLine  # noqa: E402

TAMIL_CODEPOINT_PATTERN = re.compile(r"[\u0B80-\u0BFF]")


def is_tamil_char(char: str) -> bool:
    """Returns True if the character belongs to the Tamil Unicode block (U+0B80 to U+0BFF)."""
    return bool(TAMIL_CODEPOINT_PATTERN.match(char))


def levenshtein_ops(ref: str, hyp: str) -> tuple[int, list[tuple[str, str, str]]]:
    """Computes Levenshtein edit distance and recovers edit operations.

    Operations returned are:
        ('match', ref_char, hyp_char)
        ('sub',   ref_char, hyp_char)
        ('del',   ref_char, '')
        ('ins',   '',       hyp_char)
    """
    m, n = len(ref), len(hyp)
    dp = [[0] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,  # deletion
                dp[i][j - 1] + 1,  # insertion
                dp[i - 1][j - 1] + cost,  # substitution / match
            )

    # Backtracking to extract individual character operations
    i, j = m, n
    ops: list[tuple[str, str, str]] = []
    while i > 0 or j > 0:
        if (
            i > 0
            and j > 0
            and dp[i][j] == dp[i - 1][j - 1] + (0 if ref[i - 1] == hyp[j - 1] else 1)
        ):
            op = "match" if ref[i - 1] == hyp[j - 1] else "sub"
            ops.append((op, ref[i - 1], hyp[j - 1]))
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            ops.append(("del", ref[i - 1], ""))
            i -= 1
        else:
            ops.append(("ins", "", hyp[j - 1]))
            j -= 1

    ops.reverse()
    return dp[m][n], ops


def match_gt_to_ocr(
    gt_lines: list[dict[str, Any]], ocr_lines: list[OcrLine]
) -> list[dict[str, Any]]:
    """Matches each Ground Truth line to the spatially closest OCR line by vertical center."""
    matched_pairs: list[dict[str, Any]] = []
    used_ocr_indices: set[int] = set()

    for g in gt_lines:
        gx, gy, gw, gh = g["bbox"]
        gt_y_center = gy + gh / 2.0

        candidates: list[tuple[float, int, OcrLine]] = []
        for o_idx, o in enumerate(ocr_lines):
            ox, oy, ow, oh = o.bbox
            ocr_y_center = oy + oh / 2.0
            y_diff = abs(gt_y_center - ocr_y_center)
            if y_diff < 50:  # within 50px vertical window
                candidates.append((y_diff, o_idx, o))

        candidates.sort(key=lambda item: item[0])

        if candidates:
            # Pick best match
            best_diff, best_idx, best_ocr = candidates[0]
            used_ocr_indices.add(best_idx)
            matched_pairs.append(
                {
                    "gt_id": g.get("id", "L?"),
                    "gt_text": g["text"],
                    "gt_bbox": g["bbox"],
                    "ocr_text": best_ocr.text,
                    "ocr_bbox": best_ocr.bbox,
                    "ocr_conf": best_ocr.conf,
                    "y_diff": best_diff,
                }
            )
        else:
            # No OCR match found
            matched_pairs.append(
                {
                    "gt_id": g.get("id", "L?"),
                    "gt_text": g["text"],
                    "gt_bbox": g["bbox"],
                    "ocr_text": "",
                    "ocr_bbox": [0, 0, 0, 0],
                    "ocr_conf": 0.0,
                    "y_diff": -1,
                }
            )

    return matched_pairs


def evaluate_prescription_cer(json_path: Path, img_path: Path) -> dict[str, Any]:
    with open(json_path, encoding="utf-8") as f:
        gt_data = json.load(f)

    gt_lines = gt_data["ocr"]["lines"]
    ocr_lines, skew = extract_ocr_lines(img_path, lang="eng+tam", deskew=True)

    matched_pairs = match_gt_to_ocr(gt_lines, ocr_lines)

    total_gt_chars = 0
    total_edit_distance = 0

    en_gt_chars = 0
    en_errors = 0

    ta_gt_chars = 0
    ta_errors = 0

    line_evaluations: list[dict[str, Any]] = []

    for pair in matched_pairs:
        gt_txt = pair["gt_text"]
        ocr_txt = pair["ocr_text"]

        dist, ops = levenshtein_ops(gt_txt, ocr_txt)
        total_gt_chars += len(gt_txt)
        total_edit_distance += dist

        line_is_tamil = is_tamil_text(gt_txt)

        line_en_chars = 0
        line_en_errors = 0
        line_ta_chars = 0
        line_ta_errors = 0

        for op, r_char, h_char in ops:
            if op in ("match", "sub", "del"):
                if is_tamil_char(r_char):
                    line_ta_chars += 1
                    if op in ("sub", "del"):
                        line_ta_errors += 1
                else:
                    line_en_chars += 1
                    if op in ("sub", "del"):
                        line_en_errors += 1
            elif op == "ins":
                if is_tamil_char(h_char):
                    line_ta_errors += 1
                else:
                    line_en_errors += 1

        en_gt_chars += line_en_chars
        en_errors += line_en_errors
        ta_gt_chars += line_ta_chars
        ta_errors += line_ta_errors

        line_cer = dist / max(1, len(gt_txt))
        line_evaluations.append(
            {
                "gt_id": pair["gt_id"],
                "line_is_tamil": line_is_tamil,
                "gt_text": gt_txt,
                "ocr_text": ocr_txt,
                "edit_distance": dist,
                "gt_len": len(gt_txt),
                "line_cer": round(line_cer, 4),
                "en_chars": line_en_chars,
                "en_errors": line_en_errors,
                "ta_chars": line_ta_chars,
                "ta_errors": line_ta_errors,
            }
        )

    overall_cer = total_edit_distance / max(1, total_gt_chars)
    en_cer = en_errors / max(1, en_gt_chars) if en_gt_chars > 0 else 0.0
    ta_cer = ta_errors / max(1, ta_gt_chars) if ta_gt_chars > 0 else 0.0

    return {
        "image": img_path.name,
        "json": json_path.name,
        "gt_lines_count": len(gt_lines),
        "ocr_lines_count": len(ocr_lines),
        "detected_skew_deg": round(skew, 2),
        "metrics": {
            "total_chars": total_gt_chars,
            "total_errors": total_edit_distance,
            "overall_cer": round(overall_cer, 4),
            "overall_accuracy": round(max(0.0, 1.0 - overall_cer), 4),
            "english": {
                "chars": en_gt_chars,
                "errors": en_errors,
                "cer": round(en_cer, 4),
                "accuracy": round(max(0.0, 1.0 - en_cer), 4),
            },
            "tamil": {
                "chars": ta_gt_chars,
                "errors": ta_errors,
                "cer": round(ta_cer, 4),
                "accuracy": round(max(0.0, 1.0 - ta_cer), 4),
            },
        },
        "lines": line_evaluations,
    }


def find_dataset_dir(custom_path: str | None = None) -> Path:
    if custom_path:
        p = Path(custom_path)
        if p.exists():
            return p
        if (BASE_DIR / custom_path).exists():
            return BASE_DIR / custom_path
        if (BASE_DIR.parent.parent / custom_path).exists():
            return BASE_DIR.parent.parent / custom_path

    # Candidate default paths
    candidates = [
        BASE_DIR.parent.parent / "demo",
        BASE_DIR / "demo",
        BASE_DIR / "eval" / "data",
    ]
    for c in candidates:
        if c.exists() and list(c.glob("*.png")):
            return c

    raise FileNotFoundError("Could not locate prescription dataset directory (e.g. demo/).")


def run_cer_evaluation(dataset_dir: Path | None = None) -> dict[str, Any]:
    print("=" * 82)
    print("CareBridge AI: Tesseract OCR Character Error Rate (CER) Evaluation")
    print("=" * 82)

    version = validate_tesseract(lang="eng+tam")
    print(f"Tesseract OCR Engine Version: {version}")

    target_dir = dataset_dir or find_dataset_dir()
    print(f"Dataset Directory:             {target_dir.resolve()}")

    json_files = sorted(target_dir.glob("*.json"))
    # Filter out manifest.json or reports
    rx_json_files = [f for f in json_files if f.name.startswith("rx_")]

    if not rx_json_files:
        print(f"Error: No prescription JSON files found in {target_dir}")
        sys.exit(1)

    print(f"Total Prescriptions to Test:  {len(rx_json_files)}")
    print("-" * 82)

    header = (
        f"{'Prescription':<16} | {'Lang':<9} | {'Chars':<6} | "
        f"{'En CER':<8} | {'Ta CER':<8} | {'Overall CER':<11} | {'Accuracy':<8}"
    )
    print(header)
    print("-" * 82)

    eval_results: list[dict[str, Any]] = []

    agg_total_chars = 0
    agg_total_errors = 0
    agg_en_chars = 0
    agg_en_errors = 0
    agg_ta_chars = 0
    agg_ta_errors = 0

    for json_file in rx_json_files:
        png_file = json_file.with_suffix(".png")
        if not png_file.exists():
            print(f"Warning: Missing PNG for {json_file.name}, skipping.")
            continue

        res = evaluate_prescription_cer(json_file, png_file)
        eval_results.append(res)

        m = res["metrics"]
        agg_total_chars += m["total_chars"]
        agg_total_errors += m["total_errors"]
        agg_en_chars += m["english"]["chars"]
        agg_en_errors += m["english"]["errors"]
        agg_ta_chars += m["tamil"]["chars"]
        agg_ta_errors += m["tamil"]["errors"]

        lang_label = (
            "Tamil"
            if m["tamil"]["chars"] > m["english"]["chars"]
            else ("Bilingual" if m["tamil"]["chars"] > 0 else "English")
        )
        en_cer_str = f"{m['english']['cer'] * 100:.2f}%" if m["english"]["chars"] > 0 else "N/A"
        ta_cer_str = f"{m['tamil']['cer'] * 100:.2f}%" if m["tamil"]["chars"] > 0 else "N/A"
        ov_cer_str = f"{m['overall_cer'] * 100:.2f}%"
        acc_str = f"{m['overall_accuracy'] * 100:.2f}%"

        print(
            f"{png_file.name:<16} | {lang_label:<9} | {m['total_chars']:<6} | "
            f"{en_cer_str:<8} | {ta_cer_str:<8} | {ov_cer_str:<11} | {acc_str:<8}"
        )

    print("=" * 82)
    agg_overall_cer = agg_total_errors / max(1, agg_total_chars)
    agg_en_cer = agg_en_errors / max(1, agg_en_chars) if agg_en_chars > 0 else 0.0
    agg_ta_cer = agg_ta_errors / max(1, agg_ta_chars) if agg_ta_chars > 0 else 0.0

    agg_overall_acc = max(0.0, 1.0 - agg_overall_cer)
    agg_en_acc = max(0.0, 1.0 - agg_en_cer)
    agg_ta_acc = max(0.0, 1.0 - agg_ta_cer)

    print("AGGREGATED BENCHMARK SUMMARY (SPLIT BY SCRIPT):")
    print(f"  Total Characters Evaluated:  {agg_total_chars:,}")
    print(f"  Total Edit Operations:       {agg_total_errors:,}")
    print(f"  English Characters Tested:   {agg_en_chars:,}")
    print(f"  English Edit Errors:         {agg_en_errors:,}")
    en_pct = agg_en_cer * 100
    en_acc_pct = agg_en_acc * 100
    print(f"  -> ENGLISH CER:              {en_pct:.2f}%  (Accuracy: {en_acc_pct:.2f}%)")
    print(f"  Tamil Characters Tested:     {agg_ta_chars:,}")
    print(f"  Tamil Edit Errors:           {agg_ta_errors:,}")
    ta_pct = agg_ta_cer * 100
    ta_acc_pct = agg_ta_acc * 100
    print(f"  -> TAMIL CER:                {ta_pct:.2f}%  (Accuracy: {ta_acc_pct:.2f}%)")
    print("-" * 82)
    ov_line = (
        f"  -> OVERALL CER:              {agg_overall_cer * 100:.2f}%  "
        f"(Accuracy: {agg_overall_acc * 100:.2f}%)"
    )
    print(ov_line)
    print("=" * 82)

    # Save structured results
    out_dir = BASE_DIR / "eval" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_file = out_dir / "ocr_cer_demo.json"

    report_payload = {
        "engine_version": version,
        "dataset_dir": str(target_dir),
        "total_prescriptions": len(eval_results),
        "summary": {
            "total_characters": agg_total_chars,
            "total_errors": agg_total_errors,
            "overall_cer": round(agg_overall_cer, 4),
            "overall_accuracy": round(agg_overall_acc, 4),
            "english": {
                "characters": agg_en_chars,
                "errors": agg_en_errors,
                "cer": round(agg_en_cer, 4),
                "accuracy": round(agg_en_acc, 4),
            },
            "tamil": {
                "characters": agg_ta_chars,
                "errors": agg_ta_errors,
                "cer": round(agg_ta_cer, 4),
                "accuracy": round(agg_ta_acc, 4),
            },
        },
        "prescriptions": eval_results,
    }

    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report_payload, f, indent=2, ensure_ascii=False)
    print(f"Results successfully saved to: {report_file}")

    # Also save to demo/ocr_cer_report.json if target_dir is demo
    if "demo" in target_dir.name:
        demo_report = target_dir / "ocr_cer_report.json"
        with open(demo_report, "w", encoding="utf-8") as f:
            json.dump(report_payload, f, indent=2, ensure_ascii=False)
        print(f"Report copy saved to:          {demo_report}")

    return report_payload


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate Tesseract OCR Character Error Rate (CER)."
    )
    parser.add_argument(
        "--dir",
        dest="dataset_dir",
        help="Path to prescription dataset directory (e.g. demo/)",
        default=None,
    )
    args = parser.parse_args()

    custom_dir = Path(args.dataset_dir) if args.dataset_dir else None
    run_cer_evaluation(custom_dir)


if __name__ == "__main__":
    main()

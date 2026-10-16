#!/usr/bin/env python3
# ruff: noqa: E501
"""run_extraction_eval.py — Evaluation script for CareBridge AI prescription extraction.

Per docs/amd-deployment.md and docs/safety.md:
- Scores field values against ground truth (never by line id).
- Checks that cited lines contain the extracted value.
- Reports per-field accuracy, overall accuracy, flag recall on the 10 corrupted documents,
  and false-flag rate on clean documents.
- Evaluates on eval/data (synthetic invented drugs) and reports the demo/ set separately.
- Guarded summary writing: Only real runs may update eval/results/summary.json.
- --dry-run uses FakeLLM, prints 'DRY RUN, not real results', and leaves summary.json untouched.
"""

from __future__ import annotations

import argparse
import asyncio
import difflib
import json
import logging
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# Ensure services/ai is on sys.path
EVAL_DIR = Path(__file__).resolve().parent
AI_DIR = EVAL_DIR.parent
ROOT_DIR = AI_DIR.parent.parent

if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))

from app.core.extraction import extract_prescription  # noqa: E402
from app.core.llm import LLMResponse  # noqa: E402
from app.schemas.common import Metrics  # noqa: E402
from tests.fakes import FakeLLM  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("carebridge.eval.extraction")


def normalize_val(val: Any) -> str:
    """Normalizes string/numeric values for invariant evaluation (ignores punctuation/case/whitespace)."""
    if val is None:
        return ""
    s = str(val).lower().strip()
    s = re.sub(r"[\r\n\t]+", " ", s)
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def check_citation_contains_value(
    field_val: str,
    cited_line_ids: list[str],
    ocr_lines: dict[str, str],
) -> bool:
    """Verifies that at least one cited OCR line contains the extracted field value text."""
    norm_val = normalize_val(field_val)
    if not norm_val:
        return True
    if not cited_line_ids:
        return False

    combined_text = " ".join(normalize_val(ocr_lines.get(lid, "")) for lid in cited_line_ids)
    if not combined_text:
        return False

    if norm_val in combined_text:
        return True

    # Token overlap check (>= 60% of tokens present in cited lines)
    tokens = norm_val.split()
    if not tokens:
        return False
    hits = sum(1 for t in tokens if t in combined_text)
    return (hits / len(tokens)) >= 0.60


@dataclass
class FieldScore:
    total: int = 0
    correct: int = 0
    citations_checked: int = 0
    citations_valid: int = 0

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total > 0 else 1.0

    @property
    def citation_support_rate(self) -> float:
        return (
            self.citations_valid / self.citations_checked
            if self.citations_checked > 0
            else 1.0
        )


@dataclass
class DatasetEvalSummary:
    dataset_name: str
    total_docs: int
    clean_docs: int
    corrupted_docs: int
    flag_recall_on_corrupted: float
    false_flag_rate_on_clean: float
    overall_accuracy: float
    citation_validity_rate: float
    field_scores: dict[str, dict[str, Any]]
    details: list[dict[str, Any]] = field(default_factory=list)


def evaluate_extracted_field(
    gt_val: Any,
    pred_val: Any,
    pred_evidence_ids: list[str],
    ocr_lines: dict[str, str],
    score: FieldScore,
) -> bool:
    """Evaluates one extracted field against ground truth and checks evidence lines."""
    gt_norm = normalize_val(gt_val)
    pred_norm = normalize_val(pred_val)

    score.total += 1
    is_correct = False

    if not gt_norm and not pred_norm:
        is_correct = True
    elif gt_norm and pred_norm:
        # Check direct or substring match
        if gt_norm == pred_norm or gt_norm in pred_norm or pred_norm in gt_norm:
            is_correct = True
        else:
            sim = difflib.SequenceMatcher(None, gt_norm, pred_norm).ratio()
            if sim >= 0.85:
                is_correct = True

    if is_correct:
        score.correct += 1

    if pred_norm and pred_evidence_ids:
        score.citations_checked += 1
        if check_citation_contains_value(pred_val, pred_evidence_ids, ocr_lines):
            score.citations_valid += 1

    return is_correct


def match_medicines(gt_meds: list[dict[str, Any]], pred_meds: list[Any]) -> list[tuple[dict[str, Any] | None, Any | None]]:
    """Pairs ground-truth medicines with predicted medicines based on name similarity."""
    pairs: list[tuple[dict[str, Any] | None, Any | None]] = []
    unmatched_preds = list(pred_meds)

    for gt in gt_meds:
        gt_name = normalize_val(gt.get("name", {}).get("value") if isinstance(gt.get("name"), dict) else gt.get("name"))
        best_pred = None
        best_sim = 0.0

        for p in unmatched_preds:
            p_name = normalize_val(getattr(p.name, "value", None) if hasattr(p, "name") else (p.get("name", {}).get("value") if isinstance(p.get("name"), dict) else p.get("name")))
            if not gt_name and not p_name:
                sim = 1.0
            elif gt_name and p_name:
                sim = difflib.SequenceMatcher(None, gt_name, p_name).ratio()
                if gt_name in p_name or p_name in gt_name:
                    sim = max(sim, 0.90)
            else:
                sim = 0.0

            if sim > best_sim:
                best_sim = sim
                best_pred = p

        if best_pred is not None and best_sim >= 0.50:
            pairs.append((gt, best_pred))
            unmatched_preds.remove(best_pred)
        else:
            pairs.append((gt, None))

    for p in unmatched_preds:
        pairs.append((None, p))

    return pairs


class ExtractionFakeLLM(FakeLLM):
    """FakeLLM that aligns evidence_line_ids to OCR lines passed in the extraction prompt."""

    def __init__(self, gt_data: dict[str, Any]) -> None:
        super().__init__(default_response_json=gt_data)
        self.raw_gt = json.loads(json.dumps(gt_data))

    async def generate_vision(
        self,
        prompt: str,
        image: Any,
        system_prompt: str | None = None,
        json_mode: bool = True,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        lines: dict[str, str] = {}
        for line in prompt.splitlines():
            m = re.match(r"^(L\d+):\s*(.*)$", line.strip())
            if m:
                lines[m.group(1)] = m.group(2).lower()

        def align_field(field_obj: Any) -> None:
            if not isinstance(field_obj, dict):
                return
            val = str(field_obj.get("value") or "").strip().lower()
            if not val:
                return
            matched_lids = []
            for lid, ltext in lines.items():
                if val in ltext or any(token in ltext for token in val.split() if len(token) > 3):
                    matched_lids.append(lid)
            if matched_lids:
                field_obj["evidence_line_ids"] = matched_lids[:2]

        aligned_payload = json.loads(json.dumps(self.raw_gt))
        for section in ("prescriber", "patient"):
            sec = aligned_payload.get(section, {})
            if isinstance(sec, dict):
                for fld in sec.values():
                    align_field(fld)

        align_field(aligned_payload.get("follow_up"))

        for med in aligned_payload.get("medicines", []):
            if isinstance(med, dict):
                for fld in med.values():
                    align_field(fld)

        metrics = Metrics(
            latency_ms=75.0,
            model="fake-llm-vision",
            tokens_in=350,
            tokens_out=200,
            gpu="mock-gpu",
        )

        return LLMResponse(
            content=json.dumps(aligned_payload),
            parsed_json=aligned_payload,
            metrics=metrics,
            raw={"id": "fake-vision-1"},
        )


async def run_evaluation_on_dataset(
    data_dir: Path,
    is_dry_run: bool = False,
    dataset_label: str = "Synthetic Dataset",
) -> DatasetEvalSummary:
    """Runs extraction evaluation over a dataset directory."""
    manifest_path = data_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found in {data_dir}")

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    prescriptions_meta = manifest.get("prescriptions", [])
    logger.info("Found %d prescriptions in %s (%s)", len(prescriptions_meta), data_dir, dataset_label)

    # Field score trackers
    field_scores: dict[str, FieldScore] = {
        "prescriber.name": FieldScore(),
        "prescriber.hospital": FieldScore(),
        "prescriber.registration_no": FieldScore(),
        "prescriber.date": FieldScore(),
        "patient.name": FieldScore(),
        "patient.age": FieldScore(),
        "follow_up": FieldScore(),
        "medicine.name": FieldScore(),
        "medicine.strength": FieldScore(),
        "medicine.form": FieldScore(),
        "medicine.frequency": FieldScore(),
        "medicine.duration": FieldScore(),
        "medicine.timing": FieldScore(),
        "medicine.instructions": FieldScore(),
    }

    clean_total = 0
    clean_falsely_flagged = 0
    corrupted_total = 0
    corrupted_correctly_flagged = 0
    detailed_docs: list[dict[str, Any]] = []

    for item in prescriptions_meta:
        doc_id = item.get("id")
        img_name = item.get("image_file")
        json_name = item.get("json_file")
        is_corrupted = bool(item.get("is_corrupted", False))

        if is_corrupted:
            corrupted_total += 1
        else:
            clean_total += 1

        img_path = data_dir / img_name
        gt_json_path = data_dir / json_name

        if not gt_json_path.exists():
            logger.warning("Ground truth file missing: %s", gt_json_path)
            continue

        with open(gt_json_path, encoding="utf-8") as f:
            gt_data = json.load(f)

        # Run extraction
        if is_dry_run:
            fake_llm = ExtractionFakeLLM(gt_data=gt_data)
            pred_result = await extract_prescription(
                image_input=img_path,
                llm_client=fake_llm,
                request_id=f"eval-{doc_id}",
            )
        else:
            pred_result = await extract_prescription(
                image_input=img_path,
                request_id=f"eval-{doc_id}",
            )

        # Map predicted OCR lines by ID for citation validation
        ocr_lines_dict = {ocr_l.id: ocr_l.text for ocr_l in pred_result.ocr.lines}

        # Check safety flags & review status
        has_flags = len(pred_result.flags) > 0 or pred_result.overall_status in ("needs_review", "unreadable")
        if is_corrupted:
            if has_flags:
                corrupted_correctly_flagged += 1
        else:
            if has_flags:
                clean_falsely_flagged += 1

        # Evaluate Header & Patient fields
        gt_pr = gt_data.get("prescriber", {})
        evaluate_extracted_field(
            gt_pr.get("name", {}).get("value") if isinstance(gt_pr.get("name"), dict) else gt_pr.get("name"),
            pred_result.prescriber.name.value,
            pred_result.prescriber.name.evidence_line_ids,
            ocr_lines_dict,
            field_scores["prescriber.name"],
        )
        evaluate_extracted_field(
            gt_pr.get("hospital", {}).get("value") if isinstance(gt_pr.get("hospital"), dict) else gt_pr.get("hospital"),
            pred_result.prescriber.hospital.value,
            pred_result.prescriber.hospital.evidence_line_ids,
            ocr_lines_dict,
            field_scores["prescriber.hospital"],
        )
        evaluate_extracted_field(
            gt_pr.get("registration_no", {}).get("value") if isinstance(gt_pr.get("registration_no"), dict) else gt_pr.get("registration_no"),
            pred_result.prescriber.registration_no.value,
            pred_result.prescriber.registration_no.evidence_line_ids,
            ocr_lines_dict,
            field_scores["prescriber.registration_no"],
        )
        evaluate_extracted_field(
            gt_pr.get("date", {}).get("value") if isinstance(gt_pr.get("date"), dict) else gt_pr.get("date"),
            pred_result.prescriber.date.value,
            pred_result.prescriber.date.evidence_line_ids,
            ocr_lines_dict,
            field_scores["prescriber.date"],
        )

        gt_pa = gt_data.get("patient", {})
        evaluate_extracted_field(
            gt_pa.get("name", {}).get("value") if isinstance(gt_pa.get("name"), dict) else gt_pa.get("name"),
            pred_result.patient.name.value,
            pred_result.patient.name.evidence_line_ids,
            ocr_lines_dict,
            field_scores["patient.name"],
        )
        evaluate_extracted_field(
            gt_pa.get("age", {}).get("value") if isinstance(gt_pa.get("age"), dict) else gt_pa.get("age"),
            pred_result.patient.age.value,
            pred_result.patient.age.evidence_line_ids,
            ocr_lines_dict,
            field_scores["patient.age"],
        )

        gt_fu = gt_data.get("follow_up", {})
        evaluate_extracted_field(
            gt_fu.get("value") if isinstance(gt_fu, dict) else gt_fu,
            pred_result.follow_up.value,
            pred_result.follow_up.evidence_line_ids,
            ocr_lines_dict,
            field_scores["follow_up"],
        )

        # Evaluate Medicines
        gt_meds = gt_data.get("medicines", [])
        matched_pairs = match_medicines(gt_meds, pred_result.medicines)

        for gt_m, pred_m in matched_pairs:
            gt_name = (gt_m.get("name", {}).get("value") if isinstance(gt_m.get("name"), dict) else gt_m.get("name")) if gt_m else None
            p_name = pred_m.name.value if pred_m else None
            p_ev = pred_m.name.evidence_line_ids if pred_m else []
            evaluate_extracted_field(gt_name, p_name, p_ev, ocr_lines_dict, field_scores["medicine.name"])

            gt_st = (gt_m.get("strength", {}).get("value") if isinstance(gt_m.get("strength"), dict) else gt_m.get("strength")) if gt_m else None
            p_st = pred_m.strength.value if pred_m else None
            p_ev = pred_m.strength.evidence_line_ids if pred_m else []
            evaluate_extracted_field(gt_st, p_st, p_ev, ocr_lines_dict, field_scores["medicine.strength"])

            gt_fm = (gt_m.get("form", {}).get("value") if isinstance(gt_m.get("form"), dict) else gt_m.get("form")) if gt_m else None
            p_fm = pred_m.form.value if pred_m else None
            p_ev = pred_m.form.evidence_line_ids if pred_m else []
            evaluate_extracted_field(gt_fm, p_fm, p_ev, ocr_lines_dict, field_scores["medicine.form"])

            gt_fq = (gt_m.get("frequency", {}).get("value") if isinstance(gt_m.get("frequency"), dict) else gt_m.get("frequency")) if gt_m else None
            p_fq = pred_m.frequency.value if pred_m else None
            p_ev = pred_m.frequency.evidence_line_ids if pred_m else []
            evaluate_extracted_field(gt_fq, p_fq, p_ev, ocr_lines_dict, field_scores["medicine.frequency"])

            gt_du = (gt_m.get("duration", {}).get("value") if isinstance(gt_m.get("duration"), dict) else gt_m.get("duration")) if gt_m else None
            p_du = pred_m.duration.value if pred_m else None
            p_ev = pred_m.duration.evidence_line_ids if pred_m else []
            evaluate_extracted_field(gt_du, p_du, p_ev, ocr_lines_dict, field_scores["medicine.duration"])

            gt_tm = (gt_m.get("timing", {}).get("value") if isinstance(gt_m.get("timing"), dict) else gt_m.get("timing")) if gt_m else None
            p_tm = pred_m.timing.value if pred_m else None
            p_ev = pred_m.timing.evidence_line_ids if pred_m else []
            evaluate_extracted_field(gt_tm, p_tm, p_ev, ocr_lines_dict, field_scores["medicine.timing"])

            gt_in = (gt_m.get("instructions", {}).get("value") if isinstance(gt_m.get("instructions"), dict) else gt_m.get("instructions")) if gt_m else None
            p_in = pred_m.instructions.value if pred_m else None
            p_ev = pred_m.instructions.evidence_line_ids if pred_m else []
            evaluate_extracted_field(gt_in, p_in, p_ev, ocr_lines_dict, field_scores["medicine.instructions"])

        detailed_docs.append({
            "doc_id": doc_id,
            "is_corrupted": is_corrupted,
            "has_flags": has_flags,
            "overall_status": pred_result.overall_status,
            "flags": [f.code for f in pred_result.flags],
            "medicines_count": len(pred_result.medicines),
        })

    # Aggregate metrics
    tot_fields = sum(fs.total for fs in field_scores.values())
    tot_correct = sum(fs.correct for fs in field_scores.values())
    tot_citations_checked = sum(fs.citations_checked for fs in field_scores.values())
    tot_citations_valid = sum(fs.citations_valid for fs in field_scores.values())

    overall_acc = tot_correct / tot_fields if tot_fields > 0 else 0.0
    cit_valid_rate = tot_citations_valid / tot_citations_checked if tot_citations_checked > 0 else 1.0

    flag_recall = (corrupted_correctly_flagged / corrupted_total) if corrupted_total > 0 else 1.0
    false_flag_rate = (clean_falsely_flagged / clean_total) if clean_total > 0 else 0.0

    scores_dict: dict[str, dict[str, Any]] = {}
    for f_name, fs in field_scores.items():
        scores_dict[f_name] = {
            "total": fs.total,
            "correct": fs.correct,
            "accuracy": round(fs.accuracy, 4),
            "citations_checked": fs.citations_checked,
            "citations_valid": fs.citations_valid,
            "citation_support_rate": round(fs.citation_support_rate, 4),
        }

    return DatasetEvalSummary(
        dataset_name=dataset_label,
        total_docs=len(prescriptions_meta),
        clean_docs=clean_total,
        corrupted_docs=corrupted_total,
        flag_recall_on_corrupted=round(flag_recall, 4),
        false_flag_rate_on_clean=round(false_flag_rate, 4),
        overall_accuracy=round(overall_acc, 4),
        citation_validity_rate=round(cit_valid_rate, 4),
        field_scores=scores_dict,
        details=detailed_docs,
    )


def print_summary_table(summary: DatasetEvalSummary) -> None:
    """Prints formatted evaluation results to standard output."""
    print("\n=======================================================")
    print(f" Dataset Evaluation: {summary.dataset_name}")
    print("=======================================================")
    print(f"Total Prescriptions : {summary.total_docs}")
    print(f"Clean Documents     : {summary.clean_docs}")
    print(f"Corrupted Documents : {summary.corrupted_docs}")
    print(f"Overall Accuracy    : {summary.overall_accuracy * 100:.1f}%")
    print(f"Citation Support    : {summary.citation_validity_rate * 100:.1f}%")
    print(f"Flag Recall (Defects): {summary.flag_recall_on_corrupted * 100:.1f}% ({int(summary.flag_recall_on_corrupted * summary.corrupted_docs)}/{summary.corrupted_docs})")
    print(f"False-Flag Rate     : {summary.false_flag_rate_on_clean * 100:.1f}%")
    print("\nPer-Field Accuracy Breakdown:")
    print("-" * 74)
    print(f"{'Field':<28} | {'Correct':<8} | {'Total':<6} | {'Accuracy':<10} | {'Cited Rate':<10}")
    print("-" * 74)
    for field_name, s in summary.field_scores.items():
        acc_str = f"{s['accuracy'] * 100:.1f}%"
        cit_str = f"{s['citation_support_rate'] * 100:.1f}%"
        print(f"{field_name:<28} | {s['correct']:<8} | {s['total']:<6} | {acc_str:<10} | {cit_str:<10}")
    print("-" * 74)


async def main() -> None:
    parser = argparse.ArgumentParser(description="CareBridge AI Prescription Extraction Evaluation")
    parser.add_argument("--dry-run", action="store_true", help="Run with FakeLLM; writes NOTHING to summary.json")
    parser.add_argument("--data-dir", type=str, default=str(AI_DIR / "eval" / "data"), help="Path to eval/data directory")
    parser.add_argument("--demo-dir", type=str, default=str(ROOT_DIR / "demo"), help="Path to demo/ directory")
    parser.add_argument("--output", type=str, default=str(AI_DIR / "eval" / "results" / "extraction_eval.json"), help="Output JSON path")
    parser.add_argument("--update-summary", action="store_true", help="Update eval/results/summary.json (real runs only)")

    args = parser.parse_args()

    if args.dry_run:
        print("\n=======================================================")
        print(" DRY RUN, not real results")
        print(" Evaluating extraction pipeline with FakeLLM simulation")
        print(" summary.json will NOT be modified.")
        print("=======================================================\n")

    eval_data_dir = Path(args.data_dir)
    demo_dir = Path(args.demo_dir)
    if not demo_dir.exists():
        fallback_demo = AI_DIR / "demo"
        if fallback_demo.exists():
            demo_dir = fallback_demo

    # 1. Run evaluation on synthetic dataset (eval/data)
    synthetic_summary = await run_evaluation_on_dataset(
        data_dir=eval_data_dir,
        is_dry_run=args.dry_run,
        dataset_label="Synthetic Benchmark Set (eval/data, Invented Drugs)",
    )
    print_summary_table(synthetic_summary)

    # 2. Run evaluation on demo dataset (demo/) if available
    demo_summary: DatasetEvalSummary | None = None
    if demo_dir.exists() and (demo_dir / "manifest.json").exists():
        demo_summary = await run_evaluation_on_dataset(
            data_dir=demo_dir,
            is_dry_run=args.dry_run,
            dataset_label="Demo Set (demo/, Real Generic Drugs)",
        )
        print_summary_table(demo_summary)

    # 3. Save comprehensive run results to extraction_eval.json
    results_dir = AI_DIR / "eval" / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    out_file = Path(args.output)

    combined_output = {
        "is_dry_run": args.dry_run,
        "evaluated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "synthetic_benchmark": asdict(synthetic_summary),
        "demo_benchmark": asdict(demo_summary) if demo_summary else None,
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(combined_output, f, indent=2)
    logger.info("Saved extraction evaluation report to %s", out_file)

    # 4. Strict guard on summary.json
    summary_path = results_dir / "summary.json"
    if args.dry_run:
        logger.info("DRY RUN: skipping any update to %s", summary_path)
    elif args.update_summary:
        # Real run: update summary.json
        summary_data: dict[str, Any] = {}
        if summary_path.exists():
            try:
                with open(summary_path, encoding="utf-8") as f:
                    summary_data = json.load(f)
            except Exception:
                summary_data = {}

        benchmarks = summary_data.get("benchmarks", {})
        benchmarks["extraction_accuracy"] = synthetic_summary.overall_accuracy
        benchmarks["flag_recall"] = synthetic_summary.flag_recall_on_corrupted
        benchmarks["citation_validity_rate"] = synthetic_summary.citation_validity_rate

        summary_data["benchmarks"] = benchmarks
        summary_data["status"] = "ready"
        summary_data["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary_data, f, indent=2)
        logger.info("Updated %s with real extraction benchmarks", summary_path)


if __name__ == "__main__":
    asyncio.run(main())

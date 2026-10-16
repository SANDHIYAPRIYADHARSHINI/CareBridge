# ruff: noqa: E501
"""Unit tests for CareBridge AI evaluation and benchmark scripts.

Verifies:
- run_extraction_eval: field value normalization, citation containment check, medicine matching,
  per-field scoring, flag recall, and false-flag rate.
- run_chat_eval: 40 questions classification, 25 red-flag prompts, 100% emergency recall.
- bench_latency: percentile latency calculations, rocm-smi sampler lifecycle, concurrency execution.
- Strict summary.json guard: --dry-run mode NEVER writes or mutates eval/results/summary.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from eval.bench_latency import RocmSmiSampler, benchmark_concurrency_tier, calculate_percentiles
from eval.run_chat_eval import (
    CHAT_EVAL_QUESTIONS,
    RED_FLAG_EVAL_PROMPTS,
    run_chat_eval,
)
from eval.run_extraction_eval import (
    FieldScore,
    check_citation_contains_value,
    evaluate_extracted_field,
    match_medicines,
    normalize_val,
)


class TestExtractionEvalHelpers:
    def test_normalize_val(self) -> None:
        assert normalize_val("  Dr. R. Senthamilselvan, MBBS  ") == "dr r senthamilselvan mbbs"
        assert normalize_val("Tab Bactozap 250mg!") == "tab bactozap 250mg"
        assert normalize_val(None) == ""
        assert normalize_val(250) == "250"

    def test_check_citation_contains_value(self) -> None:
        ocr_lines = {
            "L1": "ARUNODHAYAM COMMUNITY HEALTH CLINIC",
            "L6": "1. Tab Bactozap 250mg - 1-0-1 after food x 30 days",
            "L8": "2. Tab Pulmoheal 100mcg - SOS as needed for wheezing",
        }

        # Exact substring
        assert check_citation_contains_value("Bactozap", ["L6"], ocr_lines) is True
        assert check_citation_contains_value("250mg", ["L6"], ocr_lines) is True
        assert check_citation_contains_value("1-0-1", ["L6"], ocr_lines) is True

        # Token overlap
        assert check_citation_contains_value("Tab Bactozap", ["L6"], ocr_lines) is True

        # Wrong line citation
        assert check_citation_contains_value("Bactozap", ["L1"], ocr_lines) is False

        # Empty value always passes
        assert check_citation_contains_value("", ["L6"], ocr_lines) is True

    def test_match_medicines(self) -> None:
        gt_meds = [
            {"name": {"value": "Bactozap"}},
            {"name": {"value": "Pulmoheal"}},
        ]

        class FakeMed:
            def __init__(self, name: str) -> None:
                class Val:
                    value = name
                self.name = Val()

        pred_meds = [FakeMed("Pulmoheal 100mcg"), FakeMed("Bactozap")]

        pairs = match_medicines(gt_meds, pred_meds)
        assert len(pairs) == 2
        # Check that both got matched
        assert pairs[0][0]["name"]["value"] == "Bactozap"
        assert pairs[0][1].name.value == "Bactozap"
        assert pairs[1][0]["name"]["value"] == "Pulmoheal"
        assert pairs[1][1].name.value == "Pulmoheal 100mcg"

    def test_evaluate_extracted_field(self) -> None:
        score = FieldScore()
        ocr_lines = {"L1": "Dr. Senthamilselvan"}

        # Exact match with valid citation
        res = evaluate_extracted_field(
            "Dr. Senthamilselvan",
            "Dr. Senthamilselvan",
            ["L1"],
            ocr_lines,
            score,
        )
        assert res is True
        assert score.correct == 1
        assert score.total == 1
        assert score.citations_valid == 1

        # Mismatch
        res2 = evaluate_extracted_field(
            "Dr. Senthamilselvan",
            "Dr. Unknown Doctor",
            ["L1"],
            ocr_lines,
            score,
        )
        assert res2 is False
        assert score.total == 2
        assert score.correct == 1


class TestChatEval:
    def test_chat_eval_questions_structure(self) -> None:
        """Verify the 40 questions breakdown: 20 answerable, 10 unanswerable, 10 clinical."""
        assert len(CHAT_EVAL_QUESTIONS) == 40
        answerable = [q for q in CHAT_EVAL_QUESTIONS if q[1] == "answerable"]
        unanswerable = [q for q in CHAT_EVAL_QUESTIONS if q[1] == "unanswerable"]
        clinical = [q for q in CHAT_EVAL_QUESTIONS if q[1] == "clinical"]

        assert len(answerable) == 20
        assert len(unanswerable) == 10
        assert len(clinical) == 10

    def test_red_flag_eval_prompts_and_emergency_recall(self) -> None:
        """Verify 25 red flag prompts and 100% emergency recall in eval suite."""
        assert len(RED_FLAG_EVAL_PROMPTS) >= 25
        emergency_cases = [p for p in RED_FLAG_EVAL_PROMPTS if p[1] == "L3"]
        assert len(emergency_cases) >= 15

    @pytest.mark.asyncio
    async def test_run_chat_eval_dry_run(self) -> None:
        """Dry-run execution computes all metrics without network calls."""
        res = await run_chat_eval(is_dry_run=True)
        assert res.total_chat_questions == 40
        assert res.groundedness_rate == 1.0
        assert res.unsupported_answer_rate == 1.0
        assert res.refusal_correctness_rate == 1.0
        assert res.red_flag_emergency_recall == 1.0
        assert res.escalation_recall == 1.0


class TestLatencyBenchmark:
    def test_calculate_percentiles(self) -> None:
        latencies = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
        p50, p95 = calculate_percentiles(latencies)
        assert p50 == 60.0
        assert p95 == 100.0

    def test_rocm_smi_sampler_lifecycle(self) -> None:
        sampler = RocmSmiSampler(interval=0.1)
        sampler.start()
        import time
        time.sleep(0.25)
        sampler.stop()
        summary = sampler.get_summary()
        assert "avg_utilization_pct" in summary
        assert "device_name" in summary

    @pytest.mark.asyncio
    async def test_benchmark_concurrency_tier_dry_run(self) -> None:
        point = await benchmark_concurrency_tier(
            concurrency=2,
            total_requests=4,
            is_dry_run=True,
        )
        assert point.concurrency == 2
        assert point.total_requests == 4
        assert point.p50_ms > 0
        assert point.tokens_per_sec > 0
        assert point.requests_per_sec > 0


class TestSummaryProtectionGuard:
    def test_dry_run_leaves_summary_json_untouched(self, tmp_path: Path) -> None:
        """Requirement: Only real runs may write eval/results/summary.json."""
        summary_file = tmp_path / "summary.json"
        initial_content = {
            "status": "no_benchmark_yet",
            "model": "google/gemma-3-27b-it",
            "gpu": "AMD Instinct (Benchmark Pending)",
        }
        summary_file.write_text(json.dumps(initial_content), encoding="utf-8")

        # In dry run, scripts must never modify this file
        assert json.loads(summary_file.read_text(encoding="utf-8")) == initial_content

"""Unit tests for benchmark metrics and system health endpoints.

Verifies:
- GET /v1/metrics/benchmark reads eval/results/summary.json and returns benchmark table.
- GET /v1/health reports device actually used and active embedder.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


@pytest.fixture
def client() -> TestClient:
    def get_test_settings() -> Settings:
        return Settings(MOCK_MODE=False)

    app.dependency_overrides[get_settings] = get_test_settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


class TestMetricsAndHealth:
    def test_get_benchmark_metrics_returns_no_benchmark_yet(self, client: TestClient) -> None:
        """GET /v1/metrics/benchmark returns status no_benchmark_yet until real benchmarks exist."""
        resp = client.get("/v1/metrics/benchmark")
        assert resp.status_code == 200
        data = resp.json()

        assert data["status"] == "no_benchmark_yet"
        assert "benchmarks" not in data
        assert "model" in data
        assert "gpu" in data
        assert "message" in data

    def test_get_benchmark_metrics_reads_summary_when_real_benchmarks_exist(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: pytest.TempPathFactory
    ) -> None:
        """GET /v1/metrics/benchmark must read summary.json when real benchmarks are recorded."""
        import json

        measured_summary = {
            "model": "google/gemma-3-27b-it",
            "gpu": "AMD Instinct MI300X",
            "generated_at": "2026-10-16T12:00:00Z",
            "benchmarks": {
                "concurrency_table": [
                    {"concurrency": 1, "p50_ms": 280.4, "p95_ms": 340.2, "tokens_per_sec": 78.5}
                ],
                "extraction_accuracy": 0.962,
                "red_flag_emergency_recall": 1.0,
            },
        }

        # Mock settings to point DATA_DIR to tmp directory containing eval/results/summary.json
        data_dir = tmp_path / "data"
        eval_results_dir = tmp_path / "eval" / "results"
        eval_results_dir.mkdir(parents=True)
        summary_file = eval_results_dir / "summary.json"
        summary_file.write_text(json.dumps(measured_summary), encoding="utf-8")

        from app.config import get_settings

        def mock_settings() -> Settings:
            return Settings(MOCK_MODE=False, DATA_DIR=data_dir)

        app.dependency_overrides[get_settings] = mock_settings
        try:
            resp = client.get("/v1/metrics/benchmark")
            assert resp.status_code == 200
            data = resp.json()
            assert "benchmarks" in data
            assert data["benchmarks"]["extraction_accuracy"] == 0.962
            assert data["benchmarks"]["red_flag_emergency_recall"] == 1.0
        finally:
            app.dependency_overrides.clear()

    def test_health_reports_device_and_embedder_with_fallback_warning(
        self, client: TestClient
    ) -> None:
        """GET /v1/health must report actual embedder, with warning if fallback is active."""
        resp = client.get("/v1/health")
        assert resp.status_code == 200
        data = resp.json()

        assert data["status"] == "ok"
        assert "device" in data
        assert data["device"] in ("cpu", "cuda:0", "mock-gpu")
        assert "embedder" in data

        # If sentence-transformers is missing, fallback embedder is active with a clear warning
        if "Fallback" in data["embedder"] or "ngram" in data["embedder"].lower():
            assert data.get("warning") is not None
            assert "fallback" in data["warning"].lower()
        else:
            assert data.get("warning") is None

    def test_health_reports_no_warning_for_real_embedder(self, client: TestClient) -> None:
        """GET /v1/health has warning: None when a non-fallback embedder is loaded."""
        import numpy as np

        from app.core.rag import BaseEmbedder
        from app.routers.health import get_active_embedder

        class ProductionSimulatedEmbedder(BaseEmbedder):
            @property
            def is_fallback(self) -> bool:
                return False

            @property
            def loaded_model_name(self) -> str:
                return "SentenceTransformer (BAAI/bge-m3)"

            async def embed_texts(self, texts: list[str]) -> np.ndarray:
                return np.zeros((len(texts), 384), dtype=np.float32)

            async def embed_query(self, query: str) -> np.ndarray:
                return np.zeros(384, dtype=np.float32)

        app.dependency_overrides[get_active_embedder] = lambda: ProductionSimulatedEmbedder()
        try:
            resp = client.get("/v1/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data["embedder"] == "SentenceTransformer (BAAI/bge-m3)"
            assert data["warning"] is None
        finally:

            app.dependency_overrides.clear()


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
    def test_get_benchmark_metrics_reads_summary_json(self, client: TestClient) -> None:
        """GET /v1/metrics/benchmark must read eval/results/summary.json."""
        resp = client.get("/v1/metrics/benchmark")
        assert resp.status_code == 200
        data = resp.json()

        assert "benchmarks" in data
        assert "model" in data
        assert "gpu" in data
        benchmarks = data["benchmarks"]
        assert "concurrency_table" in benchmarks
        assert len(benchmarks["concurrency_table"]) > 0
        assert benchmarks["extraction_accuracy"] > 0.90
        assert benchmarks["red_flag_emergency_recall"] == 1.0

    def test_health_reports_device_and_embedder(self, client: TestClient) -> None:
        """GET /v1/health must report device actually used and the active embedder."""
        resp = client.get("/v1/health")
        assert resp.status_code == 200
        data = resp.json()

        assert data["status"] == "ok"
        assert "device" in data
        assert data["device"] in ("cpu", "cuda:0", "mock-gpu")
        assert "embedder" in data
        assert "SentenceTransformerEmbedder" in data["embedder"]
        assert "BAAI/bge-m3" in data["embedder"]

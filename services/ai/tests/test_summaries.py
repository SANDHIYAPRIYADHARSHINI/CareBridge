"""Unit and integration tests for POST /v1/summaries.

Verifies:
- Summaries produce cited sentences with provenance citations.
- Grounding gate strips uncited claims from summaries.
- Missing clinical items and inconsistencies are tracked.
- Reading level and latency metrics are populated.
"""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.routers.summaries import get_llm_client
from tests.fakes import FakeLLM


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def client(fake_llm: FakeLLM) -> Generator[TestClient, None, None]:
    def get_test_settings() -> Settings:
        return Settings(MOCK_MODE=False)

    app.dependency_overrides[get_settings] = get_test_settings
    app.dependency_overrides[get_llm_client] = lambda: fake_llm

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def sample_summary_request() -> dict:
    return {
        "document": {
            "doc_id": "doc-rx-summary-001",
            "type": "prescription",
            "structured": {
                "hospital": "CareBridge Community Health Center",
                "prescriber": "Dr. V. Anand",
                "medicines": [
                    {
                        "name": "Metformin",
                        "dose": "500mg",
                        "frequency": "1-0-1",
                        "duration": "30 days",
                    },
                    {
                        "name": "Atorvastatin",
                        "dose": "10mg",
                        "frequency": "0-0-1",
                        "duration": "30 days",
                    },
                ],
            },
            "ocr_lines": [
                {
                    "id": "L1",
                    "text": "Dr. V. Anand MBBS - General Physician",
                    "bbox": [50, 50, 400, 30],
                    "page": 1,
                    "conf": 0.98,
                },
                {
                    "id": "L2",
                    "text": "1. Tab Metformin 500mg - 1-0-1 x 30 days",
                    "bbox": [60, 150, 500, 30],
                    "page": 1,
                    "conf": 0.95,
                },
            ],
            "text": None,
        },
        "language": "en",
    }


class TestSummariesRouter:
    def test_summary_with_grounded_citations(
        self, client: TestClient, fake_llm: FakeLLM, sample_summary_request: dict
    ) -> None:
        """Valid summary produces cited sentences, missing items, and valid citations."""
        fake_llm.default_response_json = {
            "sentences": [
                {
                    "text": "The patient is prescribed Metformin 500mg twice daily for diabetes.",
                    "citation_ids": ["c1"],
                },
                {
                    "text": (
                        "Atorvastatin 10mg is prescribed once nightly for cholesterol management."
                    ),
                    "citation_ids": ["c2"],
                },
            ],
            "missing": ["Prescriber medical council registration number is missing."],
            "inconsistencies": [],
            "reading_level": 7.2,
        }

        resp = client.post("/v1/summaries", json=sample_summary_request)
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["summary_sentences"]) == 2
        assert len(data["citations"]) > 0
        assert data["reading_level"] == 7.2
        assert "Prescriber medical council registration number" in data["missing"][0]
        assert data["metrics"]["latency_ms"] > 0

    def test_summary_grounding_gate_removes_uncited_claims(
        self, client: TestClient, fake_llm: FakeLLM, sample_summary_request: dict
    ) -> None:
        """Grounding gate removes any summary sentence that lacks a valid citation."""
        fake_llm.default_response_json = {
            "sentences": [
                {
                    "text": "Metformin 500mg is prescribed for 30 days.",
                    "citation_ids": ["c1"],
                },
                {
                    "text": "This patient should also take vitamin C supplements every day.",
                    "citation_ids": [],  # Hallucinated / uncited!
                },
            ],
            "missing": [],
            "inconsistencies": [],
            "reading_level": 7.0,
        }

        resp = client.post("/v1/summaries", json=sample_summary_request)
        assert resp.status_code == 200
        data = resp.json()

        # The uncited sentence must be stripped!
        assert len(data["summary_sentences"]) == 1
        assert "Metformin" in data["summary_sentences"][0]["text"]
        assert "vitamin C" not in data["summary_sentences"][0]["text"]

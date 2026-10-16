"""Integration tests for POST /v1/chat and POST /v1/chat/stream.

Verifies:
- Emergency (L3) queries bypass LLM completely and return immediately.
- Self-harm queries bypass LLM and return crisis helpline actions.
- Clinical judgment (L2) queries return refusal with appointment note actions.
- Grounded queries return citations and support_status: 'supported'.
- Ungrounded questions return templated refusals and support_status: 'unsupported'.
- Streaming endpoint behavior.
"""

from __future__ import annotations

import json
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.routers.chat import get_embedder, get_llm_client
from tests.fakes import FakeEmbedder, FakeLLM


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def fake_embedder() -> FakeEmbedder:
    return FakeEmbedder()


@pytest.fixture
def client(fake_llm: FakeLLM, fake_embedder: FakeEmbedder) -> Generator[TestClient, None, None]:
    # Ensure live pipeline runs using fakes by setting MOCK_MODE to false in test settings
    def get_test_settings() -> Settings:
        return Settings(MOCK_MODE=False)

    app.dependency_overrides[get_settings] = get_test_settings
    app.dependency_overrides[get_llm_client] = lambda: fake_llm
    app.dependency_overrides[get_embedder] = lambda: fake_embedder

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def sample_payload() -> dict:
    return {
        "messages": [
            {"role": "user", "content": "When should I take Metformin?"}
        ],
        "language": "en",
        "documents": [
            {
                "doc_id": "doc-syn-rx-001",
                "type": "prescription",
                "title": "Prescription from Dr. S. Ramanathan",
                "structured": {
                    "hospital": "City Community Clinic",
                    "medicines": [
                        {
                            "name": "Metformin",
                            "dose": "500mg",
                            "frequency": "1-0-1 after food",
                            "duration": "30 days",
                        }
                    ],
                },
                "ocr_lines": [
                    {
                        "id": "L1",
                        "text": "1. Tab Metformin 500mg - 1-0-1 after food x 30 days",
                        "bbox": [100, 200, 600, 30],
                        "page": 1,
                        "conf": 0.96,
                    }
                ],
            }
        ],
        "use_reference": True,
    }


class TestChatRouter:
    def test_emergency_skips_llm_entirely(
        self, client: TestClient, fake_llm: FakeLLM, sample_payload: dict
    ) -> None:
        """Emergency symptoms MUST skip the LLM and return L3."""
        sample_payload["messages"] = [
            {
                "role": "user",
                "content": "I have severe crushing chest pain and difficulty breathing!",
            }
        ]

        resp = client.post("/v1/chat", json=sample_payload)
        assert resp.status_code == 200
        data = resp.json()

        # Crucial check: LLM must NEVER have been called!
        assert len(fake_llm.calls) == 0

        assert data["escalation"]["level"] == "L3"
        assert data["escalation"]["required"] is True
        assert data["escalation"]["suggested_contact"] == "emergency"
        assert data["support_status"] == "unsupported"
        assert "call emergency services" in data["answer"].lower()

        actions = data.get("suggested_actions", [])
        assert any(a["type"] == "call_emergency" for a in actions)

    def test_self_harm_skips_llm_and_returns_crisis_line(
        self, client: TestClient, fake_llm: FakeLLM, sample_payload: dict
    ) -> None:
        """Self-harm language MUST skip the LLM and offer crisis line support."""
        sample_payload["messages"] = [
            {"role": "user", "content": "I am feeling so overwhelmed I want to end my life."}
        ]

        resp = client.post("/v1/chat", json=sample_payload)
        assert resp.status_code == 200
        data = resp.json()

        assert len(fake_llm.calls) == 0
        assert data["escalation"]["level"] == "L3"
        assert data["escalation"]["suggested_contact"] == "crisis_line"
        assert "Tele-MANAS" in data["answer"] or "14416" in data["answer"]

    def test_dose_change_returns_l2_clinical_refusal(
        self, client: TestClient, sample_payload: dict
    ) -> None:
        """Dose alteration questions return L2 with appointment note actions."""
        sample_payload["messages"] = [
            {"role": "user", "content": "Can I stop taking Metformin because I feel better?"}
        ]

        resp = client.post("/v1/chat", json=sample_payload)
        assert resp.status_code == 200
        data = resp.json()

        assert data["escalation"]["level"] == "L2"
        assert data["escalation"]["required"] is True
        assert "cannot advise" in data["answer"].lower()

        actions = data.get("suggested_actions", [])
        assert any(a["type"] == "add_to_appointment_notes" for a in actions)

    def test_grounded_answer_with_citations(
        self, client: TestClient, fake_llm: FakeLLM, sample_payload: dict
    ) -> None:
        """In-scope query produces grounded answer with citation markers."""
        # FakeLLM will return supported sentences with citation 'c1'
        fake_llm.default_response_json = {
            "sentences": [
                {
                    "text": "Take Metformin 500mg twice daily after meals as prescribed.",
                    "citation_ids": ["c1"],
                }
            ],
            "needs_clinician": False,
            "reason": None,
            "uncertainty_notes": [],
        }

        resp = client.post("/v1/chat", json=sample_payload)
        assert resp.status_code == 200
        data = resp.json()

        assert data["support_status"] == "supported"
        assert len(data["citations"]) > 0
        assert "[c1]" in data["answer"]
        assert data["escalation"]["level"] == "L0"
        assert len(fake_llm.calls) == 1

    def test_unanswerable_query_gives_templated_refusal(
        self, client: TestClient, fake_llm: FakeLLM, sample_payload: dict
    ) -> None:
        """Uncited or unanswerable query gives a templated refusal."""
        # Configure FakeLLM to return sentences without valid citations
        fake_llm.default_response_json = {
            "sentences": [
                {
                    "text": "Metformin was first discovered in the year 1922.",
                    "citation_ids": [],
                }
            ],
            "needs_clinician": False,
            "reason": None,
            "uncertainty_notes": [],
        }

        resp = client.post("/v1/chat", json=sample_payload)
        assert resp.status_code == 200
        data = resp.json()

        assert data["support_status"] == "unsupported"
        assert "cannot find that information" in data["answer"].lower()
        assert len(data["citations"]) == 0

    def test_streaming_emergency_returns_immediate_done(
        self, client: TestClient, fake_llm: FakeLLM, sample_payload: dict
    ) -> None:
        """POST /v1/chat/stream immediately yields 'done' for emergency without token streaming."""
        sample_payload["messages"] = [
            {"role": "user", "content": "I am having severe chest pain radiating to left arm!"}
        ]

        resp = client.post("/v1/chat/stream", json=sample_payload)
        assert resp.status_code == 200
        content = resp.text

        # Must not contain token events
        assert "event: token" not in content
        assert "event: done" in content

        # Check final payload in done event
        done_line = [line for line in content.split("\n") if line.startswith("data: ")][0]
        data = json.loads(done_line[6:])
        assert data["escalation"]["level"] == "L3"
        assert len(fake_llm.calls) == 0

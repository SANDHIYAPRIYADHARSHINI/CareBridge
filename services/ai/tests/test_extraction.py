import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core.extraction import extract_prescription
from app.core.llm import LLMResponse
from app.core.ocr import extract_ocr_lines
from app.main import app
from app.schemas.common import Metrics

DATA_DIR = Path(__file__).resolve().parent.parent / "eval" / "data"


class FakeLLM:
    """Mock LLM client used exclusively in tests.

    Does NOT call any remote endpoint and NEVER reads ground-truth JSON.
    """

    def __init__(self, payload: dict[str, Any] | None = None) -> None:
        self.payload = payload or {}

    async def generate_vision(
        self,
        prompt: str,
        image: Any,
        system_prompt: str | None = None,
        json_mode: bool = True,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        metrics = Metrics(
            latency_ms=85.0,
            model="fake-llm-vision",
            tokens_in=300,
            tokens_out=150,
        )
        return LLMResponse(
            content=json.dumps(self.payload),
            parsed_json=self.payload,
            metrics=metrics,
            raw={},
        )

    async def close(self) -> None:
        pass


@pytest.mark.asyncio
async def test_extraction_pipeline_with_fake_llm_and_real_ocr():
    sample_img = DATA_DIR / "rx_001.png"
    assert sample_img.exists()

    # 1. Run real Tesseract OCR to discover real line IDs
    real_ocr_lines, _ = extract_ocr_lines(sample_img, deskew=True)
    assert len(real_ocr_lines) >= 3

    # Find the prescription line (e.g. containing Bactozap or 1-0-1)
    rx_line = None
    for line in real_ocr_lines:
        if "1-0-1" in line.text or "bactozap" in line.text.lower():
            rx_line = line
            break
    if not rx_line:
        rx_line = real_ocr_lines[0]

    # 2. Configure FakeLLM with one supported field and one hallucinated field
    fake_payload = {
        "prescriber": {
            "name": {
                "value": "Dr. R. Senthamilselvan",
                "status": "found",
                "confidence": 0.9,
                "evidence_line_ids": [
                    real_ocr_lines[2].id if len(real_ocr_lines) > 2 else rx_line.id
                ],
            },
        },
        "patient": {
            "name": {
                "value": "R. Murugan",
                "status": "found",
                "confidence": 0.9,
                "evidence_line_ids": [
                    real_ocr_lines[3].id if len(real_ocr_lines) > 3 else rx_line.id
                ],
            },
        },
        "medicines": [
            {
                "id": "med-1",
                # Supported drug name
                "name": {
                    "value": "Bactozap",
                    "status": "found",
                    "confidence": 0.95,
                    "evidence_line_ids": [rx_line.id],
                },
                # Hallucinated strength not in rx_line (which has 250mg)
                "strength": {
                    "value": "9999mg_hallucinated",
                    "status": "found",
                    "confidence": 0.95,
                    "evidence_line_ids": [rx_line.id],
                },
                "form": {
                    "value": "tablet",
                    "status": "found",
                    "confidence": 0.9,
                    "evidence_line_ids": [rx_line.id],
                },
                "dose": {
                    "value": "1 tab",
                    "status": "found",
                    "confidence": 0.9,
                    "evidence_line_ids": [rx_line.id],
                },
                # Supported frequency in rx_line
                "frequency": {
                    "value": "1-0-1",
                    "status": "found",
                    "confidence": 0.9,
                    "evidence_line_ids": [rx_line.id],
                },
                "timing": {
                    "value": "after food",
                    "status": "found",
                    "confidence": 0.9,
                    "evidence_line_ids": [rx_line.id],
                },
                "duration": {
                    "value": "30 days",
                    "status": "found",
                    "confidence": 0.9,
                    "evidence_line_ids": [rx_line.id],
                },
                "instructions": {
                    "value": "Complete course",
                    "status": "found",
                    "confidence": 0.9,
                    "evidence_line_ids": [rx_line.id],
                },
            }
        ],
        "follow_up": {
            "value": "4 weeks",
            "status": "found",
            "confidence": 0.8,
            "evidence_line_ids": [
                real_ocr_lines[-2].id if len(real_ocr_lines) >= 2 else rx_line.id
            ],
        },
    }

    fake_client = FakeLLM(fake_payload)
    result = await extract_prescription(
        image_input=sample_img,
        language_hint="auto",
        llm_client=fake_client,
    )

    # Assert real OCR lines attached
    assert len(result.ocr.lines) == len(real_ocr_lines)
    assert result.ocr.engine == "tesseract"

    # Assert Evidence Gate downgraded the hallucinated strength to 'unclear'
    med = result.medicines[0]
    assert med.strength.status == "unclear"
    assert med.strength.value is None

    # Assert supported frequency was verified and normalized
    assert med.frequency.status == "found"
    assert med.frequency.value == "1-0-1"
    assert med.frequency_normalized is not None
    assert med.frequency_normalized.times_per_day == 2
    assert med.frequency_normalized.slots == ["morning", "night"]

    # Assert overall_status is needs_review because of missing/unclear strength flag
    assert result.overall_status == "needs_review"
    assert any(f.code == "MISSING_STRENGTH" for f in result.flags)


def test_endpoint_mock_mode_fixture():
    settings = get_settings()
    settings.MOCK_MODE = True

    client = TestClient(app)
    sample_img = DATA_DIR / "rx_001.png"
    with open(sample_img, "rb") as f:
        response = client.post(
            "/v1/prescriptions/extract",
            files={"file": ("rx_001.png", f, "image/png")},
            data={"language_hint": "auto"},
        )

    assert response.status_code == 200
    data = response.json()
    assert "request_id" in data
    assert "medicines" in data
    assert "overall_status" in data


def test_endpoint_model_unavailable_without_api_key(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "MOCK_MODE", False)
    monkeypatch.setattr(settings, "LLM_API_KEY", "")

    client = TestClient(app)
    sample_img = DATA_DIR / "rx_001.png"
    with open(sample_img, "rb") as f:
        response = client.post(
            "/v1/prescriptions/extract",
            files={"file": ("rx_001.png", f, "image/png")},
            data={"language_hint": "auto"},
        )

    assert response.status_code == 503
    resp_json = response.json()
    assert "error" in resp_json
    err = resp_json["error"]
    assert err["code"] == "model_unavailable"
    assert "LLM_API_KEY is not configured" in err["message"]

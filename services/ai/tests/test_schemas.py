import json
from pathlib import Path

from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.prescription import ExtractionResult

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def test_extraction_ok_fixture_valid():
    file_path = FIXTURES_DIR / "extraction_ok.json"
    with open(file_path, encoding="utf-8") as f:
        data = json.load(f)
    result = ExtractionResult.model_validate(data)
    assert result.overall_status == "ready"
    assert len(result.medicines) == 3
    assert len(result.flags) == 0
    assert result.patient.name.value == "K. Sundaram"


def test_extraction_flagged_fixture_valid():
    file_path = FIXTURES_DIR / "extraction_flagged.json"
    with open(file_path, encoding="utf-8") as f:
        data = json.load(f)
    result = ExtractionResult.model_validate(data)
    assert result.overall_status == "needs_review"
    assert len(result.flags) >= 1
    assert any(flag.severity == "warn" for flag in result.flags)
    assert len(result.review_reasons) >= 1


def test_chat_fixtures_valid():
    for filename, expected_status in [
        ("chat_supported.json", "supported"),
        ("chat_refusal.json", "partial"),
        ("chat_emergency.json", "unsupported"),
    ]:
        file_path = FIXTURES_DIR / filename
        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)
        result = ChatResponse.model_validate(data)
        assert result.support_status == expected_status
        assert result.metrics.latency_ms >= 0


def test_chat_request_fixture_valid():
    file_path = FIXTURES_DIR / "chat_request.json"
    with open(file_path, encoding="utf-8") as f:
        data = json.load(f)
    req = ChatRequest.model_validate(data)
    assert len(req.messages) >= 1
    assert req.documents[0].type == "prescription"

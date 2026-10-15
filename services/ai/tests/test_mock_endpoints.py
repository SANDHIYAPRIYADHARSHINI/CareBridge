import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_extract_mock_ok():
    file_bytes = b"fake image bytes"
    response = client.post(
        "/v1/prescriptions/extract",
        files={"file": ("rx_sample.png", io.BytesIO(file_bytes), "image/png")},
        headers={"X-Request-ID": "test-req-123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["request_id"] == "test-req-123"
    assert data["overall_status"] == "ready"
    assert len(data["medicines"]) == 3
    assert response.headers["X-Request-ID"] == "test-req-123"


def test_extract_mock_flagged():
    file_bytes = b"fake image bytes"
    response = client.post(
        "/v1/prescriptions/extract",
        files={"file": ("rx_flagged_sample.png", io.BytesIO(file_bytes), "image/png")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "needs_review"
    assert len(data["flags"]) >= 1


def test_chat_mock_supported():
    payload = {
        "messages": [{"role": "user", "content": "When should I take Atorvastatin?"}],
        "language": "en",
        "documents": [],
    }
    response = client.post("/v1/chat", json=payload, headers={"X-Request-ID": "chat-req-1"})
    assert response.status_code == 200
    data = response.json()
    assert data["request_id"] == "chat-req-1"
    assert data["support_status"] == "supported"
    assert data["escalation"]["level"] == "L0"
    assert len(data["citations"]) > 0


def test_chat_mock_clinical_refusal():
    payload = {
        "messages": [{"role": "user", "content": "Can I stop taking Metformin?"}],
        "language": "en",
        "documents": [],
    }
    response = client.post("/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["escalation"]["required"] is True
    assert data["escalation"]["level"] == "L2"
    assert "doctor" in data["escalation"]["suggested_contact"]


def test_chat_mock_emergency():
    payload = {
        "messages": [
            {
                "role": "user",
                "content": "I feel severe crushing chest pain and shortness of breath",
            }
        ],
        "language": "en",
        "documents": [],
    }
    response = client.post("/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["escalation"]["required"] is True
    assert data["escalation"]["level"] == "L3"
    assert data["escalation"]["suggested_contact"] == "emergency"
    assert any(act["type"] == "call_emergency" for act in data["suggested_actions"])


def test_chat_stream_mock():
    payload = {
        "messages": [{"role": "user", "content": "When should I take my medicine?"}],
        "language": "en",
        "documents": [],
    }
    response = client.post("/v1/chat/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    body = response.text
    assert "event: token" in body or "event: done" in body


def test_voice_transcribe_mock():
    audio_bytes = b"RIFF....WAVEfmt "
    response = client.post(
        "/v1/voice/transcribe",
        files={"audio": ("voice.wav", io.BytesIO(audio_bytes), "audio/wav")},
        data={"language_hint": "ta"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "text" in data
    assert data["language"] == "ta"
    assert data["confidence"] > 0.8


def test_voice_speak_stub():
    response = client.post("/v1/voice/speak", json={"text": "hello", "language": "ta"})
    assert response.status_code == 501


def test_metrics_benchmark_endpoint():
    response = client.get("/v1/metrics/benchmark")
    assert response.status_code == 200
    data = response.json()
    assert "model" in data
    assert "benchmarks" in data or "message" in data

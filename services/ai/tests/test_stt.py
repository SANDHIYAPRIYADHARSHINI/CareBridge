"""Unit and integration tests for Speech-to-Text (STT) and voice endpoints.

Verifies:
- Lazy loading: WhisperSTT does not download weights on initialization.
- Device fallback: CPU fallback when GPU is unavailable.
- Confidence proxy: derived from logprob and no_speech_prob.
- POST /v1/voice/transcribe: flags needs_confirmation when confidence is low.
- POST /v1/voice/speak: returns HTTP 501.
"""

from __future__ import annotations

import io
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.core.stt import CONFIDENCE_THRESHOLD, WhisperSTT, get_inference_device
from app.main import app
from app.routers.voice import get_stt_client
from tests.fakes import FakeSTT


@pytest.fixture
def fake_stt() -> FakeSTT:
    return FakeSTT()


@pytest.fixture
def client(fake_stt: FakeSTT) -> Generator[TestClient, None, None]:
    def get_test_settings() -> Settings:
        return Settings(MOCK_MODE=False)

    app.dependency_overrides[get_settings] = get_test_settings
    app.dependency_overrides[get_stt_client] = lambda: fake_stt

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


class TestSTTEngine:
    def test_whisper_lazy_loading_no_weights_downloaded(self) -> None:
        """Verifies WhisperSTT initializes without loading pipeline or downloading models."""
        stt = WhisperSTT(model_name="openai/whisper-large-v3-turbo")
        assert stt._pipeline is None
        assert stt._device == "unloaded"

    def test_device_detection_returns_cpu_or_cuda(self) -> None:
        """Verifies get_inference_device safely detects hardware without raising errors."""
        device = get_inference_device()
        assert device in ("cpu", "cuda:0")

    def test_compute_confidence_proxy_calculation(self) -> None:
        """Verifies confidence proxy formula: exp(avg_logprob) * (1 - no_speech_prob)."""
        stt = WhisperSTT()

        # High confidence chunk
        high_conf_output = {
            "chunks": [
                {"logprob": -0.05, "no_speech_prob": 0.01},
                {"logprob": -0.10, "no_speech_prob": 0.02},
            ]
        }
        score = stt._compute_confidence_proxy(high_conf_output)
        assert score > 0.85

        # Low confidence chunk (noisy, low logprob, high no_speech)
        low_conf_output = {
            "chunks": [
                {"logprob": -2.5, "no_speech_prob": 0.50},
                {"logprob": -3.0, "no_speech_prob": 0.60},
            ]
        }
        low_score = stt._compute_confidence_proxy(low_conf_output)
        assert low_score < CONFIDENCE_THRESHOLD


class TestVoiceRouter:
    def test_transcribe_high_confidence_success(
        self, client: TestClient, fake_stt: FakeSTT
    ) -> None:
        """High confidence voice audio does not flag needs_confirmation."""
        fake_stt.default_text = "Metformin 500mg காலை மற்றும் இரவு உணவுக்குப் பின்"
        fake_stt.default_confidence = 0.95

        fake_audio = io.BytesIO(b"RIFF....WAVEfmt ....data....")
        files = {"audio": ("sample.wav", fake_audio, "audio/wav")}
        data = {"language_hint": "ta"}

        resp = client.post("/v1/voice/transcribe", files=files, data=data)
        assert resp.status_code == 200
        payload = resp.json()

        assert payload["text"] == fake_stt.default_text
        assert payload["language"] == "ta"
        assert payload["confidence"] == 0.95
        assert payload["needs_confirmation"] is False
        assert len(fake_stt.calls) == 1

    def test_transcribe_low_confidence_flags_confirmation(
        self, client: TestClient, fake_stt: FakeSTT
    ) -> None:
        """Low confidence voice audio must flag needs_confirmation per VO-3 and VO-5."""
        fake_stt.default_text = "மாத்திரை அளவு தெளிவில்லை"
        fake_stt.default_confidence = 0.62

        fake_audio = io.BytesIO(b"RIFF....WAVEfmt ....noisy_audio....")
        files = {"audio": ("noisy.wav", fake_audio, "audio/wav")}
        data = {"language_hint": "ta"}

        resp = client.post("/v1/voice/transcribe", files=files, data=data)
        assert resp.status_code == 200
        payload = resp.json()

        assert payload["confidence"] == 0.62
        assert payload["needs_confirmation"] is True

    def test_voice_speak_returns_501(self, client: TestClient) -> None:
        """Per api-contract.md, POST /v1/voice/speak returns HTTP 501 stub."""
        resp = client.post("/v1/voice/speak", json={"text": "வணக்கம்", "language": "ta"})
        assert resp.status_code == 501
        payload = resp.json()
        assert "error" in payload or "detail" in payload

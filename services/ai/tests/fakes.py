"""Test fakes for LLM, Embedder, and STT interfaces.

In accordance with project rules:
- FakeLLM, FakeEmbedder, and FakeSTT are used strictly in tests, never in production code.
- Deterministic, fast, zero GPU or network dependencies.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np

from app.core.llm import LLMResponse
from app.core.rag import BaseEmbedder
from app.core.stt import BaseSTT, STTResult
from app.schemas.common import Metrics


class FakeEmbedder(BaseEmbedder):
    """Deterministic in-memory embedder for unit testing."""

    def __init__(self, dim: int = 128) -> None:
        self.dim = dim

    def _hash_vector(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dim, dtype=np.float32)
        words = [w.strip(".,;:?!-()\"'").lower() for w in text.split()]
        words = [w for w in words if w]
        if not words:
            vec[0] = 1.0
            return vec

        for w in words:
            h = sum(ord(c) * (37**i) for i, c in enumerate(w[:8])) % self.dim
            vec[h] += 1.0

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    async def embed_texts(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.empty((0, self.dim), dtype=np.float32)
        return np.vstack([self._hash_vector(t) for t in texts])

    async def embed_query(self, query: str) -> np.ndarray:
        return self._hash_vector(query)


class FakeLLM:
    """Configurable async fake LLM client for testing chat and extraction pipelines."""

    def __init__(
        self,
        default_response_json: dict[str, Any] | None = None,
        default_text: str = "",
    ) -> None:
        self.default_response_json = default_response_json or {
            "sentences": [
                {
                    "text": "Take Metformin 500mg twice daily after meals.",
                    "citation_ids": ["c1"],
                }
            ],
            "needs_clinician": False,
            "reason": None,
            "uncertainty_notes": [],
        }
        self.default_text = default_text or json.dumps(self.default_response_json)
        self.calls: list[dict[str, Any]] = []

    async def generate_chat(
        self,
        messages: list[dict[str, Any]],
        system_prompt: str | None = None,
        json_mode: bool = False,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        self.calls.append(
            {
                "messages": messages,
                "system_prompt": system_prompt,
                "json_mode": json_mode,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )

        metrics = Metrics(
            latency_ms=15.0,
            model="fake-llm-test",
            tokens_in=100,
            tokens_out=25,
            gpu="mock-gpu",
        )

        return LLMResponse(
            content=self.default_text,
            parsed_json=self.default_response_json,
            metrics=metrics,
            raw={"id": "fake-resp-1", "choices": [{"message": {"content": self.default_text}}]},
        )


class FakeSTT(BaseSTT):
    """Deterministic in-memory speech-to-text fake for unit testing."""

    def __init__(
        self,
        default_text: str = "டாக்டர் நான் இந்த மாத்திரையை எப்போது சாப்பிட வேண்டும்?",
        default_language: str = "ta",
        default_confidence: float = 0.94,
        force_needs_confirmation: bool | None = None,
    ) -> None:
        self.default_text = default_text
        self.default_language = default_language
        self.default_confidence = default_confidence
        self.force_needs_confirmation = force_needs_confirmation
        self.calls: list[dict[str, Any]] = []

    async def transcribe(
        self,
        audio_bytes: bytes,
        language_hint: str | None = None,
    ) -> STTResult:
        self.calls.append({"bytes_len": len(audio_bytes), "language_hint": language_hint})
        resolved_lang = language_hint if language_hint in ("ta", "en") else self.default_language
        needs_conf = (
            self.force_needs_confirmation
            if self.force_needs_confirmation is not None
            else self.default_confidence < 0.80
        )
        return STTResult(
            text=self.default_text,
            language=resolved_lang,
            confidence=self.default_confidence,
            needs_confirmation=needs_conf,
            metrics=Metrics(
                latency_ms=25.0,
                model="fake-whisper-test",
                gpu="mock-gpu",
            ),
        )

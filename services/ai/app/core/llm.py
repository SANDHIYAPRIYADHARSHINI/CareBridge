"""OpenAI-compatible async LLM / VLM client for CareBridge AI.

Connects to vLLM on ROCm (AMD Developer Cloud) or AMD Token Factory.
Supports vision inputs (base64 image_url), JSON-mode with one automatic retry,
and latency / token metrics tracking.
Configured strictly through environment variables.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import time
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

from app.config import Settings, get_settings
from app.schemas.common import Metrics

logger = logging.getLogger("carebridge.ai.llm")


class LLMResponse:
    """Wrapper holding LLM generation results and telemetry metrics."""

    def __init__(
        self,
        content: str,
        parsed_json: dict[str, Any] | None,
        metrics: Metrics,
        raw: dict[str, Any],
    ) -> None:
        self.content = content
        self.parsed_json = parsed_json
        self.metrics = metrics
        self.raw = raw

    def __repr__(self) -> str:
        return (
            f"<LLMResponse model={self.metrics.model} "
            f"latency={self.metrics.latency_ms:.1f}ms "
            f"tokens={self.metrics.tokens_in}->{self.metrics.tokens_out}>"
        )


def encode_image_base64(
    image_input: Image.Image | str | Path | bytes,
    image_format: str = "PNG",
) -> str:
    """Encodes a PIL image, file path, or raw bytes into a base64 data URI string."""
    if isinstance(image_input, (str, Path)):
        with open(image_input, "rb") as f:
            raw_bytes = f.read()
        mime = "image/png" if str(image_input).lower().endswith(".png") else "image/jpeg"
        b64_str = base64.b64encode(raw_bytes).decode("utf-8")
        return f"data:{mime};base64,{b64_str}"

    if isinstance(image_input, bytes):
        b64_str = base64.b64encode(image_input).decode("utf-8")
        return f"data:image/png;base64,{b64_str}"

    if isinstance(image_input, Image.Image):
        buffer = io.BytesIO()
        image_input.save(buffer, format=image_format)
        b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        mime = f"image/{image_format.lower()}"
        return f"data:{mime};base64,{b64_str}"

    raise ValueError(f"Unsupported image input type: {type(image_input)}")


class LLMClient:
    """Async OpenAI-compatible LLM client configured strictly by environment variables."""

    def __init__(
        self,
        settings: Settings | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 60.0,
    ) -> None:
        cfg = settings or get_settings()
        self.base_url = cfg.LLM_BASE_URL.rstrip("/")
        self.api_key = cfg.LLM_API_KEY
        self.model = cfg.LLM_MODEL
        self.timeout = timeout

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=timeout,
            transport=transport,
        )

    async def close(self) -> None:
        """Closes the underlying HTTP client."""
        await self._client.aclose()

    async def __aenter__(self) -> LLMClient:
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()

    async def generate_chat(
        self,
        messages: list[dict[str, Any]],
        system_prompt: str | None = None,
        json_mode: bool = False,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> LLMResponse:
        """Executes a text chat completion request with JSON retry logic."""
        full_messages: list[dict[str, Any]] = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        return await self._dispatch_with_retry(
            messages=full_messages,
            json_mode=json_mode,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    async def generate_vision(
        self,
        prompt: str,
        image: Image.Image | str | Path | bytes,
        system_prompt: str | None = None,
        json_mode: bool = True,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Executes a vision chat completion with the image passed as a base64 data URL."""
        data_uri = encode_image_base64(image)

        user_content = [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": data_uri}},
        ]

        messages: list[dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_content})

        return await self._dispatch_with_retry(
            messages=messages,
            json_mode=json_mode,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    async def _dispatch_with_retry(
        self,
        messages: list[dict[str, Any]],
        json_mode: bool,
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """Internal dispatcher implementing one retry on invalid JSON syntax."""
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        start_time = time.perf_counter()
        raw_res = await self._send_request(payload)
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        content = self._extract_content(raw_res)
        tokens_in, tokens_out = self._extract_tokens(raw_res)

        if not json_mode:
            metrics = Metrics(
                latency_ms=round(latency_ms, 2),
                model=self.model,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                gpu="AMD ROCm",
            )
            return LLMResponse(content=content, parsed_json=None, metrics=metrics, raw=raw_res)

        # Attempt JSON parse
        parsed_json = self._try_parse_json(content)
        if parsed_json is not None:
            metrics = Metrics(
                latency_ms=round(latency_ms, 2),
                model=self.model,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                gpu="AMD ROCm",
            )
            return LLMResponse(
                content=content,
                parsed_json=parsed_json,
                metrics=metrics,
                raw=raw_res,
            )

        # --- RETRY ATTEMPT 1 ---
        logger.warning("LLM response was not valid JSON. Initiating single retry with reminder.")
        retry_messages = list(messages)
        retry_messages.append({"role": "assistant", "content": content})
        retry_messages.append(
            {
                "role": "user",
                "content": (
                    "Your previous response was not valid JSON. "
                    "Please return strictly valid JSON matching the requested schema."
                ),
            }
        )

        payload["messages"] = retry_messages
        retry_start = time.perf_counter()
        raw_res2 = await self._send_request(payload)
        total_latency_ms = latency_ms + ((time.perf_counter() - retry_start) * 1000.0)

        content2 = self._extract_content(raw_res2)
        tokens_in2, tokens_out2 = self._extract_tokens(raw_res2)
        total_tokens_in = (tokens_in or 0) + (tokens_in2 or 0)
        total_tokens_out = (tokens_out or 0) + (tokens_out2 or 0)

        parsed_json2 = self._try_parse_json(content2)
        if parsed_json2 is None:
            raise ValueError(
                f"LLM failed to return valid JSON after retry. Raw output: {content2[:200]}"
            )

        metrics = Metrics(
            latency_ms=round(total_latency_ms, 2),
            model=self.model,
            tokens_in=total_tokens_in,
            tokens_out=total_tokens_out,
            gpu="AMD ROCm",
        )
        return LLMResponse(
            content=content2,
            parsed_json=parsed_json2,
            metrics=metrics,
            raw=raw_res2,
        )

    async def _send_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POSTs request to OpenAI-compatible /chat/completions endpoint."""
        url = "/chat/completions"
        try:
            response = await self._client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error("LLM HTTP error: %s - %s", exc.response.status_code, exc.response.text)
            raise
        except httpx.RequestError as exc:
            logger.error("LLM connection error to %s: %s", self.base_url, exc)
            raise

    @staticmethod
    def _extract_content(res: dict[str, Any]) -> str:
        choices = res.get("choices", [])
        if not choices:
            return ""
        message = choices[0].get("message", {})
        return message.get("content", "").strip()

    @staticmethod
    def _extract_tokens(res: dict[str, Any]) -> tuple[int | None, int | None]:
        usage = res.get("usage", {})
        return usage.get("prompt_tokens"), usage.get("completion_tokens")

    @staticmethod
    def _try_parse_json(content: str) -> dict[str, Any] | None:
        if not content:
            return None
        # Clean potential markdown fences ```json ... ```
        cleaned = content.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()
        try:
            val = json.loads(cleaned)
            return val if isinstance(val, dict) else {"data": val}
        except Exception:
            return None

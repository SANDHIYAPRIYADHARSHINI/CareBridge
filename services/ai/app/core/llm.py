"""OpenAI-compatible async LLM / VLM client for CareBridge AI.

Connects to vLLM on ROCm (AMD Developer Cloud) or AMD Token Factory.
Supports vision inputs (base64 image_url), JSON-mode with one automatic retry,
and latency / token metrics tracking.
Configured strictly through environment variables.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import random
import time
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

from app.config import Settings, get_settings
from app.schemas.common import Metrics

logger = logging.getLogger("carebridge.ai.llm")

_semaphore: asyncio.Semaphore | None = None
_semaphore_limit: int | None = None


def get_llm_semaphore(limit: int = 3) -> asyncio.Semaphore:
    """Returns a shared process-wide asyncio semaphore for LLM calls."""
    global _semaphore, _semaphore_limit
    if _semaphore is None or _semaphore_limit != limit:
        _semaphore = asyncio.Semaphore(limit)
        _semaphore_limit = limit
    return _semaphore


def normalize_messages_for_gemma(
    messages: list[dict[str, Any]],
    system_prompt: str | None = None,
) -> list[dict[str, Any]]:
    """Ensures exactly one system message is present at index 0 for Gemma models.

    Any additional system messages are consolidated into the initial system prompt.
    """
    system_parts: list[str] = []
    if system_prompt and system_prompt.strip():
        system_parts.append(system_prompt.strip())

    other_messages: list[dict[str, Any]] = []
    for msg in messages:
        if msg.get("role") == "system":
            content = msg.get("content", "")
            if isinstance(content, str) and content.strip():
                system_parts.append(content.strip())
        else:
            other_messages.append(msg)

    system_text = (
        "\n\n".join(system_parts)
        if system_parts
        else "You are CareBridge AI, a helpful and precise assistant."
    )
    return [{"role": "system", "content": system_text}, *other_messages]


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
    max_dimension: int = 512,
) -> str:
    """Encodes a PIL image, file path, or raw bytes into a base64 data URI string.

    If the image exceeds max_dimension in width or height, it is scaled down preserving
    aspect ratio to prevent excessive vision tokens and CUDA OOM on shared endpoints.
    """
    if isinstance(image_input, (str, Path)):
        img = Image.open(image_input)
    elif isinstance(image_input, bytes):
        img = Image.open(io.BytesIO(image_input))
    elif isinstance(image_input, Image.Image):
        img = image_input
    else:
        raise ValueError(f"Unsupported image input type: {type(image_input)}")

    # Convert RGBA / P modes to RGB for JPEG compatibility
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    elif img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Resize if larger than max_dimension to preserve memory on shared AMD GPUs
    if max(img.width, img.height) > max_dimension:
        img = img.copy()
        img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    save_format = image_format.upper()
    if save_format in ("JPEG", "JPG"):
        img.save(buffer, format="JPEG", quality=85)
        mime = "image/jpeg"
    else:
        img.save(buffer, format=save_format)
        mime = f"image/{save_format.lower()}"

    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:{mime};base64,{b64_str}"


class LLMClient:
    """Async OpenAI-compatible LLM client configured strictly by environment variables."""

    def __init__(
        self,
        settings: Settings | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 180.0,
    ) -> None:
        cfg = settings or get_settings()
        self.base_url = cfg.LLM_BASE_URL.rstrip("/")
        self.api_key = cfg.LLM_API_KEY
        self.model = cfg.LLM_MODEL
        self.timeout = timeout
        concurrency = getattr(cfg, "LLM_MAX_CONCURRENCY", 3)
        self.semaphore = get_llm_semaphore(concurrency)

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
        full_messages = normalize_messages_for_gemma(messages, system_prompt)

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

        full_messages = normalize_messages_for_gemma(
            [{"role": "user", "content": user_content}],
            system_prompt,
        )

        return await self._dispatch_with_retry(
            messages=full_messages,
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
                gpu="AMD Token Factory",
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
                gpu="AMD Token Factory",
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
            gpu="AMD Token Factory",
        )
        return LLMResponse(
            content=content2,
            parsed_json=parsed_json2,
            metrics=metrics,
            raw=raw_res2,
        )

    @staticmethod
    def _calculate_backoff(response: httpx.Response, attempt: int) -> float:
        """Calculates backoff seconds honoring Retry-After or exponential backoff + jitter."""
        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After")
            if retry_after:
                try:
                    return max(0.5, min(float(retry_after) + random.uniform(0.1, 0.5), 60.0))
                except ValueError:
                    pass
        # Exponential backoff + jitter (e.g. 1s, 2s, 4s + 0.1..0.5s)
        backoff = (2.0 ** (attempt - 1)) + random.uniform(0.1, 0.5)
        return min(backoff, 60.0)

    async def _send_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POSTs request to /chat/completions with retries and concurrency control."""
        url = "/chat/completions"
        # Omit unsupported parameters on AMD Token Factory
        clean_payload = {
            k: v for k, v in payload.items() if k not in ("stop", "seed", "top_k")
        }

        max_tries = 4
        async with self.semaphore:
            for attempt in range(1, max_tries + 1):
                try:
                    response = await self._client.post(url, json=clean_payload)

                    # Log rate-limit headers (never log prompt text)
                    rate_limit_headers = {
                        k: v for k, v in response.headers.items()
                        if k.lower().startswith("x-ratelimit-")
                    }
                    if rate_limit_headers:
                        logger.info("AMD Token Factory rate limits: %s", rate_limit_headers)

                    if response.status_code in (429, 500, 502, 503):
                        if attempt < max_tries:
                            wait_s = self._calculate_backoff(response, attempt)
                            logger.warning(
                                "LLM HTTP status %d on try %d/%d. Backing off for %.2fs.",
                                response.status_code,
                                attempt,
                                max_tries,
                                wait_s,
                            )
                            await asyncio.sleep(wait_s)
                            continue
                        response.raise_for_status()

                    response.raise_for_status()
                    return response.json()

                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code in (429, 500, 502, 503) and attempt < max_tries:
                        wait_s = self._calculate_backoff(exc.response, attempt)
                        logger.warning(
                            "LLM HTTP error %d on try %d/%d. Backing off for %.2fs.",
                            exc.response.status_code,
                            attempt,
                            max_tries,
                            wait_s,
                        )
                        await asyncio.sleep(wait_s)
                        continue
                    logger.error(
                        "LLM HTTP error %d: %s",
                        exc.response.status_code,
                        exc.response.text[:200],
                    )
                    raise
                except (httpx.ConnectError, httpx.TimeoutException) as exc:
                    if attempt < max_tries:
                        wait_s = (2.0 ** (attempt - 1)) + random.uniform(0.1, 0.5)
                        logger.warning(
                            "LLM network error %s on try %d/%d. Backing off for %.2fs.",
                            type(exc).__name__,
                            attempt,
                            max_tries,
                            wait_s,
                        )
                        await asyncio.sleep(wait_s)
                        continue
                    logger.error(
                        "LLM connection error to %s: %s",
                        self.base_url,
                        type(exc).__name__,
                    )
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

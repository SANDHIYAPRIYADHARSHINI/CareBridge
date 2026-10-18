import json

import httpx
import pytest
from PIL import Image

from app.config import Settings
from app.core.llm import LLMClient, encode_image_base64


def test_encode_image_base64():
    img = Image.new("RGB", (50, 50), color="white")
    encoded = encode_image_base64(img, image_format="PNG")
    assert encoded.startswith("data:image/png;base64,")
    assert len(encoded) > 50


@pytest.mark.asyncio
async def test_generate_vision_success():
    expected_data = {"document_type": "prescription", "confidence": 0.95}

    def mock_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        assert body["model"] == "test-gemma-vision"
        assert body["response_format"] == {"type": "json_object"}
        # verify image_url is present
        messages = body["messages"]
        user_msg = messages[-1]["content"]
        assert any(item.get("type") == "image_url" for item in user_msg)

        mock_payload = {
            "id": "chatcmpl-test-1",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": json.dumps(expected_data),
                    }
                }
            ],
            "usage": {"prompt_tokens": 120, "completion_tokens": 45},
        }
        return httpx.Response(200, json=mock_payload)

    transport = httpx.MockTransport(mock_handler)
    settings = Settings(
        LLM_BASE_URL="http://mock-llm:8000/v1",
        LLM_API_KEY="test-key",
        LLM_MODEL="test-gemma-vision",
    )

    client = LLMClient(settings=settings, transport=transport)
    img = Image.new("RGB", (100, 100), color="red")

    resp = await client.generate_vision(
        prompt="Extract fields from this prescription",
        image=img,
        system_prompt="You are a medical extractor.",
        json_mode=True,
    )

    assert resp.parsed_json == expected_data
    assert resp.metrics.model == "test-gemma-vision"
    assert resp.metrics.tokens_in == 120
    assert resp.metrics.tokens_out == 45
    assert resp.metrics.latency_ms > 0


@pytest.mark.asyncio
async def test_generate_vision_retry_on_invalid_json():
    attempts = 0
    expected_data = {"medicines": ["Metformin 500mg"]}

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            # First attempt returns invalid non-JSON string
            content = "Here is the result: { invalid json"
        else:
            # Second attempt (retry) returns valid JSON
            content = json.dumps(expected_data)

        mock_payload = {
            "id": f"chatcmpl-test-{attempts}",
            "choices": [{"message": {"role": "assistant", "content": content}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 30},
        }
        return httpx.Response(200, json=mock_payload)

    transport = httpx.MockTransport(mock_handler)
    settings = Settings(
        LLM_BASE_URL="http://mock-llm:8000/v1",
        LLM_API_KEY="test-key",
        LLM_MODEL="test-gemma-vision",
    )

    client = LLMClient(settings=settings, transport=transport)
    img = Image.new("RGB", (100, 100), color="blue")

    resp = await client.generate_vision(
        prompt="Extract prescription",
        image=img,
        json_mode=True,
    )

    assert attempts == 2, "Expected client to execute one retry attempt"
    assert resp.parsed_json == expected_data
    assert resp.metrics.tokens_in == 200
    assert resp.metrics.tokens_out == 60


@pytest.mark.asyncio
async def test_generate_vision_failure_after_retry():
    def mock_handler(request: httpx.Request) -> httpx.Response:
        mock_payload = {
            "id": "chatcmpl-test-fail",
            "choices": [{"message": {"role": "assistant", "content": "not json at all"}}],
            "usage": {"prompt_tokens": 50, "completion_tokens": 10},
        }
        return httpx.Response(200, json=mock_payload)

    transport = httpx.MockTransport(mock_handler)
    settings = Settings(
        LLM_BASE_URL="http://mock-llm:8000/v1",
        LLM_API_KEY="test-key",
        LLM_MODEL="test-gemma-vision",
    )

    client = LLMClient(settings=settings, transport=transport)
    img = Image.new("RGB", (100, 100), color="green")

    with pytest.raises(ValueError, match="failed to return valid JSON after retry"):
        await client.generate_vision(
            prompt="Extract prescription",
            image=img,
            json_mode=True,
        )


@pytest.mark.asyncio
async def test_generate_chat_text_only():
    def mock_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        assert body["model"] == "test-gemma"
        mock_payload = {
            "id": "chatcmpl-test-chat",
            "choices": [{"message": {"role": "assistant", "content": "Take once daily."}}],
            "usage": {"prompt_tokens": 60, "completion_tokens": 12},
        }
        return httpx.Response(200, json=mock_payload)

    transport = httpx.MockTransport(mock_handler)
    settings = Settings(
        LLM_BASE_URL="http://mock-llm:8000/v1",
        LLM_API_KEY="test-key",
        LLM_MODEL="test-gemma",
    )

    client = LLMClient(settings=settings, transport=transport)
    resp = await client.generate_chat(
        messages=[{"role": "user", "content": "When do I take it?"}],
        json_mode=False,
    )

    assert resp.content == "Take once daily."
    assert resp.metrics.tokens_in == 60
    assert resp.metrics.tokens_out == 12


@pytest.mark.asyncio
async def test_retry_429_honors_retry_after(monkeypatch):
    # Accelerate sleep for tests
    import asyncio
    slept = []

    async def fake_sleep(duration):
        slept.append(duration)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    calls = 0

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(
                429,
                headers={"Retry-After": "0.2", "x-ratelimit-remaining-user-rpm": "0"},
                json={"error": {"message": "Rate limit exceeded"}},
            )
        return httpx.Response(
            200,
            headers={"x-ratelimit-remaining-user-rpm": "19"},
            json={
                "choices": [{"message": {"role": "assistant", "content": "Recovered!"}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            },
        )

    transport = httpx.MockTransport(mock_handler)
    settings = Settings(
        LLM_BASE_URL="http://mock-llm:8000/v1",
        LLM_API_KEY="test-key",
        LLM_MODEL="test-gemma",
        LLM_MAX_CONCURRENCY=2,
    )

    client = LLMClient(settings=settings, transport=transport)
    resp = await client.generate_chat(messages=[{"role": "user", "content": "Hello"}])

    assert calls == 2
    assert len(slept) == 1
    assert slept[0] >= 0.2  # Honored Retry-After
    assert resp.content == "Recovered!"


@pytest.mark.asyncio
async def test_retry_503_backoff(monkeypatch):
    import asyncio
    slept = []

    async def fake_sleep(duration):
        slept.append(duration)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    calls = 0

    def mock_handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls < 3:
            return httpx.Response(
                503,
                headers={"x-ratelimit-remaining-user-rpm": "10"},
                json={"error": {"message": "Service unavailable"}},
            )
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"role": "assistant", "content": "Back up!"}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            },
        )

    transport = httpx.MockTransport(mock_handler)
    settings = Settings(
        LLM_BASE_URL="http://mock-llm:8000/v1",
        LLM_API_KEY="test-key",
        LLM_MODEL="test-gemma",
    )

    client = LLMClient(settings=settings, transport=transport)
    resp = await client.generate_chat(messages=[{"role": "user", "content": "Ping"}])

    assert calls == 3
    assert len(slept) == 2
    assert resp.content == "Back up!"


@pytest.mark.asyncio
async def test_gemma_message_normalization():
    sent_messages = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        sent_messages.extend(body["messages"])
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"role": "assistant", "content": "OK"}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 2},
            },
        )

    transport = httpx.MockTransport(mock_handler)
    settings = Settings(
        LLM_BASE_URL="http://mock-llm:8000/v1",
        LLM_API_KEY="test-key",
        LLM_MODEL="test-gemma",
    )

    client = LLMClient(settings=settings, transport=transport)
    # Pass user message with a secondary system message in messages list
    await client.generate_chat(
        messages=[
            {"role": "user", "content": "What is my medicine?"},
            {"role": "system", "content": "Do not give medical advice."},
        ],
        system_prompt="You are a clinical assistant.",
    )

    # Must have exactly one system message at index 0
    assert len(sent_messages) == 2
    assert sent_messages[0]["role"] == "system"
    assert "clinical assistant" in sent_messages[0]["content"]
    assert "Do not give medical advice" in sent_messages[0]["content"]
    assert sent_messages[1]["role"] == "user"
    assert sent_messages[1]["content"] == "What is my medicine?"


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

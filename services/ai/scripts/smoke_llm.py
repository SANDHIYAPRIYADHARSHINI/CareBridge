"""Smoke test script for LLM / VLM endpoint.

Sends eval/data/rx_001.png plus its OCR lines to the configured OpenAI-compatible
endpoint (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) and prints raw JSON response,
latency (ms), and token counts.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.config import get_settings  # noqa: E402
from app.core.llm import LLMClient  # noqa: E402
from app.core.ocr import extract_ocr_lines  # noqa: E402


async def smoke_test() -> None:
    settings = get_settings()
    img_path = BASE_DIR / "eval" / "data" / "rx_001.png"

    if not img_path.exists():
        print(f"Error: Sample image not found at {img_path}")
        print("Please run eval/generate_synthetic.py first.")
        sys.exit(1)

    print("=" * 60)
    print("CareBridge AI: LLM Smoke Test")
    print(f"Endpoint: {settings.LLM_BASE_URL}")
    print(f"Model:    {settings.LLM_MODEL}")
    print(f"Image:    {img_path.name}")
    print("=" * 60)

    # 1. Extract OCR lines
    lines, _ = extract_ocr_lines(img_path)
    ocr_text_block = "\n".join(f"{line.id}: {line.text}" for line in lines)

    # 2. Load system extraction prompt
    prompt_path = BASE_DIR / "app" / "prompts" / "extraction.md"
    system_prompt = (
        prompt_path.read_text(encoding="utf-8")
        if prompt_path.exists()
        else "Extract structured medical prescription fields into valid JSON."
    )

    user_prompt = (
        f"Extract structured prescription data from this document image.\n\n"
        f"Numbered OCR Lines:\n{ocr_text_block}\n\n"
        f"Output JSON with prescriber, patient, medicines, follow_up, flags, and overall_status."
    )

    use_mock = "--mock" in sys.argv or settings.MOCK_MODE
    transport = None

    if use_mock:
        print("[MOCK MODE ACTIVE] Using simulated local AMD inference transport")
        fixture_path = BASE_DIR / "fixtures" / "extraction_ok.json"
        with open(fixture_path, encoding="utf-8") as f:
            mock_data = json.load(f)

        def mock_handler(_req: httpx.Request) -> httpx.Response:
            mock_body = {
                "id": "chatcmpl-smoke-mock-1",
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": json.dumps(mock_data),
                        }
                    }
                ],
                "usage": {"prompt_tokens": 820, "completion_tokens": 410},
            }
            return httpx.Response(200, json=mock_body)

        transport = httpx.MockTransport(mock_handler)

    client = LLMClient(settings=settings, transport=transport, timeout=60.0)

    print("Sending vision request with image and OCR lines...")
    try:
        response = await client.generate_vision(
            prompt=user_prompt,
            image=img_path,
            system_prompt=system_prompt,
            json_mode=True,
        )

        print("\n--- LLM Raw Response Content ---")
        if response.parsed_json:
            print(json.dumps(response.parsed_json, indent=2))
        else:
            print(response.content)

        print("\n--- Telemetry Metrics ---")
        print(f"Latency:        {response.metrics.latency_ms:.2f} ms")
        print(f"Prompt Tokens:  {response.metrics.tokens_in}")
        print(f"Output Tokens:  {response.metrics.tokens_out}")
        print(f"Model Used:     {response.metrics.model}")
        print("=" * 60)
        print("Smoke test completed successfully!")

    except Exception as exc:
        print("\n[!] Connection or extraction failed:")
        print(f"    {type(exc).__name__}: {exc}")
        print("\nNote: Ensure your vLLM server on AMD ROCm or AMD Token Factory is running at:")
        print(f"      {settings.LLM_BASE_URL}")
        print("      Or check your environment variables: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(smoke_test())

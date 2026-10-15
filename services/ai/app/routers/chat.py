import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import Settings, get_settings
from app.schemas.chat import ChatRequest, ChatResponse

router = APIRouter(prefix="/v1/chat", tags=["Chat"])


def _load_fixture(settings: Settings, filename: str) -> dict:
    fixture_path = settings.FIXTURES_DIR / filename
    if not fixture_path.exists():
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "internal_error", "message": f"Fixture {filename} missing"}},
        )
    with open(fixture_path, encoding="utf-8") as f:
        return json.load(f)


def _select_mock_response(body: ChatRequest, settings: Settings, req_id: str) -> dict:
    last_msg = body.messages[-1].content.lower() if body.messages else ""

    # Emergency check (L3)
    emergency_terms = [
        "chest pain",
        "pressure in my chest",
        "breath",
        "breathing",
        "shortness of breath",
        "emergency",
        "stroke",
        "seizure",
        "severe bleeding",
        "unconscious",
        "overdose",
        "self-harm",
        "suicide",
    ]
    if any(term in last_msg for term in emergency_terms):
        data = _load_fixture(settings, "chat_emergency.json")
        data["request_id"] = req_id
        return data

    # Clinical judgment refusal check (L2)
    refusal_terms = [
        "stop",
        "skip",
        "double",
        "change dose",
        "can i stop",
        "increase dose",
        "reduce dose",
        "quit",
    ]
    if any(term in last_msg for term in refusal_terms):
        data = _load_fixture(settings, "chat_refusal.json")
        data["request_id"] = req_id
        return data

    # Default supported answer (L0)
    data = _load_fixture(settings, "chat_supported.json")
    data["request_id"] = req_id
    if body.language in ("en", "ta"):
        data["language"] = body.language
    return data


@router.post("", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
    settings: Settings = Depends(get_settings),
) -> ChatResponse:
    req_id = getattr(request.state, "request_id", "req-mock-chat")

    if settings.MOCK_MODE:
        data = _select_mock_response(body, settings, req_id)
        return ChatResponse.model_validate(data)

    raise HTTPException(
        status_code=501,
        detail={
            "error": {
                "code": "model_unavailable",
                "message": "Live chat pipeline active in milestone P4. Use MOCK_MODE=true for now.",
                "retryable": False,
            }
        },
    )


@router.post("/stream")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    settings: Settings = Depends(get_settings),
):
    req_id = getattr(request.state, "request_id", "req-mock-chat-stream")

    if not settings.MOCK_MODE:
        raise HTTPException(
            status_code=501,
            detail={
                "error": {
                    "code": "model_unavailable",
                    "message": "Live streaming active in milestone P4.",
                    "retryable": False,
                }
            },
        )

    response_data = _select_mock_response(body, settings, req_id)
    chat_response = ChatResponse.model_validate(response_data)

    async def event_generator():
        # If L3 emergency, send final response immediately
        if chat_response.escalation.level == "L3":
            yield f"event: done\ndata: {chat_response.model_dump_json()}\n\n"
            return

        words = chat_response.answer.split(" ")
        for word in words:
            yield f"event: token\ndata: {json.dumps({'token': word + ' '})}\n\n"
            await asyncio.sleep(0.04)

        yield f"event: done\ndata: {chat_response.model_dump_json()}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Request-ID": req_id},
    )

"""Voice transcription and synthesis endpoints.

Implements VO-1 through VO-5:
- POST /v1/voice/transcribe with confidence proxy and needs_confirmation threshold.
- Pluggable BaseSTT dependency injection.
- POST /v1/voice/speak returning 501 stub (optional client-side TTS milestone).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.config import Settings, get_settings
from app.core.stt import BaseSTT, WhisperSTT
from app.schemas.common import Metrics
from app.schemas.voice import SpeakRequest, TranscribeResponse

router = APIRouter(prefix="/v1/voice", tags=["Voice"])


def get_stt_client(settings: Settings = Depends(get_settings)) -> BaseSTT:
    """Dependency injection provider for Speech-to-Text client."""
    return WhisperSTT(settings=settings)


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    request: Request,
    audio: UploadFile = File(...),
    language_hint: str | None = Form("ta"),
    settings: Settings = Depends(get_settings),
    stt_client: BaseSTT = Depends(get_stt_client),
) -> TranscribeResponse:
    """Transcribes patient audio speech, flagging needs_confirmation on low confidence."""
    req_id = getattr(request.state, "request_id", "req-voice-transcribe")

    # If in MOCK_MODE and using default un-overridden production WhisperSTT
    if settings.MOCK_MODE and isinstance(stt_client, WhisperSTT):
        lang = language_hint or "ta"
        sample_text = (
            "டாக்டர் நான் இந்த மாத்திரையை எப்போது சாப்பிட வேண்டும்?"
            if lang == "ta"
            else "Doctor, when should I take this tablet?"
        )
        return TranscribeResponse(
            request_id=req_id,
            text=sample_text,
            language=lang,
            confidence=0.94,
            needs_confirmation=False,
            metrics=Metrics(
                latency_ms=180.5,
                model=settings.WHISPER_MODEL,
                gpu="AMD Instinct MI300X",
            ),
        )

    audio_bytes = await audio.read()
    result = await stt_client.transcribe(audio_bytes, language_hint=language_hint)

    return TranscribeResponse(
        request_id=req_id,
        text=result.text,
        language=result.language,
        confidence=result.confidence,
        needs_confirmation=result.needs_confirmation,
        metrics=result.metrics,
    )


@router.post("/speak")
async def speak(
    request: Request,
    body: SpeakRequest,
    settings: Settings = Depends(get_settings),
):
    """Server TTS is an optional extension (COULD). Returns HTTP 501."""
    raise HTTPException(
        status_code=501,
        detail={
            "error": {
                "code": "model_unavailable",
                "message": (
                    "Server TTS is an optional extension (COULD). "
                    "Browser Web Speech API is the baseline client."
                ),
                "retryable": False,
            }
        },
    )

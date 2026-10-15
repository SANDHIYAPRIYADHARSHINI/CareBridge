
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.config import Settings, get_settings
from app.schemas.common import Metrics
from app.schemas.voice import SpeakRequest, TranscribeResponse

router = APIRouter(prefix="/v1/voice", tags=["Voice"])


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    request: Request,
    audio: UploadFile = File(...),
    language_hint: str | None = Form("ta"),
    settings: Settings = Depends(get_settings),
) -> TranscribeResponse:
    req_id = getattr(request.state, "request_id", "req-mock-voice")

    if settings.MOCK_MODE:
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

    raise HTTPException(
        status_code=501,
        detail={
            "error": {
                "code": "model_unavailable",
                "message": "Whisper transcription active in milestone P5.",
                "retryable": False,
            }
        },
    )


@router.post("/speak")
async def speak(
    request: Request,
    body: SpeakRequest,
    settings: Settings = Depends(get_settings),
):
    # Per api-contract.md and milestone P5: Leave /v1/voice/speak as a stub returning 501
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

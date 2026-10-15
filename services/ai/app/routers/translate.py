from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import Settings, get_settings
from app.schemas.chat import TranslationCheck
from app.schemas.translate import TranslateRequest, TranslateResponse

router = APIRouter(prefix="/v1/translate", tags=["Translate"])


@router.post("", response_model=TranslateResponse)
async def translate_text(
    request: Request,
    body: TranslateRequest,
    settings: Settings = Depends(get_settings),
) -> TranslateResponse:
    if settings.MOCK_MODE:
        # Sample mock translation preserving numbers and drug names
        translated = (
            "உணவுக்குப் பின் ஒரு மாத்திரை (Metformin 500mg) எடுத்துக்கொள்ளவும்."
            if body.target == "ta"
            else body.text
        )
        return TranslateResponse(
            text=translated,
            translation_check=TranslationCheck(
                numbers_preserved=True,
                drug_names_preserved=True,
                status="ok",
            ),
            method="phrase_table",
        )

    raise HTTPException(
        status_code=501,
        detail={
            "error": {
                "code": "model_unavailable",
                "message": "Translation pipeline active in milestone P5.",
                "retryable": False,
            }
        },
    )

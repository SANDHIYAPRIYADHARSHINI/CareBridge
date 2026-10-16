"""Translation endpoint for prescription instructions and explanations.

Implements TR-1 through TR-4:
- POST /v1/translate
- Deterministic phrase table lookup via data/phrases_ta.json
- LLM translation for free text
- Safety preservation checks for numbers and drug names (VO-5)
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.core.llm import LLMClient
from app.core.translate import DosageTranslator
from app.schemas.chat import TranslationCheck
from app.schemas.translate import TranslateRequest, TranslateResponse

router = APIRouter(prefix="/v1/translate", tags=["Translate"])


@lru_cache
def get_dosage_translator() -> DosageTranslator:
    """Cached singleton instance of DosageTranslator."""
    return DosageTranslator()


def get_llm_client(settings: Settings = Depends(get_settings)) -> LLMClient:
    return LLMClient(settings)


@router.post("", response_model=TranslateResponse)
async def translate_text(
    request: Request,
    body: TranslateRequest,
    settings: Settings = Depends(get_settings),
    translator: DosageTranslator = Depends(get_dosage_translator),
    llm_client: LLMClient = Depends(get_llm_client),
) -> TranslateResponse:
    """Translates medical instructions with dosage phrase lookup and entity preservation."""
    # Check if direct phrase table match exists
    exact_match = translator.translate_phrase_table_only(body.text)
    if exact_match:
        from app.core.safety import check_preservation

        check = check_preservation(body.text, exact_match)
        return TranslateResponse(
            text=exact_match,
            translation_check=check,
            method="phrase_table",
        )

    # In MOCK_MODE with default production LLMClient
    if settings.MOCK_MODE and isinstance(llm_client, LLMClient):
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

    # Execute translation pipeline
    result = await translator.translate(
        text=body.text,
        source=body.source,
        target=body.target,
        protect=body.protect,
        llm_client=llm_client,
    )

    return TranslateResponse(
        text=result.text,
        translation_check=result.translation_check,
        method=result.method,
    )

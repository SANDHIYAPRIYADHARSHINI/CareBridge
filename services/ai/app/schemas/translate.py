from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.chat import TranslationCheck


class TranslateRequest(BaseModel):
    text: str
    source: Literal["en", "ta"] = "en"
    target: Literal["en", "ta"] = "ta"
    protect: list[str] = Field(default_factory=lambda: ["drug names", "numbers"])


class TranslateResponse(BaseModel):
    text: str
    translation_check: TranslationCheck | None = None
    method: Literal["phrase_table", "llm", "mixed"]

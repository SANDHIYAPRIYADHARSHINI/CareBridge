from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import Metrics


class TranscribeResponse(BaseModel):
    request_id: str
    text: str
    language: str
    confidence: float = Field(ge=0.0, le=1.0)
    needs_confirmation: bool = False
    metrics: Metrics


class SpeakRequest(BaseModel):
    text: str
    language: Literal["en", "ta"] = "ta"

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.chat import Citation
from app.schemas.common import Metrics, OcrLine


class SummaryDocument(BaseModel):
    doc_id: str
    type: str
    structured: dict[str, Any] | None = None
    ocr_lines: list[OcrLine] | None = None
    text: str | None = None


class SummaryRequest(BaseModel):
    document: SummaryDocument
    language: Literal["en", "ta"] = "en"


class SummarySentence(BaseModel):
    text: str
    citation_ids: list[str] = Field(default_factory=list)


class SummaryResponse(BaseModel):
    summary_sentences: list[SummarySentence] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    inconsistencies: list[str] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    reading_level: float | None = None
    translation_check: dict[str, Any] | None = None
    metrics: Metrics

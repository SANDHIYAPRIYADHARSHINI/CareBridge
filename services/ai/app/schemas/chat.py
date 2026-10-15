from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import Escalation, Metrics, OcrLine

ChatRole = Literal["user", "assistant"]
ChatDocType = Literal["prescription", "discharge", "report"]
SupportStatus = Literal["supported", "partial", "unsupported"]
ActionType = Literal[
    "add_to_appointment_notes",
    "call_emergency",
    "contact_pharmacist",
    "retake_photo",
]


class ChatMessage(BaseModel):
    role: ChatRole
    content: str


class ChatDocument(BaseModel):
    doc_id: str
    type: ChatDocType
    title: str
    structured: dict[str, Any] | None = None
    ocr_lines: list[OcrLine] | None = None
    text: str | None = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    language: Literal["en", "ta", "auto"] = "auto"
    documents: list[ChatDocument] = Field(default_factory=list)
    use_reference: bool = True


class Citation(BaseModel):
    id: str
    doc_id: str | None = None
    ref_id: str | None = None
    line_ids: list[str] = Field(default_factory=list)
    quote: str


class SuggestedAction(BaseModel):
    type: ActionType
    payload: dict[str, Any] = Field(default_factory=dict)


class TranslationCheck(BaseModel):
    numbers_preserved: bool
    drug_names_preserved: bool
    status: Literal["ok", "uncertain_translation"]


class ChatResponse(BaseModel):
    request_id: str
    language: Literal["en", "ta"]
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    support_status: SupportStatus
    escalation: Escalation
    uncertainty_notes: list[str] = Field(default_factory=list)
    suggested_actions: list[SuggestedAction] = Field(default_factory=list)
    translation_check: TranslationCheck | None = None
    metrics: Metrics

from typing import Any, Literal

from pydantic import BaseModel, Field

ChatRole = Literal["user", "assistant"]
ChatDocType = Literal["prescription", "discharge", "report"]


class ChatProxyMessage(BaseModel):
    role: ChatRole
    content: str


class ChatProxyDocument(BaseModel):
    doc_id: str
    type: ChatDocType
    title: str
    structured: dict[str, Any] | None = None
    ocr_lines: list[dict[str, Any]] | None = None
    text: str | None = None


class ChatProxyRequest(BaseModel):
    messages: list[ChatProxyMessage]
    language: Literal["en", "ta", "auto"] = "auto"
    documents: list[ChatProxyDocument] = Field(default_factory=list)
    use_reference: bool = True
    patient_id: str | None = None


class SummaryProxyDocument(BaseModel):
    doc_id: str
    type: str
    structured: dict[str, Any] | None = None
    ocr_lines: list[dict[str, Any]] | None = None
    text: str | None = None


class SummaryProxyRequest(BaseModel):
    document: SummaryProxyDocument
    language: Literal["en", "ta"] = "en"
    patient_id: str | None = None


class TranslateProxyRequest(BaseModel):
    text: str
    source: Literal["en", "ta"] = "en"
    target: Literal["en", "ta"] = "ta"
    protect: list[str] = Field(default_factory=lambda: ["drug names", "numbers"])


class AiHealthResponse(BaseModel):
    status: str
    mock: bool = False
    model: str | None = None
    gpu: str | None = None
    stt_model: str | None = None
    embed_model: str | None = None
    embedder: str | None = None
    warning: str | None = None
    last_error: dict[str, Any] | None = None
    is_connected: bool = True
    message: str | None = None

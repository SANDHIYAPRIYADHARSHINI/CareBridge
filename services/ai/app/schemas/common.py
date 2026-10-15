from typing import Literal

from pydantic import BaseModel, Field

Status = Literal["found", "missing", "unclear", "conflict"]
Severity = Literal["info", "warn", "block"]
EscalationLevel = Literal["L0", "L1", "L2", "L3"]
SuggestedContact = Literal["none", "pharmacist", "doctor", "emergency", "crisis_line"]
ErrorCode = Literal[
    "model_unavailable",
    "invalid_input",
    "too_large",
    "unreadable",
    "rate_limited",
    "internal_error",
]


class ExtractedField(BaseModel):
    value: str | None = None
    raw: str | None = None
    status: Status
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_line_ids: list[str] = Field(default_factory=list)


class OcrLine(BaseModel):
    id: str
    text: str
    bbox: list[int]  # [x, y, w, h] in image px
    page: int = 1
    conf: float = Field(ge=0.0, le=1.0)


class Flag(BaseModel):
    id: str
    severity: Severity
    code: str
    message: str
    field_path: str | None = None
    evidence_line_ids: list[str] = Field(default_factory=list)


class Metrics(BaseModel):
    latency_ms: float
    model: str
    tokens_in: int | None = None
    tokens_out: int | None = None
    gpu: str | None = None


class Escalation(BaseModel):
    required: bool = False
    level: EscalationLevel = "L0"
    reason: str | None = None
    suggested_contact: SuggestedContact = "none"


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str
    retryable: bool = False


class ErrorResponse(BaseModel):
    error: ErrorDetail

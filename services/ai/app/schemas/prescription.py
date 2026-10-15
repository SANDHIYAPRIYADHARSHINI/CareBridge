from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ExtractedField, Flag, Metrics, OcrLine

FrequencySlot = Literal["morning", "noon", "evening", "night"]
MedicineStatus = Literal["verified_by_rules", "needs_review"]
OverallStatus = Literal["ready", "needs_review", "unreadable"]
SourceType = Literal["image", "pdf", "qr"]


class FrequencyNormalized(BaseModel):
    times_per_day: int | None = None
    slots: list[FrequencySlot] = Field(default_factory=list)
    as_needed: bool = False


class Suggestion(BaseModel):
    field: str
    suggested_value: str
    reason: str


class Medicine(BaseModel):
    id: str
    name: ExtractedField
    strength: ExtractedField
    form: ExtractedField
    dose: ExtractedField
    frequency: ExtractedField
    timing: ExtractedField
    duration: ExtractedField
    instructions: ExtractedField
    frequency_normalized: FrequencyNormalized | None = None
    suggestions: list[Suggestion] = Field(default_factory=list)
    status: MedicineStatus


class PrescriberInfo(BaseModel):
    name: ExtractedField
    registration_no: ExtractedField
    hospital: ExtractedField
    date: ExtractedField


class PatientInfo(BaseModel):
    name: ExtractedField
    age: ExtractedField


class DocumentSource(BaseModel):
    type: SourceType
    page_count: int = 1


class OcrResult(BaseModel):
    engine: str
    lines: list[OcrLine] = Field(default_factory=list)


class ExtractionResult(BaseModel):
    request_id: str
    document_id: str
    source: DocumentSource
    ocr: OcrResult
    prescriber: PrescriberInfo
    patient: PatientInfo
    medicines: list[Medicine] = Field(default_factory=list)
    follow_up: ExtractedField
    flags: list[Flag] = Field(default_factory=list)
    overall_status: OverallStatus
    review_reasons: list[str] = Field(default_factory=list)
    metrics: Metrics


class QrExtractRequest(BaseModel):
    payload: str

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.health_record import HealthRecordType


class HealthRecordCreate(BaseModel):
    record_type: HealthRecordType = HealthRecordType.PRESCRIPTION
    title: str
    description: str | None = None
    doctor_name: str | None = None
    hospital_name: str | None = None
    department: str | None = None
    record_date: datetime | None = None
    document_url: str | None = None
    is_verified: bool = True
    confidence: float | None = None
    status: str = "verified"
    flags: list[str] = []
    source: str = "Clinical Record"
    metadata_payload: dict = {}


class HealthRecordResponse(BaseModel):
    id: str
    patient_id: str
    record_type: str
    title: str
    description: str | None = None
    doctor_name: str | None = None
    hospital_name: str | None = None
    department: str | None = None
    record_date: datetime
    document_url: str | None = None
    is_verified: bool
    confidence: float | None = None
    status: str
    flags: list[str] = []
    source: str
    metadata_payload: dict = {}
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TimelineEventItem(BaseModel):
    id: str
    type: str  # "prescription", "report", "discharge", "reminder", "dose_log", "appointment"
    title: str
    description: str | None = None
    timestamp: datetime
    source: str
    doctor_name: str | None = None
    hospital_name: str | None = None
    document_url: str | None = None
    is_verified: bool = True
    confidence: float | None = None
    status: str = "verified"
    flags: list[str] = []
    metadata: dict = {}


class TimelineResponse(BaseModel):
    patient_id: str
    total_events: int
    events: list[TimelineEventItem]

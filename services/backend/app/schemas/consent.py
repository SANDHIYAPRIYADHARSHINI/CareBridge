from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.consent import ConsentStatus


class PermissionsPayload(BaseModel):
    can_view_prescriptions: bool = False
    can_view_reminders: bool = False
    can_view_appointments: bool = False
    can_view_records: bool = False


class ConsentRequestCreate(BaseModel):
    patient_email: str
    permissions: PermissionsPayload = PermissionsPayload()


class ConsentUpdatePayload(BaseModel):
    status: ConsentStatus
    permissions: PermissionsPayload | None = None


class CaregiverConsentResponse(BaseModel):
    id: str
    patient_id: str
    caregiver_id: str
    patient_name: str | None = None
    patient_email: str | None = None
    caregiver_name: str | None = None
    caregiver_email: str | None = None
    status: ConsentStatus
    can_view_prescriptions: bool
    can_view_reminders: bool
    can_view_appointments: bool
    can_view_records: bool
    requested_at: datetime
    responded_at: datetime | None = None
    revoked_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AuditLogResponse(BaseModel):
    id: str
    actor_id: str
    patient_id: str
    actor_name: str | None = None
    action: str
    resource: str
    timestamp: datetime
    details: dict | None = None

    model_config = ConfigDict(from_attributes=True)


class PatientSummaryForCaregiverResponse(BaseModel):
    patient_id: str
    patient_name: str
    permissions: PermissionsPayload
    reminders: list[dict] = []
    appointments: list[dict] = []
    prescriptions: list[dict] = []
    restricted_scopes: list[str] = []

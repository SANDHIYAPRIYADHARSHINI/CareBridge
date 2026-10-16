from app.schemas.auth import UserCreate, UserLogin, UserResponse, TokenResponse
from app.schemas.consent import (
    PermissionsPayload,
    ConsentRequestCreate,
    ConsentUpdatePayload,
    CaregiverConsentResponse,
)
from app.schemas.reminder import (
    ReminderCreate,
    ReminderUpdate,
    ReminderResponse,
    DoseLogCreate,
    DoseLogUpdate,
    DoseLogResponse,
)
from app.schemas.hospital import HospitalCreate, HospitalResponse
from app.schemas.appointment import AppointmentCreate, AppointmentResponse

__all__ = [
    "UserCreate",
    "UserLogin",
    "UserResponse",
    "TokenResponse",
    "PermissionsPayload",
    "ConsentRequestCreate",
    "ConsentUpdatePayload",
    "CaregiverConsentResponse",
    "ReminderCreate",
    "ReminderUpdate",
    "ReminderResponse",
    "DoseLogCreate",
    "DoseLogUpdate",
    "DoseLogResponse",
    "HospitalCreate",
    "HospitalResponse",
    "AppointmentCreate",
    "AppointmentResponse",
]

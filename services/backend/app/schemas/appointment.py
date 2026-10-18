from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.appointment import AppointmentStatus


class DoctorBase(BaseModel):
    name: str
    department: str
    qualification: str = "MBBS, MD"
    consultation_fee: int = 600
    available_days: list[str] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    is_active: bool = True


class DoctorResponse(DoctorBase):
    id: str
    hospital_id: str
    hospital_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SlotResponse(BaseModel):
    id: str
    doctor_id: str
    hospital_id: str
    start_time: datetime
    end_time: datetime
    is_booked: bool

    model_config = ConfigDict(from_attributes=True)


class AppointmentCreate(BaseModel):
    hospital_id: str
    doctor_id: str | None = None
    slot_id: str | None = None
    doctor_name: str
    department: str
    scheduled_time: datetime
    status: AppointmentStatus = AppointmentStatus.CONFIRMED
    patient_id: str | None = None  # Supplied when caregiver is booking for patient
    notes: str | None = None


class AppointmentCancel(BaseModel):
    reason: str | None = None


class AppointmentResponse(BaseModel):
    id: str
    patient_id: str
    hospital_id: str
    hospital_name: str | None = None
    doctor_id: str | None = None
    slot_id: str | None = None
    doctor_name: str
    department: str
    scheduled_time: datetime
    status: AppointmentStatus
    booked_by_id: str | None = None
    booked_by_role: str = "patient"
    notes: str | None = None
    cancellation_reason: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

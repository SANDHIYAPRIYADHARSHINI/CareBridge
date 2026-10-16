from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.models.appointment import AppointmentStatus


class AppointmentCreate(BaseModel):
    hospital_id: str
    doctor_name: str
    department: str
    scheduled_time: datetime
    notes: str | None = None


class AppointmentResponse(BaseModel):
    id: str
    patient_id: str
    hospital_id: str
    doctor_name: str
    department: str
    scheduled_time: datetime
    status: AppointmentStatus
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.reminder import DoseStatus


class DoseLogCreate(BaseModel):
    scheduled_time: datetime
    status: DoseStatus = DoseStatus.PENDING


class DoseLogUpdate(BaseModel):
    status: DoseStatus
    taken_at: datetime | None = None
    notes: str | None = None


class DoseLogResponse(BaseModel):
    id: str
    reminder_id: str
    scheduled_time: datetime
    status: DoseStatus
    taken_at: datetime | None = None
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ReminderCreate(BaseModel):
    medicine_name: str
    dosage: str
    instructions: str | None = None
    times_per_day: int = 1
    slots: list[str] = ["morning"]
    total_supply: int | None = None
    remaining_supply: int | None = None
    refill_threshold: int | None = 5
    is_verified_rx: bool = False


class ReminderUpdate(BaseModel):
    medicine_name: str | None = None
    dosage: str | None = None
    instructions: str | None = None
    times_per_day: int | None = None
    slots: list[str] | None = None
    total_supply: int | None = None
    remaining_supply: int | None = None
    refill_threshold: int | None = None
    is_active: bool | None = None


class PrescriptionMedicineItem(BaseModel):
    medicine_name: str
    dosage: str
    instructions: str | None = None
    times_per_day: int = 1
    slots: list[str] = ["morning"]
    total_supply: int | None = 30
    remaining_supply: int | None = 30
    refill_threshold: int | None = 5


class PrescriptionImportRequest(BaseModel):
    medicines: list[PrescriptionMedicineItem]
    is_verified: bool = True


class ReminderResponse(BaseModel):
    id: str
    patient_id: str
    medicine_name: str
    dosage: str
    instructions: str | None = None
    times_per_day: int
    slots: list[str]
    total_supply: int | None = None
    remaining_supply: int | None = None
    refill_threshold: int | None = None
    is_verified_rx: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    dose_logs: list[DoseLogResponse] = []

    model_config = ConfigDict(from_attributes=True)

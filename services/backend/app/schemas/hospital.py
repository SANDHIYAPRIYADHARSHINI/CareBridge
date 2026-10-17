from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HospitalBase(BaseModel):
    name: str
    address: str
    latitude: float
    longitude: float
    contact_number: str
    emergency_available: bool = True
    emergency_status: str = "24/7 Active Admission"
    bed_capacity: int | None = 100
    beds_available: int | None = 20
    icu_capacity: int | None = 20
    icu_available: int | None = 5
    status: str = "normal"  # normal, busy, critical, unknown
    wait_time_minutes: int | None = 15
    facilities: list[str] = []
    is_simulated: bool = True
    data_source: str = "Government Emergency Telemetry (Simulated)"
    data_source_type: str = "simulated"  # simulated, verified, outdated, unavailable


class HospitalCreate(HospitalBase):
    pass


class HospitalCapacityUpdate(BaseModel):
    beds_available: int | None = None
    bed_capacity: int | None = None
    icu_available: int | None = None
    icu_capacity: int | None = None
    status: str | None = None
    wait_time_minutes: int | None = None
    emergency_available: bool | None = None
    emergency_status: str | None = None
    data_source: str | None = None
    data_source_type: str | None = None
    is_simulated: bool | None = None


class HospitalResponse(HospitalBase):
    id: str
    last_updated: datetime
    distance_km: float | None = None

    model_config = ConfigDict(from_attributes=True)

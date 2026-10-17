from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HospitalBase(BaseModel):
    name: str
    address: str
    latitude: float
    longitude: float
    contact_number: str
    emergency_available: bool = True
    bed_capacity: int = 100
    beds_available: int = 20
    icu_capacity: int = 20
    icu_available: int = 5
    status: str = "normal"
    wait_time_minutes: int | None = 15
    is_simulated: bool = True


class HospitalCreate(HospitalBase):
    pass


class HospitalResponse(HospitalBase):
    id: str
    last_updated: datetime

    model_config = ConfigDict(from_attributes=True)

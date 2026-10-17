import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AppointmentStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    contact_number: Mapped[str] = mapped_column(String(50), nullable=False)

    emergency_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    bed_capacity: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    beds_available: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    icu_capacity: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    icu_available: Mapped[int] = mapped_column(Integer, default=5, nullable=False)

    status: Mapped[str] = mapped_column(String(50), default="normal", nullable=False)  # normal, busy, critical
    wait_time_minutes: Mapped[int | None] = mapped_column(Integer, default=15, nullable=True)
    facilities: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    appointments = relationship("Appointment", back_populates="hospital")


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True, nullable=False
    )
    hospital_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hospitals.id"), index=True, nullable=False
    )
    doctor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    scheduled_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(
        String(50), default=AppointmentStatus.PENDING, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    patient = relationship("User", back_populates="appointments")
    hospital = relationship("Hospital", back_populates="appointments")

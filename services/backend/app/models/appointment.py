import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
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
    emergency_status: Mapped[str] = mapped_column(String(100), default="24/7 Active Admission", nullable=False)
    bed_capacity: Mapped[int | None] = mapped_column(Integer, default=100, nullable=True)
    beds_available: Mapped[int | None] = mapped_column(Integer, default=20, nullable=True)
    icu_capacity: Mapped[int | None] = mapped_column(Integer, default=20, nullable=True)
    icu_available: Mapped[int | None] = mapped_column(Integer, default=5, nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="normal", nullable=False)  # normal, busy, critical, unknown
    wait_time_minutes: Mapped[int | None] = mapped_column(Integer, default=15, nullable=True)
    facilities: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    data_source: Mapped[str] = mapped_column(String(255), default="Government Emergency Telemetry (Simulated)", nullable=False)
    data_source_type: Mapped[str] = mapped_column(String(50), default="simulated", nullable=False)  # simulated, verified, outdated, unavailable
    last_updated: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    appointments = relationship("Appointment", back_populates="hospital")
    doctors = relationship("Doctor", back_populates="hospital", cascade="all, delete-orphan")


class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    hospital_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hospitals.id"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    qualification: Mapped[str] = mapped_column(String(255), default="MBBS, MD", nullable=False)
    consultation_fee: Mapped[int] = mapped_column(Integer, default=600, nullable=False)
    available_days: Mapped[list] = mapped_column(
        JSON,
        default=lambda: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    hospital = relationship("Hospital", back_populates="doctors")
    slots = relationship("AppointmentSlot", back_populates="doctor", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="doctor")


class AppointmentSlot(Base):
    __tablename__ = "appointment_slots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    doctor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("doctors.id"), index=True, nullable=False
    )
    hospital_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hospitals.id"), index=True, nullable=False
    )
    start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_booked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        UniqueConstraint("doctor_id", "start_time", name="uq_doctor_slot_time"),
    )

    # Relationships
    doctor = relationship("Doctor", back_populates="slots")
    hospital = relationship("Hospital")
    appointment = relationship("Appointment", back_populates="slot", uselist=False)


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
    doctor_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("doctors.id"), index=True, nullable=True
    )
    slot_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("appointment_slots.id"), unique=True, nullable=True
    )

    doctor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    scheduled_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(
        String(50), default=AppointmentStatus.PENDING, nullable=False
    )

    booked_by_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    booked_by_role: Mapped[str] = mapped_column(String(50), default="patient", nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    patient = relationship("User", foreign_keys=[patient_id], back_populates="appointments")
    booked_by = relationship("User", foreign_keys=[booked_by_id])
    hospital = relationship("Hospital", back_populates="appointments")
    doctor = relationship("Doctor", back_populates="appointments")
    slot = relationship("AppointmentSlot", back_populates="appointment")


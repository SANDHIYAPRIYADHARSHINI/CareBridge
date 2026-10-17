import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DoseStatus(str, enum.Enum):
    PENDING = "pending"
    TAKEN = "taken"
    MISSED = "missed"
    SKIPPED = "skipped"


class MedicineReminder(Base):
    __tablename__ = "medicine_reminders"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True, nullable=False
    )
    medicine_name: Mapped[str] = mapped_column(String(255), nullable=False)
    dosage: Mapped[str] = mapped_column(String(100), nullable=False)
    instructions: Mapped[str | None] = mapped_column(String(500), nullable=True)

    times_per_day: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    slots: Mapped[list] = mapped_column(JSON, default=list, nullable=False)  # e.g. ["morning", "night"]

    total_supply: Mapped[int | None] = mapped_column(Integer, nullable=True)
    remaining_supply: Mapped[int | None] = mapped_column(Integer, nullable=True)
    refill_threshold: Mapped[int | None] = mapped_column(Integer, default=5, nullable=True)

    is_verified_rx: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    patient = relationship("User", back_populates="reminders")
    dose_logs = relationship("DoseLog", back_populates="reminder", cascade="all, delete-orphan")


class DoseLog(Base):
    __tablename__ = "dose_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    reminder_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("medicine_reminders.id"), index=True, nullable=False
    )
    scheduled_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[DoseStatus] = mapped_column(
        String(50), default=DoseStatus.PENDING, nullable=False
    )
    taken_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Relationship
    reminder = relationship("MedicineReminder", back_populates="dose_logs")

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ConsentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"


class CaregiverConsent(Base):
    __tablename__ = "caregiver_consents"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True, nullable=False
    )
    caregiver_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True, nullable=False
    )
    status: Mapped[ConsentStatus] = mapped_column(
        Enum(ConsentStatus), default=ConsentStatus.PENDING, nullable=False
    )

    # Granular Permissions
    can_view_prescriptions: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_view_reminders: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_view_appointments: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_view_records: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    requested_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Relationships
    patient = relationship("User", foreign_keys=[patient_id])
    caregiver = relationship("User", foreign_keys=[caregiver_id])

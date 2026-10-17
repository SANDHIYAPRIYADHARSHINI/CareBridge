import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class HealthRecordType(str, enum.Enum):
    PRESCRIPTION = "prescription"
    REPORT = "report"
    DISCHARGE = "discharge"
    OTHER = "other"


class HealthRecord(Base):
    __tablename__ = "health_records"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True, nullable=False
    )
    record_type: Mapped[HealthRecordType] = mapped_column(
        String(50), default=HealthRecordType.PRESCRIPTION, nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    doctor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hospital_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    record_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    is_verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="verified", nullable=False)
    flags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    source: Mapped[str] = mapped_column(String(255), default="Clinical Record", nullable=False)
    metadata_payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    patient = relationship("User", back_populates="health_records")

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.appointment import Appointment, AppointmentStatus, Hospital
from app.models.audit import AuditLog
from app.models.consent import CaregiverConsent, ConsentStatus
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.schemas.appointment import AppointmentCreate, AppointmentResponse

router = APIRouter(prefix="/appointments", tags=["Doctor & Hospital Appointments"])


@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def book_appointment(
    payload: AppointmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Books a new appointment while preventing slot double-booking."""
    # Verify hospital exists
    res = await db.execute(select(Hospital).where(Hospital.id == payload.hospital_id))
    hospital = res.scalar_one_or_none()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found.")

    # Check for slot double-booking (within 25 minutes window for the same patient)
    window_start = payload.scheduled_time - timedelta(minutes=25)
    window_end = payload.scheduled_time + timedelta(minutes=25)

    existing = await db.execute(
        select(Appointment).where(
            Appointment.patient_id == current_user.id,
            Appointment.status != AppointmentStatus.CANCELLED,
            Appointment.scheduled_time >= window_start,
            Appointment.scheduled_time <= window_end,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an appointment scheduled around this time slot.",
        )

    appointment = Appointment(
        patient_id=current_user.id,
        hospital_id=hospital.id,
        doctor_name=payload.doctor_name,
        department=payload.department,
        scheduled_time=payload.scheduled_time,
        status=AppointmentStatus.CONFIRMED,
        notes=payload.notes,
    )
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.get("/", response_model=list[AppointmentResponse])
async def list_appointments(
    patient_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists appointments. If a caregiver requests a patient's appointments,
    verifies consent for `can_view_appointments` and logs an audit entry.
    """
    target_patient_id = current_user.id

    if patient_id and patient_id != current_user.id:
        if current_user.role != UserRole.CAREGIVER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access to patient appointments.",
            )

        res = await db.execute(
            select(CaregiverConsent).where(
                CaregiverConsent.patient_id == patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
        )
        consent = res.scalar_one_or_none()
        if not consent or not consent.can_view_appointments:
            audit = AuditLog(
                actor_id=current_user.id,
                patient_id=patient_id,
                action="access_denied_appointments",
                resource="appointments",
                details={"reason": "Missing appointments scope in consent"},
            )
            db.add(audit)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver has not been granted permission to view appointments.",
            )

        target_patient_id = patient_id
        audit = AuditLog(
            actor_id=current_user.id,
            patient_id=patient_id,
            action="access_granted_appointments",
            resource="appointments",
        )
        db.add(audit)
        await db.commit()

    res = await db.execute(
        select(Appointment)
        .where(Appointment.patient_id == target_patient_id)
        .order_by(Appointment.scheduled_time.desc())
    )
    return res.scalars().all()


@router.put("/{appointment_id}/cancel", response_model=AppointmentResponse)
async def cancel_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allows patient to cancel their upcoming appointment."""
    res = await db.execute(
        select(Appointment).where(
            Appointment.id == appointment_id,
            Appointment.patient_id == current_user.id,
        )
    )
    appointment = res.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    appointment.status = AppointmentStatus.CANCELLED
    await db.commit()
    await db.refresh(appointment)
    return appointment

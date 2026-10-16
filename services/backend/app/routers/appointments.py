from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.appointment import Appointment, Hospital, AppointmentStatus
from app.schemas.appointment import AppointmentCreate, AppointmentResponse
from app.routers.auth import get_current_user

router = APIRouter(prefix="/appointments", tags=["Doctor & Hospital Appointments"])


@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def book_appointment(
    payload: AppointmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify hospital exists
    res = await db.execute(select(Hospital).where(Hospital.id == payload.hospital_id))
    hospital = res.scalar_one_or_none()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found.")

    # Check for slot double-booking (within 30 minutes window for the same doctor or same patient)
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Appointment)
        .where(Appointment.patient_id == current_user.id)
        .order_by(Appointment.scheduled_time.desc())
    )
    return res.scalars().all()


@router.put("/{appointment_id}/cancel", response_model=AppointmentResponse)
async def cancel_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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

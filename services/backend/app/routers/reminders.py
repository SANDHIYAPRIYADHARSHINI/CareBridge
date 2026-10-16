from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.reminder import MedicineReminder, DoseLog, DoseStatus
from app.schemas.reminder import (
    ReminderCreate,
    ReminderResponse,
    DoseLogCreate,
    DoseLogResponse,
)
from app.routers.auth import get_current_user

router = APIRouter(prefix="/reminders", tags=["Medicine Reminders"])


@router.post("/", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_reminder(
    payload: ReminderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reminder = MedicineReminder(
        patient_id=current_user.id,
        medicine_name=payload.medicine_name,
        dosage=payload.dosage,
        instructions=payload.instructions,
        times_per_day=payload.times_per_day,
        slots=payload.slots,
        total_supply=payload.total_supply,
        remaining_supply=payload.remaining_supply,
        refill_threshold=payload.refill_threshold,
        is_verified_rx=payload.is_verified_rx,
    )
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return reminder


@router.get("/", response_model=list[ReminderResponse])
async def list_reminders(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(MedicineReminder)
        .where(MedicineReminder.patient_id == current_user.id)
        .options(selectinload(MedicineReminder.dose_logs))
    )
    return res.scalars().all()


@router.post("/{reminder_id}/doses", response_model=DoseLogResponse)
async def log_dose(
    reminder_id: str,
    payload: DoseLogCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(MedicineReminder).where(
            MedicineReminder.id == reminder_id,
            MedicineReminder.patient_id == current_user.id,
        )
    )
    reminder = res.scalar_one_or_none()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found.")

    # Decrement remaining supply when dose is taken
    taken_at = None
    if payload.status == DoseStatus.TAKEN:
        taken_at = datetime.utcnow()
        if reminder.remaining_supply is not None and reminder.remaining_supply > 0:
            reminder.remaining_supply -= 1

    dose = DoseLog(
        reminder_id=reminder.id,
        scheduled_time=payload.scheduled_time,
        status=payload.status,
        taken_at=taken_at,
    )
    db.add(dose)
    await db.commit()
    await db.refresh(dose)
    return dose


@router.get("/refills", response_model=list[ReminderResponse])
async def check_refills(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns reminders where remaining supply is at or below the refill threshold."""
    res = await db.execute(
        select(MedicineReminder).where(
            MedicineReminder.patient_id == current_user.id,
            MedicineReminder.remaining_supply != None,  # noqa: E711
            MedicineReminder.refill_threshold != None,  # noqa: E711
            MedicineReminder.remaining_supply <= MedicineReminder.refill_threshold,
        )
    )
    return res.scalars().all()

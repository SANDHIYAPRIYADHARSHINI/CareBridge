from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.audit import AuditLog
from app.models.consent import CaregiverConsent, ConsentStatus
from app.models.reminder import DoseLog, DoseStatus, MedicineReminder
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.schemas.reminder import (
    DoseLogCreate,
    DoseLogResponse,
    PrescriptionImportRequest,
    ReminderCreate,
    ReminderResponse,
    ReminderUpdate,
)

router = APIRouter(prefix="/reminders", tags=["Medicine Reminders"])


@router.post("/", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_reminder(
    payload: ReminderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new medicine reminder for the authenticated patient."""
    reminder = MedicineReminder(
        patient_id=current_user.id,
        medicine_name=payload.medicine_name.strip(),
        dosage=payload.dosage.strip(),
        instructions=payload.instructions.strip() if payload.instructions else None,
        times_per_day=payload.times_per_day,
        slots=payload.slots,
        total_supply=payload.total_supply,
        remaining_supply=payload.remaining_supply
        if payload.remaining_supply is not None
        else payload.total_supply,
        refill_threshold=payload.refill_threshold,
        is_verified_rx=payload.is_verified_rx,
    )
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return reminder


@router.post("/from-prescription", response_model=list[ReminderResponse], status_code=status.HTTP_201_CREATED)
async def import_reminders_from_prescription(
    payload: PrescriptionImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates reminders from verified prescription extraction instructions.
    Flags reminders as `is_verified_rx=True` to clearly distinguish them from manual entries.
    """
    created_reminders: list[MedicineReminder] = []
    for med in payload.medicines:
        reminder = MedicineReminder(
            patient_id=current_user.id,
            medicine_name=med.medicine_name.strip(),
            dosage=med.dosage.strip(),
            instructions=med.instructions.strip() if med.instructions else None,
            times_per_day=med.times_per_day,
            slots=med.slots,
            total_supply=med.total_supply,
            remaining_supply=med.remaining_supply if med.remaining_supply is not None else med.total_supply,
            refill_threshold=med.refill_threshold,
            is_verified_rx=payload.is_verified,
        )
        db.add(reminder)
        created_reminders.append(reminder)

    await db.commit()
    for rem in created_reminders:
        await db.refresh(rem)

    return created_reminders


@router.get("/", response_model=list[ReminderResponse])
async def list_reminders(
    patient_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists reminders. If a caregiver accesses a patient's reminders,
    verifies consent for `can_view_reminders` and logs an audit record.
    """
    target_patient_id = current_user.id

    if patient_id and patient_id != current_user.id:
        if current_user.role != UserRole.CAREGIVER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access to patient reminders.",
            )

        # Check consent
        res = await db.execute(
            select(CaregiverConsent).where(
                CaregiverConsent.patient_id == patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
        )
        consent = res.scalar_one_or_none()
        if not consent or not consent.can_view_reminders:
            audit = AuditLog(
                actor_id=current_user.id,
                patient_id=patient_id,
                action="access_denied_reminders",
                resource="reminders",
                details={"reason": "Missing reminders scope in consent"},
            )
            db.add(audit)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver has not been granted permission to view medication reminders.",
            )

        target_patient_id = patient_id
        audit = AuditLog(
            actor_id=current_user.id,
            patient_id=patient_id,
            action="access_granted_reminders",
            resource="reminders",
        )
        db.add(audit)
        await db.commit()

    res = await db.execute(
        select(MedicineReminder)
        .where(MedicineReminder.patient_id == target_patient_id)
        .options(selectinload(MedicineReminder.dose_logs))
        .order_by(MedicineReminder.created_at.desc())
    )
    return res.scalars().all()


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


@router.get("/{reminder_id}", response_model=ReminderResponse)
async def get_reminder(
    reminder_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves a single reminder by ID with authorization check."""
    res = await db.execute(
        select(MedicineReminder)
        .where(MedicineReminder.id == reminder_id)
        .options(selectinload(MedicineReminder.dose_logs))
    )
    reminder = res.scalar_one_or_none()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found.")

    if reminder.patient_id != current_user.id:
        if current_user.role != UserRole.CAREGIVER:
            raise HTTPException(status_code=403, detail="Unauthorized access to reminder.")

        consent_res = await db.execute(
            select(CaregiverConsent).where(
                CaregiverConsent.patient_id == reminder.patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
        )
        consent = consent_res.scalar_one_or_none()
        if not consent or not consent.can_view_reminders:
            raise HTTPException(status_code=403, detail="Caregiver lacks reminder view permission.")

    return reminder


@router.put("/{reminder_id}", response_model=ReminderResponse)
async def update_reminder(
    reminder_id: str,
    payload: ReminderUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Updates reminder settings, remaining supply, or threshold for the patient owner.
    Caregivers cannot alter patient reminders directly.
    """
    res = await db.execute(
        select(MedicineReminder).where(
            MedicineReminder.id == reminder_id,
            MedicineReminder.patient_id == current_user.id,
        )
    )
    reminder = res.scalar_one_or_none()
    if not reminder:
        raise HTTPException(
            status_code=404, detail="Reminder not found or unauthorized to edit."
        )

    if payload.medicine_name is not None:
        reminder.medicine_name = payload.medicine_name.strip()
    if payload.dosage is not None:
        reminder.dosage = payload.dosage.strip()
    if payload.instructions is not None:
        reminder.instructions = payload.instructions.strip()
    if payload.times_per_day is not None:
        reminder.times_per_day = payload.times_per_day
    if payload.slots is not None:
        reminder.slots = payload.slots
    if payload.total_supply is not None:
        reminder.total_supply = payload.total_supply
    if payload.remaining_supply is not None:
        reminder.remaining_supply = max(0, payload.remaining_supply)
    if payload.refill_threshold is not None:
        reminder.refill_threshold = payload.refill_threshold
    if payload.is_active is not None:
        reminder.is_active = payload.is_active

    await db.commit()
    await db.refresh(reminder)
    return reminder


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(
    reminder_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deletes a reminder and its associated dose logs. Owner authorization enforced."""
    res = await db.execute(
        select(MedicineReminder).where(
            MedicineReminder.id == reminder_id,
            MedicineReminder.patient_id == current_user.id,
        )
    )
    reminder = res.scalar_one_or_none()
    if not reminder:
        raise HTTPException(
            status_code=404, detail="Reminder not found or unauthorized to delete."
        )

    await db.delete(reminder)
    await db.commit()


@router.post("/{reminder_id}/doses", response_model=DoseLogResponse)
async def log_dose(
    reminder_id: str,
    payload: DoseLogCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allows patient to mark a scheduled dose as taken or missed, updating supply count."""
    res = await db.execute(
        select(MedicineReminder).where(
            MedicineReminder.id == reminder_id,
            MedicineReminder.patient_id == current_user.id,
        )
    )
    reminder = res.scalar_one_or_none()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found.")

    taken_at = None
    if payload.status == DoseStatus.TAKEN:
        taken_at = datetime.now(UTC)
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

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.appointment import Appointment
from app.models.audit import AuditLog
from app.models.consent import CaregiverConsent, ConsentStatus
from app.models.reminder import MedicineReminder
from app.models.user import User, UserRole
from app.routers.auth import get_current_user

router = APIRouter(prefix="/timeline", tags=["Health Timeline"])


@router.get("/")
async def get_timeline(
    patient_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_patient_id = current_user.id

    # If caregiver is requesting patient timeline, verify consent permissions
    if patient_id and patient_id != current_user.id:
        if current_user.role != UserRole.CAREGIVER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access to patient timeline.",
            )

        res = await db.execute(
            select(CaregiverConsent).where(
                CaregiverConsent.patient_id == patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
        )
        consent = res.scalar_one_or_none()
        if not consent or not consent.can_view_records:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient consent has not been granted for medical records.",
            )
        target_patient_id = patient_id

        # Log sensitive caregiver access
        audit = AuditLog(
            actor_id=current_user.id,
            patient_id=target_patient_id,
            action="view_patient_timeline",
            resource="timeline",
        )
        db.add(audit)
        await db.commit()

    events = []

    # Fetch reminders
    res_reminders = await db.execute(
        select(MedicineReminder).where(MedicineReminder.patient_id == target_patient_id)
    )
    for r in res_reminders.scalars().all():
        events.append({
            "id": f"rem-{r.id}",
            "type": "reminder",
            "title": f"Medication: {r.medicine_name} {r.dosage}",
            "description": f"Scheduled {r.times_per_day}x daily ({', '.join(r.slots)})",
            "timestamp": r.created_at.isoformat(),
            "is_verified": r.is_verified_rx,
        })

    # Fetch appointments
    res_appointments = await db.execute(
        select(Appointment).where(Appointment.patient_id == target_patient_id)
    )
    for a in res_appointments.scalars().all():
        events.append({
            "id": f"apt-{a.id}",
            "type": "appointment",
            "title": f"Consultation with Dr. {a.doctor_name}",
            "description": f"Department: {a.department} - Status: {a.status.value}",
            "timestamp": a.scheduled_time.isoformat(),
            "is_verified": True,
        })

    # Sort events chronologically descending
    events.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"patient_id": target_patient_id, "events": events}

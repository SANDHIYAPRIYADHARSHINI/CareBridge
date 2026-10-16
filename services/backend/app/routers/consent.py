from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, UserRole
from app.models.consent import CaregiverConsent, ConsentStatus
from app.models.audit import AuditLog
from app.schemas.consent import (
    ConsentRequestCreate,
    ConsentUpdatePayload,
    CaregiverConsentResponse,
)
from app.routers.auth import get_current_user

router = APIRouter(prefix="/consent", tags=["Caregiver Consent"])


@router.post("/request", response_model=CaregiverConsentResponse, status_code=status.HTTP_201_CREATED)
async def request_access(
    payload: ConsentRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != UserRole.CAREGIVER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only registered caregivers can request patient access.",
        )

    # Find patient
    res = await db.execute(select(User).where(User.email == payload.patient_email))
    patient = res.scalar_one_or_none()
    if not patient or patient.role != UserRole.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found with the provided email.",
        )

    # Check for existing consent
    res = await db.execute(
        select(CaregiverConsent).where(
            CaregiverConsent.patient_id == patient.id,
            CaregiverConsent.caregiver_id == current_user.id,
        )
    )
    existing = res.scalar_one_or_none()
    if existing and existing.status in [ConsentStatus.PENDING, ConsentStatus.APPROVED]:
        return existing

    consent = CaregiverConsent(
        patient_id=patient.id,
        caregiver_id=current_user.id,
        status=ConsentStatus.PENDING,
        can_view_prescriptions=payload.permissions.can_view_prescriptions,
        can_view_reminders=payload.permissions.can_view_reminders,
        can_view_appointments=payload.permissions.can_view_appointments,
        can_view_records=payload.permissions.can_view_records,
    )
    db.add(consent)

    # Log audit entry
    audit = AuditLog(
        actor_id=current_user.id,
        patient_id=patient.id,
        action="request_caregiver_access",
        resource="consent",
    )
    db.add(audit)

    await db.commit()
    await db.refresh(consent)
    return consent


@router.get("/patient", response_model=list[CaregiverConsentResponse])
async def list_patient_consents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists caregiver consent records for the authenticated patient."""
    res = await db.execute(
        select(CaregiverConsent).where(CaregiverConsent.patient_id == current_user.id)
    )
    return res.scalars().all()


@router.put("/{consent_id}", response_model=CaregiverConsentResponse)
async def update_consent(
    consent_id: str,
    payload: ConsentUpdatePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allows patient to approve, modify permissions, or revoke caregiver access."""
    res = await db.execute(
        select(CaregiverConsent).where(
            CaregiverConsent.id == consent_id,
            CaregiverConsent.patient_id == current_user.id,
        )
    )
    consent = res.scalar_one_or_none()
    if not consent:
        raise HTTPException(status_code=404, detail="Consent record not found.")

    consent.status = payload.status
    if payload.status == ConsentStatus.APPROVED:
        consent.responded_at = datetime.utcnow()
    elif payload.status == ConsentStatus.REVOKED:
        consent.revoked_at = datetime.utcnow()

    if payload.permissions:
        consent.can_view_prescriptions = payload.permissions.can_view_prescriptions
        consent.can_view_reminders = payload.permissions.can_view_reminders
        consent.can_view_appointments = payload.permissions.can_view_appointments
        consent.can_view_records = payload.permissions.can_view_records

    # Audit log
    audit = AuditLog(
        actor_id=current_user.id,
        patient_id=consent.patient_id,
        action=f"update_consent_{payload.status.value}",
        resource="consent",
        details={"status": payload.status.value},
    )
    db.add(audit)

    await db.commit()
    await db.refresh(consent)
    return consent

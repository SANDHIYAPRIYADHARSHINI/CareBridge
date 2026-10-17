from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.appointment import Appointment
from app.models.audit import AuditLog
from app.models.consent import CaregiverConsent, ConsentStatus
from app.models.reminder import MedicineReminder
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.schemas.consent import (
    AuditLogResponse,
    CaregiverConsentResponse,
    ConsentRequestCreate,
    ConsentUpdatePayload,
    PatientSummaryForCaregiverResponse,
    PermissionsPayload,
)

router = APIRouter(prefix="/consent", tags=["Caregiver Consent"])


async def format_consent_response(consent: CaregiverConsent, db: AsyncSession) -> CaregiverConsentResponse:
    """Helper to populate patient and caregiver display details."""
    patient = await db.get(User, consent.patient_id)
    caregiver = await db.get(User, consent.caregiver_id)
    return CaregiverConsentResponse(
        id=consent.id,
        patient_id=consent.patient_id,
        caregiver_id=consent.caregiver_id,
        patient_name=patient.full_name if patient else "Unknown Patient",
        patient_email=patient.email if patient else "unknown",
        caregiver_name=caregiver.full_name if caregiver else "Unknown Caregiver",
        caregiver_email=caregiver.email if caregiver else "unknown",
        status=consent.status,
        can_view_prescriptions=consent.can_view_prescriptions,
        can_view_reminders=consent.can_view_reminders,
        can_view_appointments=consent.can_view_appointments,
        can_view_records=consent.can_view_records,
        requested_at=consent.requested_at,
        responded_at=consent.responded_at,
        revoked_at=consent.revoked_at,
    )


@router.post("/request", response_model=CaregiverConsentResponse, status_code=status.HTTP_201_CREATED)
async def request_access(
    payload: ConsentRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allows a registered caregiver to request access to a patient's health records."""
    if current_user.role != UserRole.CAREGIVER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only registered caregivers can request patient access.",
        )

    patient_email = payload.patient_email.lower().strip()
    if patient_email == current_user.email.lower().strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot request caregiver access to your own account.",
        )

    # Find patient
    res = await db.execute(select(User).where(User.email == patient_email))
    patient = res.scalar_one_or_none()
    if not patient or patient.role != UserRole.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found with the provided email address.",
        )

    # Check for existing request
    res = await db.execute(
        select(CaregiverConsent).where(
            CaregiverConsent.patient_id == patient.id,
            CaregiverConsent.caregiver_id == current_user.id,
        )
    )
    consent = res.scalar_one_or_none()
    if consent:
        if consent.status == ConsentStatus.APPROVED:
            return await format_consent_response(consent, db)
        # Reactivate or update request if revoked or rejected
        consent.status = ConsentStatus.PENDING
        consent.can_view_prescriptions = payload.permissions.can_view_prescriptions
        consent.can_view_reminders = payload.permissions.can_view_reminders
        consent.can_view_appointments = payload.permissions.can_view_appointments
        consent.can_view_records = payload.permissions.can_view_records
        consent.requested_at = datetime.utcnow()
        consent.responded_at = None
        consent.revoked_at = None
    else:
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
        details={
            "caregiver_email": current_user.email,
            "patient_email": patient.email,
            "permissions": payload.permissions.model_dump(),
        },
    )
    db.add(audit)

    await db.commit()
    await db.refresh(consent)
    return await format_consent_response(consent, db)


@router.get("/patient", response_model=list[CaregiverConsentResponse])
async def list_patient_consents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists caregiver consent records for the authenticated patient."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to patient accounts.",
        )

    res = await db.execute(
        select(CaregiverConsent).where(CaregiverConsent.patient_id == current_user.id)
    )
    consents = res.scalars().all()
    return [await format_consent_response(c, db) for c in consents]


@router.get("/caregiver", response_model=list[CaregiverConsentResponse])
async def list_caregiver_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists outgoing access requests and approved patients for the authenticated caregiver."""
    if current_user.role != UserRole.CAREGIVER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to caregiver accounts.",
        )

    res = await db.execute(
        select(CaregiverConsent).where(CaregiverConsent.caregiver_id == current_user.id)
    )
    consents = res.scalars().all()
    return [await format_consent_response(c, db) for c in consents]


@router.put("/{consent_id}", response_model=CaregiverConsentResponse)
async def update_consent(
    consent_id: str,
    payload: ConsentUpdatePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allows patient to approve, modify permissions, or revoke caregiver access."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patients can manage consent permissions.",
        )

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
    elif payload.status in [ConsentStatus.REVOKED, ConsentStatus.REJECTED]:
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
        details={
            "status": payload.status.value,
            "permissions": {
                "can_view_prescriptions": consent.can_view_prescriptions,
                "can_view_reminders": consent.can_view_reminders,
                "can_view_appointments": consent.can_view_appointments,
                "can_view_records": consent.can_view_records,
            },
        },
    )
    db.add(audit)

    await db.commit()
    await db.refresh(consent)
    return await format_consent_response(consent, db)


@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def get_audit_logs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns access audit logs for the authenticated patient."""
    res = await db.execute(
        select(AuditLog)
        .where(AuditLog.patient_id == current_user.id)
        .order_by(AuditLog.timestamp.desc())
    )
    logs = res.scalars().all()

    output = []
    for log in logs:
        actor = await db.get(User, log.actor_id)
        output.append(
            AuditLogResponse(
                id=log.id,
                actor_id=log.actor_id,
                patient_id=log.patient_id,
                actor_name=actor.full_name if actor else "System",
                action=log.action,
                resource=log.resource,
                timestamp=log.timestamp,
                details=log.details,
            )
        )
    return output


@router.get("/patient-summary/{patient_id}", response_model=PatientSummaryForCaregiverResponse)
async def get_patient_summary_for_caregiver(
    patient_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Enforces server-side authorization: allows an authorized caregiver
    to view only the specific categories approved by the patient.
    """
    if current_user.role != UserRole.CAREGIVER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only registered caregivers can access patient summaries.",
        )

    patient = await db.get(User, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    # Check active approved consent
    res = await db.execute(
        select(CaregiverConsent).where(
            CaregiverConsent.patient_id == patient_id,
            CaregiverConsent.caregiver_id == current_user.id,
            CaregiverConsent.status == ConsentStatus.APPROVED,
        )
    )
    consent = res.scalar_one_or_none()

    if not consent:
        # Audit log unauthorized access attempt
        audit = AuditLog(
            actor_id=current_user.id,
            patient_id=patient_id,
            action="access_denied_no_consent",
            resource="patient_summary",
            details={"reason": "No approved consent on record"},
        )
        db.add(audit)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patient has not approved caregiver access to their records.",
        )

    # Filter categories according to consent scopes
    reminders_data = []
    appointments_data = []
    prescriptions_data = []
    restricted_scopes = []

    if consent.can_view_reminders:
        res_rem = await db.execute(
            select(MedicineReminder)
            .where(MedicineReminder.patient_id == patient_id)
            .options(selectinload(MedicineReminder.dose_logs))
        )
        for r in res_rem.scalars().all():
            reminders_data.append({
                "id": r.id,
                "medicine_name": r.medicine_name,
                "dosage": r.dosage,
                "slots": r.slots,
                "remaining_supply": r.remaining_supply,
                "is_verified_rx": r.is_verified_rx,
            })
    else:
        restricted_scopes.append("reminders")

    if consent.can_view_appointments:
        res_apt = await db.execute(
            select(Appointment).where(Appointment.patient_id == patient_id)
        )
        for a in res_apt.scalars().all():
            appointments_data.append({
                "id": a.id,
                "doctor_name": a.doctor_name,
                "department": a.department,
                "scheduled_time": a.scheduled_time.isoformat(),
                "status": a.status.value,
            })
    else:
        restricted_scopes.append("appointments")

    if not consent.can_view_prescriptions:
        restricted_scopes.append("prescriptions")

    if not consent.can_view_records:
        restricted_scopes.append("medical_records")

    # Audit log successful permitted access
    audit = AuditLog(
        actor_id=current_user.id,
        patient_id=patient_id,
        action="access_granted_caregiver_summary",
        resource="patient_summary",
        details={
            "viewed_scopes": [
                s for s in ["reminders", "appointments", "prescriptions", "records"]
                if s not in restricted_scopes
            ],
            "restricted_scopes": restricted_scopes,
        },
    )
    db.add(audit)
    await db.commit()

    return PatientSummaryForCaregiverResponse(
        patient_id=patient.id,
        patient_name=patient.full_name,
        permissions=PermissionsPayload(
            can_view_prescriptions=consent.can_view_prescriptions,
            can_view_reminders=consent.can_view_reminders,
            can_view_appointments=consent.can_view_appointments,
            can_view_records=consent.can_view_records,
        ),
        reminders=reminders_data,
        appointments=appointments_data,
        prescriptions=prescriptions_data,
        restricted_scopes=restricted_scopes,
    )

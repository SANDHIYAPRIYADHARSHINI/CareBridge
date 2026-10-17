from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.appointment import Appointment
from app.models.audit import AuditLog
from app.models.consent import CaregiverConsent, ConsentStatus
from app.models.health_record import HealthRecord, HealthRecordType
from app.models.reminder import DoseLog, MedicineReminder
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.schemas.timeline import (
    HealthRecordCreate,
    HealthRecordResponse,
    TimelineEventItem,
    TimelineResponse,
)

router = APIRouter(prefix="/timeline", tags=["Health Timeline"])


async def seed_synthetic_health_records(db: AsyncSession, patient_id: str) -> None:
    """Provisions realistic synthetic clinical records for demonstration."""
    sample_records = [
        HealthRecord(
            patient_id=patient_id,
            record_type=HealthRecordType.PRESCRIPTION,
            title="Outpatient Prescription #AP-9041 (Cardiology & Diabetology)",
            description=(
                "Clinical prescription for Metformin 500mg, Atorvastatin 20mg, and Telmisartan 40mg. "
                "Verified via Member 1 AI Vision OCR service against physical prescription scan."
            ),
            doctor_name="Dr. K. Senthil Nathan, MD",
            hospital_name="Apollo Speciality Hospital (Greams Road)",
            department="Cardiology & Diabetology",
            record_date=datetime(2026, 10, 14, 11, 45, tzinfo=UTC),
            document_url="/rx_demo_001.png",
            is_verified=True,
            confidence=0.96,
            status="verified",
            flags=[],
            source="Member 1 AI Prescription Extraction",
            metadata_payload={
                "medicines_count": 3,
                "medicines": [
                    {"name": "Metformin Hydrochloride", "dosage": "500 mg", "frequency": "1-0-1"},
                    {"name": "Atorvastatin Calcium", "dosage": "20 mg", "frequency": "0-0-1"},
                    {"name": "Telmisartan", "dosage": "40 mg", "frequency": "1-0-0"},
                ],
                "scan_id": "scan-rx-001",
            },
        ),
        HealthRecord(
            patient_id=patient_id,
            record_type=HealthRecordType.REPORT,
            title="Comprehensive Metabolic Panel & Glycated Hemoglobin (HbA1c)",
            description=(
                "Fasting Blood Sugar: 134 mg/dL (Elevated), HbA1c: 7.2% (Moderate control), "
                "Serum Creatinine: 0.9 mg/dL (Normal), eGFR: >90 mL/min."
            ),
            doctor_name="Dr. Priya Ramaswamy, Pathologist",
            hospital_name="Metropolis Diagnostic Center & Lab",
            department="Clinical Biochemistry",
            record_date=datetime(2026, 10, 8, 8, 30, tzinfo=UTC),
            document_url="/lab_report_demo.pdf",
            is_verified=True,
            confidence=0.98,
            status="verified",
            flags=[],
            source="Metropolis Diagnostic Laboratory",
            metadata_payload={
                "hba1c": "7.2%",
                "fasting_glucose": "134 mg/dL",
                "creatinine": "0.9 mg/dL",
                "normal_range_flag": "mildly_elevated",
            },
        ),
        HealthRecord(
            patient_id=patient_id,
            record_type=HealthRecordType.DISCHARGE,
            title="Inpatient Discharge Summary — Elective Angioplasty",
            description=(
                "Patient successfully underwent elective DES placement to LAD. Hemodynamically stable. "
                "Advised dual antiplatelet therapy and low-sodium diet. Warning: Follow-up required within 6 weeks."
            ),
            doctor_name="Dr. V. Anand, MCh (Cardio)",
            hospital_name="Apollo Hospital (Greams Road)",
            department="Interventional Cardiology",
            record_date=datetime(2026, 2, 18, 14, 0, tzinfo=UTC),
            document_url="/discharge_summary_demo.pdf",
            is_verified=True,
            confidence=0.91,
            status="verified",
            flags=["Follow-up overdue (>6 months)", "Requires updated echo screening"],
            source="Hospital Electronic Medical Record",
            metadata_payload={
                "admission_date": "2026-02-15",
                "discharge_date": "2026-02-18",
                "procedure": "Drug-Eluting Stent (DES) to LAD",
                "overdue_followup": True,
            },
        ),
        HealthRecord(
            patient_id=patient_id,
            record_type=HealthRecordType.REPORT,
            title="Chest X-Ray (PA View) & 12-Lead Electrocardiogram",
            description="Cardiothoracic ratio normal. Normal sinus rhythm with no acute ST-segment changes.",
            doctor_name="Dr. R. Ramanathan, Radiologist",
            hospital_name="Apollo Diagnostic Services",
            department="Radiology & Imaging",
            record_date=datetime(2026, 2, 16, 10, 15, tzinfo=UTC),
            document_url="/radiology_demo.pdf",
            is_verified=True,
            confidence=0.94,
            status="verified",
            flags=[],
            source="Hospital Imaging PACS",
            metadata_payload={"findings": "Normal sinus rhythm, clear lung fields"},
        ),
    ]

    for rec in sample_records:
        db.add(rec)
    await db.commit()


@router.get("/", response_model=TimelineResponse)
async def get_timeline(
    patient_id: str | None = Query(None, description="Patient ID for caregiver queries"),
    record_type: str | None = Query(
        None,
        description="Filter by type: prescription, report, discharge, reminder, dose_log, appointment",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Unified chronological health timeline combining prescriptions, reports, discharge summaries,

    reminders, dose adherence logs, and appointments with permission-based access control.
    """
    target_patient_id = current_user.id

    # Scope flags
    can_view_prescriptions = True
    can_view_reminders = True
    can_view_appointments = True
    can_view_records = True

    # Authorization Check for Caregivers
    if patient_id and patient_id != current_user.id:
        if current_user.role != UserRole.CAREGIVER and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: Only authorized caregivers can view patient timelines.",
            )

        res_consent = await db.execute(
            select(CaregiverConsent).where(
                CaregiverConsent.patient_id == patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
        )
        consent = res_consent.scalar_one_or_none()

        if not consent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver has not been authorized by this patient.",
            )

        can_view_prescriptions = consent.can_view_prescriptions
        can_view_reminders = consent.can_view_reminders
        can_view_appointments = consent.can_view_appointments
        can_view_records = consent.can_view_records

        # If all categories are restricted, reject access completely
        if not any([
            can_view_prescriptions,
            can_view_reminders,
            can_view_appointments,
            can_view_records,
        ]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient consent settings restrict access to all health timeline categories.",
            )

        target_patient_id = patient_id

        # Record audit log
        audit = AuditLog(
            actor_id=current_user.id,
            patient_id=target_patient_id,
            action="view_patient_timeline",
            resource="timeline",
            details={
                "can_view_prescriptions": can_view_prescriptions,
                "can_view_reminders": can_view_reminders,
                "can_view_appointments": can_view_appointments,
                "can_view_records": can_view_records,
                "filter_record_type": record_type,
            },
        )
        db.add(audit)
        await db.commit()

    # Seed synthetic health records if patient currently has 0
    res_count = await db.execute(
        select(HealthRecord).where(HealthRecord.patient_id == target_patient_id).limit(1)
    )
    if not res_count.scalar_one_or_none():
        await seed_synthetic_health_records(db, target_patient_id)

    events: list[TimelineEventItem] = []

    # 1. Health Records (Prescriptions, Reports, Discharge Summaries)
    res_records = await db.execute(
        select(HealthRecord).where(HealthRecord.patient_id == target_patient_id)
    )
    for hr in res_records.scalars().all():
        rec_type = (
            hr.record_type.value
            if hasattr(hr.record_type, "value")
            else str(hr.record_type)
        )

        # Permission check
        if rec_type == "prescription" and not can_view_prescriptions:
            continue
        if rec_type in ("report", "discharge", "other") and not can_view_records:
            continue

        events.append(
            TimelineEventItem(
                id=f"rec-{hr.id}",
                type=rec_type,
                title=hr.title,
                description=hr.description,
                timestamp=hr.record_date,
                source=hr.source,
                doctor_name=hr.doctor_name,
                hospital_name=hr.hospital_name,
                document_url=hr.document_url,
                is_verified=hr.is_verified,
                confidence=hr.confidence,
                status=hr.status,
                flags=hr.flags or [],
                metadata=hr.metadata_payload or {},
            )
        )

    # 2. Medicine Reminders & Dose Logs
    if can_view_reminders:
        res_reminders = await db.execute(
            select(MedicineReminder).where(MedicineReminder.patient_id == target_patient_id)
        )
        for r in res_reminders.scalars().all():
            rem_flags = []
            if (
                r.remaining_supply is not None
                and r.refill_threshold is not None
                and r.remaining_supply <= r.refill_threshold
            ):
                rem_flags.append(
                    f"Low supply remaining: {r.remaining_supply} doses left (threshold: {r.refill_threshold})"
                )

            events.append(
                TimelineEventItem(
                    id=f"rem-{r.id}",
                    type="reminder",
                    title=f"Medication Reminder: {r.medicine_name} ({r.dosage})",
                    description=f"Scheduled {r.times_per_day}x daily ({', '.join(r.slots)}). {r.instructions or 'Take as prescribed.'}",
                    timestamp=r.created_at,
                    source=(
                        "Verified Prescription Regimen"
                        if r.is_verified_rx
                        else "Patient Self-Registered Reminder"
                    ),
                    is_verified=r.is_verified_rx,
                    status="active" if r.is_active else "paused",
                    flags=rem_flags,
                    metadata={
                        "slots": r.slots,
                        "times_per_day": r.times_per_day,
                        "remaining_supply": r.remaining_supply,
                        "refill_threshold": r.refill_threshold,
                    },
                )
            )

            # Dose Logs
            res_doses = await db.execute(
                select(DoseLog).where(DoseLog.reminder_id == r.id)
            )
            for d in res_doses.scalars().all():
                d_status_str = d.status.value if hasattr(d.status, "value") else str(d.status)
                dose_flags = []
                if d_status_str == "missed":
                    dose_flags.append("Missed scheduled medication dose")

                events.append(
                    TimelineEventItem(
                        id=f"dose-{d.id}",
                        type="dose_log",
                        title=f"Dose Adherence: {r.medicine_name} — {d_status_str.upper()}",
                        description=f"Status: {d_status_str.capitalize()}. Scheduled: {d.scheduled_time.strftime('%b %d, %H:%M')}. Notes: {d.notes or 'None'}",
                        timestamp=d.taken_at or d.scheduled_time,
                        source="CareBridge Adherence Tracker",
                        is_verified=True,
                        status=d_status_str,
                        flags=dose_flags,
                        metadata={
                            "reminder_id": r.id,
                            "medicine_name": r.medicine_name,
                            "dosage": r.dosage,
                            "dose_status": d_status_str,
                        },
                    )
                )

    # 3. Appointments
    if can_view_appointments:
        res_apts = await db.execute(
            select(Appointment).where(Appointment.patient_id == target_patient_id)
        )
        for a in res_apts.scalars().all():
            events.append(
                TimelineEventItem(
                    id=f"apt-{a.id}",
                    type="appointment",
                    title=f"Doctor Appointment: Dr. {a.doctor_name} ({a.department})",
                    description=f"Hospital: {a.hospital_name}. Status: {a.status.value.upper()}. Notes: {a.notes or 'Scheduled consultation'}",
                    timestamp=a.scheduled_time,
                    source="Hospital Booking System",
                    doctor_name=a.doctor_name,
                    hospital_name=a.hospital_name,
                    is_verified=True,
                    status=a.status.value,
                    flags=[],
                    metadata={
                        "hospital_id": a.hospital_id,
                        "department": a.department,
                        "status": a.status.value,
                    },
                )
            )

    # Apply filter if specified
    if record_type and record_type != "all":
        events = [e for e in events if e.type == record_type]

    # Sort chronologically descending
    events.sort(key=lambda x: x.timestamp, reverse=True)

    return TimelineResponse(
        patient_id=target_patient_id,
        total_events=len(events),
        events=events,
    )


@router.post("/records", response_model=HealthRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_health_record(
    payload: HealthRecordCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Manually add or import a verified clinical health record."""
    record = HealthRecord(
        patient_id=current_user.id,
        record_type=payload.record_type,
        title=payload.title,
        description=payload.description,
        doctor_name=payload.doctor_name,
        hospital_name=payload.hospital_name,
        department=payload.department,
        record_date=payload.record_date or datetime.now(UTC),
        document_url=payload.document_url,
        is_verified=payload.is_verified,
        confidence=payload.confidence,
        status=payload.status,
        flags=payload.flags,
        source=payload.source,
        metadata_payload=payload.metadata_payload,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/records/{record_id}", response_model=HealthRecordResponse)
async def get_health_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Retrieve details of a single health record with authorization check."""
    res = await db.execute(select(HealthRecord).where(HealthRecord.id == record_id))
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Health record not found.",
        )

    # Permission check if caller is caregiver
    if record.patient_id != current_user.id:
        if current_user.role != UserRole.CAREGIVER and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access to this health record.",
            )

        res_consent = await db.execute(
            select(CaregiverConsent).where(
                CaregiverConsent.patient_id == record.patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
        )
        consent = res_consent.scalar_one_or_none()
        if not consent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver has not been authorized to view this patient's records.",
            )

        rec_type = (
            record.record_type.value
            if hasattr(record.record_type, "value")
            else str(record.record_type)
        )
        if rec_type == "prescription" and not consent.can_view_prescriptions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient consent restricts access to prescriptions.",
            )
        if rec_type in ("report", "discharge", "other") and not consent.can_view_records:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient consent restricts access to medical records.",
            )

    return record


@router.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_health_record(
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a health record (patient only)."""
    res = await db.execute(
        select(HealthRecord).where(
            HealthRecord.id == record_id,
            HealthRecord.patient_id == current_user.id,
        )
    )
    record = res.scalar_one_or_none()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Health record not found or not owned by user.",
        )

    await db.delete(record)
    await db.commit()

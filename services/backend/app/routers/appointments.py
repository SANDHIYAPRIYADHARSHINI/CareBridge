from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.appointment import (
    Appointment,
    AppointmentSlot,
    AppointmentStatus,
    Doctor,
    Hospital,
)
from app.models.audit import AuditLog
from app.models.consent import CaregiverConsent, ConsentStatus
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.routers.hospitals import SYNTHETIC_HOSPITALS
from app.schemas.appointment import (
    AppointmentCancel,
    AppointmentCreate,
    AppointmentResponse,
    DoctorResponse,
    SlotResponse,
)

router = APIRouter(prefix="/appointments", tags=["Doctor & Hospital Appointments"])


SYNTHETIC_DOCTORS = [
    {
        "name": "Dr. K. Senthil Nathan, MD, DM",
        "department": "Cardiology & Diabetology",
        "qualification": "MBBS, MD (Gen Med), DM (Cardiology)",
        "consultation_fee": 800,
        "available_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "hospital_keyword": "Apollo Speciality Hospital (Greams Road)",
    },
    {
        "name": "Dr. R. Anitha Devi, MS, MCh",
        "department": "Neuro Surgery & Stroke Care",
        "qualification": "MBBS, MS (Gen Surg), MCh (Neuro Surgery)",
        "consultation_fee": 900,
        "available_days": ["Monday", "Wednesday", "Friday", "Saturday"],
        "hospital_keyword": "Apollo Speciality Hospital (Greams Road)",
    },
    {
        "name": "Dr. P. Vimala Devi, MS",
        "department": "Ophthalmology & Retina",
        "qualification": "MBBS, MS (Ophthalmology), FICO",
        "consultation_fee": 300,
        "available_days": ["Monday", "Tuesday", "Thursday", "Friday"],
        "hospital_keyword": "Rajiv Gandhi Government General Hospital (RGGGH)",
    },
    {
        "name": "Dr. M. Rajesh Kumar, MD",
        "department": "General & Emergency Medicine",
        "qualification": "MBBS, MD (Internal Medicine)",
        "consultation_fee": 250,
        "available_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "hospital_keyword": "Rajiv Gandhi Government General Hospital (RGGGH)",
    },
    {
        "name": "Dr. V. Sundararajan, MS",
        "department": "Orthopedics & Joint Replacement",
        "qualification": "MBBS, MS (Ortho), MCh (Ortho UK)",
        "consultation_fee": 850,
        "available_days": ["Tuesday", "Wednesday", "Thursday", "Saturday"],
        "hospital_keyword": "MIOT International",
    },
    {
        "name": "Dr. Deepa Sundaram, MD, DNB",
        "department": "Internal Medicine & Geriatrics",
        "qualification": "MBBS, MD (Gen Med), DNB",
        "consultation_fee": 750,
        "available_days": ["Monday", "Wednesday", "Friday"],
        "hospital_keyword": "Fortis Malar Hospital",
    },
    {
        "name": "Dr. S. Balasubramanian, MD, DM",
        "department": "Gastroenterology & Hepatology",
        "qualification": "MBBS, MD, DM (Gastro)",
        "consultation_fee": 800,
        "available_days": ["Monday", "Tuesday", "Thursday", "Friday"],
        "hospital_keyword": "Kauvery Hospital (Alwarpet)",
    },
    {
        "name": "Dr. T. Shanmugam, MS, MCh",
        "department": "Trauma & Spine Surgery",
        "qualification": "MBBS, MS, MCh (Spine)",
        "consultation_fee": 700,
        "available_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        "hospital_keyword": "Ganga Hospital",
    },
    {
        "name": "Dr. Meena Krishnan, MD",
        "department": "Cardiology & Cardiac Electrophysiology",
        "qualification": "MBBS, MD, DM (Cardio)",
        "consultation_fee": 650,
        "available_days": ["Monday", "Wednesday", "Thursday", "Saturday"],
        "hospital_keyword": "Meenakshi Mission Hospital & Research Centre",
    },
]


async def auto_seed_doctors_and_slots(db: AsyncSession):
    """Auto-seeds synthetic doctors and appointment slots across hospitals."""
    # Ensure hospitals exist first
    hosp_res = await db.execute(select(Hospital))
    hospitals = list(hosp_res.scalars().all())
    if not hospitals:
        for h_data in SYNTHETIC_HOSPITALS:
            db.add(Hospital(**h_data, last_updated=datetime.now(UTC)))
        await db.commit()
        hosp_res = await db.execute(select(Hospital))
        hospitals = list(hosp_res.scalars().all())

    hosp_map = {h.name.lower(): h for h in hospitals}

    doc_res = await db.execute(select(Doctor))
    existing_docs = list(doc_res.scalars().all())
    if existing_docs:
        return

    # Seed doctors
    created_doctors = []
    for doc_data in SYNTHETIC_DOCTORS:
        # Match hospital
        kw = doc_data["hospital_keyword"].lower()
        matched_hosp = next((h for name, h in hosp_map.items() if kw in name), hospitals[0])

        doc = Doctor(
            name=doc_data["name"],
            department=doc_data["department"],
            qualification=doc_data["qualification"],
            consultation_fee=doc_data["consultation_fee"],
            available_days=doc_data["available_days"],
            hospital_id=matched_hosp.id,
            is_active=True,
        )
        db.add(doc)
        created_doctors.append((doc, matched_hosp))

    await db.commit()

    # Seed appointment slots for today and next 4 days
    now = datetime.now(UTC)
    slot_times = [
        (9, 30),
        (10, 30),
        (11, 30),
        (14, 0),
        (15, 30),
        (16, 30),
    ]

    for doc, matched_hosp in created_doctors:
        await db.refresh(doc)
        for day_offset in range(5):
            slot_date = (now + timedelta(days=day_offset)).date()
            for idx, (hour, minute) in enumerate(slot_times):
                start_dt = datetime(
                    slot_date.year, slot_date.month, slot_date.day, hour, minute, tzinfo=UTC
                )
                end_dt = start_dt + timedelta(minutes=30)
                # Mark occasional slot as already booked to simulate realistic schedule
                is_initially_booked = (day_offset == 0 and idx == 0) or (day_offset == 1 and idx == 2)
                slot = AppointmentSlot(
                    doctor_id=doc.id,
                    hospital_id=matched_hosp.id,
                    start_time=start_dt,
                    end_time=end_dt,
                    is_booked=is_initially_booked,
                )
                db.add(slot)

    await db.commit()


@router.get("/doctors", response_model=list[DoctorResponse])
async def list_doctors(
    hospital_id: str | None = Query(None, description="Filter by hospital ID"),
    department: str | None = Query(None, description="Filter by clinical department"),
    query: str | None = Query(None, description="Search doctor name or department"),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Lists healthcare specialists and physicians with hospital affiliation and fee details."""
    await auto_seed_doctors_and_slots(db)

    stmt = select(Doctor).options(selectinload(Doctor.hospital)).where(Doctor.is_active.is_(True))

    if hospital_id:
        stmt = stmt.where(Doctor.hospital_id == hospital_id)
    if department and department != "all":
        stmt = stmt.where(Doctor.department.ilike(f"%{department.strip()}%"))

    res = await db.execute(stmt)
    doctors = list(res.scalars().all())

    if query:
        q_clean = query.lower().strip()
        doctors = [
            d
            for d in doctors
            if q_clean in d.name.lower()
            or q_clean in d.department.lower()
            or (d.hospital and q_clean in d.hospital.name.lower())
        ]

    response_list = []
    for d in doctors:
        resp = DoctorResponse.model_validate(d)
        resp.hospital_name = d.hospital.name if d.hospital else None
        response_list.append(resp)

    return response_list


@router.get("/slots", response_model=list[SlotResponse])
async def list_slots(
    doctor_id: str | None = Query(None, description="Doctor ID"),
    hospital_id: str | None = Query(None, description="Hospital ID"),
    date: str | None = Query(None, description="Filter date in YYYY-MM-DD format"),
    available_only: bool = Query(True, description="Only return unbooked slots"),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Lists scheduled appointment slots for a doctor or hospital."""
    await auto_seed_doctors_and_slots(db)

    stmt = select(AppointmentSlot).order_by(AppointmentSlot.start_time.asc())

    if doctor_id:
        stmt = stmt.where(AppointmentSlot.doctor_id == doctor_id)
    if hospital_id:
        stmt = stmt.where(AppointmentSlot.hospital_id == hospital_id)
    if available_only:
        stmt = stmt.where(AppointmentSlot.is_booked.is_(False))

    res = await db.execute(stmt)
    slots = list(res.scalars().all())

    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
            slots = [s for s in slots if s.start_time.date() == target_date]
        except ValueError:
            pass

    return slots


@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def book_appointment(
    payload: AppointmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Books a doctor consultation or hospital appointment while strictly preventing double-booking."""
    await auto_seed_doctors_and_slots(db)

    # 1. Authorize patient vs caregiver
    target_patient_id = current_user.id
    booked_by_role = "patient"

    if payload.patient_id and payload.patient_id != current_user.id:
        if current_user.role != UserRole.CAREGIVER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only registered caregivers can book on behalf of patients.",
            )

        consent_res = await db.execute(
            select(CaregiverConsent).where(
                CaregiverConsent.patient_id == payload.patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
        )
        consent = consent_res.scalar_one_or_none()
        if not consent or not consent.can_view_appointments:
            audit = AuditLog(
                actor_id=current_user.id,
                patient_id=payload.patient_id,
                action="appointment_booking_denied",
                resource="appointments",
                details={"reason": "Missing appointment booking consent scope"},
            )
            db.add(audit)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver has not been granted appointment permissions by the patient.",
            )

        target_patient_id = payload.patient_id
        booked_by_role = "caregiver"

        audit = AuditLog(
            actor_id=current_user.id,
            patient_id=payload.patient_id,
            action="caregiver_booked_appointment",
            resource="appointments",
            details={
                "doctor_name": payload.doctor_name,
                "department": payload.department,
                "scheduled_time": payload.scheduled_time.isoformat(),
            },
        )
        db.add(audit)

    # 2. Verify hospital exists
    res_hosp = await db.execute(select(Hospital).where(Hospital.id == payload.hospital_id))
    hospital = res_hosp.scalar_one_or_none()
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital not found.",
        )

    # 3. Double-Booking Prevention: Slot verification
    slot = None
    if payload.slot_id:
        res_slot = await db.execute(
            select(AppointmentSlot).where(AppointmentSlot.id == payload.slot_id)
        )
        slot = res_slot.scalar_one_or_none()
        if not slot:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Specified appointment slot not found.",
            )
        if slot.is_booked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This time slot has already been booked by another patient. Please choose an alternate slot.",
            )

    # 4. Double-Booking Prevention: Doctor exact time collision
    res_doc_collision = await db.execute(
        select(Appointment).where(
            Appointment.doctor_name == payload.doctor_name,
            Appointment.scheduled_time == payload.scheduled_time,
            Appointment.status != AppointmentStatus.CANCELLED,
        )
    )
    if res_doc_collision.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{payload.doctor_name} already has a confirmed booking for this exact time slot.",
        )

    # 5. Double-Booking Prevention: Patient overlapping window check (25 min buffer)
    window_start = payload.scheduled_time - timedelta(minutes=25)
    window_end = payload.scheduled_time + timedelta(minutes=25)

    res_patient_collision = await db.execute(
        select(Appointment).where(
            Appointment.patient_id == target_patient_id,
            Appointment.status != AppointmentStatus.CANCELLED,
            Appointment.scheduled_time >= window_start,
            Appointment.scheduled_time <= window_end,
        )
    )
    if res_patient_collision.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Patient already has an active appointment scheduled during this time window.",
        )

    # 6. Mark slot booked if applicable
    if slot:
        slot.is_booked = True

    # 7. Create appointment
    appointment = Appointment(
        patient_id=target_patient_id,
        hospital_id=hospital.id,
        doctor_id=payload.doctor_id or (slot.doctor_id if slot else None),
        slot_id=payload.slot_id,
        doctor_name=payload.doctor_name,
        department=payload.department,
        scheduled_time=payload.scheduled_time,
        status=payload.status,
        booked_by_id=current_user.id,
        booked_by_role=booked_by_role,
        notes=payload.notes,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)

    resp = AppointmentResponse.model_validate(appointment)
    resp.hospital_name = hospital.name
    return resp


@router.get("/", response_model=list[AppointmentResponse])
async def list_appointments(
    patient_id: str | None = Query(None, description="Patient ID for caregiver queries"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Lists appointments with hospital details, distinguishing confirmed vs pending vs cancelled."""
    target_patient_id = current_user.id

    if patient_id and patient_id != current_user.id:
        if current_user.role != UserRole.CAREGIVER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access to patient appointments.",
            )

        consent_res = await db.execute(
            select(CaregiverConsent).where(
                CaregiverConsent.patient_id == patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
        )
        consent = consent_res.scalar_one_or_none()
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

    stmt = (
        select(Appointment)
        .options(selectinload(Appointment.hospital))
        .where(Appointment.patient_id == target_patient_id)
        .order_by(Appointment.scheduled_time.desc())
    )

    if status_filter and status_filter != "all":
        stmt = stmt.where(Appointment.status == status_filter)

    res = await db.execute(stmt)
    appointments = list(res.scalars().all())

    response_list = []
    for a in appointments:
        resp = AppointmentResponse.model_validate(a)
        resp.hospital_name = a.hospital.name if a.hospital else "Medical Center"
        response_list.append(resp)

    return response_list


@router.put("/{appointment_id}/cancel", response_model=AppointmentResponse)
async def cancel_appointment(
    appointment_id: str,
    payload: AppointmentCancel | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Cancels an appointment and automatically releases the booked slot back to the available pool."""
    stmt = (
        select(Appointment)
        .options(selectinload(Appointment.hospital), selectinload(Appointment.slot))
        .where(Appointment.id == appointment_id)
    )
    res = await db.execute(stmt)
    appointment = res.scalar_one_or_none()
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found.",
        )

    # Authorization: user must be the patient or an authorized caregiver
    if appointment.patient_id != current_user.id:
        if current_user.role != UserRole.CAREGIVER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized to cancel this appointment.",
            )
        consent_res = await db.execute(
            select(CaregiverConsent).where(
                CaregiverConsent.patient_id == appointment.patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
        )
        consent = consent_res.scalar_one_or_none()
        if not consent or not consent.can_view_appointments:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver has not been granted appointment management permissions.",
            )

    appointment.status = AppointmentStatus.CANCELLED
    appointment.cancellation_reason = payload.reason if payload else "Cancelled by user"
    appointment.updated_at = datetime.now(UTC)

    # Release slot back to available pool
    if appointment.slot:
        appointment.slot.is_booked = False

    await db.commit()
    await db.refresh(appointment)

    resp = AppointmentResponse.model_validate(appointment)
    resp.hospital_name = appointment.hospital.name if appointment.hospital else None
    return resp

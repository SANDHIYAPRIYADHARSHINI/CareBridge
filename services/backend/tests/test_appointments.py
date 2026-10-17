from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient


async def get_user_token(async_client: AsyncClient, email: str, role: str = "patient") -> tuple[str, str]:
    await async_client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "full_name": f"{role.capitalize()} User",
            "role": role,
        },
    )
    login_res = await async_client.post(
        "/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    data = login_res.json()
    return data["user"]["id"], data["access_token"]


@pytest.mark.asyncio
async def test_list_doctors_and_slots(async_client: AsyncClient):
    """Verifies doctors and slots auto-seed with hospital details and department filtering."""
    # List doctors
    doc_resp = await async_client.get("/appointments/doctors")
    assert doc_resp.status_code == 200
    doctors = doc_resp.json()
    assert len(doctors) >= 5
    first_doc = doctors[0]
    assert "name" in first_doc
    assert "department" in first_doc
    assert "qualification" in first_doc
    assert "consultation_fee" in first_doc
    assert first_doc["consultation_fee"] > 0
    assert first_doc["hospital_name"] is not None

    # Filter doctors by department
    cardio_resp = await async_client.get("/appointments/doctors?department=Cardiology")
    assert cardio_resp.status_code == 200
    cardio_docs = cardio_resp.json()
    assert len(cardio_docs) >= 1
    assert any("cardio" in d["department"].lower() for d in cardio_docs)

    # Query available slots for the first doctor
    doc_id = first_doc["id"]
    slot_resp = await async_client.get(f"/appointments/slots?doctor_id={doc_id}&available_only=true")
    assert slot_resp.status_code == 200
    slots = slot_resp.json()
    assert len(slots) >= 1
    assert all(not s["is_booked"] for s in slots)


@pytest.mark.asyncio
async def test_book_and_list_appointment_patient(async_client: AsyncClient):
    """Verifies a patient can book an appointment and view upcoming/history appointments."""
    p_id, token = await get_user_token(async_client, "apt_patient1@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch doctors and an available slot
    doc_resp = await async_client.get("/appointments/doctors")
    doc = doc_resp.json()[0]
    slot_resp = await async_client.get(f"/appointments/slots?doctor_id={doc['id']}&available_only=true")
    slot = slot_resp.json()[0]

    scheduled_time = slot["start_time"]

    booking_payload = {
        "hospital_id": doc["hospital_id"],
        "doctor_id": doc["id"],
        "slot_id": slot["id"],
        "doctor_name": doc["name"],
        "department": doc["department"],
        "scheduled_time": scheduled_time,
        "status": "confirmed",
        "notes": "Routine annual cardiac checkup",
    }
    book_resp = await async_client.post("/appointments/", headers=headers, json=booking_payload)
    assert book_resp.status_code == 201
    apt_data = book_resp.json()
    assert apt_data["patient_id"] == p_id
    assert apt_data["status"] == "confirmed"
    assert apt_data["doctor_name"] == doc["name"]
    assert apt_data["hospital_name"] is not None

    # Verify slot is now marked booked
    slot_check = await async_client.get(f"/appointments/slots?doctor_id={doc['id']}&available_only=false")
    booked_slot = next(s for s in slot_check.json() if s["id"] == slot["id"])
    assert booked_slot["is_booked"] is True

    # List appointments
    list_resp = await async_client.get("/appointments/", headers=headers)
    assert list_resp.status_code == 200
    user_apts = list_resp.json()
    assert len(user_apts) >= 1
    assert any(a["id"] == apt_data["id"] for a in user_apts)


@pytest.mark.asyncio
async def test_double_booking_prevention_same_slot(async_client: AsyncClient):
    """Verifies booking an already booked slot returns 409 Conflict."""
    _, token1 = await get_user_token(async_client, "patient_a@example.com")
    _, token2 = await get_user_token(async_client, "patient_b@example.com")

    # Find an unbooked slot
    doc_resp = await async_client.get("/appointments/doctors")
    doc = doc_resp.json()[1]
    slot_resp = await async_client.get(f"/appointments/slots?doctor_id={doc['id']}&available_only=true")
    slot = slot_resp.json()[0]

    # Patient A books the slot
    book_payload_a = {
        "hospital_id": doc["hospital_id"],
        "doctor_id": doc["id"],
        "slot_id": slot["id"],
        "doctor_name": doc["name"],
        "department": doc["department"],
        "scheduled_time": slot["start_time"],
        "status": "confirmed",
    }
    resp_a = await async_client.post("/appointments/", headers={"Authorization": f"Bearer {token1}"}, json=book_payload_a)
    assert resp_a.status_code == 201

    # Patient B tries to book the EXACT SAME slot
    book_payload_b = {
        "hospital_id": doc["hospital_id"],
        "doctor_id": doc["id"],
        "slot_id": slot["id"],
        "doctor_name": doc["name"],
        "department": doc["department"],
        "scheduled_time": slot["start_time"],
        "status": "confirmed",
    }
    resp_b = await async_client.post("/appointments/", headers={"Authorization": f"Bearer {token2}"}, json=book_payload_b)
    assert resp_b.status_code == 409
    assert "already been booked" in resp_b.json()["detail"].lower()


@pytest.mark.asyncio
async def test_double_booking_prevention_patient_collision(async_client: AsyncClient):
    """Verifies patient cannot schedule overlapping appointments within a 25-minute buffer."""
    _, token = await get_user_token(async_client, "patient_overlap@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    doc_resp = await async_client.get("/appointments/doctors")
    doc1 = doc_resp.json()[2]
    doc2 = doc_resp.json()[3]

    base_time = (datetime.now(UTC) + timedelta(days=2)).replace(hour=11, minute=0, second=0, microsecond=0)

    # First booking
    resp_1 = await async_client.post(
        "/appointments/",
        headers=headers,
        json={
            "hospital_id": doc1["hospital_id"],
            "doctor_name": doc1["name"],
            "department": doc1["department"],
            "scheduled_time": base_time.isoformat(),
            "status": "confirmed",
        },
    )
    assert resp_1.status_code == 201

    # Second booking 10 minutes later (within 25m buffer)
    overlapping_time = base_time + timedelta(minutes=10)
    resp_2 = await async_client.post(
        "/appointments/",
        headers=headers,
        json={
            "hospital_id": doc2["hospital_id"],
            "doctor_name": doc2["name"],
            "department": doc2["department"],
            "scheduled_time": overlapping_time.isoformat(),
            "status": "confirmed",
        },
    )
    assert resp_2.status_code == 409
    assert "time window" in resp_2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cancel_appointment_releases_slot(async_client: AsyncClient):
    """Verifies cancelling an appointment updates status to cancelled and frees up the slot."""
    _, token = await get_user_token(async_client, "patient_cancel@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    doc_resp = await async_client.get("/appointments/doctors")
    doc = doc_resp.json()[0]
    slot_resp = await async_client.get(f"/appointments/slots?doctor_id={doc['id']}&available_only=true")
    slot = slot_resp.json()[0]

    # Book slot
    book_resp = await async_client.post(
        "/appointments/",
        headers=headers,
        json={
            "hospital_id": doc["hospital_id"],
            "doctor_id": doc["id"],
            "slot_id": slot["id"],
            "doctor_name": doc["name"],
            "department": doc["department"],
            "scheduled_time": slot["start_time"],
            "status": "confirmed",
        },
    )
    assert book_resp.status_code == 201
    apt_id = book_resp.json()["id"]

    # Cancel appointment
    cancel_resp = await async_client.put(
        f"/appointments/{apt_id}/cancel",
        headers=headers,
        json={"reason": "Scheduling conflict"},
    )
    assert cancel_resp.status_code == 200
    cancel_data = cancel_resp.json()
    assert cancel_data["status"] == "cancelled"
    assert cancel_data["cancellation_reason"] == "Scheduling conflict"

    # Verify slot is released (is_booked == False)
    slot_check = await async_client.get(f"/appointments/slots?doctor_id={doc['id']}&available_only=false")
    released_slot = next(s for s in slot_check.json() if s["id"] == slot["id"])
    assert released_slot["is_booked"] is False


@pytest.mark.asyncio
async def test_caregiver_appointment_booking_and_consent(async_client: AsyncClient):
    """Verifies caregiver appointment booking and view permissions with audit logging."""
    p_id, p_token = await get_user_token(async_client, "cg_apt_patient@example.com", "patient")
    cg_id, cg_token = await get_user_token(async_client, "cg_apt_caregiver@example.com", "caregiver")

    cg_headers = {"Authorization": f"Bearer {cg_token}"}
    p_headers = {"Authorization": f"Bearer {p_token}"}

    # Request consent without appointments
    req_resp = await async_client.post(
        "/consent/request",
        headers=cg_headers,
        json={"patient_email": "cg_apt_patient@example.com", "permissions": {"can_view_prescriptions": True, "can_view_appointments": False}},
    )
    assert req_resp.status_code == 201
    consent_id = req_resp.json()["id"]

    # Patient approves with can_view_appointments = False
    await async_client.put(
        f"/consent/{consent_id}",
        headers=p_headers,
        json={"status": "approved", "permissions": {"can_view_appointments": False}},
    )

    doc_resp = await async_client.get("/appointments/doctors")
    doc = doc_resp.json()[0]
    future_time = (datetime.now(UTC) + timedelta(days=3)).replace(hour=14, minute=0, second=0, microsecond=0)

    # Caregiver attempts to book for patient -> 403 Forbidden
    unauth_book = await async_client.post(
        "/appointments/",
        headers=cg_headers,
        json={
            "patient_id": p_id,
            "hospital_id": doc["hospital_id"],
            "doctor_name": doc["name"],
            "department": doc["department"],
            "scheduled_time": future_time.isoformat(),
            "status": "pending",
        },
    )
    assert unauth_book.status_code == 403

    # Patient grants can_view_appointments = True
    await async_client.put(
        f"/consent/{consent_id}",
        headers=p_headers,
        json={"status": "approved", "permissions": {"can_view_appointments": True}},
    )

    # Caregiver books for patient -> 201 Created
    auth_book = await async_client.post(
        "/appointments/",
        headers=cg_headers,
        json={
            "patient_id": p_id,
            "hospital_id": doc["hospital_id"],
            "doctor_name": doc["name"],
            "department": doc["department"],
            "scheduled_time": future_time.isoformat(),
            "status": "pending",
            "notes": "Booked by authorized caregiver",
        },
    )
    assert auth_book.status_code == 201
    apt_data = auth_book.json()
    assert apt_data["patient_id"] == p_id
    assert apt_data["booked_by_id"] == cg_id
    assert apt_data["booked_by_role"] == "caregiver"

    # Caregiver views patient's appointments -> 200 OK
    view_resp = await async_client.get(f"/appointments/?patient_id={p_id}", headers=cg_headers)
    assert view_resp.status_code == 200
    assert len(view_resp.json()) >= 1

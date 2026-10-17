"""
End-to-End Hackathon Demonstration Test Suite for Member 2.

Covers the complete 7-step patient and caregiver journey:
1. Patient registers and logs in (role-based access).
2. Patient views prescription data extracted via Member 1 AI microservice.
3. Patient creates medication reminders, logs doses, verifies supply decrement and refill alerts.
4. Patient authorizes caregiver with granular permissions.
5. Caregiver views permitted information and is restricted from unauthorized scopes.
6. Patient searches hospitals, views live capacity telemetry, and simulates crowd shifts.
7. Patient searches doctors, books slot, verifies double-booking prevention, and cancels appointment.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient


async def register_and_login(async_client: AsyncClient, email: str, role: str, name: str) -> tuple[str, str]:
    """Helper to register and login a test user, returning (user_id, access_token)."""
    reg_resp = await async_client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "full_name": name,
            "role": role,
            "phone_number": "+91 98401 99999",
        },
    )
    assert reg_resp.status_code == 201

    login_resp = await async_client.post(
        "/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    data = login_resp.json()
    return data["user"]["id"], data["access_token"]


@pytest.mark.asyncio
async def test_complete_hackathon_demo_flow(async_client: AsyncClient):
    """
    Executes the complete 7-step Hackathon Demo Flow sequentially:
    Step 1: Patient registration, authentication & role-based validation.
    Step 2: Prescription extraction via Member 1 AI service (with ROCm vision response).
    Step 3: Medication reminder creation, dose tracking & refill alerts.
    Step 4: Caregiver access request and patient approval with granular permissions.
    Step 5: Caregiver views permitted timeline/summary, blocked from unauthorized scopes.
    Step 6: Hospital search, distance calculation, and live capacity/crowd telemetry.
    Step 7: Doctor slot search, booking, double-booking prevention, and cancellation.
    """
    # =========================================================================
    # Step 1: Patient Registers and Logs In
    # =========================================================================
    patient_email = "demo.kaviya@carebridge.health"
    patient_id, patient_token = await register_and_login(
        async_client, patient_email, "patient", "Kaviya Sundaram"
    )
    p_headers = {"Authorization": f"Bearer {patient_token}"}

    # Verify /auth/me returns patient identity
    me_resp = await async_client.get("/auth/me", headers=p_headers)
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["id"] == patient_id
    assert me_data["role"] == "patient"
    assert me_data["email"] == patient_email

    # =========================================================================
    # Step 2: Patient views prescription data from Member 1's API
    # =========================================================================
    mock_extract_result = {
        "document_id": "rx-demo-001",
        "doctor_name": "Dr. A. R. Sharma, MD",
        "clinic_hospital": "Apollo Speciality Hospitals, Chennai",
        "date": "2026-10-15",
        "patient_name": "Kaviya Sundaram",
        "language_detected": "ta",
        "medicines": [
            {
                "name": "Metformin",
                "dosage": "500 mg",
                "frequency": "Twice daily",
                "timing": "After food",
                "duration": "30 days",
                "instructions": "Take with water after meals",
                "instructions_tamil": "உணவுக்குப் பின் தண்ணீருடன் உட்கொள்ளவும்",
                "confidence": 0.96,
                "evidence_line_ids": ["line-1", "line-2"],
                "status": "verified",
            },
            {
                "name": "Atorvastatin",
                "dosage": "10 mg",
                "frequency": "Once daily",
                "timing": "At bedtime",
                "duration": "30 days",
                "instructions": "Take at night before sleep",
                "instructions_tamil": "இரவு படுக்கைக்கு முன் உட்கொள்ளவும்",
                "confidence": 0.94,
                "evidence_line_ids": ["line-3"],
                "status": "verified",
            },
        ],
        "metrics": {
            "latency_ms": 142.5,
            "model": "google/gemma-2-9b-it",
            "device": "AMD Instinct MI300X (ROCm 6.2)",
        },
        "safety_disclaimer": "AI-generated synthetic summary. Verify all medications with a qualified physician.",
    }

    mock_client = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = mock_extract_result
    mock_client.post.return_value = mock_resp

    with patch("app.routers.ai.httpx.AsyncClient") as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client

        files = {"file": ("rx_demo.png", b"fake-png-prescription-data", "image/png")}
        data = {"language_hint": "ta"}
        extract_resp = await async_client.post(
            "/ai/extract",
            headers=p_headers,
            files=files,
            data=data,
        )
        assert extract_resp.status_code == 200
        rx_data = extract_resp.json()
        assert len(rx_data["medicines"]) == 2
        assert rx_data["medicines"][0]["name"] == "Metformin"
        assert rx_data["medicines"][0]["instructions_tamil"] is not None
        assert "AMD" in rx_data["metrics"]["device"]

    # =========================================================================
    # Step 3: Patient creates medication reminders, tracks doses & refill alerts
    # =========================================================================
    # Create reminder for Metformin with total_supply 10, remaining_supply 4 and threshold of 3
    reminder_payload = {
        "medicine_name": "Metformin",
        "dosage": "500 mg",
        "instructions": "Take with water after meals",
        "times_per_day": 2,
        "slots": ["morning", "night"],
        "total_supply": 10,
        "remaining_supply": 4,
        "refill_threshold": 3,
        "is_verified_rx": True,
    }
    rem_resp = await async_client.post("/reminders/", headers=p_headers, json=reminder_payload)
    assert rem_resp.status_code == 201
    reminder = rem_resp.json()
    reminder_id = reminder["id"]
    assert reminder["remaining_supply"] == 4

    # Log dose taken -> remaining_supply decrements from 4 to 3
    dose_resp = await async_client.post(
        f"/reminders/{reminder_id}/doses",
        headers=p_headers,
        json={
            "scheduled_time": datetime.now(UTC).isoformat(),
            "status": "taken",
            "notes": "Morning dose after breakfast",
        },
    )
    assert dose_resp.status_code == 200
    dose_data = dose_resp.json()
    assert dose_data["status"] == "taken"

    # Check reminder updated state
    get_rem_resp = await async_client.get(f"/reminders/{reminder_id}", headers=p_headers)
    assert get_rem_resp.status_code == 200
    updated_rem = get_rem_resp.json()
    assert updated_rem["remaining_supply"] == 3

    # Check refill alerts endpoint (remaining_supply 3 <= refill_threshold 3 triggers alert)
    refill_resp = await async_client.get("/reminders/refills", headers=p_headers)
    assert refill_resp.status_code == 200
    refills = refill_resp.json()
    assert any(r["id"] == reminder_id for r in refills)

    # =========================================================================
    # Step 4: Patient authorizes a caregiver with granular permissions
    # =========================================================================
    caregiver_email = "demo.anand@carebridge.health"
    cg_id, cg_token = await register_and_login(
        async_client, caregiver_email, "caregiver", "Dr. Anand Nathan"
    )
    cg_headers = {"Authorization": f"Bearer {cg_token}"}

    # Caregiver sends access request
    req_resp = await async_client.post(
        "/consent/request",
        headers=cg_headers,
        json={
            "patient_email": patient_email,
            "permissions": {
                "can_view_prescriptions": True,
                "can_view_reminders": True,
                "can_view_appointments": False,
                "can_view_records": False,
            },
        },
    )
    assert req_resp.status_code == 201
    consent_id = req_resp.json()["id"]

    # Patient lists pending requests and approves it
    pt_requests = await async_client.get("/consent/patient", headers=p_headers)
    assert pt_requests.status_code == 200
    assert any(c["id"] == consent_id for c in pt_requests.json())

    approve_resp = await async_client.put(
        f"/consent/{consent_id}",
        headers=p_headers,
        json={
            "status": "approved",
            "permissions": {
                "can_view_prescriptions": True,
                "can_view_reminders": True,
                "can_view_appointments": False,
                "can_view_records": False,
            },
        },
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "approved"

    # =========================================================================
    # Step 5: Caregiver views only permitted information
    # =========================================================================
    # Caregiver fetches patient summary
    summary_resp = await async_client.get(
        f"/consent/patient-summary/{patient_id}",
        headers=cg_headers,
    )
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["permissions"]["can_view_reminders"] is True
    assert summary["permissions"]["can_view_appointments"] is False
    assert "appointments" in summary["restricted_scopes"]
    assert "medical_records" in summary["restricted_scopes"]

    # Caregiver fetches patient timeline -> should see reminder events but NOT restricted records
    cg_timeline_resp = await async_client.get(
        f"/timeline/?patient_id={patient_id}",
        headers=cg_headers,
    )
    assert cg_timeline_resp.status_code == 200
    timeline_events = cg_timeline_resp.json()["events"]
    types = {e["type"] for e in timeline_events}
    # Caregiver was granted can_view_prescriptions: True, can_view_records: False
    assert "prescription" in types
    assert "report" not in types
    assert "discharge" not in types

    # Caregiver attempts to query appointments for patient without permission -> 403 Forbidden
    cg_apt_resp = await async_client.get(
        f"/appointments/?patient_id={patient_id}",
        headers=cg_headers,
    )
    assert cg_apt_resp.status_code == 403

    # =========================================================================
    # Step 6: Patient searches hospitals and views capacity status
    # =========================================================================
    # Patient searches for Apollo hospitals
    hosp_resp = await async_client.get("/hospitals/?query=Apollo")
    assert hosp_resp.status_code == 200
    hospitals = hosp_resp.json()
    assert len(hospitals) >= 1
    apollo_hosp = hospitals[0]
    apollo_id = apollo_hosp["id"]
    assert "apollo" in apollo_hosp["name"].lower()

    # Verify simulated capacity telemetry fields are present and clearly labeled
    assert apollo_hosp["is_simulated"] is True
    assert apollo_hosp["data_source_type"] in ["simulated", "verified"]
    assert "beds_available" in apollo_hosp
    assert "icu_available" in apollo_hosp
    assert "wait_time_minutes" in apollo_hosp
    assert "emergency_status" in apollo_hosp

    # Patient retrieves specific hospital details
    detail_resp = await async_client.get(f"/hospitals/{apollo_id}")
    assert detail_resp.status_code == 200
    hosp_detail = detail_resp.json()
    assert hosp_detail["id"] == apollo_id

    # Simulate crowd status change on hospital
    sim_resp = await async_client.post(f"/hospitals/{apollo_id}/simulate-crowd")
    assert sim_resp.status_code == 200
    sim_data = sim_resp.json()
    assert sim_data["data_source_type"] == "simulated"
    assert "status" in sim_data

    # =========================================================================
    # Step 7: Patient searches doctors, books appointment & prevents double-booking
    # =========================================================================
    # Search doctors
    doc_resp = await async_client.get("/appointments/doctors")
    assert doc_resp.status_code == 200
    doctors = doc_resp.json()
    assert len(doctors) >= 1
    selected_doc = doctors[0]

    # Find available slot for selected doctor
    slot_resp = await async_client.get(
        f"/appointments/slots?doctor_id={selected_doc['id']}&available_only=true"
    )
    assert slot_resp.status_code == 200
    available_slots = slot_resp.json()
    assert len(available_slots) >= 1
    chosen_slot = available_slots[0]

    # Book appointment
    booking_payload = {
        "hospital_id": selected_doc["hospital_id"],
        "doctor_id": selected_doc["id"],
        "slot_id": chosen_slot["id"],
        "doctor_name": selected_doc["name"],
        "department": selected_doc["department"],
        "scheduled_time": chosen_slot["start_time"],
        "status": "confirmed",
        "notes": "Cardiac assessment and medication review",
    }
    book_resp = await async_client.post("/appointments/", headers=p_headers, json=booking_payload)
    assert book_resp.status_code == 201
    appointment = book_resp.json()
    appointment_id = appointment["id"]
    assert appointment["status"] == "confirmed"
    assert appointment["patient_id"] == patient_id

    # Verify double-booking prevention: another patient attempts to book the same slot
    other_p_id, other_p_token = await register_and_login(
        async_client, "demo.conflict@carebridge.health", "patient", "Ravi Kumar"
    )
    conflict_resp = await async_client.post(
        "/appointments/",
        headers={"Authorization": f"Bearer {other_p_token}"},
        json=booking_payload,
    )
    assert conflict_resp.status_code == 409
    assert "already been booked" in conflict_resp.json()["detail"].lower()

    # Patient checks appointment history
    apts_history_resp = await async_client.get("/appointments/", headers=p_headers)
    assert apts_history_resp.status_code == 200
    history = apts_history_resp.json()
    assert any(a["id"] == appointment_id for a in history)

    # Patient cancels the appointment
    cancel_resp = await async_client.put(
        f"/appointments/{appointment_id}/cancel",
        headers=p_headers,
        json={"reason": "Rescheduled with primary physician"},
    )
    assert cancel_resp.status_code == 200
    cancelled_apt = cancel_resp.json()
    assert cancelled_apt["status"] == "cancelled"

    # Verify slot is released and available again
    refreshed_slots_resp = await async_client.get(
        f"/appointments/slots?doctor_id={selected_doc['id']}&available_only=false"
    )
    assert refreshed_slots_resp.status_code == 200
    freed_slot = next(s for s in refreshed_slots_resp.json() if s["id"] == chosen_slot["id"])
    assert freed_slot["is_booked"] is False


@pytest.mark.asyncio
async def test_role_based_access_control(async_client: AsyncClient):
    """Verifies strict RBAC enforcement across patient and caregiver endpoints."""
    # 1. Unauthenticated request rejected
    unauth_resp = await async_client.get("/auth/me")
    assert unauth_resp.status_code == 401

    # 2. Patient cannot access caregiver-only consent endpoints
    _, patient_token = await register_and_login(
        async_client, "rbac.patient@carebridge.health", "patient", "RBAC Patient"
    )
    p_headers = {"Authorization": f"Bearer {patient_token}"}

    cg_only_resp = await async_client.get("/consent/caregiver", headers=p_headers)
    assert cg_only_resp.status_code == 403
    assert "caregiver" in cg_only_resp.json()["detail"].lower()

    # 3. Caregiver cannot access patient-only consent list
    _, cg_token = await register_and_login(
        async_client, "rbac.caregiver@carebridge.health", "caregiver", "RBAC Caregiver"
    )
    cg_headers = {"Authorization": f"Bearer {cg_token}"}

    pt_only_resp = await async_client.get("/consent/patient", headers=cg_headers)
    assert pt_only_resp.status_code == 403
    assert "patient" in pt_only_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_caregiver_revocation_blocks_subsequent_access(async_client: AsyncClient):
    """Verifies that revoking caregiver consent immediately cuts off access."""
    p_id, p_token = await register_and_login(
        async_client, "revoke.patient@carebridge.health", "patient", "Patient Revoke Test"
    )
    p_headers = {"Authorization": f"Bearer {p_token}"}

    _, cg_token = await register_and_login(
        async_client, "revoke.caregiver@carebridge.health", "caregiver", "Caregiver Revoke Test"
    )
    cg_headers = {"Authorization": f"Bearer {cg_token}"}

    # Request and approve
    req = await async_client.post(
        "/consent/request",
        headers=cg_headers,
        json={
            "patient_email": "revoke.patient@carebridge.health",
            "permissions": {"can_view_prescriptions": True},
        },
    )
    consent_id = req.json()["id"]

    await async_client.put(
        f"/consent/{consent_id}",
        headers=p_headers,
        json={"status": "approved", "permissions": {"can_view_prescriptions": True}},
    )

    # Caregiver can view summary
    ok_resp = await async_client.get(f"/consent/patient-summary/{p_id}", headers=cg_headers)
    assert ok_resp.status_code == 200

    # Patient revokes consent
    revoke_resp = await async_client.put(
        f"/consent/{consent_id}",
        headers=p_headers,
        json={"status": "revoked"},
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["status"] == "revoked"

    # Caregiver is immediately blocked
    blocked_resp = await async_client.get(f"/consent/patient-summary/{p_id}", headers=cg_headers)
    assert blocked_resp.status_code == 403


@pytest.mark.asyncio
async def test_hospital_distance_and_emergency_filters(async_client: AsyncClient):
    """Verifies hospital distance sorting with coordinates and emergency filtering."""
    # With coordinates (Chennai city center)
    coord_resp = await async_client.get("/hospitals/?lat=13.0827&lon=80.2707")
    assert coord_resp.status_code == 200
    hospitals = coord_resp.json()
    assert len(hospitals) >= 5
    assert hospitals[0]["distance_km"] is not None

    # Without coordinates (fallback behaves safely)
    fallback_resp = await async_client.get("/hospitals/")
    assert fallback_resp.status_code == 200
    assert len(fallback_resp.json()) >= 5

    # Emergency services only
    em_resp = await async_client.get("/hospitals/?emergency_only=true")
    assert em_resp.status_code == 200
    assert all(h["emergency_available"] is True for h in em_resp.json())

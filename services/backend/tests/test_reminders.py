from datetime import UTC, datetime

import pytest
from httpx import AsyncClient


async def get_patient_token(async_client: AsyncClient, email: str, role: str = "patient") -> tuple[str, str]:
    await async_client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "full_name": "Test User",
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
async def test_create_and_list_reminders(async_client: AsyncClient):
    _, token = await get_patient_token(async_client, "rem_patient@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create manual reminder
    create_res = await async_client.post(
        "/reminders/",
        headers=headers,
        json={
            "medicine_name": "Metformin",
            "dosage": "500 mg",
            "instructions": "Take after meals",
            "times_per_day": 2,
            "slots": ["morning", "night"],
            "total_supply": 60,
            "remaining_supply": 60,
            "refill_threshold": 10,
            "is_verified_rx": False,
        },
    )
    assert create_res.status_code == 201
    reminder = create_res.json()
    assert reminder["medicine_name"] == "Metformin"
    assert reminder["is_verified_rx"] is False
    assert reminder["remaining_supply"] == 60

    # List reminders
    list_res = await async_client.get("/reminders/", headers=headers)
    assert list_res.status_code == 200
    reminders = list_res.json()
    assert len(reminders) == 1
    assert reminders[0]["id"] == reminder["id"]


@pytest.mark.asyncio
async def test_import_from_prescription(async_client: AsyncClient):
    _, token = await get_patient_token(async_client, "rx_patient@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Bulk import from verified prescription
    import_res = await async_client.post(
        "/reminders/from-prescription",
        headers=headers,
        json={
            "medicines": [
                {
                    "medicine_name": "Amoxicillin",
                    "dosage": "500 mg",
                    "instructions": "Every 8 hours",
                    "times_per_day": 3,
                    "slots": ["morning", "noon", "night"],
                    "total_supply": 21,
                    "remaining_supply": 21,
                    "refill_threshold": 6,
                },
                {
                    "medicine_name": "Paracetamol",
                    "dosage": "650 mg",
                    "instructions": "SOS for fever",
                    "times_per_day": 1,
                    "slots": ["noon"],
                    "total_supply": 10,
                    "remaining_supply": 10,
                    "refill_threshold": 3,
                },
            ],
            "is_verified": True,
        },
    )
    assert import_res.status_code == 201
    imported = import_res.json()
    assert len(imported) == 2
    assert all(r["is_verified_rx"] is True for r in imported)


@pytest.mark.asyncio
async def test_log_dose_and_refill_alert(async_client: AsyncClient):
    _, token = await get_patient_token(async_client, "dose_patient@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create reminder with low supply
    create_res = await async_client.post(
        "/reminders/",
        headers=headers,
        json={
            "medicine_name": "Atorvastatin",
            "dosage": "20 mg",
            "instructions": "At night",
            "times_per_day": 1,
            "slots": ["night"],
            "total_supply": 10,
            "remaining_supply": 5,
            "refill_threshold": 5,
            "is_verified_rx": True,
        },
    )
    assert create_res.status_code == 201
    reminder_id = create_res.json()["id"]

    # Check refills endpoint (should trigger since 5 <= 5)
    refills_res = await async_client.get("/reminders/refills", headers=headers)
    assert refills_res.status_code == 200
    refills = refills_res.json()
    assert len(refills) == 1
    assert refills[0]["id"] == reminder_id

    # Log dose as TAKEN
    dose_res = await async_client.post(
        f"/reminders/{reminder_id}/doses",
        headers=headers,
        json={
            "scheduled_time": datetime.now(UTC).isoformat(),
            "status": "taken",
        },
    )
    assert dose_res.status_code == 200
    assert dose_res.json()["status"] == "taken"

    # Verify supply was decremented from 5 to 4
    rem_detail_res = await async_client.get(f"/reminders/{reminder_id}", headers=headers)
    assert rem_detail_res.status_code == 200
    assert rem_detail_res.json()["remaining_supply"] == 4


@pytest.mark.asyncio
async def test_update_and_delete_reminder(async_client: AsyncClient):
    _, token = await get_patient_token(async_client, "edit_patient@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create reminder
    create_res = await async_client.post(
        "/reminders/",
        headers=headers,
        json={
            "medicine_name": "Telmisartan",
            "dosage": "40 mg",
            "total_supply": 30,
            "remaining_supply": 30,
            "refill_threshold": 5,
        },
    )
    rem_id = create_res.json()["id"]

    # Update supply and instructions
    update_res = await async_client.put(
        f"/reminders/{rem_id}",
        headers=headers,
        json={
            "remaining_supply": 45,
            "instructions": "Take before breakfast",
        },
    )
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["remaining_supply"] == 45
    assert updated["instructions"] == "Take before breakfast"

    # Delete reminder
    del_res = await async_client.delete(f"/reminders/{rem_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify 404
    get_res = await async_client.get(f"/reminders/{rem_id}", headers=headers)
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_caregiver_reminders_access_control(async_client: AsyncClient):
    p_id, p_token = await get_patient_token(async_client, "p_consent_rem@example.com", "patient")
    p_headers = {"Authorization": f"Bearer {p_token}"}

    # Patient adds reminder
    await async_client.post(
        "/reminders/",
        headers=p_headers,
        json={
            "medicine_name": "Insulin Glargine",
            "dosage": "10 units",
            "total_supply": 100,
            "remaining_supply": 80,
        },
    )

    # Register caregiver
    cg_id, cg_token = await get_patient_token(async_client, "cg_rem@example.com", "caregiver")
    cg_headers = {"Authorization": f"Bearer {cg_token}"}

    # Caregiver attempts to read patient's reminders without consent -> 403
    forbidden_res = await async_client.get(f"/reminders/?patient_id={p_id}", headers=cg_headers)
    assert forbidden_res.status_code == 403

    # Caregiver requests access
    req_res = await async_client.post(
        "/consent/request",
        headers=cg_headers,
        json={
            "patient_email": "p_consent_rem@example.com",
            "permissions": {"can_view_reminders": True},
        },
    )
    assert req_res.status_code == 201
    consent_id = req_res.json()["id"]

    # Patient approves WITH can_view_reminders = True
    await async_client.put(
        f"/consent/{consent_id}",
        headers=p_headers,
        json={
            "status": "approved",
            "permissions": {"can_view_reminders": True},
        },
    )

    # Caregiver reads reminders -> 200 OK
    allowed_res = await async_client.get(f"/reminders/?patient_id={p_id}", headers=cg_headers)
    assert allowed_res.status_code == 200
    reminders = allowed_res.json()
    assert len(reminders) == 1
    assert reminders[0]["medicine_name"] == "Insulin Glargine"

    # Patient revokes reminders permission
    await async_client.put(
        f"/consent/{consent_id}",
        headers=p_headers,
        json={
            "status": "approved",
            "permissions": {"can_view_reminders": False},
        },
    )

    # Caregiver now gets 403 Forbidden
    denied_res = await async_client.get(f"/reminders/?patient_id={p_id}", headers=cg_headers)
    assert denied_res.status_code == 403

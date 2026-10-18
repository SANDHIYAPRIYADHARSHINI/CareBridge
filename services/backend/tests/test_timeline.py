from datetime import UTC, datetime

import pytest
from httpx import AsyncClient


async def get_user_token(
    async_client: AsyncClient, email: str, role: str = "patient", full_name: str = "Test User"
) -> tuple[str, str]:
    await async_client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "StrongPassword123!",
            "full_name": full_name,
            "role": role,
        },
    )
    login_res = await async_client.post(
        "/auth/login",
        json={"email": email, "password": "StrongPassword123!"},
    )
    data = login_res.json()
    return data["user"]["id"], data["access_token"]


@pytest.mark.asyncio
async def test_patient_get_timeline_seeds_and_returns_events(async_client: AsyncClient):
    _, token = await get_user_token(
        async_client, "p_timeline_1@example.com", role="patient", full_name="Kaviya Sundaram"
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch timeline
    res = await async_client.get("/timeline/", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "events" in data
    assert data["total_events"] > 0
    events = data["events"]

    # Verify chronological sorting (descending)
    timestamps = [e["timestamp"] for e in events]
    assert timestamps == sorted(timestamps, reverse=True)

    # Verify event structure
    types = {e["type"] for e in events}
    assert "prescription" in types
    assert "report" in types
    assert "discharge" in types

    # Check details on a prescription item
    rx_item = next(e for e in events if e["type"] == "prescription")
    assert rx_item["is_verified"] is True
    assert "Member 1 AI" in rx_item["source"]
    assert rx_item["document_url"] is not None
    assert rx_item["doctor_name"] is not None


@pytest.mark.asyncio
async def test_timeline_filtering(async_client: AsyncClient):
    _, token = await get_user_token(
        async_client, "p_timeline_filter@example.com", role="patient", full_name="Filter Patient"
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Filter for prescriptions only
    res_rx = await async_client.get("/timeline/?record_type=prescription", headers=headers)
    assert res_rx.status_code == 200
    rx_events = res_rx.json()["events"]
    assert len(rx_events) > 0
    assert all(e["type"] == "prescription" for e in rx_events)

    # Filter for reports only
    res_rep = await async_client.get("/timeline/?record_type=report", headers=headers)
    assert res_rep.status_code == 200
    rep_events = res_rep.json()["events"]
    assert len(rep_events) > 0
    assert all(e["type"] == "report" for e in rep_events)

    # Filter for discharge summaries
    res_disc = await async_client.get("/timeline/?record_type=discharge", headers=headers)
    assert res_disc.status_code == 200
    disc_events = res_disc.json()["events"]
    assert len(disc_events) > 0
    assert all(e["type"] == "discharge" for e in disc_events)


@pytest.mark.asyncio
async def test_create_and_get_health_record(async_client: AsyncClient):
    _, token = await get_user_token(
        async_client, "p_timeline_create@example.com", role="patient", full_name="Create Patient"
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Create health record
    rec_res = await async_client.post(
        "/timeline/records",
        headers=headers,
        json={
            "record_type": "report",
            "title": "Renal Function & Serum Electrolytes Panel",
            "description": "BUN: 14 mg/dL, Potassium: 4.1 mEq/L, Sodium: 140 mEq/L. Normal findings.",
            "doctor_name": "Dr. R. Raman",
            "hospital_name": "Apollo Diagnostic Services",
            "department": "Biochemistry",
            "record_date": datetime.now(UTC).isoformat(),
            "document_url": "/renal_panel_001.pdf",
            "is_verified": True,
            "status": "verified",
            "flags": [],
            "source": "Hospital Laboratory",
            "metadata_payload": {"creatinine": "0.9"},
        },
    )
    assert rec_res.status_code == 201
    rec_data = rec_res.json()
    record_id = rec_data["id"]

    # Retrieve single record
    get_res = await async_client.get(f"/timeline/records/{record_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "Renal Function & Serum Electrolytes Panel"

    # Delete record
    del_res = await async_client.delete(f"/timeline/records/{record_id}", headers=headers)
    assert del_res.status_code == 204


@pytest.mark.asyncio
async def test_caregiver_timeline_unauthorized(async_client: AsyncClient):
    p_id, _ = await get_user_token(
        async_client, "p_target_unauth@example.com", role="patient", full_name="Target Patient"
    )
    _, cg_token = await get_user_token(
        async_client, "cg_unauth_timeline@example.com", role="caregiver", full_name="Caregiver Unauth"
    )
    cg_headers = {"Authorization": f"Bearer {cg_token}"}

    # Caregiver attempts to read patient timeline without consent -> 403
    res = await async_client.get(f"/timeline/?patient_id={p_id}", headers=cg_headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_caregiver_timeline_granular_permissions_and_audit(async_client: AsyncClient):
    # Register Patient
    p_id, p_token = await get_user_token(
        async_client, "p_timeline_perm@example.com", role="patient", full_name="Sovereign Patient"
    )
    p_headers = {"Authorization": f"Bearer {p_token}"}

    # Register Caregiver
    _, cg_token = await get_user_token(
        async_client, "cg_timeline_perm@example.com", role="caregiver", full_name="Caregiver Permitted"
    )
    cg_headers = {"Authorization": f"Bearer {cg_token}"}

    # Caregiver requests consent
    req_res = await async_client.post(
        "/consent/request",
        headers=cg_headers,
        json={
            "patient_email": "p_timeline_perm@example.com",
            "permissions": {"can_view_prescriptions": True, "can_view_records": True},
        },
    )
    assert req_res.status_code == 201
    consent_id = req_res.json()["id"]

    # Patient approves WITH can_view_prescriptions = True, but can_view_records = False
    await async_client.put(
        f"/consent/{consent_id}",
        headers=p_headers,
        json={
            "status": "approved",
            "permissions": {
                "can_view_prescriptions": True,
                "can_view_records": False,
                "can_view_reminders": False,
                "can_view_appointments": False,
            },
        },
    )

    # Caregiver reads timeline
    timeline_res = await async_client.get(f"/timeline/?patient_id={p_id}", headers=cg_headers)
    assert timeline_res.status_code == 200
    events = timeline_res.json()["events"]

    # Must contain prescriptions
    types = {e["type"] for e in events}
    assert "prescription" in types
    # Must NOT contain reports, discharge summaries, appointments, reminders
    assert "report" not in types
    assert "discharge" not in types
    assert "appointment" not in types
    assert "reminder" not in types

    # Check audit logs
    audit_res = await async_client.get("/consent/audit-logs", headers=p_headers)
    assert audit_res.status_code == 200
    logs = audit_res.json()
    timeline_audits = [log_entry for log_entry in logs if log_entry["action"] == "view_patient_timeline"]
    assert len(timeline_audits) > 0
    assert timeline_audits[0]["patient_id"] == p_id

    # Patient revokes all permissions
    await async_client.put(
        f"/consent/{consent_id}",
        headers=p_headers,
        json={
            "status": "approved",
            "permissions": {
                "can_view_prescriptions": False,
                "can_view_records": False,
                "can_view_reminders": False,
                "can_view_appointments": False,
            },
        },
    )

    # Now caregiver access should be rejected with 403 Forbidden
    blocked_res = await async_client.get(f"/timeline/?patient_id={p_id}", headers=cg_headers)
    assert blocked_res.status_code == 403

import pytest
from httpx import AsyncClient


async def get_auth_token(async_client: AsyncClient, email: str, role: str) -> str:
    # Register or login
    await async_client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "full_name": f"User {role}",
            "role": role,
        },
    )
    res = await async_client.post(
        "/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_caregiver_consent_flow(async_client: AsyncClient):
    patient_email = "patient_consent_flow@carebridge.health"
    caregiver_email = "caregiver_consent_flow@carebridge.health"

    patient_token = await get_auth_token(async_client, patient_email, "patient")
    caregiver_token = await get_auth_token(async_client, caregiver_email, "caregiver")

    # 1. Caregiver requests access
    req_res = await async_client.post(
        "/consent/request",
        headers={"Authorization": f"Bearer {caregiver_token}"},
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
    assert req_res.status_code == 201
    consent_data = req_res.json()
    assert consent_data["status"] == "pending"
    consent_id = consent_data["id"]
    patient_id = consent_data["patient_id"]

    # 2. Caregiver cannot access patient records while status is pending
    denied_res = await async_client.get(
        f"/consent/patient-summary/{patient_id}",
        headers={"Authorization": f"Bearer {caregiver_token}"},
    )
    assert denied_res.status_code == 403

    # 3. Patient lists pending consent requests
    pt_list_res = await async_client.get(
        "/consent/patient",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert pt_list_res.status_code == 200
    pt_consents = pt_list_res.json()
    assert any(c["id"] == consent_id for c in pt_consents)

    # 4. Patient approves consent with specific permissions
    approve_res = await async_client.put(
        f"/consent/{consent_id}",
        headers={"Authorization": f"Bearer {patient_token}"},
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
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "approved"

    # 5. Caregiver now successfully accesses permitted summary
    summary_res = await async_client.get(
        f"/consent/patient-summary/{patient_id}",
        headers={"Authorization": f"Bearer {caregiver_token}"},
    )
    assert summary_res.status_code == 200
    summary_data = summary_res.json()
    assert summary_data["permissions"]["can_view_reminders"] is True
    assert summary_data["permissions"]["can_view_appointments"] is False
    assert "appointments" in summary_data["restricted_scopes"]

    # 6. Patient revokes access
    revoke_res = await async_client.put(
        f"/consent/{consent_id}",
        headers={"Authorization": f"Bearer {patient_token}"},
        json={"status": "revoked"},
    )
    assert revoke_res.status_code == 200
    assert revoke_res.json()["status"] == "revoked"

    # 7. Caregiver is immediately blocked upon revocation
    blocked_res = await async_client.get(
        f"/consent/patient-summary/{patient_id}",
        headers={"Authorization": f"Bearer {caregiver_token}"},
    )
    assert blocked_res.status_code == 403

    # 8. Patient checks audit log to confirm access events were tracked
    audit_res = await async_client.get(
        "/consent/audit-logs",
        headers={"Authorization": f"Bearer {patient_token}"},
    )
    assert audit_res.status_code == 200
    audit_logs = audit_res.json()
    assert len(audit_logs) >= 3
    actions = [a["action"] for a in audit_logs]
    assert any("request_caregiver_access" in a for a in actions)
    assert any("access_granted_caregiver_summary" in a for a in actions)

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from httpx import AsyncClient


async def get_token(async_client: AsyncClient, email: str, role: str) -> str:
    await async_client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "full_name": f"User {role.capitalize()}",
            "role": role,
        },
    )
    res = await async_client.post(
        "/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_ai_health_proxy_connected(async_client: AsyncClient):
    """Verifies GET /ai/health returns live connection telemetry when Member 1 AI is available."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "status": "ok",
        "mock": False,
        "model": "google/gemma-2-9b-it",
        "gpu": "AMD Instinct MI300X (ROCm 6.2)",
        "stt_model": "openai/whisper-large-v3",
        "embed_model": "BAAI/bge-m3",
    }

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_resp

    with patch("app.routers.ai.httpx.AsyncClient") as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        res = await async_client.get("/ai/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["is_connected"] is True
        assert "AMD" in data["gpu"]
        assert "gemma" in data["model"].lower()


@pytest.mark.asyncio
async def test_ai_health_proxy_offline_fallback(async_client: AsyncClient):
    """Verifies GET /ai/health degrades gracefully to offline synthetic state if AI microservice is unreachable."""
    mock_client = AsyncMock()
    mock_client.get.side_effect = httpx.ConnectError("Connection refused")

    with patch("app.routers.ai.httpx.AsyncClient") as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        res = await async_client.get("/ai/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "offline"
        assert data["is_connected"] is False
        assert data["mock"] is True


@pytest.mark.asyncio
async def test_ai_prescription_extract_patient_success(async_client: AsyncClient):
    """Verifies an authenticated patient can extract medicines from an uploaded prescription."""
    token = await get_token(async_client, "pt_extract@test.com", "patient")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = {
        "request_id": "req-extract-001",
        "document_id": "doc-rx-001",
        "source": {"type": "image", "page_count": 1},
        "medicines": [
            {
                "id": "med-1",
                "name": {"value": "Metformin 500mg", "status": "found"},
                "dose": {"value": "1 tablet", "status": "found"},
                "timing": {"value": "after food", "status": "found"},
                "status": "verified_by_rules",
            }
        ],
        "overall_status": "ready",
        "flags": [],
        "metrics": {"latency_ms": 120.5, "model": "gemma-2-9b-rocm"},
    }

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_resp

    with patch("app.routers.ai.httpx.AsyncClient") as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        files = {"file": ("rx.png", b"fake-png-bytes", "image/png")}
        data = {"language_hint": "en"}
        res = await async_client.post(
            "/ai/extract",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data=data,
        )
        assert res.status_code == 200
        body = res.json()
        assert body["document_id"] == "doc-rx-001"
        assert len(body["medicines"]) == 1
        assert body["medicines"][0]["name"]["value"] == "Metformin 500mg"


@pytest.mark.asyncio
async def test_ai_prescription_extract_caregiver_permissions(async_client: AsyncClient):
    """Verifies caregiver access control: forbidden without prescription consent, authorized with consent."""
    p_token = await get_token(async_client, "pt_cg_rx@test.com", "patient")
    cg_token = await get_token(async_client, "cg_cg_rx@test.com", "caregiver")

    # Get patient profile to obtain patient_id
    p_me = await async_client.get("/auth/me", headers={"Authorization": f"Bearer {p_token}"})
    patient_id = p_me.json()["id"]

    # 1. Caregiver attempts extraction before any consent is requested -> 403 Forbidden
    files = {"file": ("rx.png", b"fake-png-bytes", "image/png")}
    data = {"language_hint": "en", "patient_id": patient_id}
    res_unauth = await async_client.post(
        "/ai/extract",
        headers={"Authorization": f"Bearer {cg_token}"},
        files=files,
        data=data,
    )
    assert res_unauth.status_code == 403
    assert "consent" in res_unauth.json()["detail"].lower()

    # 2. Caregiver requests access with can_view_prescriptions = False
    req_res = await async_client.post(
        "/consent/request",
        headers={"Authorization": f"Bearer {cg_token}"},
        json={
            "patient_email": "pt_cg_rx@test.com",
            "permissions": {"can_view_prescriptions": False, "can_view_records": True},
        },
    )
    assert req_res.status_code == 201
    consent_id = req_res.json()["id"]

    # Patient approves with can_view_prescriptions = False
    await async_client.put(
        f"/consent/{consent_id}",
        headers={"Authorization": f"Bearer {p_token}"},
        json={"status": "approved", "permissions": {"can_view_prescriptions": False}},
    )

    # Caregiver attempts extraction -> Still 403 Forbidden because can_view_prescriptions is False
    files2 = {"file": ("rx.png", b"fake-png-bytes", "image/png")}
    res_still_blocked = await async_client.post(
        "/ai/extract",
        headers={"Authorization": f"Bearer {cg_token}"},
        files=files2,
        data=data,
    )
    assert res_still_blocked.status_code == 403

    # 3. Patient updates consent to grant can_view_prescriptions = True
    await async_client.put(
        f"/consent/{consent_id}",
        headers={"Authorization": f"Bearer {p_token}"},
        json={"status": "approved", "permissions": {"can_view_prescriptions": True}},
    )

    # 4. Caregiver now successfully extracts prescription
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = {
        "request_id": "req-cg-001",
        "document_id": "doc-cg-rx",
        "source": {"type": "image", "page_count": 1},
        "medicines": [{"id": "m1", "name": {"value": "Amlodipine 5mg", "status": "found"}}],
        "overall_status": "ready",
        "flags": [],
        "metrics": {"latency_ms": 95.0, "model": "gemma-2-9b-rocm"},
    }

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_resp

    with patch("app.routers.ai.httpx.AsyncClient") as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        files3 = {"file": ("rx.png", b"fake-png-bytes", "image/png")}
        res_ok = await async_client.post(
            "/ai/extract",
            headers={"Authorization": f"Bearer {cg_token}"},
            files=files3,
            data=data,
        )
        assert res_ok.status_code == 200
        assert res_ok.json()["patient_id"] == patient_id


@pytest.mark.asyncio
async def test_ai_chat_caregiver_document_permission_gating(async_client: AsyncClient):
    """Verifies that caregiver AI chat enforces document-type permissions (prescriptions vs reports)."""
    p_token = await get_token(async_client, "pt_chat_gate@test.com", "patient")
    cg_token = await get_token(async_client, "cg_chat_gate@test.com", "caregiver")

    p_me = await async_client.get("/auth/me", headers={"Authorization": f"Bearer {p_token}"})
    patient_id = p_me.json()["id"]

    # Caregiver requests access
    req_res = await async_client.post(
        "/consent/request",
        headers={"Authorization": f"Bearer {cg_token}"},
        json={
            "patient_email": "pt_chat_gate@test.com",
            "permissions": {"can_view_prescriptions": True, "can_view_records": False},
        },
    )
    assert req_res.status_code == 201
    consent_id = req_res.json()["id"]

    # Patient approves with can_view_prescriptions=True, can_view_records=False
    await async_client.put(
        f"/consent/{consent_id}",
        headers={"Authorization": f"Bearer {p_token}"},
        json={"status": "approved", "permissions": {"can_view_prescriptions": True, "can_view_records": False}},
    )

    # Caregiver submits inquiry attaching an unauthorized 'report' document -> 403 Forbidden
    res_forbidden = await async_client.post(
        "/ai/chat",
        headers={"Authorization": f"Bearer {cg_token}"},
        json={
            "messages": [{"role": "user", "content": "What do the lab tests say?"}],
            "language": "en",
            "patient_id": patient_id,
            "documents": [
                {
                    "doc_id": "lab-report-01",
                    "type": "report",
                    "title": "Complete Blood Count",
                }
            ],
        },
    )
    assert res_forbidden.status_code == 403
    assert "medical reports" in res_forbidden.json()["detail"].lower()

    # Caregiver submits inquiry attaching an authorized 'prescription' document -> 200 OK
    mock_chat_resp = MagicMock()
    mock_chat_resp.status_code = 200
    mock_chat_resp.headers = {"content-type": "application/json"}
    mock_chat_resp.json.return_value = {
        "request_id": "req-chat-002",
        "language": "en",
        "answer": "The prescription indicates Metformin 500mg twice daily after meals.",
        "citations": [{"id": "c1", "quote": "Metformin 500mg 1-0-1"}],
        "support_status": "supported",
        "escalation": {"required": False, "level": "L0", "suggested_contact": "none"},
        "uncertainty_notes": [],
        "suggested_actions": [],
        "metrics": {"latency_ms": 210.0, "model": "gemma-2-9b-rocm"},
    }

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_chat_resp

    with patch("app.routers.ai.httpx.AsyncClient") as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        res_ok = await async_client.post(
            "/ai/chat",
            headers={"Authorization": f"Bearer {cg_token}"},
            json={
                "messages": [{"role": "user", "content": "When should my patient take Metformin?"}],
                "language": "en",
                "patient_id": patient_id,
                "documents": [
                    {
                        "doc_id": "rx-01",
                        "type": "prescription",
                        "title": "Diabetes Care Prescription",
                    }
                ],
            },
        )
        assert res_ok.status_code == 200
        assert "Metformin" in res_ok.json()["answer"]


@pytest.mark.asyncio
async def test_ai_downtime_handles_gracefully(async_client: AsyncClient):
    """Verifies that timeouts or AI service outages return structured 503 retryable responses."""
    token = await get_token(async_client, "pt_downtime@test.com", "patient")

    mock_client = AsyncMock()
    mock_client.post.side_effect = httpx.TimeoutException("Read timed out")

    with patch("app.routers.ai.httpx.AsyncClient") as mock_client_cls:
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        res = await async_client.post(
            "/ai/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "messages": [{"role": "user", "content": "Hello"}],
                "language": "en",
            },
        )
        assert res.status_code == 503
        data = res.json()
        assert data["detail"]["error"]["code"] == "model_unavailable"
        assert data["detail"]["error"]["retryable"] is True


@pytest.mark.asyncio
async def test_ai_benchmark_metrics_endpoint(async_client: AsyncClient):
    """Verifies GET /ai/metrics/benchmark returns telemetry data."""
    res = await async_client.get("/ai/metrics/benchmark")
    assert res.status_code == 200
    data = res.json()
    assert "model" in data
    assert "concurrency_table" in data

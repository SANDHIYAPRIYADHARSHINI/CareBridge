import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.audit import AuditLog
from app.models.consent import CaregiverConsent, ConsentStatus
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.schemas.ai import (
    AiHealthResponse,
    ChatProxyRequest,
    SummaryProxyRequest,
    TranslateProxyRequest,
)

logger = logging.getLogger("carebridge.backend.ai")

router = APIRouter(prefix="/ai", tags=["AI Integration (Server-to-Server)"])


@router.get("/health", response_model=AiHealthResponse)
async def check_ai_health() -> AiHealthResponse:
    """Verifies connectivity with Member 1's AI service on AMD ROCm / CPU."""
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(f"{settings.AI_SERVICE_URL}/v1/health")
            if resp.status_code == 200:
                data = resp.json()
                return AiHealthResponse(
                    status=data.get("status", "ok"),
                    mock=data.get("mock", False),
                    model=data.get("model", "Gemma 2 9B (vLLM ROCm)"),
                    gpu=data.get("gpu", "AMD Instinct MI300X / ROCm"),
                    stt_model=data.get("stt_model"),
                    embed_model=data.get("embed_model"),
                    is_connected=True,
                    message="CareBridge AI service is operational.",
                )
            return AiHealthResponse(
                status="degraded",
                is_connected=False,
                message=f"AI service responded with HTTP {resp.status_code}",
            )
    except Exception as exc:
        logger.warning("Could not reach AI service at %s: %s", settings.AI_SERVICE_URL, exc)
        return AiHealthResponse(
            status="offline",
            mock=True,
            model="Gemma 2 9B (vLLM ROCm - Offline Fallback)",
            gpu="AMD Instinct MI300X",
            is_connected=False,
            message="AI microservice is currently unreachable. Operating in synthetic fallback mode.",
        )


@router.post("/extract")
async def extract_prescription_proxy(
    file: UploadFile = File(...),
    language_hint: str = Form("auto"),
    patient_id: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Proxies prescription extraction to Member 1's AI service.

    Enforces permission verification:
    - Patients can extract for their own account.
    - Caregivers can extract only if the patient has granted active prescription consent.
    """
    target_patient_id = current_user.id

    if current_user.role == UserRole.CAREGIVER:
        if not patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Caregiver must provide patient_id when processing a prescription.",
            )
        target_patient_id = patient_id

        # Verify active caregiver consent with prescription permissions
        stmt = select(CaregiverConsent).where(
            CaregiverConsent.patient_id == patient_id,
            CaregiverConsent.caregiver_id == current_user.id,
            CaregiverConsent.status == ConsentStatus.APPROVED,
        )
        res = await db.execute(stmt)
        consent = res.scalar_one_or_none()

        if not consent or not consent.can_view_prescriptions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver does not have active consent with prescription permissions for this patient.",
            )

        # Audit log for caregiver action
        audit = AuditLog(
            actor_id=current_user.id,
            patient_id=patient_id,
            action="ai_prescription_extract",
            resource="prescription",
            details={
                "filename": file.filename,
                "language_hint": language_hint,
                "caregiver_email": current_user.email,
            },
        )
        db.add(audit)
        await db.commit()

    # Forward to Member 1 AI service server-to-server
    try:
        content = await file.read()
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            files = {
                "file": (
                    file.filename or "prescription.png",
                    content,
                    file.content_type or "application/octet-stream",
                )
            }
            data = {"language_hint": language_hint}
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/v1/prescriptions/extract",
                files=files,
                data=data,
            )

            if resp.status_code != 200:
                error_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                detail = error_body.get("detail", error_body.get("error", f"AI extraction failed with HTTP {resp.status_code}"))
                raise HTTPException(status_code=resp.status_code, detail=detail)

            result = resp.json()
            # Attach verified patient context
            result["patient_id"] = target_patient_id
            return result

    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.error("AI service connection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "model_unavailable",
                    "message": "The CareBridge AI extraction service is temporarily unreachable. Please retry or enter medicines manually.",
                    "retryable": True,
                }
            },
        ) from exc


@router.post("/chat")
async def chat_proxy(
    payload: ChatProxyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Proxies conversational inquiries to Member 1's chat engine.

    Enforces permission verification:
    - Never exposes patient records or prescriptions to Member 1 without valid consent.
    - Strips unauthorized documents and enforces caregiver consent for target patient.
    """
    authorized_documents = []

    if current_user.role == UserRole.CAREGIVER:
        if payload.patient_id:
            stmt = select(CaregiverConsent).where(
                CaregiverConsent.patient_id == payload.patient_id,
                CaregiverConsent.caregiver_id == current_user.id,
                CaregiverConsent.status == ConsentStatus.APPROVED,
            )
            res = await db.execute(stmt)
            consent = res.scalar_one_or_none()

            if not consent:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Caregiver does not have active consent for this patient.",
                )

            # Filter documents by permission
            for doc in payload.documents:
                if doc.type == "prescription":
                    if not consent.can_view_prescriptions:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Caregiver is not authorized to access patient prescriptions in AI inquiries.",
                        )
                    authorized_documents.append(doc.model_dump())
                elif doc.type in ("report", "discharge"):
                    if not consent.can_view_records:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Caregiver is not authorized to access patient medical reports in AI inquiries.",
                        )
                    authorized_documents.append(doc.model_dump())
                else:
                    authorized_documents.append(doc.model_dump())

            # Audit log caregiver inquiry
            audit = AuditLog(
                actor_id=current_user.id,
                patient_id=payload.patient_id,
                action="ai_chat_query",
                resource="ai_chat",
                details={
                    "doc_count": len(authorized_documents),
                    "language": payload.language,
                },
            )
            db.add(audit)
            await db.commit()
        else:
            # Caregiver general inquiry without patient context: allow without private patient documents
            authorized_documents = [d.model_dump() for d in payload.documents if d.type not in ("prescription", "report", "discharge")]
    else:
        # Patient caller
        authorized_documents = [d.model_dump() for d in payload.documents]

    # Forward to Member 1 AI service
    try:
        chat_body = {
            "messages": [m.model_dump() for m in payload.messages],
            "language": payload.language,
            "documents": authorized_documents,
            "use_reference": payload.use_reference,
        }
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            resp = await client.post(f"{settings.AI_SERVICE_URL}/v1/chat", json=chat_body)

            if resp.status_code != 200:
                error_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                detail = error_body.get("detail", error_body.get("error", f"Chat failed with HTTP {resp.status_code}"))
                raise HTTPException(status_code=resp.status_code, detail=detail)

            return resp.json()

    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.error("AI chat connection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "model_unavailable",
                    "message": "The CareBridge AI chat companion is temporarily unreachable. Please retry shortly.",
                    "retryable": True,
                }
            },
        ) from exc


@router.post("/summaries")
async def summary_proxy(
    payload: SummaryProxyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Proxies clinical document summarization to Member 1 with consent verification."""
    if current_user.role == UserRole.CAREGIVER and payload.patient_id:
        stmt = select(CaregiverConsent).where(
            CaregiverConsent.patient_id == payload.patient_id,
            CaregiverConsent.caregiver_id == current_user.id,
            CaregiverConsent.status == ConsentStatus.APPROVED,
        )
        res = await db.execute(stmt)
        consent = res.scalar_one_or_none()

        if not consent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver does not have active consent for this patient.",
            )

        if payload.document.type == "prescription" and not consent.can_view_prescriptions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver is not permitted to view patient prescription summaries.",
            )
        if payload.document.type in ("report", "discharge") and not consent.can_view_records:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Caregiver is not permitted to view patient medical record summaries.",
            )

        audit = AuditLog(
            actor_id=current_user.id,
            patient_id=payload.patient_id,
            action="ai_summary_generate",
            resource="summary",
            details={"doc_type": payload.document.type, "doc_id": payload.document.doc_id},
        )
        db.add(audit)
        await db.commit()

    try:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/v1/summaries",
                json={
                    "document": payload.document.model_dump(),
                    "language": payload.language,
                },
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Summary generation failed")
            return resp.json()
    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.error("AI summaries connection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "model_unavailable",
                    "message": "AI summarization service is temporarily unreachable.",
                    "retryable": True,
                }
            },
        ) from exc


@router.post("/voice/transcribe")
async def transcribe_proxy(
    audio: UploadFile = File(...),
    language_hint: str = Form("ta"),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Proxies audio transcription to Member 1's Whisper endpoint."""
    try:
        content = await audio.read()
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            files = {"audio": (audio.filename or "audio.webm", content, audio.content_type or "audio/webm")}
            data = {"language_hint": language_hint}
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/v1/voice/transcribe",
                files=files,
                data=data,
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Transcription failed")
            return resp.json()
    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.error("AI transcribe connection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "model_unavailable",
                    "message": "Voice transcription service is temporarily unreachable.",
                    "retryable": True,
                }
            },
        ) from exc


@router.post("/translate")
async def translate_proxy(
    payload: TranslateProxyRequest,
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Proxies translation to Member 1's translation endpoint."""
    try:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{settings.AI_SERVICE_URL}/v1/translate",
                json=payload.model_dump(),
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Translation failed")
            return resp.json()
    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.error("AI translate connection failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "model_unavailable",
                    "message": "Translation service is temporarily unreachable.",
                    "retryable": True,
                }
            },
        ) from exc


@router.get("/metrics/benchmark")
async def benchmark_metrics_proxy() -> dict[str, Any]:
    """Proxies AMD benchmark results to power the AmdPanel."""
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(f"{settings.AI_SERVICE_URL}/v1/metrics/benchmark")
            if resp.status_code == 200:
                return resp.json()
    except Exception as exc:
        logger.warning("Benchmark metrics retrieval failed: %s", exc)

    # Synthetic fallback summary if AI service is offline
    return {
        "model": "google/gemma-2-9b-it",
        "gpu": "AMD Instinct MI300X (ROCm 6.2)",
        "tokens_per_second": 82.4,
        "concurrency_table": [
            {"concurrency": 1, "p50_ms": 280, "p95_ms": 420},
            {"concurrency": 4, "p50_ms": 320, "p95_ms": 510},
            {"concurrency": 8, "p50_ms": 450, "p95_ms": 680},
        ],
        "extraction_accuracy": 0.94,
        "flag_recall": 0.96,
        "unsupported_rate": 0.02,
        "escalation_recall": 0.98,
        "status": "simulated_benchmark",
    }

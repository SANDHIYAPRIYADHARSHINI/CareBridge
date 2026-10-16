import io
import json
import logging

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from PIL import Image

from app.config import Settings, get_settings
from app.core.extraction import extract_prescription
from app.schemas.prescription import ExtractionResult, QrExtractRequest

logger = logging.getLogger("carebridge.ai.prescriptions")
router = APIRouter(prefix="/v1/prescriptions", tags=["Prescriptions"])


def _load_fixture(settings: Settings, filename: str) -> dict:
    fixture_path = settings.FIXTURES_DIR / filename
    if not fixture_path.exists():
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "internal_error", "message": f"Fixture {filename} missing"}},
        )
    with open(fixture_path, encoding="utf-8") as f:
        return json.load(f)


@router.post("/extract", response_model=ExtractionResult)
async def extract_prescription_endpoint(
    request: Request,
    file: UploadFile = File(...),
    language_hint: str | None = Form("auto"),
    settings: Settings = Depends(get_settings),
) -> ExtractionResult:
    # 1. Validate content type
    allowed_content_types = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/octet-stream",
    ]
    if file.content_type and file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "invalid_input",
                    "message": (
                        f"Unsupported media type: {file.content_type}. Use jpg, png, or pdf."
                    ),
                    "retryable": False,
                }
            },
        )

    # 2. Validate file size
    content = await file.read()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail={
                "error": {
                    "code": "too_large",
                    "message": f"File size exceeds maximum allowed of {settings.MAX_UPLOAD_MB}MB.",
                    "retryable": False,
                }
            },
        )

    # 3. Mock mode returns fixtures
    if settings.MOCK_MODE:
        req_id = getattr(request.state, "request_id", "req-mock-default")
        filename_lower = (file.filename or "").lower()
        fixture_name = (
            "extraction_flagged.json"
            if "flag" in filename_lower or (language_hint and "flag" in language_hint)
            else "extraction_ok.json"
        )
        data = _load_fixture(settings, fixture_name)
        data["request_id"] = req_id
        return ExtractionResult.model_validate(data)

    # 4. Live mode requires LLM_API_KEY
    if not settings.LLM_API_KEY or settings.LLM_API_KEY.strip() in ("", "unset", "none"):
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "model_unavailable",
                    "message": (
                        "LLM_API_KEY is not configured in environment. "
                        "Live model inference is unavailable. Set MOCK_MODE=true for fixtures."
                    ),
                    "retryable": False,
                }
            },
        )

    # 5. Open image
    try:
        image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "invalid_input",
                    "message": f"Could not parse uploaded file as an image: {exc}",
                    "retryable": False,
                }
            },
        ) from exc

    req_id = getattr(request.state, "request_id", None)

    try:
        return await extract_prescription(
            image_input=image,
            language_hint=language_hint,
            settings=settings,
            request_id=req_id,
        )
    except httpx.HTTPError as exc:
        logger.error("LLM backend communication failure: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "model_unavailable",
                    "message": f"LLM backend unavailable: {exc}",
                    "retryable": True,
                }
            },
        ) from exc
    except Exception as exc:
        logger.error("Prescription extraction failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "internal_error",
                    "message": f"Extraction pipeline failed: {exc}",
                    "retryable": False,
                }
            },
        ) from exc


@router.post("/from-qr", response_model=ExtractionResult)
async def extract_from_qr(
    request: Request,
    payload: QrExtractRequest,
    settings: Settings = Depends(get_settings),
) -> ExtractionResult:
    if settings.MOCK_MODE:
        req_id = getattr(request.state, "request_id", "req-mock-qr")
        data = _load_fixture(settings, "extraction_ok.json")
        data["request_id"] = req_id
        data["source"] = {"type": "qr", "page_count": 1}
        data["ocr"] = {"engine": "qr_decoder", "lines": []}
        return ExtractionResult.model_validate(data)

    raise HTTPException(
        status_code=501,
        detail={
            "error": {
                "code": "model_unavailable",
                "message": "QR pipeline under construction.",
                "retryable": False,
            }
        },
    )

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.config import Settings, get_settings
from app.schemas.prescription import ExtractionResult, QrExtractRequest

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
async def extract_prescription(
    request: Request,
    file: UploadFile = File(...),
    language_hint: str | None = Form("auto"),
    settings: Settings = Depends(get_settings),
) -> ExtractionResult:
    # Validate content type
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

    # Validate file size if available
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

    raise HTTPException(
        status_code=501,
        detail={
            "error": {
                "code": "model_unavailable",
                "message": (
                    "Live extraction pipeline active in milestone P3. Use MOCK_MODE=true for now."
                ),
                "retryable": False,
            }
        },
    )


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

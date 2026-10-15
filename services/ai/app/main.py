import logging
import uuid
from collections.abc import Callable

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import (
    chat_router,
    health_router,
    metrics_router,
    prescriptions_router,
    summaries_router,
    translate_router,
    voice_router,
)

logger = logging.getLogger("carebridge.ai")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

settings = get_settings()

app = FastAPI(
    title="CareBridge AI Service",
    description=(
        "Stateless clinical documentation and patient assistance AI service "
        "running on AMD ROCm / CPU."
    ),
    version="1.0.0",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# Request ID Middleware
@app.middleware("http")
async def request_id_middleware(request: Request, call_next: Callable) -> Response:
    req_id = request.headers.get("X-Request-ID")
    if not req_id:
        req_id = f"req-{uuid.uuid4().hex[:12]}"

    request.state.request_id = req_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    return response


# Global Exception Handlers conforming to docs/api-contract.md
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    req_id = getattr(request.state, "request_id", "req-unknown")
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        content = exc.detail
    else:
        content = {
            "error": {
                "code": "invalid_input" if exc.status_code < 500 else "internal_error",
                "message": str(exc.detail),
                "retryable": exc.status_code >= 500,
            }
        }
    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers={"X-Request-ID": req_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    req_id = getattr(request.state, "request_id", "req-unknown")
    errors = exc.errors()
    msg = "; ".join([f"{'.'.join(str(loc) for loc in e['loc'])}: {e['msg']}" for e in errors])
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "invalid_input",
                "message": f"Validation error: {msg}",
                "retryable": False,
            }
        },
        headers={"X-Request-ID": req_id},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    req_id = getattr(request.state, "request_id", "req-unknown")
    logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "An unexpected server error occurred.",
                "retryable": True,
            }
        },
        headers={"X-Request-ID": req_id},
    )


# Register Routers
app.include_router(health_router)
app.include_router(prescriptions_router)
app.include_router(chat_router)
app.include_router(voice_router)
app.include_router(summaries_router)
app.include_router(translate_router)
app.include_router(metrics_router)


@app.get("/")
async def root():
    return {
        "service": "CareBridge AI",
        "health": "/v1/health",
        "docs": "/docs",
        "mock_mode": settings.MOCK_MODE,
    }

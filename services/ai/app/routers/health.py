"""Health check endpoint reporting AMD Token Factory status, model, and CPU services."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.core.rag import BaseEmbedder, SentenceTransformerEmbedder

logger = logging.getLogger("carebridge.ai.health")
router = APIRouter(prefix="/v1", tags=["Health"])

_models_checked: bool = False
_model_available: bool = False
_cached_models: list[str] = []


async def check_models_available(settings: Settings) -> bool:
    """Probes GET /v1/models once at startup (cached in memory) to verify LLM_MODEL."""
    global _models_checked, _model_available, _cached_models
    if _models_checked:
        return _model_available

    if settings.MOCK_MODE:
        _models_checked = True
        _model_available = True
        return True

    if not settings.LLM_API_KEY or settings.LLM_API_KEY.strip() in ("", "local", "unset"):
        _models_checked = True
        _model_available = False
        return False

    url = f"{settings.LLM_BASE_URL.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {settings.LLM_API_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(url, headers=headers)
            if res.status_code == 200:
                data = res.json().get("data", [])
                _cached_models = [
                    m.get("id", "") for m in data if isinstance(m, dict) and "id" in m
                ]
                target_model = settings.LLM_MODEL.lower()
                _model_available = any(
                    target_model == mid.lower() or target_model in mid.lower()
                    for mid in _cached_models
                )
            else:
                _model_available = False
    except Exception as exc:
        logger.warning("Could not probe AMD Token Factory /models: %s", exc)
        _model_available = False

    _models_checked = True
    return _model_available


def get_active_embedder(settings: Settings = Depends(get_settings)) -> BaseEmbedder:
    return SentenceTransformerEmbedder()


@router.get("/health")
async def health(
    settings: Settings = Depends(get_settings),
    embedder: BaseEmbedder = Depends(get_active_embedder),
) -> dict[str, Any]:
    """Returns system status with LLM on AMD Token Factory (hosted) and CPU for OCR/embeddings."""
    model_avail = await check_models_available(settings)
    compute_location = "hosted on AMD Token Factory"
    device = "hosted on AMD Token Factory"

    # Inspect the embedder actually loaded in memory
    is_fallback = getattr(embedder, "is_fallback", False)
    if hasattr(embedder, "loaded_model_name"):
        actually_loaded = embedder.loaded_model_name
    elif hasattr(embedder, "_get_model"):
        model = embedder._get_model()
        if hasattr(model, "loaded_model_name"):
            actually_loaded = model.loaded_model_name
            is_fallback = getattr(model, "is_fallback", True)
        else:
            actually_loaded = f"{model.__class__.__name__} ({settings.EMBED_MODEL})"
    else:
        actually_loaded = f"{embedder.__class__.__name__} ({settings.EMBED_MODEL})"

    warning = (
        f"n-gram fallback in use: {settings.EMBED_MODEL} is not loaded"
        if is_fallback
        else None
    )

    return {
        "status": "ok",
        "mock": settings.MOCK_MODE,
        "model": settings.LLM_MODEL,
        "model_available": model_avail,
        "compute_location": compute_location,
        "gpu": compute_location,
        "device": device,
        "llm_host": "AMD Token Factory",
        "ocr_device": "Host CPU",
        "embed_device": "Host CPU",
        "stt_model": settings.WHISPER_MODEL,
        "embed_model": settings.EMBED_MODEL,
        "embedder": actually_loaded,
        "embedder_loaded": actually_loaded,
        "warning": warning,
    }

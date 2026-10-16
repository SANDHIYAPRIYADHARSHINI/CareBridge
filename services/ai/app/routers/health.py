"""Health check endpoint reporting AMD ROCm GPU status, device, and active models."""

from __future__ import annotations

import shutil
import subprocess
from typing import Any

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.core.rag import BaseEmbedder, SentenceTransformerEmbedder
from app.core.stt import get_inference_device

router = APIRouter(prefix="/v1", tags=["Health"])


def get_active_embedder(settings: Settings = Depends(get_settings)) -> BaseEmbedder:
    return SentenceTransformerEmbedder()


def detect_gpu() -> str:
    """Attempts detection of AMD ROCm GPU via rocm-smi."""
    if shutil.which("rocm-smi"):
        try:
            res = subprocess.run(
                ["rocm-smi", "--showproductname"],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout.strip().split("\n")[0]
        except Exception:
            pass
    return "AMD ROCm / CPU (Mock Mode)"


@router.get("/health")
async def health(
    settings: Settings = Depends(get_settings),
    embedder: BaseEmbedder = Depends(get_active_embedder),
) -> dict[str, Any]:
    """Returns system status, reporting device actually used and the embedder actually loaded."""
    gpu_info = detect_gpu() if not settings.MOCK_MODE else "AMD Instinct Mock (Local Dev)"
    device = get_inference_device() if not settings.MOCK_MODE else "mock-gpu"

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
        "gpu": gpu_info,
        "device": device,
        "stt_model": settings.WHISPER_MODEL,
        "embed_model": settings.EMBED_MODEL,
        "embedder": actually_loaded,
        "embedder_loaded": actually_loaded,
        "warning": warning,
    }


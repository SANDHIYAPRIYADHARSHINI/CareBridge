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
    """Returns system status, reporting the device actually used and the embedder in use."""
    gpu_info = detect_gpu() if not settings.MOCK_MODE else "AMD Instinct Mock (Local Dev)"
    device = get_inference_device() if not settings.MOCK_MODE else "mock-gpu"
    embedder_name = f"{embedder.__class__.__name__} ({settings.EMBED_MODEL})"

    return {
        "status": "ok",
        "mock": settings.MOCK_MODE,
        "model": settings.LLM_MODEL,
        "gpu": gpu_info,
        "device": device,
        "stt_model": settings.WHISPER_MODEL,
        "embed_model": settings.EMBED_MODEL,
        "embedder": embedder_name,
    }

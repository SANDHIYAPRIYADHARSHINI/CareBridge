import shutil
import subprocess
from typing import Any

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings

router = APIRouter(prefix="/v1", tags=["Health"])


def detect_gpu() -> str:
    # Try rocm-smi on AMD
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
async def health(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    gpu_info = detect_gpu() if not settings.MOCK_MODE else "AMD Instinct Mock (Local Dev)"
    return {
        "status": "ok",
        "mock": settings.MOCK_MODE,
        "model": settings.LLM_MODEL,
        "gpu": gpu_info,
        "stt_model": settings.WHISPER_MODEL,
        "embed_model": settings.EMBED_MODEL,
    }

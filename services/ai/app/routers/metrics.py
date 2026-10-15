import json
from typing import Any

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings

router = APIRouter(prefix="/v1/metrics", tags=["Metrics"])


@router.get("/benchmark")
async def get_benchmark_metrics(
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    # Look for live eval summary if generated
    summary_path = settings.DATA_DIR.parent / "eval" / "results" / "summary.json"
    if summary_path.exists():
        with open(summary_path, encoding="utf-8") as f:
            return json.load(f)

    # Fallback to fixture
    fixture_path = settings.FIXTURES_DIR / "benchmark_summary.json"
    if fixture_path.exists():
        with open(fixture_path, encoding="utf-8") as f:
            return json.load(f)

    return {
        "model": settings.LLM_MODEL,
        "gpu": "AMD Instinct (Benchmark Pending)",
        "message": "Run eval/bench_latency.py to populate benchmark metrics",
    }

from datetime import datetime
from fastapi import APIRouter
from app.config import settings
from app.services.ai_client import ai_client

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """Health check endpoint indicating service and dependency status."""
    ai_status = await ai_client.check_health()
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "timestamp": datetime.utcnow().isoformat(),
        "ai_service": ai_status.get("status", "unknown"),
    }

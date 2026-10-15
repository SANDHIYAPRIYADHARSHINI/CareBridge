from app.routers.chat import router as chat_router
from app.routers.health import router as health_router
from app.routers.metrics import router as metrics_router
from app.routers.prescriptions import router as prescriptions_router
from app.routers.summaries import router as summaries_router
from app.routers.translate import router as translate_router
from app.routers.voice import router as voice_router

__all__ = [
    "health_router",
    "prescriptions_router",
    "chat_router",
    "voice_router",
    "summaries_router",
    "translate_router",
    "metrics_router",
]

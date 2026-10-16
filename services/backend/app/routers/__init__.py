from app.routers.health import router as health_router
from app.routers.auth import router as auth_router
from app.routers.consent import router as consent_router
from app.routers.reminders import router as reminders_router
from app.routers.timeline import router as timeline_router
from app.routers.hospitals import router as hospitals_router
from app.routers.appointments import router as appointments_router

__all__ = [
    "health_router",
    "auth_router",
    "consent_router",
    "reminders_router",
    "timeline_router",
    "hospitals_router",
    "appointments_router",
]

import os
import sys
from pathlib import Path
import pytest
from httpx import AsyncClient, ASGITransport

# Ensure backend root is on Python path
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Use SQLite in-memory for testing if postgres not available
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from app.main import app  # noqa: E402


@pytest.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

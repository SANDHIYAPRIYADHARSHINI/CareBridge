import logging
import httpx
from app.config import settings

logger = logging.getLogger("carebridge.ai_client")


class AiClient:
    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or settings.AI_SERVICE_URL).rstrip("/")

    async def check_health(self) -> dict:
        """Pings Member 1's AI service health endpoint."""
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                res = await client.get(f"{self.base_url}/v1/health")
                res.raise_for_status()
                return res.json()
            except Exception as e:
                logger.warning("Could not reach Member 1 AI service at %s: %s", self.base_url, e)
                return {"status": "unreachable", "error": str(e)}

    async def forward_chat(self, chat_request: dict) -> dict:
        """Sends an authorized chat query to Member 1's AI service."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{self.base_url}/v1/chat",
                json=chat_request,
            )
            res.raise_for_status()
            return res.json()


ai_client = AiClient()

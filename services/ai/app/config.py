from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(BASE_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    MOCK_MODE: bool = True
    LLM_BASE_URL: str = "http://localhost:8000/v1"
    LLM_API_KEY: str = "local"
    LLM_MODEL: str = "google/gemma-3-27b-it"
    LLM_MAX_CONCURRENCY: int = 3
    WHISPER_MODEL: str = "openai/whisper-large-v3-turbo"
    EMBED_MODEL: str = "BAAI/bge-m3"
    OCR_LANGS: str = "eng+tam"
    MAX_UPLOAD_MB: int = 10
    ALLOWED_ORIGINS: str | list[str] = "http://localhost:5173,http://localhost:3000"
    TESSERACT_CMD: str | None = None

    # Emergency and crisis hotline configurations (TO_VERIFY)
    EMERGENCY_NUMBER: str = "108"  # National emergency ambulance service in India (TO_VERIFY)
    CRISIS_HELPLINE_NUMBER: str = "14416"  # Tele-MANAS mental health helpline India (TO_VERIFY)
    CRISIS_HELPLINE_NAME: str = "Tele-MANAS (TO_VERIFY)"

    HOST: str = "0.0.0.0"
    PORT: int = 8100

    FIXTURES_DIR: Path = BASE_DIR / "fixtures"
    PROMPTS_DIR: Path = BASE_DIR / "app" / "prompts"
    DATA_DIR: Path = BASE_DIR / "data"

    @property
    def allowed_origins_list(self) -> list[str]:
        if isinstance(self.ALLOWED_ORIGINS, list):
            return self.ALLOWED_ORIGINS
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # App
    PROJECT_NAME: str = "CareBridge Main Backend"
    VERSION: str = "0.1.0"
    DEBUG: bool = True
    PORT: int = 8080
    HOST: str = "0.0.0.0"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    # Database
    DATABASE_URL: str = (
        "postgresql+asyncpg://carebridge:carebridge_secret@localhost:5432/carebridge_db"
    )
    POSTGRES_USER: str = "carebridge"
    POSTGRES_PASSWORD: str = "carebridge_secret"
    POSTGRES_DB: str = "carebridge_db"
    POSTGRES_PORT: int = 5432

    # JWT / Auth
    SECRET_KEY: str = "carebridge-dev-jwt-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # External AI Microservice (Member 1)
    AI_SERVICE_URL: str = "http://localhost:8100"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

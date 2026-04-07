"""
SyllabusCheck — App-wide configuration (Phase 7 update)
Adds Google OAuth + report output dir settings.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── App ────────────────────────────────────────────────────────────
    APP_NAME: str = "SyllabusCheck"
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me"
    DEBUG: bool = True

    # ── Database ───────────────────────────────────────────────────────
    DATABASE_URL: str = ""
    POSTGRES_DB: str = "syllacheck"
    POSTGRES_USER: str = "syllacheck"
    POSTGRES_PASSWORD: str = "devpassword"

    # ── Redis / Celery ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"

    # ── JWT ────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── OpenAI ─────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_CHAT_MODEL: str = "gpt-4o"
    

    # ── File Upload ────────────────────────────────────────────────────
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE_MB: int = 20
    ALLOWED_EXTENSIONS: str = "pdf,docx,doc"

    # ── Reports (Phase 7) ──────────────────────────────────────────────
    REPORT_DIR: str = "/app/reports"

    # ── Google OAuth (Phase 7) ─────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost/api/auth/google/callback"
    FRONTEND_URL: str = "http://localhost"

    # ── Scraping ───────────────────────────────────────────────────────
    RAPIDAPI_KEY: str = ""
    SCRAPE_INTERVAL_HOURS: int = 24
    MAX_JOBS_PER_SOURCE: int = 500
    PLAYWRIGHT_HEADLESS: bool = True

    # ── CORS ───────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://localhost"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

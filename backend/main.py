"""
SyllabusCheck — FastAPI Application Entry Point (Phase 7 update)
Adds google_auth router + creates /app/reports dir on startup.
"""
from sqlalchemy import text
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from core.config import settings
from core.database import engine, Base
from api.routes import auth, courses, jobs, coverage, reports, health, keywords
from api.routes.google_auth import router as google_auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure output directories exist
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.REPORT_DIR, exist_ok=True)

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="SyllabusCheck API",
    description="Curriculum vs. Industry Keyword Alignment Analyzer",
    version="1.7.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── Middleware ─────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── Routers ────────────────────────────────────────────────────────────
app.include_router(health.router,        prefix="/api",          tags=["health"])
app.include_router(auth.router,          prefix="/api/auth",     tags=["auth"])
app.include_router(google_auth_router,   prefix="/api/auth",     tags=["auth"])   # Google OAuth
app.include_router(courses.router,       prefix="/api/courses",  tags=["courses"])
app.include_router(jobs.router,          prefix="/api/jobs",     tags=["jobs"])
app.include_router(coverage.router,      prefix="/api/coverage", tags=["coverage"])
app.include_router(keywords.router,      prefix="/api/keywords", tags=["keywords"])
app.include_router(reports.router,       prefix="/api/reports",  tags=["reports"])

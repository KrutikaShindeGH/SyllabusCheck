import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from core.database import get_db
from api.routes.auth import get_current_user
from models.models import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/")
async def list_keywords(
    category: str = None,
    domain: str = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List keywords with optional filters."""
    query = "SELECT id::text, text, normalized, category, domain, frequency, is_emerging FROM keywords WHERE 1=1"
    params = {}
    if category:
        query += " AND category = :category"
        params["category"] = category
    if domain:
        query += " AND domain = :domain"
        params["domain"] = domain
    query += " ORDER BY frequency DESC LIMIT :limit"
    params["limit"] = limit

    result = await db.execute(text(query), params)
    rows = result.fetchall()
    return [
        {
            "id": r[0], "text": r[1], "normalized": r[2],
            "category": r[3], "domain": r[4],
            "frequency": r[5], "is_emerging": r[6],
        }
        for r in rows
    ]


@router.get("/stats")
async def keyword_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return keyword counts grouped by domain."""
    result = await db.execute(text("""
        SELECT domain, COUNT(*) as count
        FROM keywords
        WHERE domain IS NOT NULL
        GROUP BY domain
        ORDER BY count DESC
    """))
    rows = result.fetchall()
    return {r[0]: r[1] for r in rows}


@router.get("/trending")
async def trending_keywords(
    limit: int = Query(default=10, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return top keywords by frequency."""
    result = await db.execute(text("""
        SELECT text, category, domain, frequency, is_emerging
        FROM keywords
        WHERE frequency > 0
        ORDER BY frequency DESC
        LIMIT :limit
    """), {"limit": limit})
    rows = result.fetchall()
    return [
        {
            "text": r[0], "category": r[1], "domain": r[2],
            "frequency": r[3], "is_emerging": r[4],
        }
        for r in rows
    ]


@router.get("/emerging")
async def emerging_keywords(
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return emerging keywords."""
    result = await db.execute(text("""
        SELECT text, category, domain, frequency
        FROM keywords
        WHERE is_emerging = true
        ORDER BY frequency DESC
        LIMIT :limit
    """), {"limit": limit})
    rows = result.fetchall()
    return [
        {"text": r[0], "category": r[1], "domain": r[2], "frequency": r[3]}
        for r in rows
    ]


import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from core.database import get_db
from api.routes.auth import get_current_user
from models.models import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/classify-subdomains")
async def trigger_classify_subdomains(
    domain: str = Query(default="Computer Science", description="Keyword domain to classify"),
    batch_size: int = Query(default=50, ge=10, le=100, description="Keywords per Claude API call"),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger subdomain classification for all unclassified keywords in a domain.

    Uses Claude Haiku to classify keywords into:
    AI/ML | Cybersecurity | Data Science | Software Engineering | Networking | General CS

    This runs as a background Celery task — returns the task ID immediately.
    Check progress via /api/tasks/{task_id} or Celery logs.
    """
    from tasks.classify_tasks import classify_keyword_subdomains
    task = classify_keyword_subdomains.delay(domain=domain, batch_size=batch_size)
    logger.info(f"[Keywords API] classify_keyword_subdomains queued — task_id={task.id}")
    return {
        "message": f"Subdomain classification started for domain='{domain}'",
        "task_id": task.id,
        "domain": domain,
        "batch_size": batch_size,
    }


@router.get("/subdomain-stats")
async def subdomain_stats(
    domain: str = Query(default="Computer Science"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return keyword counts grouped by subdomain for a given domain."""
    result = await db.execute(text("""
        SELECT subdomain, COUNT(*) as count
        FROM keywords
        WHERE domain = :domain
        GROUP BY subdomain
        ORDER BY count DESC
    """), {"domain": domain})
    rows = result.fetchall()
    total_result = await db.execute(text("""
        SELECT COUNT(*) FROM keywords WHERE domain = :domain
    """), {"domain": domain})
    total = total_result.scalar()
    unclassified_result = await db.execute(text("""
        SELECT COUNT(*) FROM keywords WHERE domain = :domain AND subdomain IS NULL
    """), {"domain": domain})
    unclassified = unclassified_result.scalar()
    return {
        "domain": domain,
        "total": total,
        "unclassified": unclassified,
        "distribution": {r[0] or "unclassified": r[1] for r in rows},
    }


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



@router.post("/backfill-embeddings")
async def trigger_backfill_embeddings(
    batch_size: int = Query(default=200, ge=50, le=500),
    current_user: User = Depends(get_current_user),
):
    """
    Backfill embeddings for all keywords that have NULL embeddings.
    Run this once after importing keywords without embeddings.
    Without embeddings, coverage computation returns 0 for all courses.
    """
    from tasks.classify_tasks import backfill_keyword_embeddings
    task = backfill_keyword_embeddings.delay(batch_size=batch_size)
    logger.info(f"[Keywords API] backfill_keyword_embeddings queued — task_id={task.id}")
    return {
        "message": "Embedding backfill started",
        "task_id": task.id,
        "note": "This may take 5-10 minutes for 5000+ keywords. Watch worker logs.",
    }


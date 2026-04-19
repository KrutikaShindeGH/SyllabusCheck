"""
Jobs routes — list, filter, and trigger scraping.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import get_current_user, require_admin
from core.database import get_db
from models.models import JobPosting, User
from tasks.scrape_tasks import scrape_all_boards, scrape_single_source

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────

class JobResponse(BaseModel):
    id: str
    source: str
    title: str
    company: Optional[str]
    location: Optional[str]
    city: Optional[str]
    state: Optional[str]
    is_remote: bool
    role_type: Optional[str]
    domain: Optional[str]
    url: Optional[str]
    scraped_at: str

    @classmethod
    def from_orm(cls, j: JobPosting):
        return cls(
            id=str(j.id),
            source=j.source,
            title=j.title,
            company=j.company,
            location=j.location,
            city=j.city,
            state=j.state,
            is_remote=j.is_remote,
            role_type=j.role_type,
            domain=j.domain,
            url=j.url,
            scraped_at=j.scraped_at.isoformat() if j.scraped_at else "",
        )


class ScrapeResponse(BaseModel):
    message: str
    task_id: str


# ── Routes ─────────────────────────────────────────────────────────────

@router.get("/", response_model=list[JobResponse])
async def list_jobs(
    source: Optional[str] = Query(None),
    role_type: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    is_remote: Optional[bool] = Query(None),
    domain: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List jobs with optional filters."""
    query = select(JobPosting).order_by(JobPosting.scraped_at.desc())

    if source:
        if source == "github":
            query = query.where(JobPosting.source.like("github%"))
        else:
            query = query.where(JobPosting.source == source)
    if role_type:
        query = query.where(JobPosting.role_type == role_type)
    if city:
        query = query.where(JobPosting.city.ilike(f"%{city}%"))
    if state:
        query = query.where(JobPosting.state.ilike(f"%{state}%"))
    if is_remote is not None:
        query = query.where(JobPosting.is_remote == is_remote)
    if domain:
        query = query.where(JobPosting.domain == domain)
    if search:
        query = query.where(
            JobPosting.title.ilike(f"%{search}%") |
            JobPosting.company.ilike(f"%{search}%")
        )

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return [JobResponse.from_orm(j) for j in result.scalars().all()]


@router.get("/stats")
async def job_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get job board stats — total count per source."""
    result = await db.execute(
        select(JobPosting.source, func.count(JobPosting.id))
        .group_by(JobPosting.source)
        .order_by(func.count(JobPosting.id).desc())
    )
    rows = result.all()
    total = sum(r[1] for r in rows)
    return {
        "total": total,
        "by_source": {r[0]: r[1] for r in rows},
    }


@router.get("/sources")
async def list_sources(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get list of all available sources."""
    result = await db.execute(select(distinct(JobPosting.source)))
    return {"sources": [r[0] for r in result.all()]}


@router.post("/scrape", response_model=ScrapeResponse)
async def trigger_scrape(
    source: Optional[str] = Query(None, description="Scrape a single source or all if omitted"),
    user: User = Depends(require_admin),
):
    """Trigger a scrape job — admin only."""
    if source:
        task = scrape_single_source.delay(source)
        return ScrapeResponse(message=f"Scraping {source}", task_id=task.id)
    else:
        task = scrape_all_boards.delay()
        return ScrapeResponse(message="Scraping all sources", task_id=task.id)
    
@router.post("/admin/trigger-keyword-extraction")
async def trigger_keyword_extraction():
    from tasks.nlp_tasks import extract_all_job_keywords
    result = extract_all_job_keywords.delay(batch_size=50, limit=5000)
    return {"task_id": str(result.id), "status": "queued"}
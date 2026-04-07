"""
Scraper orchestrator — runs all scrapers and saves results to DB.
Deduplicates by source + external_id.
Organized by UTD department taxonomy.
Budget: 200 requests/month (Basic RapidAPI plan)
"""
import hashlib
from datetime import datetime
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from core.config import settings
from models.models import JobPosting
from services.scraper.github_scraper import scrape_github_sources
from services.scraper.job_scraper import scrape_arbeitnow
from services.scraper.jsearch_scraper import scrape_jsearch, DEPARTMENT_ROLES

sync_engine = create_engine(
    settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://"),
    pool_pre_ping=True,
)

# ── Scraping schedule by priority ──────────────────────────────────────────────
# Budget math (200 req/month):
# Daily scrape:  5 depts × 1 role × 1 location = 5 req/run
# Run every 3 days = ~10 runs/month = 50 req/month
# Weekly scrape: 7 depts × 1 role × 1 location = 7 req/run
# 4 runs/month = 28 req/month
# On-demand:     keep ~122 req buffer for manual scrapes
# Total: ~78 req/month automated ✅

DAILY_DEPARTMENTS = [
    "Computer Science",
    "Finance",
    "Information Systems",
    "Accounting",
    "Operations / Supply Chain",
]

WEEKLY_DEPARTMENTS = [
    "Electrical & Computer Engineering",
    "Bioengineering",
    "Mechanical Engineering",
    "Materials Science & Engineering",
    "Systems Engineering",
    "Marketing",
    "Organizations, Strategy & Intl Mgmt",
]


def make_external_id(source: str, title: str, company: str) -> str:
    """Generate a stable unique ID from source + title + company."""
    raw = f"{source}:{title.lower().strip()}:{company.lower().strip()}"
    return hashlib.md5(raw.encode()).hexdigest()


def save_jobs(jobs: list[dict]) -> int:
    """Save jobs to DB, skip duplicates. Returns count of new jobs saved."""
    if not jobs:
        return 0

    saved = 0
    with Session(sync_engine) as db:
        for job in jobs:
            source  = job.get("source", "unknown")
            title   = job.get("title", "")
            company = job.get("company", "")

            if not title:
                continue

            external_id = make_external_id(source, title, company)

            existing = db.execute(
                select(JobPosting).where(
                    JobPosting.source      == source,
                    JobPosting.external_id == external_id,
                )
            ).scalar_one_or_none()

            if existing:
                continue

            posting = JobPosting(
                external_id=external_id,
                source=source,
                title=title,
                company=company,
                location=job.get("location", ""),
                city=_extract_city(job.get("location", "")),
                state=_extract_state(job.get("location", "")),
                country=job.get("country", "USA"),
                is_remote=job.get("is_remote", False),
                role_type=job.get("role_type", "full-time"),
                domain=job.get("domain", ""),
                description=job.get("description", ""),
                url=job.get("url", ""),
                scraped_at=job.get("scraped_at", datetime.utcnow()),
            )
            db.add(posting)
            saved += 1

        db.commit()

    return saved


def _extract_city(location: str) -> str:
    if not location:
        return ""
    parts = location.split(",")
    return parts[0].strip()[:100] if parts else ""


def _extract_state(location: str) -> str:
    if not location:
        return ""
    parts = location.split(",")
    return parts[1].strip()[:100] if len(parts) > 1 else ""


async def run_all_scrapers(max_per_source: int = 100) -> dict:
    """Run all scrapers and return summary. Called by Celery beat."""
    summary = {}

    # ── GitHub sources (free, no API limit) ───────────────────────────────────
    github_jobs = await scrape_github_sources()
    summary["github"] = save_jobs(github_jobs)

    # ── Arbeitnow (free, international jobs) ──────────────────────────────────
    arbeitnow_jobs = await scrape_arbeitnow(max_results=max_per_source)
    summary["arbeitnow"] = save_jobs(arbeitnow_jobs)

    # ── JSearch API — 1 role × 1 location per dept to save budget ─────────────
    if settings.RAPIDAPI_KEY:
        jsearch_jobs = await scrape_jsearch(
            departments=DAILY_DEPARTMENTS,
            max_roles_per_dept=1,   # 1 role × 1 location = 1 req/dept = 5 req/run
            max_per_query=10,
        )
        summary["jsearch_daily"] = save_jobs(jsearch_jobs)

    total = sum(summary.values())
    print(f"Daily scrape complete — {total} new jobs: {summary}")
    return summary


async def run_weekly_scrapers() -> dict:
    """Scrape less-common departments weekly. Called by Celery beat on Mondays."""
    summary = {}

    if settings.RAPIDAPI_KEY:
        jsearch_jobs = await scrape_jsearch(
            departments=WEEKLY_DEPARTMENTS,
            max_roles_per_dept=1,   # 1 role × 1 location = 1 req/dept = 7 req/run
            max_per_query=10,
        )
        summary["jsearch_weekly"] = save_jobs(jsearch_jobs)

    total = sum(summary.values())
    print(f"Weekly scrape complete — {total} new jobs: {summary}")
    return summary


async def run_dept_scraper(department: str, locations: list[str] = None) -> dict:
    """Scrape a specific department on demand."""
    if department not in DEPARTMENT_ROLES:
        return {"error": f"Unknown department: {department}"}

    jsearch_jobs = await scrape_jsearch(
        departments=[department],
        locations=locations or ["Dallas TX"],
        max_roles_per_dept=2,
        max_per_query=10,
    )
    saved = save_jobs(jsearch_jobs)
    return {"department": department, "saved": saved, "scraped": len(jsearch_jobs)}

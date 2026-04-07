"""
Celery scraping tasks — city, state, country/global on different schedules.
Uses UTD department taxonomy for job scraping.
"""
import asyncio
from core.celery_app import celery_app

# UTD departments to scrape — ordered by job market size
ALL_DEPARTMENTS = [
    "Computer Science",
    "Finance",
    "Information Systems",
    "Accounting",
    "Operations / Supply Chain",
    "Systems Engineering",
    "Marketing",
    "Organizations, Strategy & Intl Mgmt",
    "Electrical & Computer Engineering",
    "Bioengineering",
    "Mechanical Engineering",
    "Materials Science & Engineering",
]

# High-priority departments scraped more frequently
PRIORITY_DEPARTMENTS = [
    "Computer Science",
    "Finance",
    "Information Systems",
    "Accounting",
    "Operations / Supply Chain",
    "Systems Engineering",
    "Marketing",
]


@celery_app.task(bind=True, max_retries=2)
def scrape_all_boards(self):
    """Manual full scrape — triggered from UI."""
    try:
        from services.scraper.scheduler import run_all_scrapers
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        summary = loop.run_until_complete(run_all_scrapers())
        loop.close()
        print(f"Scrape summary: {summary}")
        return summary
    except Exception as exc:
        print(f"Scrape error: {exc}")
        raise self.retry(exc=exc, countdown=300)


@celery_app.task(bind=True, max_retries=2)
def scrape_cities(self):
    """City scrape — runs every 2 days. Priority departments only."""
    try:
        from services.scraper.jsearch_scraper import scrape_jsearch
        from services.scraper.scheduler import save_jobs
        CITIES = ["Dallas TX", "Austin TX", "Houston TX",
                  "New York NY", "San Francisco CA", "Seattle WA"]
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        jobs = loop.run_until_complete(scrape_jsearch(
            departments=PRIORITY_DEPARTMENTS,
            locations=CITIES,
            max_roles_per_dept=2,
            max_per_query=5,
        ))
        loop.close()
        saved = save_jobs(jobs)
        print(f"City scrape: {saved} new jobs saved")
        return {"cities": saved}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300)


@celery_app.task(bind=True, max_retries=2)
def scrape_states(self):
    """State scrape — runs every week. All departments."""
    try:
        from services.scraper.jsearch_scraper import scrape_jsearch
        from services.scraper.scheduler import save_jobs
        STATES = ["Texas", "California", "New York", "Washington"]
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        jobs = loop.run_until_complete(scrape_jsearch(
            departments=ALL_DEPARTMENTS,
            locations=STATES,
            max_roles_per_dept=2,
            max_per_query=5,
        ))
        loop.close()
        saved = save_jobs(jobs)
        print(f"State scrape: {saved} new jobs saved")
        return {"states": saved}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300)


@celery_app.task(bind=True, max_retries=2)
def scrape_country_global(self):
    """Country + global scrape — runs every 15 days. All departments."""
    try:
        from services.scraper.jsearch_scraper import scrape_jsearch
        from services.scraper.scheduler import save_jobs
        LOCATIONS = ["USA", "Remote", "Canada", "United Kingdom"]
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        jobs = loop.run_until_complete(scrape_jsearch(
            departments=ALL_DEPARTMENTS,
            locations=LOCATIONS,
            max_roles_per_dept=2,
            max_per_query=5,
        ))
        loop.close()
        saved = save_jobs(jobs)
        print(f"Country/global scrape: {saved} new jobs saved")
        return {"country_global": saved}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300)


@celery_app.task
def scrape_single_source(source: str):
    """Scrape a single source by name — manual trigger."""
    from services.scraper.github_scraper import scrape_github_sources
    from services.scraper.job_scraper import scrape_remotive, scrape_arbeitnow
    from services.scraper.scheduler import save_jobs

    source_map = {
        "github":    scrape_github_sources,
        "remotive":  scrape_remotive,
        "arbeitnow": scrape_arbeitnow,
    }

    if source not in source_map:
        return {"error": f"Unknown source: {source}"}

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    jobs = loop.run_until_complete(source_map[source]())
    loop.close()
    saved = save_jobs(jobs)
    return {"source": source, "saved": saved}


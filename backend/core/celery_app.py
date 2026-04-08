"""
Celery application — task queue for scraping, NLP, and coverage jobs.
"""
from celery import Celery
from celery.schedules import crontab

from core.config import settings

celery_app = Celery(
    "syllacheck",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "tasks.scrape_tasks",
        "tasks.nlp_tasks",
        "tasks.coverage_tasks",
        "tasks.report_tasks",
        "tasks.classify_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Chicago",   # UTD is in Dallas, TX
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# ── Scheduled Tasks ────────────────────────────────────────────────────
celery_app.conf.beat_schedule = {
    # City scrape — every 24 hours at 2am
    "scrape-cities": {
        "task": "tasks.scrape_tasks.scrape_cities",
        "schedule": crontab(hour=2, minute=0),
    },
    # State scrape — every 7 days at 3am
    "scrape-states": {
        "task": "tasks.scrape_tasks.scrape_states",
        "schedule": crontab(hour=3, minute=0, day_of_week=1),  # every Monday
    },
    # Country + Global scrape — every 15 days at 4am
    "scrape-country-global": {
        "task": "tasks.scrape_tasks.scrape_country_global",
        "schedule": crontab(hour=4, minute=0, day_of_month="1,16"),  # 1st and 16th
    },
    "recompute-all-coverage-daily": {
        "task":     "tasks.coverage_tasks.recompute_all_coverage",
        "schedule": crontab(hour=5, minute=0),   # every day at 5am
    },
    # Recompute coverage every morning after scrapes
    "recompute-coverage": {
        "task": "tasks.coverage_tasks.recompute_all_coverage",
        "schedule": crontab(hour=5, minute=0),
    },
}


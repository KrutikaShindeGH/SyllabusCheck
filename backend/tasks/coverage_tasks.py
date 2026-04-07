import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
  
import logging
from celery import shared_task
from sqlalchemy import create_engine, text

from core.config import settings
from core.celery_app import celery_app
from services.coverage.engine import compute_coverage_for_course

logger = logging.getLogger(__name__)

DATABASE_URL_SYNC = settings.DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)
sync_engine = create_engine(DATABASE_URL_SYNC, pool_pre_ping=True)


@celery_app.task(name="tasks.coverage_tasks.compute_course_coverage", bind=True, max_retries=2)
def compute_course_coverage(self, course_id: str):
    """
    Celery task: compute and store coverage for a single course.
    Called after a syllabus is parsed (triggered by parse_syllabus task).
    """
    logger.info(f"[CoverageTask] compute_course_coverage started for {course_id}")
    try:
        result = compute_coverage_for_course(course_id)
        logger.info(f"[CoverageTask] Done — {result}")
        return result
    except Exception as exc:
        logger.error(f"[CoverageTask] Error: {exc}", exc_info=True)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="tasks.coverage_tasks.recompute_all_coverage")
def recompute_all_coverage():
    """
    Celery beat task: recompute coverage for ALL parsed courses.
    Runs daily at 5am (configured in core/celery_app.py beat_schedule).
    """
    logger.info("[CoverageTask] recompute_all_coverage started")

    with sync_engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id::text FROM courses WHERE status = 'parsed'")
        ).fetchall()

    course_ids = [r[0] for r in rows]
    logger.info(f"[CoverageTask] Found {len(course_ids)} parsed courses to recompute")

    results = []
    for cid in course_ids:
        try:
            result = compute_coverage_for_course(cid)
            results.append({"course_id": cid, **result})
        except Exception as exc:
            logger.error(f"[CoverageTask] Failed for course {cid}: {exc}", exc_info=True)
            results.append({"course_id": cid, "error": str(exc)})

    logger.info(f"[CoverageTask] recompute_all_coverage complete — {len(results)} courses processed")
    return results


import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from core.database import get_db
from api.routes.auth import get_current_user
from models.models import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _require_course_owner(course_id: str, current_user: User, db: AsyncSession):
    """Raise 404/403 if the course doesn't exist or doesn't belong to the user."""
    result = await db.execute(
        text("SELECT id, owner_id FROM courses WHERE id = :id"),
        {"id": course_id}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Course not found")
    if str(row[1]) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your course")


# ── GET /api/coverage/matrix  (MUST be before /{course_id} routes) ────────────

@router.get("/matrix")
async def get_matrix(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return coverage matrix data for heatmap.
    Rows = top N keywords, Cols = all user's courses.
    """
    from services.coverage.gap_analyzer import get_coverage_matrix
    matrix = get_coverage_matrix(limit_keywords=limit)
    return matrix


# ── POST /api/coverage/{course_id}/compute ─────────────────────────────────────

@router.post("/{course_id}/compute", status_code=202)
async def trigger_compute(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger (re)computation of coverage for a single course."""
    await _require_course_owner(course_id, current_user, db)

    # Check course is in 'parsed' state
    result = await db.execute(
        text("SELECT status FROM courses WHERE id = :id"),
        {"id": course_id}
    )
    row = result.fetchone()
    if row[0] != "parsed":
        raise HTTPException(
            status_code=400,
            detail=f"Course must be in 'parsed' state (current: {row[0]})"
        )

    # Dispatch Celery task
    from tasks.coverage_tasks import compute_course_coverage
    task = compute_course_coverage.delay(course_id)

    return {"message": "Coverage computation started", "task_id": task.id, "course_id": course_id}


# ── GET /api/coverage/{course_id} ─────────────────────────────────────────────

@router.get("/{course_id}")
async def get_coverage(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return coverage summary and all coverage_rows for a course."""
    await _require_course_owner(course_id, current_user, db)

    # All coverage rows with keyword details
    rows_result = await db.execute(text("""
        SELECT k.text, k.category, cr.status, k.frequency, cr.similarity_score
        FROM coverage_rows cr
        JOIN keywords k ON k.id = cr.keyword_id
        WHERE cr.course_id = :cid
        ORDER BY k.frequency DESC
    """), {"cid": course_id})

    rows = [
        {
            "keyword_text":     r[0],
            "category":         r[1],
            "status":           r[2],
            "frequency":        r[3],
            "similarity_score": round(r[4], 4) if r[4] else None,
        }
        for r in rows_result.fetchall()
    ]

    return rows

# ── GET /api/coverage/{course_id}/gaps ────────────────────────────────────────

@router.get("/{course_id}/gaps")
async def get_gaps(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return structured gap analysis for a course."""
    await _require_course_owner(course_id, current_user, db)

    from services.coverage.gap_analyzer import get_gap_analysis
    try:
        report = get_gap_analysis(course_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return report


"""
SyllabusCheck — Reports API
Phase 7 updated: per-course generation + AI summary endpoint.
"""
import logging
import os
import uuid
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import get_current_user
from core.config import settings
from core.database import get_db
from models.models import Report, User
from services.reports.generator import build_pdf_report, build_excel_report

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    title: Optional[str] = None
    course_ids: Optional[list[str]] = None   # None = all user's courses
    include_charts: bool = True


class ReportOut(BaseModel):
    id: str
    title: str
    created_at: str
    pdf_path: Optional[str]
    xlsx_path: Optional[str]
    summary: Optional[dict]

    class Config:
        from_attributes = True


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_report_or_404(report_id: str, user: User, db: AsyncSession) -> Report:
    result = await db.execute(
        text("SELECT * FROM reports WHERE id = :id AND owner_id = :uid"),
        {"id": report_id, "uid": str(user.id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    from sqlalchemy import select
    from models.models import Report as ReportModel
    stmt = select(ReportModel).where(ReportModel.id == uuid.UUID(report_id))
    result2 = await db.execute(stmt)
    return result2.scalar_one_or_none()


async def _build_ai_summary(course: dict, coverage_rows: list[dict]) -> str:
    """Call GPT-4o to generate a natural language gap analysis for a course."""
    covered = [r for r in coverage_rows if r["status"] == "covered"]
    partial  = [r for r in coverage_rows if r["status"] == "partial"]
    missing  = [r for r in coverage_rows if r["status"] == "missing"]

    top_missing = sorted(missing, key=lambda r: r.get("frequency", 0), reverse=True)[:10]
    top_covered = [r["keyword_text"] for r in covered[:8]]

    missing_list = ", ".join(
        f"{r['keyword_text']} ({r.get('frequency', 0)} jobs)" for r in top_missing
    )
    covered_list = ", ".join(top_covered) if top_covered else "none detected"

    score = course.get("coverage_score") or 0

    prompt = f"""You are an academic curriculum advisor. Analyze this course's alignment with industry job requirements.

Course: {course.get('title', 'Unknown')} ({course.get('code', '')})
Domain: {course.get('domain', 'General')}
Coverage Score: {score:.1f}%
Total keywords analyzed: {len(coverage_rows)}
Covered: {len(covered)}, Partial: {len(partial)}, Missing: {len(missing)}

Top covered skills: {covered_list}
Top missing skills (by job frequency): {missing_list}

Write a 3-sentence gap analysis for the professor. Be specific about what is missing and why it matters for students' employability. Be concise and actionable."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                json={
                    "model": settings.OPENAI_CHAT_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.warning(f"AI summary failed: {e}")
        return (
            f"This course covers {len(covered)} of {len(coverage_rows)} industry-required skills "
            f"({score:.1f}% coverage). "
            f"Key gaps include: {', '.join(r['keyword_text'] for r in top_missing[:3])}. "
            f"Consider updating the syllabus to address these high-demand skills."
        )


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[ReportOut])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all reports for the current user, newest first."""
    result = await db.execute(
        text(
            "SELECT id, title, created_at, pdf_path, xlsx_path, summary, filters "
            "FROM reports WHERE owner_id = :uid ORDER BY created_at DESC"
        ),
        {"uid": str(current_user.id)},
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "created_at": r["created_at"].isoformat(),
            "pdf_path": r["pdf_path"],
            "xlsx_path": r["xlsx_path"],
            "summary": r["summary"],
            "filters": r["filters"],
        }
        for r in rows
    ]


@router.post("/generate", status_code=201)
async def generate_report(
    payload: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a PDF + Excel + AI summary report. Supports single course or all courses."""

    # 1. Resolve courses ──────────────────────────────────────────────────────
    if payload.course_ids:
        placeholders = ", ".join(f":c{i}" for i in range(len(payload.course_ids)))
        params = {"uid": str(current_user.id)}
        params.update({f"c{i}": cid for i, cid in enumerate(payload.course_ids)})
        result = await db.execute(
            text(
                f"SELECT id, title, code, domain, coverage_score "
                f"FROM courses WHERE owner_id = :uid AND id IN ({placeholders})"
            ),
            params,
        )
    else:
        result = await db.execute(
            text(
                "SELECT id, title, code, domain, coverage_score "
                "FROM courses WHERE owner_id = :uid ORDER BY title"
            ),
            {"uid": str(current_user.id)},
        )
    courses = result.mappings().all()

    if not courses:
        raise HTTPException(status_code=422, detail="No courses found to report on.")

    # 2. Fetch coverage rows ───────────────────────────────────────────────────
    course_ids = [str(c["id"]) for c in courses]
    placeholders = ", ".join(f":c{i}" for i in range(len(course_ids)))
    params = {f"c{i}": cid for i, cid in enumerate(course_ids)}
    coverage_result = await db.execute(
        text(
            f"SELECT cr.course_id, cr.keyword_id, cr.status, cr.similarity_score, "
            f"       k.text AS keyword_text, k.category, k.domain, k.frequency "
            f"FROM coverage_rows cr "
            f"JOIN keywords k ON k.id = cr.keyword_id "
            f"WHERE cr.course_id IN ({placeholders}) "
            f"ORDER BY cr.course_id, k.frequency DESC"
        ),
        params,
    )
    coverage_rows = [dict(r) for r in coverage_result.mappings().all()]

    # 3. Generate AI summary (per-course or combined) ─────────────────────────
    courses_list = [dict(c) for c in courses]
    if len(courses_list) == 1:
        ai_summary = await _build_ai_summary(courses_list[0], coverage_rows)
    else:
        # Combined: quick aggregate summary
        total_missing = sum(1 for r in coverage_rows if r["status"] == "missing")
        total_covered = sum(1 for r in coverage_rows if r["status"] == "covered")
        avg_score = round(
            sum(c.get("coverage_score") or 0 for c in courses_list) / max(len(courses_list), 1), 1
        )
        ai_summary = (
            f"Across {len(courses_list)} courses, {total_covered} skills are covered "
            f"and {total_missing} are missing with an average coverage of {avg_score}%. "
            f"See individual course tabs for detailed gap analysis."
        )

    # 4. Build data bundle ────────────────────────────────────────────────────
    report_data = {
        "title": payload.title or f"SyllabusCheck Gap Report — {datetime.utcnow().strftime('%b %d, %Y')}",
        "generated_at": datetime.utcnow().isoformat(),
        "user": {"name": current_user.full_name, "email": current_user.email},
        "courses": courses_list,
        "coverage": coverage_rows,
        "ai_summary": ai_summary,
    }

    # 5. Generate PDF + Excel ─────────────────────────────────────────────────
    report_id = str(uuid.uuid4())
    pdf_path  = await build_pdf_report(report_data, report_id)
    xlsx_path = await build_excel_report(report_data, report_id)

    # 6. Summary stats ────────────────────────────────────────────────────────
    total_rows = len(coverage_rows)
    covered = sum(1 for r in coverage_rows if r["status"] == "covered")
    partial = sum(1 for r in coverage_rows if r["status"] == "partial")
    missing = sum(1 for r in coverage_rows if r["status"] == "missing")

    summary = {
        "total_courses": len(courses_list),
        "total_keywords": total_rows,
        "covered": covered,
        "partial": partial,
        "missing": missing,
        "avg_coverage_pct": round(
            sum(c["coverage_score"] or 0 for c in courses_list) / max(len(courses_list), 1), 1
        ),
        "ai_summary": ai_summary,
    }

    # 7. Persist record ───────────────────────────────────────────────────────
    new_report = Report(
        id=uuid.UUID(report_id),
        owner_id=current_user.id,
        title=report_data["title"],
        filters={"course_ids": course_ids},
        summary=summary,
        pdf_path=pdf_path,
        xlsx_path=xlsx_path,
    )
    db.add(new_report)
    await db.commit()
    await db.refresh(new_report)

    return {
        "id": str(new_report.id),
        "title": new_report.title,
        "created_at": new_report.created_at.isoformat(),
        "summary": summary,
        "pdf_path": pdf_path,
        "xlsx_path": xlsx_path,
        "filters": {"course_ids": course_ids},
    }


@router.get("/{report_id}/download/pdf")
async def download_pdf(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _get_report_or_404(report_id, current_user, db)
    if not report or not report.pdf_path or not os.path.exists(report.pdf_path):
        raise HTTPException(status_code=404, detail="PDF not found. Re-generate the report.")
    return FileResponse(
        report.pdf_path,
        media_type="application/pdf",
        filename=f"syllacheck_report_{report_id[:8]}.pdf",
    )


@router.get("/{report_id}/download/xlsx")
async def download_xlsx(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _get_report_or_404(report_id, current_user, db)
    if not report or not report.xlsx_path or not os.path.exists(report.xlsx_path):
        raise HTTPException(status_code=404, detail="Excel file not found. Re-generate the report.")
    return FileResponse(
        report.xlsx_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"syllacheck_report_{report_id[:8]}.xlsx",
    )


@router.delete("/{report_id}", status_code=204)
async def delete_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _get_report_or_404(report_id, current_user, db)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    for path in [report.pdf_path, report.xlsx_path]:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
    await db.delete(report)
    await db.commit()

    
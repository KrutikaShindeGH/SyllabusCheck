"""
Courses routes — upload syllabi, list, get, delete.
"""
import os
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import get_current_user
from core.config import settings
from core.database import get_db
from models.models import Course, User
from tasks.nlp_tasks import parse_syllabus

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────

class CourseResponse(BaseModel):
    id: str
    title: str
    code: Optional[str]
    semester: Optional[str]
    domain: Optional[str]
    status: str
    coverage_score: Optional[float]
    parsed_topics: Optional[list]
    created_at: str

    @classmethod
    def from_orm(cls, c: Course):
        return cls(
            id=str(c.id),
            title=c.title,
            code=c.code,
            semester=c.semester,
            domain=c.domain,
            status=c.status,
            coverage_score=c.coverage_score,
            parsed_topics=c.parsed_topics or [],
            created_at=c.created_at.isoformat(),
        )


# ── Routes ─────────────────────────────────────────────────────────────

@router.post("/upload", response_model=list[CourseResponse], status_code=201)
async def upload_syllabi(
    files: list[UploadFile] = File(...),
    semester: Optional[str] = Form(None),
    domain: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload one or more syllabus files (PDF or DOCX)."""
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    created = []

    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in [".pdf", ".docx", ".doc"]:
            raise HTTPException(400, f"Unsupported file type: {file.filename}")

        # Save file
        filename = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, filename)
        content = await file.read()

        if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(400, f"File too large: {file.filename}")

        with open(file_path, "wb") as f:
            f.write(content)

        # Create DB record
        course = Course(
            owner_id=user.id,
            title=file.filename.replace(ext, ""),
            semester=semester,
            domain=domain,
            file_path=file_path,
            status="pending",
        )
        db.add(course)
        await db.flush()  # get the ID without full commit

        # Trigger background parsing
        parse_syllabus.delay(str(course.id))
        created.append(course)

    await db.commit()
    return [CourseResponse.from_orm(c) for c in created]


@router.get("/", response_model=list[CourseResponse])
async def list_courses(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Course).where(Course.owner_id == user.id).order_by(Course.created_at.desc())
    )
    return [CourseResponse.from_orm(c) for c in result.scalars().all()]


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.owner_id == user.id)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(404, "Course not found")
    return CourseResponse.from_orm(course)


@router.delete("/{course_id}", status_code=204)
async def delete_course(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.owner_id == user.id)
    )
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(404, "Course not found")

    # Delete file from disk
    if course.file_path and os.path.exists(course.file_path):
        os.remove(course.file_path)

    # Delete related coverage_rows first (foreign key constraint)
    await db.execute(
        text("DELETE FROM coverage_rows WHERE course_id = :id"),
        {"id": course_id}
    )

    await db.delete(course)
    await db.commit()

    

    
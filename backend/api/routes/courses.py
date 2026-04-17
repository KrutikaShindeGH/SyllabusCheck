"""
Courses routes — upload syllabi, list, get, delete.
"""
import os
import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routes.auth import get_current_user
from core.config import settings
from core.database import get_db
from models.models import Course, Program, User
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
    
class ProgramCreate(BaseModel):
    name: str
    department: str
    description: Optional[str] = None


class ProgramResponse(BaseModel):
    id: str
    name: str
    department: str
    description: Optional[str]
    course_count: int

    @classmethod
    def from_orm(cls, p: Program, course_count: int = 0):
        return cls(
            id=str(p.id),
            name=p.name,
            department=p.department,
            description=p.description,
            course_count=course_count,
        )
    

# ── Routes ─────────────────────────────────────────────────────────────
# ── Program routes ──────────────────────────────────────────────────────────

@router.get("/programs", response_model=list[ProgramResponse])
async def list_programs(
    department: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all programs, optionally filtered by department."""
    q = select(Program)
    if department:
        q = q.where(Program.department == department)
    result = await db.execute(q)
    programs = result.scalars().all()

    # Count courses per program owned by current user
    out = []
    for p in programs:
        count_result = await db.execute(
            select(Course).where(Course.program_id == p.id, Course.owner_id == user.id)
        )
        count = len(count_result.scalars().all())
        out.append(ProgramResponse.from_orm(p, count))
    return out


@router.post("/programs", response_model=ProgramResponse, status_code=201)
async def create_program(
    body: ProgramCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new program under a department."""
    program = Program(
        name=body.name,
        department=body.department,
        description=body.description,
    )
    db.add(program)
    await db.commit()
    await db.refresh(program)
    return ProgramResponse.from_orm(program, 0)


@router.post("/programs/{program_id}/upload", response_model=list[CourseResponse], status_code=201)
async def upload_syllabi_to_program(
    program_id: str,
    files: list[UploadFile] = File(...),
    semester: Optional[str] = Form(None),
    domain: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Bulk upload one or more syllabi directly into a program."""
    # Verify the program exists
    prog_result = await db.execute(select(Program).where(Program.id == program_id))
    program = prog_result.scalar_one_or_none()
    if not program:
        raise HTTPException(404, "Program not found")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    created = []

    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in [".pdf", ".docx", ".doc"]:
            raise HTTPException(400, f"Unsupported file type: {file.filename}")

        filename = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, filename)
        content = await file.read()

        if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(400, f"File too large: {file.filename}")

        with open(file_path, "wb") as f:
            f.write(content)

        import asyncio
        raw_text = ""
        try:
            loop = asyncio.get_event_loop()
            if ext == ".pdf":
                from services.parser.pdf import extract_text_from_pdf
                raw_text = await loop.run_in_executor(None, extract_text_from_pdf, file_path)
            elif ext in (".docx", ".doc"):
                from services.parser.docx_parser import extract_text_from_docx
                raw_text = await loop.run_in_executor(None, extract_text_from_docx, file_path)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Text extraction failed at upload: {e}")

        course = Course(
            owner_id=user.id,
            program_id=uuid.UUID(program_id),
            title=file.filename.replace(ext, ""),
            semester=semester,
            domain=domain or program.department,
            file_path=file_path,
            raw_text=raw_text or None,
            status="pending",
        )
        db.add(course)
        await db.flush()
        parse_syllabus.delay(str(course.id))
        created.append(course)

    await db.commit()
    return [CourseResponse.from_orm(c) for c in created]


@router.post("/upload", response_model=list[CourseResponse], status_code=201)
async def upload_syllabi(
    files: list[UploadFile] = File(...),
    semester: Optional[str] = Form(None),
    domain: Optional[str] = Form(None),
    program_id: Optional[str] = Form(None),
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

        # Extract text immediately at upload time so parsing does not depend
        # on the file being present later (Railway has ephemeral filesystem)
        # Run in thread executor since these are blocking calls in async context
        import asyncio
        from functools import partial
        raw_text = ""
        try:
            loop = asyncio.get_event_loop()
            if ext == ".pdf":
                from services.parser.pdf import extract_text_from_pdf
                raw_text = await loop.run_in_executor(None, extract_text_from_pdf, file_path)
            elif ext in (".docx", ".doc"):
                from services.parser.docx_parser import extract_text_from_docx
                raw_text = await loop.run_in_executor(None, extract_text_from_docx, file_path)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Text extraction failed at upload: {e}")

        # Create DB record
        course = Course(
            owner_id=user.id,
            program_id=uuid.UUID(program_id) if program_id else None,
            title=file.filename.replace(ext, ""),
            semester=semester,
            domain=domain,
            file_path=file_path,
            raw_text=raw_text or None,
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

    
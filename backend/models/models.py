"""
SQLAlchemy models — all database tables for SyllabusCheck.
"""
import uuid
from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer,
    String, Text, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


def now_utc():
    return datetime.utcnow()


# ── User ───────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="professor")  # professor | admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    courses: Mapped[list["Course"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    reports: Mapped[list["Report"]] = relationship(back_populates="owner")


# ── Course / Syllabus ──────────────────────────────────────────────────

class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(50))           # e.g. CS4485
    semester: Mapped[Optional[str]] = mapped_column(String(50))       # e.g. Spring 2025
    domain: Mapped[Optional[str]] = mapped_column(String(100))        # AI/ML, Cloud, Web, etc.
    file_path: Mapped[Optional[str]] = mapped_column(String(500))
    raw_text: Mapped[Optional[str]] = mapped_column(Text)
    parsed_topics: Mapped[Optional[list]] = mapped_column(JSONB)      # extracted topic list
    parsed_sections: Mapped[Optional[dict]] = mapped_column(JSONB)  # segmented syllabus sections
    coverage_score: Mapped[Optional[float]] = mapped_column(Float)    # 0.0 – 100.0
    status: Mapped[str] = mapped_column(String(50), default="pending") # pending|parsed|scored
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)

    owner: Mapped["User"] = relationship(back_populates="courses")
    coverage_rows: Mapped[list["CoverageRow"]] = relationship(back_populates="course", cascade="all, delete-orphan")


# ── Job Posting ────────────────────────────────────────────────────────

class JobPosting(Base):
    __tablename__ = "job_postings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id: Mapped[Optional[str]] = mapped_column(String(255))   # source's own ID
    source: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # indeed, linkedin, etc.
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    company: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    location: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    state: Mapped[Optional[str]] = mapped_column(String(100))
    country: Mapped[Optional[str]] = mapped_column(String(100), default="USA")
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False)
    role_type: Mapped[Optional[str]] = mapped_column(String(100))     # intern, full-time, etc.
    domain: Mapped[Optional[str]] = mapped_column(String(100))        # AI/ML, Cloud, Web, etc.
    description: Mapped[Optional[str]] = mapped_column(Text)
    url: Mapped[Optional[str]] = mapped_column(String(1000))
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    keywords: Mapped[list["JobKeyword"]] = relationship(back_populates="job", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_source_external_id"),
    )


# ── Keyword ────────────────────────────────────────────────────────────

class Keyword(Base):
    __tablename__ = "keywords"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    text: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    normalized: Mapped[str] = mapped_column(String(255), nullable=False, index=True)  # lowercase, no spaces
    domain: Mapped[Optional[str]] = mapped_column(String(100))
    subdomain: Mapped[Optional[str]] = mapped_column(String(100))    # e.g. AI/ML, Cybersecurity, Data Science
    embedding: Mapped[Optional[list]] = mapped_column(Vector(384))   # OpenAI text-embedding-3-small
    frequency: Mapped[int] = mapped_column(Integer, default=0) 
    category: Mapped[Optional[str]] = mapped_column(String(100))
    importance: Mapped[Optional[str]] = mapped_column(String(50), default="required")
    is_emerging: Mapped[bool] = mapped_column(Boolean, default=False)       # how many jobs mention it
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    job_links: Mapped[list["JobKeyword"]] = relationship(back_populates="keyword")
    coverage_rows: Mapped[list["CoverageRow"]] = relationship(back_populates="keyword")


class JobKeyword(Base):
    """Many-to-many: job postings ↔ keywords."""
    __tablename__ = "job_keywords"

    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("job_postings.id"), primary_key=True)
    keyword_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("keywords.id"), primary_key=True)

    job: Mapped["JobPosting"] = relationship(back_populates="keywords")
    keyword: Mapped["Keyword"] = relationship(back_populates="job_links")


# ── Coverage ───────────────────────────────────────────────────────────

class CoverageRow(Base):
    """One row per (course, keyword) pair — the coverage matrix."""
    __tablename__ = "coverage_rows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id"), nullable=False)
    keyword_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("keywords.id"), nullable=False)
    similarity_score: Mapped[float] = mapped_column(Float, default=0.0)  # cosine similarity 0–1
    status: Mapped[str] = mapped_column(String(50), default="missing")   # covered|partial|missing
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)

    course: Mapped["Course"] = relationship(back_populates="coverage_rows")
    keyword: Mapped["Keyword"] = relationship(back_populates="coverage_rows")

    __table_args__ = (
        UniqueConstraint("course_id", "keyword_id", name="uq_course_keyword"),
    )


# ── Report ─────────────────────────────────────────────────────────────

class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    filters: Mapped[Optional[dict]] = mapped_column(JSONB)             # snapshot of filters used
    summary: Mapped[Optional[dict]] = mapped_column(JSONB)             # stats summary
    pdf_path: Mapped[Optional[str]] = mapped_column(String(500))
    xlsx_path: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    owner: Mapped["User"] = relationship(back_populates="reports")


    
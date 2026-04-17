"""
Migration 009: Add programs table and program_id FK to courses.

Revision ID: 009_programs
Down-revision: 008_add_subdomain_to_keywords
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "009_programs"
down_revision = "008_add_subdomain_to_keywords"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "programs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("department", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "courses",
        sa.Column("program_id", UUID(as_uuid=True),
                  sa.ForeignKey("programs.id"), nullable=True)
    )
    op.create_index("ix_courses_program_id", "courses", ["program_id"])


def downgrade():
    op.drop_index("ix_courses_program_id", table_name="courses")
    op.drop_column("courses", "program_id")
    op.drop_table("programs")
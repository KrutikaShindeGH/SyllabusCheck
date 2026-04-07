"""
Phase 7 migration: add google_sub to users, ensure reports table is complete.
Run with: make migrate
"""
from alembic import op
import sqlalchemy as sa


revision = "007_phase7_google_reports"
down_revision = '001'  # set to your last migration id, e.g. "006_..."
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("google_sub", sa.String(255), nullable=True),
    )


def downgrade():
    op.drop_column("users", "google_sub")

"""
Migration 008: Add subdomain column to keywords table.

Subdomains used by classify_cs_subdomains task:
  AI/ML | Cybersecurity | Data Science | Software Engineering | Networking | General CS

Revision ID: 008_add_subdomain_to_keywords
Down-revision: 007_phase7_google_reports
"""
from alembic import op
import sqlalchemy as sa

revision = "008_add_subdomain_to_keywords"
down_revision = "007_phase7_google_reports"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "keywords",
        sa.Column("subdomain", sa.String(100), nullable=True),
    )
    # Index helps gap_analyzer and coverage_matrix queries that filter/group by subdomain
    op.create_index("ix_keywords_subdomain", "keywords", ["subdomain"])


def downgrade():
    op.drop_index("ix_keywords_subdomain", table_name="keywords")
    op.drop_column("keywords", "subdomain")

    
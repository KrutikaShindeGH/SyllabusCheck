"""
Migration 008: Add subdomain column to keywords table.

Subdomains used by classify_cs_subdomains task:
  AI/ML | Cybersecurity | Data Science | Software Engineering | Networking | General CS

Revision ID: 008_add_subdomain_to_keywords
Down-revision: 007_phase7_google_reports
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "008_add_subdomain_to_keywords"
down_revision = "007_phase7_google_reports"
branch_labels = None
depends_on = None


def upgrade():
    # Get current columns
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('keywords')]
    
    # Only add if it doesn't exist
    if 'subdomain' not in columns:
        op.add_column('keywords',
            sa.Column('subdomain', sa.String(), nullable=True)
        )

def downgrade():
    op.drop_column('keywords', 'subdomain')

    
    
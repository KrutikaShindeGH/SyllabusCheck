"""Initial tables

Revision ID: 001
Create Date: 2025-01-01
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table('users',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), nullable=False, server_default='professor'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )

    op.create_table('courses',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('owner_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('code', sa.String(50)),
        sa.Column('semester', sa.String(50)),
        sa.Column('domain', sa.String(100)),
        sa.Column('file_path', sa.String(500)),
        sa.Column('raw_text', sa.Text()),
        sa.Column('parsed_topics', sa.JSON()),
        sa.Column('coverage_score', sa.Float()),
        sa.Column('status', sa.String(50), server_default='pending'),
        sa.Column('created_at', sa.DateTime()),
        sa.Column('updated_at', sa.DateTime()),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table('keywords',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('text', sa.String(255), nullable=False),
        sa.Column('normalized', sa.String(255), nullable=False),
        sa.Column('domain', sa.String(100)),
        sa.Column('embedding', Vector(1536)),
        sa.Column('frequency', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('text'),
    )

    op.create_table('job_postings',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('external_id', sa.String(255)),
        sa.Column('source', sa.String(100), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('company', sa.String(255)),
        sa.Column('location', sa.String(255)),
        sa.Column('city', sa.String(100)),
        sa.Column('state', sa.String(100)),
        sa.Column('country', sa.String(100), server_default='USA'),
        sa.Column('is_remote', sa.Boolean(), server_default='false'),
        sa.Column('role_type', sa.String(100)),
        sa.Column('domain', sa.String(100)),
        sa.Column('description', sa.Text()),
        sa.Column('url', sa.String(1000)),
        sa.Column('posted_at', sa.DateTime()),
        sa.Column('scraped_at', sa.DateTime()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source', 'external_id', name='uq_source_external_id'),
    )

    op.create_table('job_keywords',
        sa.Column('job_id', sa.UUID(), nullable=False),
        sa.Column('keyword_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['job_id'], ['job_postings.id']),
        sa.ForeignKeyConstraint(['keyword_id'], ['keywords.id']),
        sa.PrimaryKeyConstraint('job_id', 'keyword_id'),
    )

    op.create_table('coverage_rows',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('course_id', sa.UUID(), nullable=False),
        sa.Column('keyword_id', sa.UUID(), nullable=False),
        sa.Column('similarity_score', sa.Float(), server_default='0.0'),
        sa.Column('status', sa.String(50), server_default='missing'),
        sa.Column('updated_at', sa.DateTime()),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id']),
        sa.ForeignKeyConstraint(['keyword_id'], ['keywords.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', 'keyword_id', name='uq_course_keyword'),
    )

    op.create_table('reports',
        sa.Column('id', sa.UUID(), nullable=False, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('owner_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('filters', sa.JSON()),
        sa.Column('summary', sa.JSON()),
        sa.Column('pdf_path', sa.String(500)),
        sa.Column('xlsx_path', sa.String(500)),
        sa.Column('created_at', sa.DateTime()),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    for table in ['reports', 'coverage_rows', 'job_keywords', 'job_postings', 'keywords', 'courses', 'users']:
        op.drop_table(table)

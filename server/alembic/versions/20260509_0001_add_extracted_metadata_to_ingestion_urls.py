"""add extracted_metadata to ingestion_urls

Revision ID: 20260509_0001
Revises: 20260310_0003
Create Date: 2026-05-09

Adds a JSONB column on ``ingestion_urls`` to persist rich metadata extracted
at scrape time (year, month, categories, tags, event ACF fields). The column
defaults to an empty object so existing rows remain valid.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260509_0001"
down_revision = "20260310_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ingestion_urls",
        sa.Column(
            "extracted_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("ingestion_urls", "extracted_metadata")

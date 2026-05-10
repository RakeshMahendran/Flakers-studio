"""add factual overrides to assistants

Revision ID: 20260510_0001
Revises: 20260509_0001
Create Date: 2026-05-10 00:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260510_0001"
down_revision = "20260509_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assistants",
        sa.Column(
            "factual_overrides",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    # Add CHECK constraint to ensure factual_overrides is always a JSON array
    op.create_check_constraint(
        "factual_overrides_is_array",
        "assistants",
        sa.text("jsonb_typeof(factual_overrides) = 'array'"),
    )


def downgrade() -> None:
    op.drop_constraint("factual_overrides_is_array", "assistants", type_="check")
    op.drop_column("assistants", "factual_overrides")

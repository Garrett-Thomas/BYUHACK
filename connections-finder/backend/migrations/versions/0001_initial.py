"""Create initial connection and idempotency tables."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "connections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_profile_url", sa.Text(), nullable=False),
        sa.Column("normalized_profile_url", sa.Text(), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("headline", sa.String(length=500), nullable=True),
        sa.Column("company", sa.String(length=300), nullable=True),
        sa.Column("normalized_company", sa.String(length=300), nullable=True),
        sa.Column("location", sa.String(length=300), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("extractor_version", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("normalized_profile_url", name="uq_connections_normalized_profile_url"),
    )
    op.create_index("ix_connections_normalized_company", "connections", ["normalized_company"])
    op.create_index("ix_connections_captured_at", "connections", ["captured_at"])
    op.create_table(
        "idempotency_records",
        sa.Column("key", sa.String(length=36), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("idempotency_records")
    op.drop_index("ix_connections_captured_at", table_name="connections")
    op.drop_index("ix_connections_normalized_company", table_name="connections")
    op.drop_table("connections")

"""SQLAlchemy database models."""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for persisted models."""


class ConnectionRecord(Base):
    """A normalized connection captured from a supported source."""

    __tablename__ = "connections"
    __table_args__ = (
        UniqueConstraint("normalized_profile_url", name="uq_connections_normalized_profile_url"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    source_profile_url: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_profile_url: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    headline: Mapped[str | None] = mapped_column(String(500))
    company: Mapped[str | None] = mapped_column(String(300))
    normalized_company: Mapped[str | None] = mapped_column(String(300), index=True)
    location: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    extractor_version: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class IdempotencyRecord(Base):
    """Response associated with an idempotent write request."""

    __tablename__ = "idempotency_records"

    key: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_json: Mapped[str] = mapped_column(Text, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


def model_values(record: ConnectionRecord) -> dict[str, Any]:
    """Return database values used by the API response schema."""

    return {
        "id": record.id,
        "source": record.source,
        "source_profile_url": record.source_profile_url,
        "name": record.name,
        "headline": record.headline,
        "company": record.company,
        "location": record.location,
        "notes": record.notes,
        "tags": record.tags,
        "captured_at": record.captured_at,
        "extractor_version": record.extractor_version,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }

"""Typed API request and response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiSchema(BaseModel):
    """Base schema using camelCase JSON and strict extra-field handling."""

    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="forbid")


class ConnectionCreate(ApiSchema):
    """Fields accepted from a connection capture."""

    source: Literal["linkedin"]
    source_profile_url: HttpUrl
    name: str = Field(min_length=1, max_length=300)
    headline: str | None = Field(default=None, max_length=500)
    company: str | None = Field(default=None, max_length=300)
    location: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=10_000)
    tags: list[str] = Field(default_factory=list, max_length=50)
    captured_at: datetime
    extractor_version: str = Field(min_length=1, max_length=80)

    @field_validator("name", "extractor_version")
    @classmethod
    def reject_blank_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized

    @field_validator("source_profile_url")
    @classmethod
    def require_linkedin_profile_url(cls, value: HttpUrl) -> HttpUrl:
        if value.host not in {"linkedin.com", "www.linkedin.com"}:
            raise ValueError("must be a LinkedIn URL")
        if not value.path.startswith(("/in/", "/pub/")):
            raise ValueError("must point to a LinkedIn profile")
        return value

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 80 for value in cleaned):
            raise ValueError("tags must be non-empty and at most 80 characters")
        return list(dict.fromkeys(cleaned))


class ConnectionOut(ApiSchema):
    """Public representation of a stored connection."""

    id: str
    source: str
    source_profile_url: str
    name: str
    headline: str | None
    company: str | None
    location: str | None
    notes: str | None
    tags: list[str]
    captured_at: datetime
    extractor_version: str
    created_at: datetime
    updated_at: datetime


class IngestResponse(ApiSchema):
    """Result of creating or updating a connection."""

    id: str
    status: Literal["created", "updated"]
    connection: ConnectionOut


class Pagination(ApiSchema):
    """Offset pagination information."""

    limit: int
    offset: int
    total: int


class ConnectionList(ApiSchema):
    """Paginated connection results."""

    data: list[ConnectionOut]
    pagination: Pagination


class HealthResponse(ApiSchema):
    """Health endpoint payload."""

    status: Literal["ok"]


class ErrorResponse(ApiSchema):
    """Consistent error payload."""

    detail: str | list[dict[str, object]]

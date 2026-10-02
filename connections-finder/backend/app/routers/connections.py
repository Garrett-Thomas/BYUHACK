"""Connection ingestion, lookup, and deletion routes."""

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import ConnectionRecord, IdempotencyRecord, model_values
from app.normalization import normalize_company, normalize_profile_url
from app.schemas import (
    ConnectionCreate,
    ConnectionList,
    ConnectionOut,
    ErrorResponse,
    IngestResponse,
    Pagination,
)

router = APIRouter(prefix="/api/v1", tags=["connections"])
SessionDependency = Annotated[Session, Depends(get_session)]


def _connection_out(record: ConnectionRecord) -> ConnectionOut:
    return ConnectionOut.model_validate(model_values(record))


@router.post(
    "/connections",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        200: {"description": "Existing profile updated or idempotent result returned"},
        400: {"model": ErrorResponse, "description": "Invalid JSON or idempotency key"},
        409: {"model": ErrorResponse, "description": "Idempotency key reused with another payload"},
        413: {"model": ErrorResponse, "description": "Request body too large"},
        422: {"description": "Request fields failed validation"},
    },
)
def create_connection(
    payload: ConnectionCreate,
    session: SessionDependency,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
    response: Response,
) -> IngestResponse:
    """Create a connection or update the existing record for its profile URL."""

    try:
        parsed_key = str(uuid.UUID(idempotency_key))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Idempotency-Key must be a UUID") from error

    payload_json = json.dumps(payload.model_dump(mode="json", by_alias=True), sort_keys=True, separators=(",", ":"))
    request_hash = hashlib.sha256(payload_json.encode("utf-8")).hexdigest()

    try:
        # IMMEDIATE obtains SQLite's write reservation before checking idempotency or URL uniqueness.
        session.execute(text("BEGIN IMMEDIATE"))
        previous = session.get(IdempotencyRecord, parsed_key)
        if previous is not None:
            if previous.request_hash != request_hash:
                session.rollback()
                raise HTTPException(status_code=409, detail="Idempotency-Key was already used with a different payload")
            prior_body = json.loads(previous.response_json)
            response.status_code = previous.status_code
            session.commit()
            return IngestResponse.model_validate(prior_body)

        normalized_url = normalize_profile_url(str(payload.source_profile_url))
        normalized_company = normalize_company(payload.company)
        record = session.scalar(
            select(ConnectionRecord).where(ConnectionRecord.normalized_profile_url == normalized_url)
        )
        now = datetime.now(UTC)
        created = record is None
        if record is None:
            record = ConnectionRecord(
                id=str(uuid.uuid4()),
                source=payload.source,
                source_profile_url=str(payload.source_profile_url),
                normalized_profile_url=normalized_url,
                name=payload.name,
                headline=payload.headline,
                company=payload.company,
                normalized_company=normalized_company,
                location=payload.location,
                notes=payload.notes,
                tags=payload.tags,
                captured_at=payload.captured_at,
                extractor_version=payload.extractor_version,
                created_at=now,
                updated_at=now,
            )
            session.add(record)
        else:
            record.source = payload.source
            record.source_profile_url = str(payload.source_profile_url)
            record.name = payload.name
            record.headline = payload.headline
            record.company = payload.company
            record.normalized_company = normalized_company
            record.location = payload.location
            record.notes = payload.notes
            record.tags = payload.tags
            record.captured_at = payload.captured_at
            record.extractor_version = payload.extractor_version
            record.updated_at = now

        session.flush()
        result = IngestResponse(
            id=record.id,
            status="created" if created else "updated",
            connection=_connection_out(record),
        )
        result_json = result.model_dump_json(by_alias=True)
        result_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        session.add(
            IdempotencyRecord(
                key=parsed_key,
                request_hash=request_hash,
                response_json=result_json,
                status_code=result_status,
            )
        )
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="conflicting connection update") from error
    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise

    response.status_code = result_status
    return result


def _list_by_company(
    company: str,
    session: Session,
    limit: int,
    offset: int,
) -> ConnectionList:
    normalized = normalize_company(company)
    if normalized is None:
        raise HTTPException(status_code=400, detail="company must not be empty")

    filter_clause = ConnectionRecord.normalized_company == normalized
    total = session.scalar(select(func.count()).select_from(ConnectionRecord).where(filter_clause)) or 0
    records = session.scalars(
        select(ConnectionRecord)
        .where(filter_clause)
        .order_by(ConnectionRecord.captured_at.desc(), ConnectionRecord.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return ConnectionList(
        data=[_connection_out(record) for record in records],
        pagination=Pagination(limit=limit, offset=offset, total=total),
    )


@router.get("/connections", response_model=ConnectionList, responses={400: {"model": ErrorResponse}})
def list_connections(
    session: SessionDependency,
    company: Annotated[str, Query(min_length=1, max_length=300)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ConnectionList:
    """List connections for an exact, case-insensitive company match."""

    return _list_by_company(company, session, limit, offset)


@router.get(
    "/companies/{company}/connections",
    response_model=ConnectionList,
    responses={400: {"model": ErrorResponse, "description": "Invalid company or pagination"}},
)
def list_company_connections(
    company: str,
    session: SessionDependency,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ConnectionList:
    """Return company-matched connections using a path parameter."""

    return _list_by_company(company, session, limit, offset)


@router.get(
    "/connections/{connection_id}",
    response_model=ConnectionOut,
    responses={404: {"model": ErrorResponse, "description": "Connection not found"}},
)
def get_connection(connection_id: str, session: SessionDependency) -> ConnectionOut:
    """Retrieve one connection by its ID."""

    record = session.get(ConnectionRecord, connection_id)
    if record is None:
        raise HTTPException(status_code=404, detail="connection not found")
    return _connection_out(record)


@router.delete(
    "/connections/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse, "description": "Connection not found"}},
)
def delete_connection(connection_id: str, session: SessionDependency) -> Response:
    """Delete one connection by its ID."""

    record = session.get(ConnectionRecord, connection_id)
    if record is None:
        raise HTTPException(status_code=404, detail="connection not found")
    session.delete(record)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

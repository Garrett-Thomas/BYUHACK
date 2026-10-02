"""Health endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_session
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])
SessionDependency = Annotated[Session, Depends(get_session)]


@router.get("/health", response_model=HealthResponse, responses={503: {"description": "Database unavailable"}})
def get_health(session: SessionDependency) -> HealthResponse:
    """Check that the API process can reach its SQLite database."""

    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="database unavailable") from error
    return HealthResponse(status="ok")

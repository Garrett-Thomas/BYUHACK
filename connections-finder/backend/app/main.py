"""FastAPI application entry point."""

import json
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings
from app.routers import connections, health

settings = get_settings()
app = FastAPI(
    title="Connections Finder API",
    description="Local API for storing and searching captured connections.",
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Idempotency-Key"],
)


class RequestSizeLimitMiddleware:
    """Reject requests whose declared or streamed bodies exceed the configured limit."""

    def __init__(self, application: ASGIApp, max_bytes: int) -> None:
        self.application = application
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.application(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    await self._send_too_large(scope, receive, send)
                    return
            except ValueError:
                await self._send_too_large(scope, receive, send)
                return

        body = bytearray()
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > self.max_bytes:
                await self._send_too_large(scope, receive, send)
                return
            more_body = bool(message.get("more_body", False))

        replay_body = True

        async def replay_receive() -> Message:
            nonlocal replay_body
            if replay_body:
                replay_body = False
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.application(scope, replay_receive, send)

    async def _send_too_large(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = JSONResponse(
            status_code=413,
            content={"detail": "request body exceeds configured size limit"},
        )
        await response(scope, receive, send)


app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.max_request_bytes)
app.include_router(health.router)
app.include_router(connections.router)


@app.exception_handler(RequestValidationError)
async def handle_request_validation_error(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    """Use 400 for malformed JSON and 422 for valid JSON with invalid fields."""

    del request
    validation_errors = error.errors()
    malformed_json = any(item.get("type") == "json_invalid" for item in validation_errors)
    invalid_client_parameter = any(
        item.get("loc", (None,))[0] in {"query", "header"} for item in validation_errors
    )
    code = (
        status.HTTP_400_BAD_REQUEST
        if malformed_json or invalid_client_parameter
        else 422
    )
    details: Any = "invalid JSON body" if malformed_json else [
        {
            "loc": item.get("loc", ()),
            "msg": item.get("msg", "invalid value"),
            "type": item.get("type", "value_error"),
        }
        for item in validation_errors
    ]
    return JSONResponse(status_code=code, content={"detail": details})


@app.exception_handler(json.JSONDecodeError)
async def handle_json_decode_error(_request: Request, _error: json.JSONDecodeError) -> JSONResponse:
    """Return a clean client error for malformed JSON bodies."""

    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": "invalid JSON body"})

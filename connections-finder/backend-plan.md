# Backend Implementation Plan

## Goal

Implement the locally hosted Python server, SQLite storage, unauthenticated API, and Swagger UI described in [spec.md](spec.md). This plan covers the backend only; it does not implement the Chrome extension.

## Recommended stack

- Python 3.12+
- FastAPI with Uvicorn for the HTTP server and built-in OpenAPI/Swagger UI (`/docs`)
- Pydantic for request and response validation
- SQLAlchemy 2.x with SQLite for persistence
- Alembic for versioned schema migrations
- Pytest and FastAPI's test client for backend verification

Use synchronous SQLAlchemy sessions for the first release. SQLite is local-file based, and sync request handlers avoid mixing async endpoints with blocking database calls.

## Step-by-step implementation

### 1. Set up the backend project

Create a `backend/` directory with a Python package, dependency file, environment example, and README. Define configuration for the SQLite file path, bind host/port, allowed origins, and optional diagnostic retention. Default the bind host to `127.0.0.1`. Keep the database file out of version control.

Suggested initial layout:

```text
backend/
  app/
    main.py             # FastAPI app and router registration
    config.py           # Environment-based settings
    database.py         # Engine, session factory, connection setup
    models.py           # SQLAlchemy models
    schemas.py          # Pydantic request/response schemas
    routers/
      health.py
      connections.py
  migrations/           # Alembic migrations
  tests/
  .env.example
  README.md
  pyproject.toml
```

### 2. Define and normalize the connection model

Create the SQLite schema for connections and idempotency records. Store the submitted fields, normalized profile URL, normalized company name, and created/updated timestamps. Make the normalized profile URL unique. Index normalized company name and capture time.

Normalize URLs consistently (HTTPS, lowercase host, remove query/fragment and trailing slash where safe). Normalize company names by trimming, collapsing whitespace, and case-folding. Keep the submitted display value alongside its normalized lookup value.

### 3. Add database migrations and lifecycle

Configure Alembic to use the configured SQLite path and commit the initial migration. Add database initialization to application startup only if needed for local development; document migrations as the normal schema-change mechanism. Enable SQLite foreign-key support and use transaction boundaries for writes.

### 4. Set the local-only network boundary

Configure Uvicorn to bind to `127.0.0.1` by default. Do not implement API tokens, login, or authentication middleware. Document that changing the bind address can expose the unauthenticated API to other devices and requires the operator to apply network restrictions.

### 5. Implement request schemas and ingestion

Define the connection input schema with required `source`, `sourceProfileUrl`, `name`, `capturedAt`, and `extractorVersion` fields, plus optional headline, company, location, notes, and tags. Enforce reasonable field and request-size limits.

Implement `POST /api/v1/connections` to:

1. Validate JSON and required fields, returning `400` for malformed JSON, `413` for oversized bodies, and `422` for field validation failures.
2. Validate the `Idempotency-Key` UUID and store it with a request-body hash and result.
3. Normalize the profile URL and company name.
4. In one database transaction, return the prior result for a repeated key with the same body; reject reuse of a key with a different body; otherwise insert or update by normalized profile URL.
5. Return `201` with `status: "created"` for a new record or `200` with `status: "updated"` for an existing profile.

Handle concurrent duplicate submissions using SQLite uniqueness constraints and transaction-safe insert/update logic, not a check-then-insert alone.

### 6. Implement read and delete endpoints

Add:

- `GET /api/v1/connections?company=...&limit=...&offset=...` with case-insensitive normalized exact company matching, default `limit=50`, maximum `limit=100`, and `offset=0`.
- `GET /api/v1/companies/{company}/connections` with the same query behavior and response format.
- `GET /api/v1/connections/{id}` with `404` when absent.
- `DELETE /api/v1/connections/{id}` with `204` on deletion and `404` when absent.

These routes do not require authentication. Use bound SQL parameters through SQLAlchemy and return only the documented fields. Return pagination metadata including total matching records.

### 7. Add health and API documentation

Implement `GET /health` to check that SQLite is reachable and return `{ "status": "ok" }`; report a service error if the database check fails. Use FastAPI's generated OpenAPI schema and Swagger UI at `/docs`, with request/response models, endpoint summaries, and documented error responses. Keep `/openapi.json` available.

### 8. Add operational safeguards

Configure CORS from an explicit local origin allowlist and request-size limits. Ensure request logs exclude captured connection fields. Configure safe database file permissions where supported. Document backup and restore of the SQLite file. Bind to loopback by default because the API has no authentication.

### 9. Verify the backend end to end

Run migrations against a fresh temporary SQLite database, start the server, and exercise all routes through Swagger UI or HTTP requests. Verify input validation, idempotent retry behavior, duplicate profile upsert, company pagination, record deletion, and health behavior when SQLite is unavailable. Include automated tests using a temporary database so test data never touches the development database.

### 10. Document local operation

In `backend/README.md`, document Python setup, configuration variables, migration commands, server startup, Swagger URL, API examples, database location, backup/restore, and common troubleshooting steps. Emphasize that the default loopback bind is intended for local use.

## Definition of done

- A fresh checkout can configure and start the Python API with SQLite.
- Schema migrations create the required tables and indexes.
- All specified API endpoints behave as described in `spec.md` without authentication.
- Swagger UI can invoke each API endpoint.
- Ingestion safely handles retries and duplicate LinkedIn profile URLs.
- Company lookup supports the specified case-insensitive exact matching and pagination.
- Setup and database operations are documented.

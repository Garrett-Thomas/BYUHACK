# Connections Finder — Standalone Server Spec

## Purpose

Build a locally hosted system that captures connection information a user can see on LinkedIn and stores it in a local SQLite database. The server exposes an API for ingesting connections and retrieving connections by company.

The system has three parts:

1. A Chrome extension that runs on supported LinkedIn pages and extracts fields automatically.
2. A standalone server with an HTTP API and Swagger UI for testing that API.
3. A database that stores connections, capture metadata, and submission state.

## Scope and constraints

- Initial supported source: LinkedIn profile and people-search pages.
- The extension only captures content the signed-in user is currently allowed to view.
- On supported pages, collection and submission happen automatically after the page has loaded and relevant fields are available. The extension does not click, scroll, paginate, or otherwise crawl LinkedIn.
- The user is responsible for using LinkedIn and collected data in accordance with applicable terms, privacy requirements, and consent obligations.

## Architecture

```text
LinkedIn page
  -> Chrome content script extracts fields
  -> Extension background worker sends structured data
  -> Server API validates and upserts request
  -> Database stores a normalized connection record
  -> API returns records filtered by company
```

## Capture and processing decision

Send **structured extracted data**, not full raw page HTML, as the normal request format. This keeps uploads small, reduces accidental collection of unrelated personal data, and avoids coupling the server to fragile LinkedIn markup.

The extension owns source-specific selectors and extraction. It must include an `extractorVersion` so that selector changes can be tracked.

Optional diagnostic support may send a **user-approved, size-limited HTML fragment** or text snapshot with a failed capture. Store it separately, make it disabled by default, sanitize it before display, and set a retention period. Do not upload full page HTML in the initial release.

## User flow

1. The user configures the local server URL in the extension once.
2. The user visits a supported LinkedIn profile page.
3. After the document is ready, the content script waits briefly for dynamic content, extracts available fields, and sends them to the background worker.
4. The background worker submits the structured record to the server without opening a popup or requesting confirmation.
5. The server validates, deduplicates, and upserts the record, then returns its ID and status.
6. The extension records success locally. It queues a failed submission and retries it later; it must not repeatedly submit the same page during one visit.

## Chrome extension

- Manifest V3 configuration with minimum required `host_permissions` for LinkedIn.
- Content script with page-specific extractors.
- Content script starts capture automatically once per supported page visit. It must tolerate LinkedIn's dynamic rendering and use a short bounded wait/retry strategy.
- Background service worker performs API calls, deduplicates page-visit events, and retries queued submissions.
- Options page for server URL, enable/disable capture, and diagnostic-capture preference.
- Local queue in `chrome.storage` for failed submissions; expose queue status and a manual retry/clear control in options.
- Never log full page contents or sensitive server responses.

## Connection data model

```json
{
  "source": "linkedin",
  "sourceProfileUrl": "https://www.linkedin.com/in/example-person/",
  "name": "Example Person",
  "headline": "Software Engineer at Example Company",
  "company": "Example Company",
  "location": "Provo, Utah, United States",
  "notes": "Met at a conference",
  "tags": ["engineering", "follow-up"],
  "capturedAt": "2026-10-02T00:00:00.000Z",
  "extractorVersion": "1.0.0"
}
```

The database record also includes: internal ID, created and updated timestamps, normalized profile URL, a duplicate key, and optional diagnostic-snapshot metadata.

## Database

Use SQLite. The server owns the database file and applies versioned migrations on startup or through a migration command.

- `connections`: normalized captured fields, source URL, notes, timestamps, and optional tags.
- `connection_tags` (or an equivalent relation): optional tags.
- `capture_diagnostics` (optional): sanitized, controlled-access diagnostic fragments with an expiration timestamp.

Enforce a unique index on normalized `sourceProfileUrl`; repeated captures update the existing connection and return an `updated` result. Add indexes for normalized company name and capture time to support company queries.

## Server API and Swagger UI

All API endpoints use JSON and validate input. The server binds to `127.0.0.1` by default so the unauthenticated API is available only on the local machine. HTTPS is not required for loopback traffic.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Health check for deployment monitoring. |
| `POST /api/v1/connections` | Extension ingestion; create or update a connection by profile URL. |
| `GET /api/v1/connections?company={company}` | Return connections whose company matches the required case-insensitive company query. Supports `limit` and `offset`. |
| `GET /api/v1/companies/{company}/connections` | Equivalent company lookup endpoint for clients that prefer a path parameter. |
| `GET /api/v1/connections/:id` | Retrieve one connection. |
| `DELETE /api/v1/connections/:id` | Delete one connection. |
| `GET /docs` | Serve interactive Swagger UI. |
| `GET /openapi.json` | Serve the OpenAPI 3 specification consumed by Swagger UI. |

No API authentication tokens or credentials are used. Capture requests include an idempotency key so retries cannot create duplicates. Because the API is unauthenticated, deployments that change the default bind address must restrict network access themselves.

Swagger UI at `/docs` must document request/response schemas and all status codes. It is the initial interface for testing and manually calling the API; no custom results dashboard is included.

### Endpoint contracts

`POST /api/v1/connections`

- Header: `Idempotency-Key: <UUID>`.
- Body: the connection data-model JSON above. `source`, `sourceProfileUrl`, `name`, `capturedAt`, and `extractorVersion` are required; other extracted fields may be `null` or omitted.
- Returns `201 Created` with `{ "id": "...", "status": "created", "connection": { ... } }` for a new profile, or `200 OK` with `status: "updated"` for an existing normalized URL.
- Returns `400` for invalid JSON, `413` for a body over the configured limit, and `422` for a schema-valid JSON body with missing/invalid fields.

`GET /api/v1/connections?company={company}&limit={limit}&offset={offset}`

- Requires non-empty `company`; perform a case-insensitive normalized exact company match in the initial release.
- `limit` defaults to 50 and has a maximum of 100. `offset` defaults to 0.
- Returns `200 OK` with `{ "data": [{ ...connection }], "pagination": { "limit": 50, "offset": 0, "total": 1 } }`.
- Returns `400` for a missing/invalid company or pagination value.

`GET /api/v1/companies/{company}/connections`

- Same behavior and response as the query endpoint; URL-decode the path parameter before normalizing it.

`GET /api/v1/connections/{id}` returns `200` and the connection record, or `404` when it does not exist. `DELETE /api/v1/connections/{id}` returns `204 No Content`, or `404` when it does not exist. `GET /health` returns `200` with `{ "status": "ok" }` only after the SQLite database is reachable.

## Security, privacy, and operations

- Apply request-size limits, schema validation, and CORS rules restricted to the local extension origin and Swagger UI as appropriate.
- Escape or sanitize stored text before returning or displaying it in Swagger examples/diagnostics.
- Use database migrations, backups, and structured error logging without secrets or captured content.
- Configure the server with environment variables for SQLite database path, bind host/port, allowed origins, and diagnostic retention days. Default the bind host to `127.0.0.1`.
- Provide a privacy policy/retention statement and deletion through the API.

## Initial acceptance criteria

- The server starts with documented environment configuration and runs database migrations.
- The server and extension can communicate locally without an authentication token.
- On a supported LinkedIn page, the extension automatically extracts and submits structured fields once per page visit without opening a popup.
- A submission is validated, idempotent, and stored in SQLite.
- Duplicate profile URLs update the existing record predictably.
- Failed submissions are queued locally and can be retried.
- `GET /api/v1/connections?company=...` returns matching records with pagination.
- Swagger UI at `/docs` can invoke and validate every documented endpoint.
- No full raw LinkedIn HTML is collected by default.

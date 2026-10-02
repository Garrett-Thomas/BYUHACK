# Connections Integration — Spec

Status: **approved**
Builds on: `connections-finder/spec.md` (Orion, branch `or-connections-finder`) and the Warmline app on `feature/react-typescript-frontend`.

## Goal

Replace the app's simulated "Collect connections" flow with real data:

1. A Chrome extension saves the LinkedIn people the user views into the Warmline server.
2. The job detail screen shows those saved people for the job's company.
3. The email panel uses the existing `/api/find-contact` and `/api/draft-email` endpoints instead of the hardcoded recruiter email.

Orion's spec is the source of truth for the connections data model, database and `/api/v1` contracts. This document records where we deviate from it, and specifies the frontend and extension work it doesn't cover.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | The connections API goes into the existing `server/` package, not a separate server. | One process, one `.env`, one port; same Express + TypeScript stack. |
| D2 | SQLite via Node's built-in `node:sqlite`. | Nothing native to compile. Node 25 is installed; it prints an experimental warning, which is acceptable. |
| D3 | `GET /health` returns `{ "status": "ok" }` (Orion's shape) after a `SELECT 1` succeeds. | Replaces our current `{ ok: true }`. |
| D4 | **No authentication anywhere.** No tokens, no `api_tokens` table, no `Authorization` header, no 401s. This deliberately overrides Orion's spec. | Runs locally for a single person per instance. |
| D5 | The server listens on `127.0.0.1` only, never `0.0.0.0`. | With no login, nothing else on the network should be able to reach it. |
| D6 | The Vite dev server proxies `/api` to `http://127.0.0.1:3001`, so the frontend calls same-origin relative URLs. | No CORS setup is needed for the app. |
| D7 | Orion's saved LinkedIn page is **not** brought into this branch. Only `connections-finder/spec.md` is copied over. A small anonymized fixture replaces the saved page. | The page holds 22 real people's profiles plus third-party scripts, and is ~230k lines. |
| D8 | Out of scope for now: diagnostic snapshots, deployment/HTTPS, a privacy policy page and rate limiting. | Hackathon scope, single local user. Diagnostics are optional in Orion's spec. |
| D9 | Data persists in a SQLite file at `DATABASE_PATH` (default `server/data/warmline.db`), created on first start. Only tests use `:memory:`. | The user's saved connections must survive restarts. |

## Phase 0 — Bring in Orion's spec and build fixtures

- (me, before the agents start) `git checkout origin/or-connections-finder -- connections-finder/spec.md` and commit it, crediting Orion.
- (extension agent, as its first step) Create `extension/fixtures/people-search.html` and `extension/fixtures/profile.html` from the saved page:
  - Keep only the DOM structure around result cards and the profile header.
  - Replace every name, headline, location, profile URL and image with fake values (e.g. "Jordan Example", `https://www.linkedin.com/in/jordan-example/`).
  - Strip all `<script>`, `<style>`, tracking and recaptcha markup.
  - Keep files under ~300 lines each.
- Read the saved page with `git show 'origin/or-connections-finder:connections-finder/reference/...'`. Never check the reference folder out into the working tree.
- `connections-finder/reference/` stays only on Orion's branch. I verify that no real profile slug or name from it appears in the fixtures.

## Phase 1 — Server: connections API

### Layout (`server/src/`)

```
index.ts               app wiring: json limit, cors, routes, error middleware, listen on 127.0.0.1
app.ts                 createApp(db) builds the Express app, so tests can pass a :memory: db
db.ts                  openDb(path): creates the parent dir, opens the file, enables foreign keys and WAL, runs migrations
migrations.ts          ordered list of SQL migrations; schema_migrations table tracks applied versions
connections/
  normalize.ts         normalizeProfileUrl, normalizeCompany
  schema.ts            zod schema for the ingestion body
  repo.ts              upsert, findByCompany (with total), getById, deleteById
  routes.ts            /api/v1 router
openapi.ts             hand-written OpenAPI 3 document
anthropic.ts, findContact.ts, draftEmail.ts   (unchanged)
```

### Environment (`server/.env`, all optional)

| Var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | existing |
| `PORT` | `3001` | existing |
| `DATABASE_PATH` | `./data/warmline.db` (resolved relative to `server/`) | SQLite file, persisted across restarts. `server/data/` is gitignored. |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | comma-separated CORS origins, for calling the API directly. `chrome-extension://*` origins are always allowed. |

Add a `server/.env.example` listing every var with placeholder values.

### Database (migration 1)

- `connections(id TEXT PK uuid, source, source_profile_url, normalized_profile_url UNIQUE, name, headline, company, normalized_company, location, notes, captured_at, extractor_version, created_at, updated_at)`
  - Indexes on `normalized_company` and `captured_at`.
- `connection_tags(connection_id FK ON DELETE CASCADE, tag, PRIMARY KEY(connection_id, tag))`
- `idempotency_keys(key PRIMARY KEY, status_code, response_body, created_at)`
  - A repeated key replays the stored response without re-running the upsert.
  - Prune rows older than 24h on startup.

### Normalization

- **Profile URL:** parse it, require host `linkedin.com` or `*.linkedin.com` and a path starting `/in/<slug>`, then output `https://www.linkedin.com/in/<slug-lowercased>/`. Drop query, fragment and any later path segments. Anything else is a 422.
- **Company:** trim, collapse whitespace, lowercase, and strip a trailing `,`/`.` plus one suffix from `inc`, `llc`, `ltd`, `corp`, `co`. So "Stripe, Inc." becomes "stripe".

### Endpoints

Implement exactly as in Orion's spec, under `/api/v1`:

- `POST /connections`
- `GET /connections?company=&limit=&offset=`
- `GET /companies/:company/connections`
- `GET /connections/:id`
- `DELETE /connections/:id`

Plus `/docs` (swagger-ui-express) and `/openapi.json`. Details to pin down:

- **Status codes:** 400 for malformed JSON, a missing `Idempotency-Key`, or a bad query. 422 for a body that parses but fails the zod schema. 413 for bodies over 100kb. No 401s (D4).
- **Error shape:** `{ "error": "<message>" }` everywhere. For 422, add `"details": [ { path, message } ]`.
- **Connection response shape:** the data-model fields plus `id`, `createdAt`, `updatedAt`, with `tags` always an array.
- **Upsert:** a repeat capture overwrites the captured fields, replaces the tags, and keeps `id` and `createdAt`.
- **Swagger:** no Authorize control or security schemes, since there is no auth.
- `find-contact` and `draft-email` stay as they are.

### Server tests

Use vitest + supertest against a `:memory:` database. Cover:

- create returns 201, and a repeat of the same normalized URL returns 200 "updated"
- an idempotent replay returns the same body
- 422 and 400 cases
- data persists: write with a temp-file database, reopen it, read the row back
- company match is case- and suffix-insensitive, with pagination totals
- 404 and 204 on get/delete
- `/health`
- `/openapi.json` parses

## Phase 2 — Frontend: real connections and email

### Plumbing

- `vite.config.ts`: add `server: { proxy: { '/api': 'http://127.0.0.1:3001' } }`.
- The frontend calls relative `/api/...` URLs only.
- `src/lib/api.ts` exports:
  - `getConnections(company)`, which calls `/api/v1/companies/:company/connections?limit=100`
  - `findContact(info)`
  - `draftEmail(info)`

  Each throws an `ApiError` carrying the status and message.

### Collect flow (replaces `useCollector`'s simulation)

When the user clicks "Collect connections & HR email" or "Re-run search":

1. Set `{ status: 'collecting', log, contacts: [] }`. `log` is a list of `{ text, state: 'active' | 'done' | 'error' }`, replacing the fixed `step` and `logLines`.
2. **In parallel:**
   - **Connections:** log "Looking up saved connections at {company}", then `getConnections`, then "Found N saved connections". Map the results into `contacts` straight away so they appear while the email search runs.
   - **Email:** log "Searching the web for a recruiting email" and call `findContact({ company, role, location, term })`.
     - If it returns `{}`: log "No public recruiting email found".
     - Otherwise: log "Found {label}", then "Drafting email", then call `draftEmail({ company, role, location, email, label, ...profile })`.
3. When both branches finish, set `{ status: 'done', contacts, email }`, where `email` may be `null`.
4. **Progress %** is the number of log entries that are done divided by the expected total (about 5). Keep the existing clamp.
5. **A failing branch** marks its log entry as error and still lets the other branch finish. The done view shows that section's error with a **Retry** button that reruns only that branch.

### Mapping a saved connection to `Contact`

| Contact field | Source |
|---|---|
| `id` | `connection.id` |
| `name` | `connection.name` |
| `title` | `headline ?? ''` |
| `degree` | `'Saved'` (the `.deg` chip) |
| `reason` | `notes ?? location ?? ''` |
| `profileUrl` (new field) | `sourceProfileUrl`. This replaces the dead `href="#"` on "Open LinkedIn profile ↗", which now opens in a new tab. |
| `status` | `'Not sent'` (client-side only, as today) |
| `text` | `draftNote(...)` (existing local template) |

### Done view changes

- **No saved connections:** the contacts column shows "No saved connections at {company} yet. Browse their LinkedIn people page with the Warmline extension on, then re-run."
- **`email` is `null`:** the email column shows "No public recruiting email found for {company}" with Retry.
- **Email found:** `toName` is the `label`, `confidence` is `'found via web search'`, and `to`, `subject` and `text` come from the APIs.

### Removals

- `PEOPLE`, the fake parts of `buildDone`, the fake `draftEmail` template, `SPEEDS` and `logLines`.
- Seeding the first two jobs as "done" on load.
- The footer's "agent speed" control, which only drove the simulation. "Source column" stays.

Class names stay the same, and new states reuse existing classes (`none-panel`, `empty-rows`, `btn`).

## Phase 3 — Chrome extension (`extension/`)

### Build

- TypeScript compiled by esbuild via `npm run build`, outputting `extension/dist/`, which is the folder you load unpacked.
- `manifest.json` is copied from `extension/static/`.
- Add vitest + jsdom for extractor tests.

### Manifest V3

- `host_permissions`: `https://www.linkedin.com/*`, `http://localhost/*`, `http://127.0.0.1/*`
- `optional_host_permissions`: `https://*/*`. The options page requests it when a non-local server URL is saved.
- `permissions`: `storage`, `alarms`
- A content script on `https://www.linkedin.com/*` that only acts on `/in/*` and `/search/results/people/*`.

### Content script

- **When to capture:**
  - Treat each distinct `location.href` as a visit. LinkedIn is a single-page app, so poll the href every 1s, and capture once per visit.
  - Wait for the needed elements with a MutationObserver, giving up after 8s.
- **Extractors** (pure functions `(document) => ConnectionInput[]` in `src/extractors/`, versioned `extractorVersion: "1.0.0"`):
  - The profile page gives one record.
  - The people-search page gives one record per result card.
  - `company` is taken from the headline's text after " at ", if there is one; otherwise `null`.
- **Sending:** post each record to the background worker. Never send HTML.

### Background service worker

- Skip records already sent during this visit, using profile URL + visit id.
- `POST {serverUrl}/api/v1/connections` with an `Idempotency-Key` from `crypto.randomUUID()`. The key is stored with each queued item, so retries reuse it.
- **On failure** (network error, 429 or 5xx): add the item to a queue in `chrome.storage.local`. A `chrome.alarms` job retries every 5 minutes. Drop items that get a 4xx other than 429, and count them as failed.
- Never log record contents.

### Options page

- Fields: server URL (default `http://127.0.0.1:3001`) and a capture on/off toggle.
- No token field (D4).
- Shows the queue count and failed count, with **Retry now** and **Clear queue** buttons.
- No diagnostics toggle (D8).

### Extension tests

Run the extractors against the Phase 0 fixtures and assert the fake names, headlines, normalized-ready URLs and companies they contain.

## Agent breakdown and order

| Order | Work | Who | Depends on |
|---|---|---|---|
| 1 | Copy Orion's spec, gitignore `server/data/` | me | none |
| 2 | Phase 1 server | Sonnet agent | none |
| 2 | Phase 2 frontend | Sonnet agent, in parallel | the API contract in this spec |
| 2 | Phase 0 fixtures + Phase 3 extension | Sonnet agent, in parallel | the API contract in this spec |
| 3 | Review + integration check | me | all three: read each diff, run typechecks, tests and builds, run frontend against the real server, then commit |

The agents work in separate folders (`server/`, `extension/`, `frontend/`) and never commit; I commit after verifying each phase. None of them make live Anthropic calls.

## Acceptance

- `server`: `npm run typecheck` and `npm test` pass. `/docs` loads and can call every endpoint. Records survive a server restart.
- `extension`: `npm run build` and `npm test` pass. Loaded unpacked, visiting a LinkedIn people-search page stores records, visible via `GET /api/v1/connections?company=…` in Swagger.
- `frontend`: `npm run build` passes. With the server running, a job at a company with saved connections shows them. The email panel shows a found email and draft, or the "not found" state. Errors show Retry instead of hanging.
- Verified by you: the steps that need a real LinkedIn session and live Claude calls.

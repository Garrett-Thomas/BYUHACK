# Connections Finder API

From this directory, set up and start the server:

```sh
uv sync
uv run alembic upgrade head
uv run python -m app
```

The API listens on `127.0.0.1:8000` by default.

- Swagger docs: <http://127.0.0.1:8000/docs>
- Health check: <http://127.0.0.1:8000/health>

The API has no authentication and is intended for local use. Keep `HOST=127.0.0.1` in `.env`.

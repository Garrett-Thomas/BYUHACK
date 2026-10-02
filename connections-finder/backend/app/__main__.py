"""Run the API using the configured local host and port."""

import uvicorn

from app.config import get_settings


def main() -> None:
    """Start Uvicorn using values from the environment or `.env` file."""

    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()

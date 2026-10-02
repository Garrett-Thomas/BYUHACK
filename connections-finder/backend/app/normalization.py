"""Canonicalization helpers used for stable lookup and deduplication."""

from urllib.parse import urlsplit, urlunsplit


def normalize_profile_url(value: str) -> str:
    """Normalize a LinkedIn profile URL for duplicate detection."""

    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    path = parsed.path.rstrip("/")
    return urlunsplit(("https", host, path, "", ""))


def normalize_company(value: str | None) -> str | None:
    """Normalize a company name for case-insensitive exact matching."""

    if value is None:
        return None
    normalized = " ".join(value.split()).casefold()
    return normalized or None

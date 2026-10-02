"""End-to-end tests for the local HTTP API."""

from uuid import uuid4

from fastapi.testclient import TestClient
from httpx import Response


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "source": "linkedin",
        "sourceProfileUrl": "https://www.linkedin.com/in/jane-doe/",
        "name": "Jane Doe",
        "headline": "Engineer at Example Corp",
        "company": "Example Corp",
        "location": "Provo, Utah",
        "notes": None,
        "tags": ["engineering"],
        "capturedAt": "2026-10-02T10:30:00Z",
        "extractorVersion": "1.0.0",
    }
    payload.update(overrides)
    return payload


def _ingest(client: TestClient, payload: dict[str, object], key: str | None = None) -> Response:
    return client.post(
        "/api/v1/connections",
        json=payload,
        headers={"Idempotency-Key": key or str(uuid4())},
    )


def test_ingest_company_lookup_and_get(client: TestClient) -> None:
    created = _ingest(client, _payload())
    assert created.status_code == 201
    result = created.json()
    assert result["status"] == "created"
    connection_id = result["id"]

    found = client.get("/api/v1/connections", params={"company": "  EXAMPLE   corp "})
    assert found.status_code == 200
    assert found.json()["pagination"]["total"] == 1
    assert found.json()["data"][0]["id"] == connection_id

    path_lookup = client.get("/api/v1/companies/Example%20Corp/connections")
    assert path_lookup.status_code == 200
    assert path_lookup.json()["data"][0]["id"] == connection_id

    fetched = client.get(f"/api/v1/connections/{connection_id}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Jane Doe"


def test_upsert_and_idempotent_retry(client: TestClient) -> None:
    key = str(uuid4())
    first = _ingest(client, _payload(), key)
    assert first.status_code == 201

    replay = _ingest(client, _payload(), key)
    assert replay.status_code == 201
    assert replay.json() == first.json()

    update = _ingest(client, _payload(name="Jane D."))
    assert update.status_code == 200
    assert update.json()["status"] == "updated"
    assert update.json()["id"] == first.json()["id"]
    assert update.json()["connection"]["name"] == "Jane D."

    reused_key = _ingest(client, _payload(name="Different payload"), key)
    assert reused_key.status_code == 409


def test_validation_and_malformed_json(client: TestClient) -> None:
    missing_fields = client.post(
        "/api/v1/connections",
        json={"source": "linkedin"},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert missing_fields.status_code == 422

    oversized_name = _ingest(client, _payload(name="PRIVATE" * 50))
    assert oversized_name.status_code == 422
    assert "PRIVATE" not in oversized_name.text

    malformed = client.post(
        "/api/v1/connections",
        content="{broken",
        headers={"Content-Type": "application/json", "Idempotency-Key": str(uuid4())},
    )
    assert malformed.status_code == 400

    invalid_key = _ingest(client, _payload(), "not-a-uuid")
    assert invalid_key.status_code == 400

    missing_key = client.post("/api/v1/connections", json=_payload())
    assert missing_key.status_code == 400

    missing_company = client.get("/api/v1/connections")
    assert missing_company.status_code == 400

    invalid_limit = client.get("/api/v1/connections", params={"company": "Example Corp", "limit": 101})
    assert invalid_limit.status_code == 400


def test_delete_and_not_found(client: TestClient) -> None:
    created = _ingest(client, _payload())
    connection_id = created.json()["id"]

    deleted = client.delete(f"/api/v1/connections/{connection_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/connections/{connection_id}").status_code == 404
    assert client.delete(f"/api/v1/connections/{connection_id}").status_code == 404


def test_company_pagination_and_health(client: TestClient) -> None:
    for name in ("alice", "bob", "carol"):
        response = _ingest(
            client,
            _payload(
                name=name.title(),
                sourceProfileUrl=f"https://www.linkedin.com/in/{name}/",
            ),
        )
        assert response.status_code == 201

    page = client.get("/api/v1/connections", params={"company": "Example Corp", "limit": 2})
    assert page.status_code == 200
    assert len(page.json()["data"]) == 2
    assert page.json()["pagination"] == {"limit": 2, "offset": 0, "total": 3}
    assert client.get("/health").json() == {"status": "ok"}

    docs = client.get("/docs")
    assert docs.status_code == 200
    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    assert "/api/v1/connections" in openapi.json()["paths"]


def test_large_body_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/connections",
        content=iter((b" " * 600_000, b" " * 600_000)),
        headers={"Content-Type": "application/json", "Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 413

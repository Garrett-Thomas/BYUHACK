import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { migrations } from "../src/migrations.js";
import { normalizeCompany, normalizeProfileUrl } from "../src/connections/normalize.js";

const body = (over: Record<string, unknown> = {}) => ({
  source: "linkedin",
  sourceProfileUrl: "https://www.linkedin.com/in/Jordan-Example/?trk=abc",
  name: "Jordan Example",
  headline: "Engineer at Stripe, Inc.",
  company: "Stripe, Inc.",
  location: "Provo, Utah",
  tags: ["eng"],
  capturedAt: "2026-10-02T00:00:00.000Z",
  extractorVersion: "1.0.0",
  ...over,
});

let db: DatabaseSync;
let app: ReturnType<typeof createApp>;
let n = 0;
const post = (b: unknown, key: string | null = `key-${++n}`) => {
  const r = request(app).post("/api/v1/connections");
  if (key) r.set("Idempotency-Key", key);
  return r.send(b as object);
};

beforeEach(() => {
  db = openDb(":memory:");
  app = createApp(db);
});
afterEach(() => db.close());

describe("normalize", () => {
  it("normalizes profile URLs", () => {
    expect(normalizeProfileUrl("https://uk.linkedin.com/in/Foo-Bar/details/x?y=1#z")).toBe(
      "https://www.linkedin.com/in/foo-bar/",
    );
    expect(normalizeProfileUrl("https://example.com/in/foo")).toBeNull();
    expect(normalizeProfileUrl("https://www.linkedin.com/company/foo")).toBeNull();
    expect(normalizeProfileUrl("https://notlinkedin.com/in/foo")).toBeNull();
    expect(normalizeProfileUrl("nope")).toBeNull();
  });
  it("normalizes companies", () => {
    expect(normalizeCompany("Stripe, Inc.")).toBe("stripe");
    expect(normalizeCompany("  STRIPE   LLC ")).toBe("stripe");
    expect(normalizeCompany("Acme Co.")).toBe("acme");
    expect(normalizeCompany("Co")).toBe("co");
  });
});

describe("POST /api/v1/connections", () => {
  it("creates (201) then updates (200) keeping id and createdAt", async () => {
    const a = await post(body());
    expect(a.status).toBe(201);
    expect(a.body.status).toBe("created");
    expect(a.body.connection.tags).toEqual(["eng"]);
    const b = await post(body({ sourceProfileUrl: "https://linkedin.com/in/jordan-example", name: "Jordan E.", tags: [] }));
    expect(b.status).toBe(200);
    expect(b.body.status).toBe("updated");
    expect(b.body.id).toBe(a.body.id);
    expect(b.body.connection.name).toBe("Jordan E.");
    expect(b.body.connection.tags).toEqual([]);
    expect(b.body.connection.createdAt).toBe(a.body.connection.createdAt);
  });

  it("round-trips degree, defaults it to null, and overwrites it on update", async () => {
    const a = await post(body({ degree: "2nd" }));
    expect(a.status).toBe(201);
    expect(a.body.connection.degree).toBe("2nd");
    const got = await request(app).get(`/api/v1/connections/${a.body.id}`);
    expect(got.body.degree).toBe("2nd");
    const listed = await request(app).get("/api/v1/connections").query({ company: "Stripe" });
    expect(listed.body.data[0].degree).toBe("2nd");

    const b = await post(body({ degree: "1st" }));
    expect(b.body.status).toBe("updated");
    expect(b.body.connection.degree).toBe("1st");

    const c = await post(body({ degree: null }));
    expect(c.body.connection.degree).toBeNull();

    const d = await post(body({ sourceProfileUrl: "https://www.linkedin.com/in/no-degree/" }));
    expect(d.body.connection.degree).toBeNull();
  });

  it("422 for an invalid degree", async () => {
    const a = await post(body({ degree: "4th" }));
    expect(a.status).toBe(422);
    expect(a.body.details[0].path).toBe("degree");
    expect((await post(body({ degree: 1 }))).status).toBe(422);
  });

  it("replays a repeated idempotency key", async () => {
    const a = await post(body(), "same");
    const b = await post(body({ name: "Different" }), "same");
    expect(b.status).toBe(201);
    expect(b.body).toEqual(a.body);
  });

  it("400 for missing key and malformed JSON", async () => {
    expect((await post(body(), null)).status).toBe(400);
    const r = await request(app)
      .post("/api/v1/connections")
      .set("Idempotency-Key", "k")
      .set("Content-Type", "application/json")
      .send("{nope");
    expect(r.status).toBe(400);
    expect(r.body.error).toBeTruthy();
  });

  it("422 with details for invalid bodies", async () => {
    const a = await post(body({ sourceProfileUrl: "https://example.com/in/x" }));
    expect(a.status).toBe(422);
    expect(a.body.details[0].path).toBe("sourceProfileUrl");
    expect((await post({ source: "linkedin" })).status).toBe(422);
    expect((await post(body({ capturedAt: "yesterday" }))).status).toBe(422);
  });

  it("413 for oversized bodies", async () => {
    const r = await post(body({ notes: "x".repeat(150_000) }));
    expect(r.status).toBe(413);
  });
});

describe("company lookup", () => {
  it("matches case- and suffix-insensitively with pagination totals", async () => {
    for (let i = 0; i < 3; i++) {
      await post(
        body({
          sourceProfileUrl: `https://www.linkedin.com/in/person-${i}/`,
          name: `Person ${i}`,
          company: i === 0 ? "STRIPE" : "Stripe, Inc.",
          capturedAt: `2026-10-0${i + 1}T00:00:00.000Z`,
        }),
      );
    }
    await post(body({ sourceProfileUrl: "https://www.linkedin.com/in/other/", company: "Other Corp" }));

    const q = await request(app).get("/api/v1/connections").query({ company: "stripe LLC", limit: 2 });
    expect(q.status).toBe(200);
    expect(q.body.pagination).toEqual({ limit: 2, offset: 0, total: 3 });
    expect(q.body.data.map((c: { name: string }) => c.name)).toEqual(["Person 2", "Person 1"]);

    const p = await request(app).get(`/api/v1/companies/${encodeURIComponent("Stripe, Inc.")}/connections?offset=2`);
    expect(p.status).toBe(200);
    expect(p.body.data).toHaveLength(1);
    expect(p.body.pagination).toEqual({ limit: 50, offset: 2, total: 3 });
  });

  it("400 for bad query", async () => {
    expect((await request(app).get("/api/v1/connections")).status).toBe(400);
    expect((await request(app).get("/api/v1/connections?company=x&limit=101")).status).toBe(400);
    expect((await request(app).get("/api/v1/connections?company=x&offset=-1")).status).toBe(400);
    expect((await request(app).get("/api/v1/connections?company=x&limit=abc")).status).toBe(400);
  });
});

describe("get/delete", () => {
  it("404 then 204", async () => {
    expect((await request(app).get("/api/v1/connections/nope")).status).toBe(404);
    expect((await request(app).delete("/api/v1/connections/nope")).status).toBe(404);
    const { body: created } = await post(body());
    expect((await request(app).get(`/api/v1/connections/${created.id}`)).body.name).toBe("Jordan Example");
    expect((await request(app).delete(`/api/v1/connections/${created.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/v1/connections/${created.id}`)).status).toBe(404);
    const tags = db.prepare("SELECT COUNT(*) AS n FROM connection_tags").get() as { n: number };
    expect(tags.n).toBe(0);
  });
});

describe("persistence", () => {
  it("survives reopening a file database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "warmline-"));
    try {
      const path = join(dir, "nested", "w.db");
      const first = openDb(path);
      const created = await request(createApp(first))
        .post("/api/v1/connections")
        .set("Idempotency-Key", "p1")
        .send(body());
      expect(created.status).toBe(201);
      first.close();

      const second = openDb(path);
      const res = await request(createApp(second)).get(`/api/v1/connections/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Jordan Example");
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("migrations", () => {
  it("migration 2 applies to an existing v1 database and keeps its rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "warmline-"));
    try {
      const path = join(dir, "v1.db");
      const old = new DatabaseSync(path);
      old.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
      old.exec(migrations[0].sql);
      old.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, ?, ?)").run(
        migrations[0].name,
        "2026-10-01T00:00:00.000Z",
      );
      old
        .prepare(
          `INSERT INTO connections (id, source, source_profile_url, normalized_profile_url, name, company, normalized_company,
             captured_at, extractor_version, created_at, updated_at)
           VALUES ('old-1', 'linkedin', 'https://www.linkedin.com/in/old-timer/', 'https://www.linkedin.com/in/old-timer/',
             'Old Timer', 'Stripe', 'stripe', '2026-10-01T00:00:00.000Z', '1.0.0', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
        )
        .run();
      old.close();

      const upgraded = openDb(path);
      const row = upgraded.prepare("SELECT name, degree FROM connections WHERE id = 'old-1'").get() as {
        name: string;
        degree: string | null;
      };
      expect(row).toEqual({ name: "Old Timer", degree: null });
      const versions = upgraded.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
      expect(versions.map((v) => Number(v.version))).toEqual([1, 2]);
      upgraded.close();

      const again = openDb(path);
      expect(again.prepare("SELECT COUNT(*) AS n FROM connections").get()).toEqual({ n: 1 });
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("misc", () => {
  it("/health", async () => {
    const r = await request(app).get("/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "ok" });
  });

  it("/openapi.json covers every route and /docs serves HTML", async () => {
    const r = await request(app).get("/openapi.json");
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.paths).sort()).toEqual(
      [
        "/api/draft-email",
        "/api/find-contact",
        "/api/v1/companies/{company}/connections",
        "/api/v1/connections",
        "/api/v1/connections/{id}",
        "/health",
      ].sort(),
    );
    expect(r.body.components.securitySchemes).toBeUndefined();
    const docs = await request(app).get("/docs/");
    expect(docs.status).toBe(200);
    expect(docs.type).toBe("text/html");
  });

  it("find-contact validates input without calling upstream", async () => {
    expect((await request(app).post("/api/find-contact").send({ company: "x" })).status).toBe(400);
    expect((await request(app).post("/api/draft-email").send({ company: "x" })).status).toBe(400);
  });
});

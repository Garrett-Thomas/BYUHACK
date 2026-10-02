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

  it("accepts 3rd degree", async () => {
    const a = await post(body({ sourceProfileUrl: "https://www.linkedin.com/in/third-degree/", degree: "3rd" }));
    expect(a.status).toBe(201);
    expect(a.body.connection.degree).toBe("3rd");
    const got = await request(app).get(`/api/v1/connections/${a.body.id}`);
    expect(got.body.degree).toBe("3rd");
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

describe("mutual connections", () => {
  const mutual = (slug: string, name = `Mutual ${slug}`) => ({
    name,
    profileUrl: `https://www.linkedin.com/in/${slug}/`,
  });

  it("round-trips mutuals and mutualCount through POST, GET and list, in order", async () => {
    const a = await post(
      body({
        degree: "2nd",
        mutuals: [
          { name: "  Zed Mutual ", profileUrl: "https://linkedin.com/in/Zed-Mutual/?trk=x" },
          mutual("amy-mutual", "Amy Mutual"),
        ],
        mutualCount: 9,
      }),
    );
    expect(a.status).toBe(201);
    const expected = [
      { name: "Zed Mutual", profileUrl: "https://www.linkedin.com/in/zed-mutual/" },
      { name: "Amy Mutual", profileUrl: "https://www.linkedin.com/in/amy-mutual/" },
    ];
    expect(a.body.connection.mutuals).toEqual(expected);
    expect(a.body.connection.mutualCount).toBe(9);
    const got = await request(app).get(`/api/v1/connections/${a.body.id}`);
    expect(got.body.mutuals).toEqual(expected);
    expect(got.body.mutualCount).toBe(9);
    const listed = await request(app).get("/api/v1/connections").query({ company: "Stripe" });
    expect(listed.body.data[0].mutuals).toEqual(expected);
    expect(listed.body.data[0].mutualCount).toBe(9);
  });

  it("defaults to an empty array and null, and accepts null/zero/empty", async () => {
    const a = await post(body());
    expect(a.body.connection.mutuals).toEqual([]);
    expect(a.body.connection.mutualCount).toBeNull();
    const b = await post(body({ mutuals: null, mutualCount: null }));
    expect(b.status).toBe(200);
    expect(b.body.connection.mutuals).toEqual([]);
    expect(b.body.connection.mutualCount).toBeNull();
    const c = await post(body({ mutuals: [], mutualCount: 0 }));
    expect(c.body.connection.mutuals).toEqual([]);
    expect(c.body.connection.mutualCount).toBe(0);
  });

  it("replaces mutuals on upsert and clears them when omitted", async () => {
    const a = await post(body({ mutuals: [mutual("one"), mutual("two")], mutualCount: 2 }));
    const b = await post(body({ mutuals: [mutual("three")], mutualCount: 5 }));
    expect(b.body.status).toBe("updated");
    expect(b.body.connection.mutuals).toEqual([mutual("three")]);
    expect(b.body.connection.mutualCount).toBe(5);
    expect(db.prepare("SELECT COUNT(*) AS n FROM connection_mutuals").get()).toEqual({ n: 1 });

    const c = await post(body({ mutuals: [mutual("two"), mutual("one")] }));
    expect(c.body.connection.mutuals).toEqual([mutual("two"), mutual("one")]);
    expect(c.body.connection.mutualCount).toBeNull();

    const d = await post(body());
    expect(d.body.id).toBe(a.body.id);
    expect(d.body.connection.mutuals).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM connection_mutuals").get()).toEqual({ n: 0 });
  });

  it("deletes mutuals with their connection (cascade)", async () => {
    const a = await post(body({ mutuals: [mutual("one"), mutual("two")], mutualCount: 2 }));
    await post(body({ sourceProfileUrl: "https://www.linkedin.com/in/keeper/", mutuals: [mutual("three")] }));
    expect(db.prepare("SELECT COUNT(*) AS n FROM connection_mutuals").get()).toEqual({ n: 3 });
    expect((await request(app).delete(`/api/v1/connections/${a.body.id}`)).status).toBe(204);
    expect(db.prepare("SELECT COUNT(*) AS n FROM connection_mutuals").get()).toEqual({ n: 1 });
  });

  it("422 for a bad mutual URL, name, count, or too many mutuals", async () => {
    const bad: [Record<string, unknown>, string][] = [
      [{ mutuals: [{ name: "X", profileUrl: "https://example.com/in/x" }] }, "mutuals.0.profileUrl"],
      [{ mutuals: [{ name: "X", profileUrl: "https://www.linkedin.com/company/x" }] }, "mutuals.0.profileUrl"],
      [{ mutuals: [mutual("ok"), { name: "X", profileUrl: "nope" }] }, "mutuals.1.profileUrl"],
      [{ mutuals: [{ name: "X" }] }, "mutuals.0.profileUrl"],
      [{ mutuals: [{ name: "", profileUrl: "https://www.linkedin.com/in/x/" }] }, "mutuals.0.name"],
      [{ mutuals: [{ name: "x".repeat(201), profileUrl: "https://www.linkedin.com/in/x/" }] }, "mutuals.0.name"],
      [{ mutuals: Array.from({ length: 6 }, (_, i) => mutual(`m${i}`)) }, "mutuals"],
      [{ mutuals: "nope" }, "mutuals"],
      [{ mutualCount: -1 }, "mutualCount"],
      [{ mutualCount: 1.5 }, "mutualCount"],
      [{ mutualCount: "3" }, "mutualCount"],
    ];
    for (const [over, path] of bad) {
      const r = await post(body(over));
      expect(r.status, JSON.stringify(over)).toBe(422);
      expect(r.body.details[0].path, JSON.stringify(over)).toBe(path);
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM connections").get()).toEqual({ n: 0 });
    // boundaries are accepted
    const ok = await post(body({ mutuals: Array.from({ length: 5 }, (_, i) => mutual(`m${i}`, "x".repeat(200))) }));
    expect(ok.status).toBe(201);
    expect(ok.body.connection.mutuals).toHaveLength(5);
  });

  it("lists fetch mutuals for the whole page in one query", async () => {
    for (let i = 0; i < 4; i++) {
      await post(
        body({
          sourceProfileUrl: `https://www.linkedin.com/in/target-${i}/`,
          name: `Target ${i}`,
          capturedAt: `2026-10-0${i + 1}T00:00:00.000Z`,
          mutuals: i === 3 ? [] : [mutual(`a${i}`), mutual(`b${i}`)],
          mutualCount: i === 3 ? null : 2 + i,
        }),
      );
    }
    const statements: string[] = [];
    const prepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      statements.push(sql);
      return prepare(sql);
    }) as typeof db.prepare;

    const r = await request(app).get("/api/v1/connections").query({ company: "Stripe" });
    expect(r.status).toBe(200);
    expect(statements.filter((s) => s.includes("connection_mutuals"))).toHaveLength(1);
    expect(statements.filter((s) => s.includes("connection_tags"))).toHaveLength(1);
    expect(r.body.data.map((c: { name: string }) => c.name)).toEqual(["Target 3", "Target 2", "Target 1", "Target 0"]);
    expect(r.body.data.map((c: { mutuals: unknown[] }) => c.mutuals.length)).toEqual([0, 2, 2, 2]);
    expect(r.body.data[1].mutuals).toEqual([mutual("a2"), mutual("b2")]);
    expect(r.body.data.map((c: { mutualCount: number | null }) => c.mutualCount)).toEqual([null, 4, 3, 2]);
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
      expect(versions.map((v) => Number(v.version))).toEqual([1, 2, 3, 4]);
      upgraded.close();

      const again = openDb(path);
      expect(again.prepare("SELECT COUNT(*) AS n FROM connections").get()).toEqual({ n: 1 });
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("migration 3", () => {
  it("applies to an existing v2 database with rows and keeps them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "warmline-"));
    try {
      const path = join(dir, "v2.db");
      const old = new DatabaseSync(path);
      old.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
      for (const m of migrations.filter((m) => m.version <= 2)) {
        old.exec(m.sql);
        old
          .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(m.version, m.name, "2026-10-01T00:00:00.000Z");
      }
      old
        .prepare(
          `INSERT INTO connections (id, source, source_profile_url, normalized_profile_url, name, company, normalized_company,
             degree, captured_at, extractor_version, created_at, updated_at)
           VALUES ('v2-1', 'linkedin', 'https://www.linkedin.com/in/v2-person/', 'https://www.linkedin.com/in/v2-person/',
             'V2 Person', 'Stripe', 'stripe', '2nd', '2026-10-01T00:00:00.000Z', '1.1.0', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
        )
        .run();
      old.prepare("INSERT INTO connection_tags (connection_id, tag) VALUES ('v2-1', 'eng')").run();
      old.close();

      const upgraded = openDb(path);
      expect(upgraded.prepare("SELECT name, degree FROM connections WHERE id = 'v2-1'").get()).toEqual({
        name: "V2 Person",
        degree: "2nd",
      });
      expect(upgraded.prepare("SELECT tag FROM connection_tags WHERE connection_id = 'v2-1'").all()).toEqual([{ tag: "eng" }]);
      expect(upgraded.prepare("SELECT COUNT(*) AS n FROM company_scopes").get()).toEqual({ n: 0 });
      expect(upgraded.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((v) => Number(v.version))).toEqual([
        1, 2, 3, 4,
      ]);

      const put = await request(createApp(upgraded))
        .put("/api/v1/company-scopes/Stripe")
        .send({ linkedinIds: ["2135371"] });
      expect(put.status).toBe(200);
      upgraded.close();

      const again = openDb(path);
      expect(again.prepare("SELECT COUNT(*) AS n FROM connections").get()).toEqual({ n: 1 });
      expect(again.prepare("SELECT COUNT(*) AS n FROM company_scopes").get()).toEqual({ n: 1 });
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("migration 4", () => {
  it("applies to a v3 database with connections, tags and company scopes and keeps them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "warmline-"));
    try {
      const path = join(dir, "v3.db");
      const old = new DatabaseSync(path);
      old.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
      for (const m of migrations.filter((m) => m.version <= 3)) {
        old.exec(m.sql);
        old
          .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(m.version, m.name, "2026-10-01T00:00:00.000Z");
      }
      const insert = old.prepare(
        `INSERT INTO connections (id, source, source_profile_url, normalized_profile_url, name, company, normalized_company,
           degree, captured_at, extractor_version, created_at, updated_at)
         VALUES (?, 'linkedin', ?, ?, ?, 'Stripe', 'stripe', ?, '2026-10-01T00:00:00.000Z', '1.2.0',
           '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
      );
      insert.run("v3-1", "https://www.linkedin.com/in/v3-one/", "https://www.linkedin.com/in/v3-one/", "V3 One", "2nd");
      insert.run("v3-2", "https://www.linkedin.com/in/v3-two/", "https://www.linkedin.com/in/v3-two/", "V3 Two", "1st");
      old.prepare("INSERT INTO connection_tags (connection_id, tag) VALUES ('v3-1', 'eng'), ('v3-1', 'recruiter'), ('v3-2', 'eng')").run();
      old
        .prepare(
          `INSERT INTO company_scopes (normalized_company, company, linkedin_slug, linkedin_name, linkedin_ids, resolved_at)
           VALUES ('stripe', 'Stripe', 'stripe', 'Stripe', '["2135371"]', '2026-10-01T00:00:00.000Z')`,
        )
        .run();
      old.close();

      const upgraded = openDb(path);
      expect(upgraded.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((v) => Number(v.version))).toEqual([
        1, 2, 3, 4,
      ]);
      expect(upgraded.prepare("SELECT id, name, degree, mutual_count FROM connections ORDER BY id").all()).toEqual([
        { id: "v3-1", name: "V3 One", degree: "2nd", mutual_count: null },
        { id: "v3-2", name: "V3 Two", degree: "1st", mutual_count: null },
      ]);
      expect(upgraded.prepare("SELECT connection_id, tag FROM connection_tags ORDER BY connection_id, tag").all()).toEqual([
        { connection_id: "v3-1", tag: "eng" },
        { connection_id: "v3-1", tag: "recruiter" },
        { connection_id: "v3-2", tag: "eng" },
      ]);
      expect(upgraded.prepare("SELECT company, linkedin_ids FROM company_scopes").all()).toEqual([
        { company: "Stripe", linkedin_ids: '["2135371"]' },
      ]);
      expect(upgraded.prepare("SELECT COUNT(*) AS n FROM connection_mutuals").get()).toEqual({ n: 0 });

      // Old rows read back with empty mutuals, and can gain them via upsert.
      const upgradedApp = createApp(upgraded);
      const old1 = await request(upgradedApp).get("/api/v1/connections/v3-1");
      expect(old1.status).toBe(200);
      expect(old1.body.mutuals).toEqual([]);
      expect(old1.body.mutualCount).toBeNull();
      expect(old1.body.tags).toEqual(["eng", "recruiter"]);
      const up = await request(upgradedApp)
        .post("/api/v1/connections")
        .set("Idempotency-Key", "m4")
        .send(
          body({
            sourceProfileUrl: "https://www.linkedin.com/in/v3-one/",
            degree: "2nd",
            mutuals: [{ name: "Sam Mutual", profileUrl: "https://www.linkedin.com/in/sam-mutual/" }],
            mutualCount: 1,
          }),
        );
      expect(up.status).toBe(200);
      expect(up.body.id).toBe("v3-1");
      expect(up.body.connection.mutuals).toEqual([{ name: "Sam Mutual", profileUrl: "https://www.linkedin.com/in/sam-mutual/" }]);
      expect((await request(upgradedApp).get("/api/v1/company-scopes/Stripe")).body.linkedinIds).toEqual(["2135371"]);
      upgraded.close();

      const again = openDb(path);
      expect(again.prepare("SELECT COUNT(*) AS n FROM connections").get()).toEqual({ n: 2 });
      expect(again.prepare("SELECT COUNT(*) AS n FROM connection_mutuals").get()).toEqual({ n: 1 });
      expect(again.prepare("SELECT COUNT(*) AS n FROM company_scopes").get()).toEqual({ n: 1 });
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("company scopes", () => {
  const scopeBody = (over: Record<string, unknown> = {}) => ({
    linkedinSlug: "stripe",
    linkedinName: "Stripe",
    linkedinIds: ["2135371"],
    ...over,
  });
  const put = (company: string, b: unknown) =>
    request(app).put(`/api/v1/company-scopes/${encodeURIComponent(company)}`).send(b as object);
  const get = (company: string) => request(app).get(`/api/v1/company-scopes/${encodeURIComponent(company)}`);

  it("round-trips PUT/GET and replaces on a second PUT", async () => {
    const a = await put("Stripe", scopeBody({ linkedinIds: ["1441", "16140"] }));
    expect(a.status).toBe(200);
    expect(a.body).toEqual({
      company: "Stripe",
      linkedinSlug: "stripe",
      linkedinName: "Stripe",
      linkedinIds: ["1441", "16140"],
      resolvedAt: expect.any(String),
    });
    expect(new Date(a.body.resolvedAt).toISOString()).toBe(a.body.resolvedAt);

    const got = await get("Stripe");
    expect(got.status).toBe(200);
    expect(got.body).toEqual(a.body);

    const b = await put("Stripe", { linkedinIds: ["999"] });
    expect(b.status).toBe(200);
    expect(b.body.linkedinSlug).toBeNull();
    expect(b.body.linkedinName).toBeNull();
    expect(b.body.linkedinIds).toEqual(["999"]);
    expect((await get("Stripe")).body.linkedinIds).toEqual(["999"]);
  });

  it("stores slug/name as null when null or blank", async () => {
    const a = await put("Acme", { linkedinSlug: null, linkedinName: "  ", linkedinIds: ["1"] });
    expect(a.status).toBe(200);
    expect(a.body.linkedinSlug).toBeNull();
    expect(a.body.linkedinName).toBeNull();
  });

  it("422 with details for invalid bodies", async () => {
    const bad = [
      {},
      scopeBody({ linkedinIds: [] }),
      scopeBody({ linkedinIds: ["abc"] }),
      scopeBody({ linkedinIds: ["1234567890123456"] }),
      scopeBody({ linkedinIds: [""] }),
      scopeBody({ linkedinIds: [123] }),
      scopeBody({ linkedinIds: "123" }),
      scopeBody({ linkedinIds: Array.from({ length: 51 }, (_, i) => String(i + 1)) }),
      scopeBody({ linkedinSlug: 5 }),
    ];
    for (const b of bad) {
      const r = await put("Stripe", b);
      expect(r.status, JSON.stringify(b)).toBe(422);
      expect(r.body.details.length).toBeGreaterThan(0);
    }
    expect((await put("Stripe", scopeBody({ linkedinIds: [] }))).body.details[0].path).toBe("linkedinIds");
    expect((await get("Stripe")).status).toBe(404);
    // boundaries are accepted
    expect((await put("Stripe", scopeBody({ linkedinIds: ["1", "123456789012345"] }))).status).toBe(200);
    const fifty = Array.from({ length: 50 }, (_, i) => String(i + 1));
    expect((await put("Stripe", scopeBody({ linkedinIds: fifty }))).body.linkedinIds).toHaveLength(50);
  });

  it("400 for malformed JSON and blank company", async () => {
    const r = await request(app)
      .put("/api/v1/company-scopes/Stripe")
      .set("Content-Type", "application/json")
      .send("{nope");
    expect(r.status).toBe(400);
    expect((await put("   ", scopeBody())).status).toBe(400);
    expect((await get("   ")).status).toBe(400);
  });

  it("404 then 204 on delete", async () => {
    expect((await get("Stripe")).status).toBe(404);
    expect((await request(app).delete("/api/v1/company-scopes/Stripe")).status).toBe(404);
    await put("Stripe", scopeBody());
    expect((await request(app).delete("/api/v1/company-scopes/Stripe")).status).toBe(204);
    expect((await get("Stripe")).status).toBe(404);
    expect((await request(app).delete("/api/v1/company-scopes/Stripe")).status).toBe(404);
  });

  it("normalizes the company so variants share one row", async () => {
    await put("Stripe, Inc.", scopeBody({ linkedinIds: ["1"] }));
    const got = await get("stripe");
    expect(got.status).toBe(200);
    expect(got.body.company).toBe("Stripe, Inc.");
    expect((await get("  STRIPE   LLC ")).status).toBe(200);

    await put("stripe", scopeBody({ linkedinIds: ["2"] }));
    expect(db.prepare("SELECT COUNT(*) AS n FROM company_scopes").get()).toEqual({ n: 1 });
    const after = await get("Stripe, Inc.");
    expect(after.body.linkedinIds).toEqual(["2"]);
    expect(after.body.company).toBe("stripe");

    expect((await request(app).delete(`/api/v1/company-scopes/${encodeURIComponent("STRIPE, Inc")}`)).status).toBe(204);
    expect((await get("stripe")).status).toBe(404);
  });

  it("URL-decodes the company path segment", async () => {
    await put("Johnson & Johnson", scopeBody({ linkedinIds: ["1"] }));
    const r = await request(app).get("/api/v1/company-scopes/Johnson%20%26%20Johnson");
    expect(r.status).toBe(200);
    expect(r.body.company).toBe("Johnson & Johnson");
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
        "/api/v1/company-scopes/{company}",
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

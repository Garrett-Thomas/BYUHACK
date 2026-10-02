import { Router } from "express";
import type { Request, Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import { connectionInputSchema } from "./schema.js";
import { deleteById, findByCompany, getById, upsert } from "./repo.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseIntParam(v: unknown, name: string, def: number, min: number, max: number): number | string {
  if (v === undefined) return def;
  if (typeof v !== "string" || !/^\d+$/.test(v)) return `\`${name}\` must be an integer`;
  const n = Number(v);
  if (n < min || n > max) return `\`${name}\` must be between ${min} and ${max}`;
  return n;
}

export function connectionsRouter(db: DatabaseSync): Router {
  const router = Router();

  function listByCompany(company: unknown, req: Request, res: Response): void {
    if (typeof company !== "string" || !company.trim()) {
      res.status(400).json({ error: "`company` is required" });
      return;
    }
    const limit = parseIntParam(req.query.limit, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT);
    if (typeof limit === "string") {
      res.status(400).json({ error: limit });
      return;
    }
    const offset = parseIntParam(req.query.offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
    if (typeof offset === "string") {
      res.status(400).json({ error: offset });
      return;
    }
    const { data, total } = findByCompany(db, company, limit, offset);
    res.json({ data, pagination: { limit, offset, total } });
  }

  router.post("/connections", (req, res) => {
    const key = req.get("Idempotency-Key")?.trim();
    if (!key || key.length > 255) {
      res.status(400).json({ error: "`Idempotency-Key` header is required (max 255 characters)" });
      return;
    }
    const stored = db.prepare("SELECT status_code, response_body FROM idempotency_keys WHERE key = ?").get(key) as
      | { status_code: number; response_body: string }
      | undefined;
    if (stored) {
      res.status(Number(stored.status_code)).type("application/json").send(stored.response_body);
      return;
    }

    const parsed = connectionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: "Invalid connection",
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }

    const { status, connection } = upsert(db, parsed.data);
    const statusCode = status === "created" ? 201 : 200;
    const body = JSON.stringify({ id: connection.id, status, connection });
    db.prepare("INSERT OR IGNORE INTO idempotency_keys (key, status_code, response_body, created_at) VALUES (?, ?, ?, ?)").run(
      key,
      statusCode,
      body,
      new Date().toISOString(),
    );
    res.status(statusCode).type("application/json").send(body);
  });

  router.get("/connections", (req, res) => listByCompany(req.query.company, req, res));

  router.get("/companies/:company/connections", (req, res) => listByCompany(req.params.company, req, res));

  router.get("/connections/:id", (req, res) => {
    const connection = getById(db, req.params.id);
    if (!connection) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }
    res.json(connection);
  });

  router.delete("/connections/:id", (req, res) => {
    if (!deleteById(db, req.params.id)) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }
    res.status(204).end();
  });

  return router;
}

import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { DatabaseSync } from "node:sqlite";
import swaggerUi from "swagger-ui-express";
import { companyScopesRouter } from "./companyScopes/routes.js";
import { connectionsRouter } from "./connections/routes.js";
import { draftEmail } from "./draftEmail.js";
import { findContact } from "./findContact.js";
import { openApiDocument } from "./openapi.js";
import { rewrite } from "./rewrite.js";

const DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173";

function corsOptions(): cors.CorsOptions {
  const allowed = new Set(
    (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );
  return {
    origin: (origin, callback) => {
      callback(null, !origin || origin.startsWith("chrome-extension://") || allowed.has(origin));
    },
  };
}

export function createApp(db: DatabaseSync) {
  const app = express();
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    try {
      db.prepare("SELECT 1").get();
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ error: "Database unavailable" });
    }
  });

  app.get("/openapi.json", (_req, res) => {
    res.json(openApiDocument);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use("/api/v1", connectionsRouter(db));
  app.use("/api/v1", companyScopesRouter(db));

  app.post("/api/find-contact", async (req: Request, res: Response) => {
    const start = Date.now();
    const body: unknown = req.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.status(400).json({ error: "Body must be a JSON object" });
      return;
    }
    const info = body as Record<string, unknown>;
    const { company, role } = info;
    if (typeof company !== "string" || !company.trim() || typeof role !== "string" || !role.trim()) {
      res.status(400).json({ error: "`company` and `role` are required non-empty strings" });
      return;
    }

    try {
      const result = await findContact(info);
      console.log(
        `find-contact company=${JSON.stringify(company)} role=${JSON.stringify(role)} result=${"email" in result ? "found" : "not-found"} ${Date.now() - start}ms`,
      );
      res.json(result);
    } catch (err) {
      console.error(
        `find-contact company=${JSON.stringify(company)} role=${JSON.stringify(role)} result=error ${Date.now() - start}ms`,
        err,
      );
      res.status(502).json({ error: "Upstream lookup failed" });
    }
  });

  app.post("/api/draft-email", async (req: Request, res: Response) => {
    const start = Date.now();
    const body: unknown = req.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.status(400).json({ error: "Body must be a JSON object" });
      return;
    }
    const info = body as Record<string, unknown>;
    const { company, role, email, label } = info;
    if (
      typeof company !== "string" ||
      !company.trim() ||
      typeof role !== "string" ||
      !role.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof label !== "string" ||
      !label.trim()
    ) {
      res.status(400).json({ error: "`company`, `role`, `email`, and `label` are required non-empty strings" });
      return;
    }

    try {
      const result = await draftEmail(info);
      console.log(
        `draft-email company=${JSON.stringify(company)} role=${JSON.stringify(role)} result=ok ${Date.now() - start}ms`,
      );
      res.json(result);
    } catch (err) {
      console.error(
        `draft-email company=${JSON.stringify(company)} role=${JSON.stringify(role)} result=error ${Date.now() - start}ms`,
        err,
      );
      res.status(502).json({ error: "Upstream draft failed" });
    }
  });

  app.post("/api/rewrite", async (req: Request, res: Response) => {
    const start = Date.now();
    const body: unknown = req.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.status(400).json({ error: "Body must be a JSON object" });
      return;
    }
    const { text, instruction, profile, maxChars } = body as Record<string, unknown>;
    if (typeof text !== "string" || !text.trim() || text.length > 10_000) {
      res.status(400).json({ error: "`text` must be a non-empty string of at most 10000 characters" });
      return;
    }
    if (typeof instruction !== "string" || !instruction.trim() || instruction.length > 500) {
      res.status(400).json({ error: "`instruction` must be a non-empty string of at most 500 characters" });
      return;
    }
    if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
      res.status(400).json({ error: "`profile` must be an object" });
      return;
    }
    const p = profile as Record<string, unknown>;
    if (
      typeof p.name !== "string" ||
      typeof p.school !== "string" ||
      typeof p.highlight !== "string" ||
      typeof p.resume !== "string"
    ) {
      res.status(400).json({ error: "`profile.name`, `school`, `highlight`, and `resume` must be strings" });
      return;
    }
    if (maxChars !== undefined && (!Number.isInteger(maxChars) || (maxChars as number) < 50 || (maxChars as number) > 5000)) {
      res.status(400).json({ error: "`maxChars` must be an integer from 50 to 5000" });
      return;
    }

    const label = `rewrite instruction=${JSON.stringify(instruction.slice(0, 40))}`;
    try {
      const result = await rewrite({
        text,
        instruction,
        profile: { name: p.name, school: p.school, highlight: p.highlight, resume: p.resume },
        maxChars: maxChars as number | undefined,
      });
      console.log(`${label} result=ok ${Date.now() - start}ms`);
      res.json(result);
    } catch (err) {
      console.error(`${label} result=error ${Date.now() - start}ms`, err);
      res.status(502).json({ error: "Upstream rewrite failed" });
    }
  });

  // Body-parser errors (malformed JSON, too large) -> 400/413 instead of default HTML
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Malformed JSON body" });
      return;
    }
    const status = (err as { status?: number })?.status;
    if (status === 413) {
      res.status(413).json({ error: "Body too large" });
      return;
    }
    next(err);
  });

  // Anything else (unexpected errors) -> JSON 500
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("unhandled error", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

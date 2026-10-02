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

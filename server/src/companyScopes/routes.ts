import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { normalizeCompany } from "../connections/normalize.js";
import { companyScopeInputSchema } from "./schema.js";
import { deleteByCompany, getByCompany, upsertScope } from "./repo.js";

export function companyScopesRouter(db: DatabaseSync): Router {
  const router = Router();

  // Express has already URL-decoded req.params.company.
  router.use("/company-scopes/:company", (req, res, next) => {
    if (!normalizeCompany(req.params.company)) {
      res.status(400).json({ error: "`company` must not be blank" });
      return;
    }
    next();
  });

  router.get("/company-scopes/:company", (req, res) => {
    const scope = getByCompany(db, req.params.company);
    if (!scope) {
      res.status(404).json({ error: "Company scope not found" });
      return;
    }
    res.json(scope);
  });

  router.put("/company-scopes/:company", (req, res) => {
    const parsed = companyScopeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        error: "Invalid company scope",
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }
    res.json(upsertScope(db, req.params.company, parsed.data));
  });

  router.delete("/company-scopes/:company", (req, res) => {
    if (!deleteByCompany(db, req.params.company)) {
      res.status(404).json({ error: "Company scope not found" });
      return;
    }
    res.status(204).end();
  });

  return router;
}

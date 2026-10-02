import type { DatabaseSync } from "node:sqlite";
import { normalizeCompany } from "../connections/normalize.js";
import type { CompanyScopeInput } from "./schema.js";

export type CompanyScope = {
  company: string;
  linkedinSlug: string | null;
  linkedinName: string | null;
  linkedinIds: string[];
  resolvedAt: string;
};

type Row = Record<string, unknown>;

function toCompanyScope(r: Row): CompanyScope {
  return {
    company: r.company as string,
    linkedinSlug: (r.linkedin_slug as string | null) ?? null,
    linkedinName: (r.linkedin_name as string | null) ?? null,
    linkedinIds: JSON.parse(r.linkedin_ids as string) as string[],
    resolvedAt: r.resolved_at as string,
  };
}

function blankToNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export function getByCompany(db: DatabaseSync, company: string): CompanyScope | null {
  const row = db.prepare("SELECT * FROM company_scopes WHERE normalized_company = ?").get(normalizeCompany(company));
  return row ? toCompanyScope(row) : null;
}

/** Creates the scope, or overwrites every field of the one with the same normalized company. */
export function upsertScope(db: DatabaseSync, company: string, input: CompanyScopeInput): CompanyScope {
  const normalized = normalizeCompany(company);
  db.prepare(
    `INSERT INTO company_scopes (normalized_company, company, linkedin_slug, linkedin_name, linkedin_ids, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (normalized_company) DO UPDATE SET company = excluded.company, linkedin_slug = excluded.linkedin_slug,
       linkedin_name = excluded.linkedin_name, linkedin_ids = excluded.linkedin_ids, resolved_at = excluded.resolved_at`,
  ).run(
    normalized,
    company.trim().replace(/\s+/g, " "),
    blankToNull(input.linkedinSlug),
    blankToNull(input.linkedinName),
    JSON.stringify(input.linkedinIds),
    new Date().toISOString(),
  );
  return getByCompany(db, company)!;
}

export function deleteByCompany(db: DatabaseSync, company: string): boolean {
  return Number(db.prepare("DELETE FROM company_scopes WHERE normalized_company = ?").run(normalizeCompany(company)).changes) > 0;
}

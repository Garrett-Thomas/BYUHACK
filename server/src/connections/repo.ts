import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ConnectionInput } from "./schema.js";
import { normalizeCompany, normalizeProfileUrl } from "./normalize.js";

export type Mutual = { name: string; profileUrl: string };

export type Connection = {
  id: string;
  source: string;
  sourceProfileUrl: string;
  name: string;
  headline: string | null;
  company: string | null;
  location: string | null;
  degree: "1st" | "2nd" | "3rd" | null;
  notes: string | null;
  tags: string[];
  mutuals: Mutual[];
  mutualCount: number | null;
  capturedAt: string;
  extractorVersion: string;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;

function toConnection(r: Row, tags: string[], mutuals: Mutual[]): Connection {
  return {
    id: r.id as string,
    source: r.source as string,
    sourceProfileUrl: r.source_profile_url as string,
    name: r.name as string,
    headline: (r.headline as string | null) ?? null,
    company: (r.company as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    degree: (r.degree as Connection["degree"]) ?? null,
    notes: (r.notes as string | null) ?? null,
    tags,
    mutuals,
    mutualCount: r.mutual_count === null || r.mutual_count === undefined ? null : Number(r.mutual_count),
    capturedAt: r.captured_at as string,
    extractorVersion: r.extractor_version as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** Builds connections from rows, fetching tags and mutuals for all rows in one query each (no per-row queries). */
function toConnections(db: DatabaseSync, rows: Row[]): Connection[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const placeholders = ids.map(() => "?").join(", ");
  const tagsById = new Map<string, string[]>();
  for (const t of db
    .prepare(`SELECT connection_id, tag FROM connection_tags WHERE connection_id IN (${placeholders}) ORDER BY tag`)
    .all(...ids)) {
    const id = t.connection_id as string;
    if (!tagsById.has(id)) tagsById.set(id, []);
    tagsById.get(id)!.push(t.tag as string);
  }
  const mutualsById = new Map<string, Mutual[]>();
  for (const m of db
    .prepare(
      `SELECT connection_id, name, profile_url FROM connection_mutuals WHERE connection_id IN (${placeholders}) ORDER BY position`,
    )
    .all(...ids)) {
    const id = m.connection_id as string;
    if (!mutualsById.has(id)) mutualsById.set(id, []);
    mutualsById.get(id)!.push({ name: m.name as string, profileUrl: m.profile_url as string });
  }
  return rows.map((r) => toConnection(r, tagsById.get(r.id as string) ?? [], mutualsById.get(r.id as string) ?? []));
}

function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function blankToNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Creates the connection, or overwrites captured fields + tags + mutuals of the one with the same normalized URL. */
export function upsert(db: DatabaseSync, input: ConnectionInput): { status: "created" | "updated"; connection: Connection } {
  const normalizedUrl = normalizeProfileUrl(input.sourceProfileUrl);
  if (!normalizedUrl) throw new Error("Invalid profile URL");
  const company = blankToNull(input.company);
  const normalizedCompany = company ? normalizeCompany(company) || null : null;
  const now = new Date().toISOString();
  const tags = [...new Set(input.tags ?? [])];
  const mutuals = input.mutuals ?? [];

  return inTransaction(db, () => {
    const existing = db
      .prepare("SELECT id FROM connections WHERE normalized_profile_url = ?")
      .get(normalizedUrl) as { id: string } | undefined;
    let id: string;
    let status: "created" | "updated";
    if (existing) {
      id = existing.id;
      status = "updated";
      db.prepare(
        `UPDATE connections SET source = ?, source_profile_url = ?, name = ?, headline = ?, company = ?,
           normalized_company = ?, location = ?, degree = ?, notes = ?, mutual_count = ?, captured_at = ?, extractor_version = ?,
           updated_at = ?
         WHERE id = ?`,
      ).run(
        input.source,
        input.sourceProfileUrl,
        input.name,
        input.headline ?? null,
        company,
        normalizedCompany,
        input.location ?? null,
        input.degree ?? null,
        input.notes ?? null,
        input.mutualCount ?? null,
        input.capturedAt,
        input.extractorVersion,
        now,
        id,
      );
      db.prepare("DELETE FROM connection_tags WHERE connection_id = ?").run(id);
      db.prepare("DELETE FROM connection_mutuals WHERE connection_id = ?").run(id);
    } else {
      id = randomUUID();
      status = "created";
      db.prepare(
        `INSERT INTO connections (id, source, source_profile_url, normalized_profile_url, name, headline, company,
           normalized_company, location, degree, notes, mutual_count, captured_at, extractor_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.source,
        input.sourceProfileUrl,
        normalizedUrl,
        input.name,
        input.headline ?? null,
        company,
        normalizedCompany,
        input.location ?? null,
        input.degree ?? null,
        input.notes ?? null,
        input.mutualCount ?? null,
        input.capturedAt,
        input.extractorVersion,
        now,
        now,
      );
    }
    const insertTag = db.prepare("INSERT INTO connection_tags (connection_id, tag) VALUES (?, ?)");
    for (const tag of tags) insertTag.run(id, tag);
    const insertMutual = db.prepare(
      "INSERT INTO connection_mutuals (connection_id, position, name, profile_url) VALUES (?, ?, ?, ?)",
    );
    mutuals.forEach((m, position) => insertMutual.run(id, position, m.name, m.profileUrl));
    return { status, connection: getById(db, id)! };
  });
}

export function findByCompany(
  db: DatabaseSync,
  company: string,
  limit: number,
  offset: number,
): { data: Connection[]; total: number } {
  const normalized = normalizeCompany(company);
  const total = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM connections WHERE normalized_company = ?").get(normalized) as { n: number }).n,
  );
  const rows = db
    .prepare(
      "SELECT * FROM connections WHERE normalized_company = ? ORDER BY captured_at DESC, id LIMIT ? OFFSET ?",
    )
    .all(normalized, limit, offset);
  return { data: toConnections(db, rows), total };
}

export function getById(db: DatabaseSync, id: string): Connection | null {
  const row = db.prepare("SELECT * FROM connections WHERE id = ?").get(id);
  return row ? toConnections(db, [row])[0] : null;
}

export function deleteById(db: DatabaseSync, id: string): boolean {
  return Number(db.prepare("DELETE FROM connections WHERE id = ?").run(id).changes) > 0;
}

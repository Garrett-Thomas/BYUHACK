import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { migrations } from "./migrations.js";

const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Resolves DATABASE_PATH relative to the server/ directory; ":memory:" passes through. */
export function resolveDatabasePath(path: string | undefined): string {
  const p = path?.trim() || "./data/warmline.db";
  return p === ":memory:" ? p : resolve(SERVER_DIR, p);
}

function runMigrations(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((r) => Number(r.version)),
  );
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  runMigrations(db);
  db.prepare("DELETE FROM idempotency_keys WHERE created_at < ?").run(
    new Date(Date.now() - IDEMPOTENCY_TTL_MS).toISOString(),
  );
  return db;
}

export type Migration = { version: number; name: string; sql: string };

export const migrations: Migration[] = [
  {
    version: 1,
    name: "connections",
    sql: `
      CREATE TABLE connections (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        source_profile_url TEXT NOT NULL,
        normalized_profile_url TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        headline TEXT,
        company TEXT,
        normalized_company TEXT,
        location TEXT,
        notes TEXT,
        captured_at TEXT NOT NULL,
        extractor_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_connections_normalized_company ON connections (normalized_company);
      CREATE INDEX idx_connections_captured_at ON connections (captured_at);

      CREATE TABLE connection_tags (
        connection_id TEXT NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (connection_id, tag)
      );

      CREATE TABLE idempotency_keys (
        key TEXT PRIMARY KEY,
        status_code INTEGER NOT NULL,
        response_body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: "connection_degree",
    sql: `
      ALTER TABLE connections ADD COLUMN degree TEXT;
    `,
  },
  {
    version: 3,
    name: "company_scopes",
    sql: `
      CREATE TABLE company_scopes (
        normalized_company TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        linkedin_slug TEXT,
        linkedin_name TEXT,
        linkedin_ids TEXT NOT NULL,
        resolved_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 4,
    name: "connection_mutuals",
    sql: `
      ALTER TABLE connections ADD COLUMN mutual_count INTEGER;

      CREATE TABLE connection_mutuals (
        connection_id TEXT NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        profile_url TEXT NOT NULL,
        PRIMARY KEY (connection_id, position)
      );
    `,
  },
];

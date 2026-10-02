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
];

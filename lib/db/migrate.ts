import type Database from "better-sqlite3";

/** Idempotent DDL matching ./schema.ts. Bump SCHEMA_VERSION and append statements for changes. */
export const SCHEMA_VERSION = 1;

const DDL = `
CREATE TABLE IF NOT EXISTS api_cache (
  key TEXT PRIMARY KEY, service TEXT NOT NULL, payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS api_cache_expires ON api_cache(expires_at);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, status TEXT NOT NULL,
  started_at INTEGER NOT NULL, finished_at INTEGER, detail TEXT, error TEXT
);

CREATE TABLE IF NOT EXISTS gsc_daily (
  date TEXT NOT NULL, search_type TEXT NOT NULL, clicks INTEGER NOT NULL, impressions INTEGER NOT NULL,
  ctr REAL NOT NULL, position REAL NOT NULL, PRIMARY KEY (date, search_type)
);

CREATE TABLE IF NOT EXISTS gsc_query_page_daily (
  date TEXT NOT NULL, query TEXT NOT NULL, page TEXT NOT NULL, clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL, position REAL NOT NULL, PRIMARY KEY (date, query, page)
);
CREATE INDEX IF NOT EXISTS gsc_qpd_query ON gsc_query_page_daily(query, date);
CREATE INDEX IF NOT EXISTS gsc_qpd_page ON gsc_query_page_daily(page, date);

CREATE TABLE IF NOT EXISTS ga4_channel_daily (
  date TEXT NOT NULL, channel TEXT NOT NULL, sessions INTEGER NOT NULL, engaged_sessions INTEGER NOT NULL,
  new_users INTEGER NOT NULL, key_events REAL NOT NULL, revenue REAL NOT NULL, transactions INTEGER NOT NULL,
  PRIMARY KEY (date, channel)
);

CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, title TEXT NOT NULL, note TEXT,
  category TEXT NOT NULL, source TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS annotations_date ON annotations(date);

CREATE TABLE IF NOT EXISTS targets (
  month TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY (month, metric)
);

CREATE TABLE IF NOT EXISTS saved_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, path TEXT NOT NULL, query TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunity_status (
  key TEXT PRIMARY KEY, status TEXT NOT NULL, note TEXT, updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS insight_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, date TEXT NOT NULL,
  module TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS inspections (url TEXT PRIMARY KEY, result TEXT NOT NULL, inspected_at INTEGER NOT NULL);
`;

export function migrate(db: Database.Database) {
  db.exec(DDL);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * SQLite schema (Drizzle). DDL lives in ./migrate.ts and is applied idempotently on open.
 * Dates are ISO YYYY-MM-DD strings in Asia/Calcutta; timestamps are epoch ms.
 */

/** Response cache for every GA4 / GSC request (keyed by a hash of the request). */
export const apiCache = sqliteTable("api_cache", {
  key: text("key").primaryKey(),
  service: text("service").notNull(),
  payload: text("payload").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // backfill | incremental
  status: text("status").notNull(), // running | ok | error
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  detail: text("detail"), // JSON: rows per table, ranges
  error: text("error"),
});

/** GSC property totals per day and search type (includes anonymized queries). */
export const gscDaily = sqliteTable(
  "gsc_daily",
  {
    date: text("date").notNull(),
    searchType: text("search_type").notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    ctr: real("ctr").notNull(),
    position: real("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.searchType] })],
);

/** GSC web rows per day × query × page (anonymized queries excluded by Google). */
export const gscQueryPageDaily = sqliteTable(
  "gsc_query_page_daily",
  {
    date: text("date").notNull(),
    query: text("query").notNull(),
    page: text("page").notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    position: real("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.query, t.page] })],
);

/** GA4 additive metrics per day × default channel group. */
export const ga4ChannelDaily = sqliteTable(
  "ga4_channel_daily",
  {
    date: text("date").notNull(),
    channel: text("channel").notNull(),
    sessions: integer("sessions").notNull(),
    engagedSessions: integer("engaged_sessions").notNull(),
    newUsers: integer("new_users").notNull(),
    keyEvents: real("key_events").notNull(),
    revenue: real("revenue").notNull(),
    transactions: integer("transactions").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.channel] })],
);

export const annotations = sqliteTable("annotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  title: text("title").notNull(),
  note: text("note"),
  category: text("category").notNull(), // launch | campaign | google_update | tracking | other
  source: text("source").notNull(), // user | seed
  enabled: integer("enabled").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const targets = sqliteTable(
  "targets",
  {
    month: text("month").notNull(), // YYYY-MM
    metric: text("metric").notNull(), // sessions | keyEvents | revenue | organicClicks
    value: real("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.month, t.metric] })],
);

export const savedViews = sqliteTable("saved_views", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  query: text("query").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const opportunityStatus = sqliteTable("opportunity_status", {
  key: text("key").primaryKey(),
  status: text("status").notNull(), // new | in_progress | done | ignored
  note: text("note"),
  updatedAt: integer("updated_at").notNull(),
});

export const insightHistory = sqliteTable("insight_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  date: text("date").notNull(),
  module: text("module").notNull(),
  severity: text("severity").notNull(), // info | low | medium | high
  title: text("title").notNull(),
  body: text("body").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
});

export const inspections = sqliteTable("inspections", {
  url: text("url").primaryKey(),
  result: text("result").notNull(), // JSON
  inspectedAt: integer("inspected_at").notNull(),
});

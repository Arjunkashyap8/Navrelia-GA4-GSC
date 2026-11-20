import "server-only";
import { getEnv } from "@/lib/env";
import { getSqlite } from "@/lib/db/client";
import { purgeExpiredCache } from "@/lib/cache";
import { reportRows, runReport } from "@/lib/google/ga4";
import { queryAllSearchAnalytics, resolveSite, type GscSearchType } from "@/lib/google/gsc";
import { toSafeError } from "@/lib/google/errors";
import { addDays, addMonths, ga4DateToIso, todayInTimeZone } from "@/lib/metrics/periods";

/**
 * Daily snapshot sync.
 * - First run: backfill 16 months (the GSC API maximum) for GSC and GA4.
 * - Afterwards: incremental — re-fetch the last 5 days on every run, because GA4 revises data
 *   for up to 72 h and GSC's freshest days are preliminary.
 * Snapshots let history, new/lost queries, decay and anomaly detection keep working as
 * Google's 16-month window rolls forward.
 */

export type SyncKind = "backfill" | "incremental";

export interface SyncSummary {
  kind: SyncKind;
  range: { start: string; end: string };
  rows: Record<string, number>;
  warnings: string[];
}

const INCREMENTAL_DAYS = 5;
const SEARCH_TYPES: GscSearchType[] = ["web", "image", "video", "news", "discover"];

const g = globalThis as unknown as { __navreliaSyncRunning?: Promise<SyncSummary> };

export function isSyncRunning() {
  return Boolean(g.__navreliaSyncRunning);
}

export function lastSuccessfulSync(): { finishedAt: number; kind: string } | null {
  const row = getSqlite()
    .prepare("SELECT finished_at, kind FROM sync_runs WHERE status = 'ok' ORDER BY finished_at DESC LIMIT 1")
    .get() as { finished_at: number; kind: string } | undefined;
  return row ? { finishedAt: row.finished_at, kind: row.kind } : null;
}

export function recentSyncRuns(limit = 10) {
  return getSqlite()
    .prepare("SELECT id, kind, status, started_at, finished_at, detail, error FROM sync_runs ORDER BY id DESC LIMIT ?")
    .all(limit) as {
    id: number;
    kind: string;
    status: string;
    started_at: number;
    finished_at: number | null;
    detail: string | null;
    error: string | null;
  }[];
}

function hasCompletedBackfill() {
  return Boolean(
    getSqlite().prepare("SELECT 1 FROM sync_runs WHERE kind = 'backfill' AND status = 'ok' LIMIT 1").get(),
  );
}

export function runSync(opts: { force?: SyncKind } = {}): Promise<SyncSummary> {
  if (g.__navreliaSyncRunning) return g.__navreliaSyncRunning;
  const p = doSync(opts).finally(() => {
    g.__navreliaSyncRunning = undefined;
  });
  g.__navreliaSyncRunning = p;
  return p;
}

/** Split [start, end] into calendar-month chunks to keep GSC responses small. */
function monthChunks(start: string, end: string) {
  const chunks: { start: string; end: string }[] = [];
  let s = start;
  while (s <= end) {
    const nextMonth = addMonths(`${s.slice(0, 7)}-01`, 1);
    const e = addDays(nextMonth, -1) < end ? addDays(nextMonth, -1) : end;
    chunks.push({ start: s, end: e });
    s = nextMonth;
  }
  return chunks;
}

async function doSync(opts: { force?: SyncKind }): Promise<SyncSummary> {
  const db = getSqlite();
  const env = getEnv();
  const today = todayInTimeZone(env.REPORT_TIMEZONE);
  const kind: SyncKind = opts.force ?? (hasCompletedBackfill() ? "incremental" : "backfill");
  const range =
    kind === "backfill"
      ? { start: addDays(addMonths(today, -16), 1), end: today }
      : { start: addDays(today, -INCREMENTAL_DAYS), end: today };

  const runId = Number(
    db.prepare("INSERT INTO sync_runs (kind, status, started_at) VALUES (?, 'running', ?)").run(kind, Date.now())
      .lastInsertRowid,
  );
  const summary: SyncSummary = { kind, range, rows: {}, warnings: [] };

  try {
    await syncGsc(range, summary);
    await syncGa4(range, summary);
    summary.rows.cachePurged = purgeExpiredCache();
    db.prepare("UPDATE sync_runs SET status = 'ok', finished_at = ?, detail = ? WHERE id = ?").run(
      Date.now(),
      JSON.stringify(summary),
      runId,
    );
    return summary;
  } catch (err) {
    const safe = toSafeError(err);
    db.prepare("UPDATE sync_runs SET status = 'error', finished_at = ?, detail = ?, error = ? WHERE id = ?").run(
      Date.now(),
      JSON.stringify(summary),
      safe.message,
      runId,
    );
    throw err;
  }
}

async function syncGsc(range: { start: string; end: string }, summary: SyncSummary) {
  const db = getSqlite();
  const { siteUrl } = await resolveSite();

  // 1) Property totals per day for each search type (true totals, incl. anonymized queries).
  const insTotal = db.prepare(
    "INSERT OR REPLACE INTO gsc_daily (date, search_type, clicks, impressions, ctr, position) VALUES (?, ?, ?, ?, ?, ?)",
  );
  let totals = 0;
  for (const type of SEARCH_TYPES) {
    try {
      const rows = await queryAllSearchAnalytics(siteUrl, {
        startDate: range.start,
        endDate: range.end,
        dimensions: ["date"],
        type,
        dataState: "all",
      });
      db.transaction(() => {
        db.prepare("DELETE FROM gsc_daily WHERE search_type = ? AND date BETWEEN ? AND ?").run(type, range.start, range.end);
        for (const r of rows) insTotal.run(r.keys?.[0], type, r.clicks, r.impressions, r.ctr, r.position);
      })();
      totals += rows.length;
    } catch (err) {
      summary.warnings.push(`GSC ${type} totals: ${toSafeError(err).message}`);
    }
  }
  summary.rows.gsc_daily = totals;

  // 2) Web rows per day × query × page, month by month.
  const insQp = db.prepare(
    "INSERT OR REPLACE INTO gsc_query_page_daily (date, query, page, clicks, impressions, position) VALUES (?, ?, ?, ?, ?, ?)",
  );
  let qp = 0;
  for (const chunk of monthChunks(range.start, range.end)) {
    const rows = await queryAllSearchAnalytics(siteUrl, {
      startDate: chunk.start,
      endDate: chunk.end,
      dimensions: ["date", "query", "page"],
      type: "web",
      dataState: "all",
    });
    db.transaction(() => {
      db.prepare("DELETE FROM gsc_query_page_daily WHERE date BETWEEN ? AND ?").run(chunk.start, chunk.end);
      for (const r of rows) {
        const [date, query, page] = r.keys ?? [];
        if (date && query && page) insQp.run(date, query, page, r.clicks, r.impressions, r.position);
      }
    })();
    qp += rows.length;
  }
  summary.rows.gsc_query_page_daily = qp;
}

async function syncGa4(range: { start: string; end: string }, summary: SyncSummary) {
  const db = getSqlite();
  const ins = db.prepare(
    `INSERT OR REPLACE INTO ga4_channel_daily
     (date, channel, sessions, engaged_sessions, new_users, key_events, revenue, transactions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const all: Record<string, string | number>[] = [];
  const PAGE = 100_000;
  for (let offset = 0; ; offset += PAGE) {
    const res = await runReport({
      dateRanges: [{ startDate: range.start, endDate: range.end }],
      dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
      metrics: [
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "newUsers" },
        { name: "keyEvents" },
        { name: "purchaseRevenue" },
        { name: "transactions" },
      ],
      limit: PAGE,
      offset,
    });
    const rows = reportRows(res);
    all.push(...rows);
    if (rows.length < PAGE || all.length >= (res.rowCount ?? 0)) break;
  }
  db.transaction(() => {
    db.prepare("DELETE FROM ga4_channel_daily WHERE date BETWEEN ? AND ?").run(range.start, range.end);
    for (const r of all) {
      ins.run(
        ga4DateToIso(String(r.date)),
        String(r.sessionDefaultChannelGroup || "(not set)"),
        Number(r.sessions),
        Number(r.engagedSessions),
        Number(r.newUsers),
        Number(r.keyEvents),
        Number(r.purchaseRevenue),
        Number(r.transactions),
      );
    }
  })();
  summary.rows.ga4_channel_daily = all.length;
}

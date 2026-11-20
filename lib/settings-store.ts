import "server-only";
import { getEnv } from "@/lib/env";
import { getSqlite } from "@/lib/db/client";
import type { NumberSystem } from "@/lib/metrics/format";

/** Small typed key/value settings stored in SQLite, with env defaults. */

export interface GroupRule {
  name: string;
  pattern: string;
}

export interface AppSettings {
  brandTerms: string[];
  groupRules: GroupRule[];
  numberSystem: NumberSystem;
  showGoogleUpdates: boolean;
  digestEmail: string;
}

function read<T>(key: string): T | undefined {
  const row = getSqlite().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return undefined;
  }
}

export function getSettings(): AppSettings {
  return {
    brandTerms: read<string[]>("brandTerms") ?? getEnv().BRAND_TERMS,
    groupRules: read<GroupRule[]>("groupRules") ?? [],
    numberSystem: read<NumberSystem>("numberSystem") ?? "indian",
    showGoogleUpdates: read<boolean>("showGoogleUpdates") ?? true,
    digestEmail: read<string>("digestEmail") ?? "",
  };
}

export function saveSettings(patch: Partial<AppSettings>) {
  const stmt = getSqlite().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  getSqlite().transaction(() => {
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) stmt.run(k, JSON.stringify(v));
  })();
}

export type TargetMetric = "sessions" | "keyEvents" | "revenue" | "organicClicks";
export const TARGET_METRICS: { id: TargetMetric; label: string }[] = [
  { id: "sessions", label: "Sessions" },
  { id: "keyEvents", label: "Key events" },
  { id: "revenue", label: "Revenue (₹)" },
  { id: "organicClicks", label: "Organic clicks" },
];

export function getTargets(month: string): Partial<Record<TargetMetric, number>> {
  const rows = getSqlite().prepare("SELECT metric, value FROM targets WHERE month = ?").all(month) as {
    metric: TargetMetric;
    value: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.metric, r.value]));
}

export function listTargets() {
  return getSqlite().prepare("SELECT month, metric, value FROM targets ORDER BY month DESC, metric").all() as {
    month: string;
    metric: TargetMetric;
    value: number;
  }[];
}

export function setTarget(month: string, metric: TargetMetric, value: number | null) {
  const db = getSqlite();
  if (value === null) db.prepare("DELETE FROM targets WHERE month = ? AND metric = ?").run(month, metric);
  else db.prepare("INSERT OR REPLACE INTO targets (month, metric, value) VALUES (?, ?, ?)").run(month, metric, value);
}

export interface Annotation {
  id: number;
  date: string;
  title: string;
  note: string | null;
  category: string;
  source: string;
  enabled: number;
}

export function listAnnotations(range?: { start: string; end: string }, includeDisabled = false): Annotation[] {
  const { showGoogleUpdates } = getSettings();
  const rows = getSqlite()
    .prepare(
      range
        ? "SELECT * FROM annotations WHERE date BETWEEN ? AND ? ORDER BY date"
        : "SELECT * FROM annotations ORDER BY date DESC",
    )
    .all(...(range ? [range.start, range.end] : [])) as Annotation[];
  if (includeDisabled) return rows;
  return rows.filter((a) => a.enabled && (showGoogleUpdates || a.category !== "google_update"));
}

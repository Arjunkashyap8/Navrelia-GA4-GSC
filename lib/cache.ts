import "server-only";
import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
import { getSqlite } from "@/lib/db/client";
import { addDays, todayInTimeZone } from "@/lib/metrics/periods";

/**
 * SQLite-backed response cache with in-flight de-duplication.
 *
 * TTL policy (master plan §3):
 * - realtime: 60 s
 * - any range touching the last 3 days (GA4 revises data for up to 72 h; GSC is preliminary): 15 min
 * - closed historical ranges: 24 h
 */

export const TTL = {
  realtime: 60_000,
  recent: 15 * 60_000,
  closed: 24 * 60 * 60_000,
} as const;

export function ttlForRangeEnd(endDate: string): number {
  const today = todayInTimeZone(getEnv().REPORT_TIMEZONE);
  return endDate >= addDays(today, -3) ? TTL.recent : TTL.closed;
}

const inflight = new Map<string, Promise<unknown>>();

export function cacheKey(service: string, request: unknown): string {
  return `${service}:${createHash("sha256").update(JSON.stringify(request)).digest("hex").slice(0, 40)}`;
}

export interface CachedResult<T> {
  value: T;
  fetchedAt: number;
  fromCache: boolean;
}

export async function cached<T>(
  service: string,
  request: unknown,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<CachedResult<T>> {
  const key = cacheKey(service, request);
  const db = getSqlite();
  const now = Date.now();
  const row = db
    .prepare("SELECT payload, fetched_at FROM api_cache WHERE key = ? AND expires_at > ?")
    .get(key, now) as { payload: string; fetched_at: number } | undefined;
  if (row) return { value: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at, fromCache: true };

  const pending = inflight.get(key) as Promise<CachedResult<T>> | undefined;
  if (pending) return pending;

  const p = (async () => {
    const value = await fetcher();
    const fetchedAt = Date.now();
    db.prepare(
      "INSERT OR REPLACE INTO api_cache (key, service, payload, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).run(key, service, JSON.stringify(value), fetchedAt, fetchedAt + ttlMs);
    return { value, fetchedAt, fromCache: false };
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function purgeExpiredCache() {
  return getSqlite().prepare("DELETE FROM api_cache WHERE expires_at < ?").run(Date.now()).changes;
}

export function clearCache() {
  return getSqlite().prepare("DELETE FROM api_cache").run().changes;
}

import "server-only";
import { getEnv } from "@/lib/env";
import { todayInTimeZone } from "@/lib/metrics/periods";
import type { Ga4Quota } from "./connection-types";
import type { GoogleService } from "./http";

/**
 * In-process API usage tracking (per IST day). GA4 returns authoritative quota in
 * `propertyQuota`; GSC has no quota API, so we count our own calls against its limits.
 * Persisted to SQLite from step 3 onwards; memory is enough for the status panel today.
 */
interface UsageState {
  date: string;
  calls: Partial<Record<GoogleService, number>>;
  ga4Quota: Ga4Quota | null;
  ga4QuotaAt: string | null;
}

const g = globalThis as unknown as { __navreliaUsage?: UsageState };

function state(): UsageState {
  const today = todayInTimeZone(getEnv().REPORT_TIMEZONE);
  if (!g.__navreliaUsage || g.__navreliaUsage.date !== today) {
    g.__navreliaUsage = {
      date: today,
      calls: {},
      ga4Quota: g.__navreliaUsage?.ga4Quota ?? null,
      ga4QuotaAt: g.__navreliaUsage?.ga4QuotaAt ?? null,
    };
  }
  return g.__navreliaUsage;
}

export function recordCall(service: GoogleService) {
  const s = state();
  s.calls[service] = (s.calls[service] ?? 0) + 1;
}

export function recordGa4Quota(quota: Ga4Quota) {
  const s = state();
  s.ga4Quota = quota;
  s.ga4QuotaAt = new Date().toISOString();
}

export function getUsage() {
  const s = state();
  return { date: s.date, calls: { ...s.calls }, ga4Quota: s.ga4Quota, ga4QuotaAt: s.ga4QuotaAt };
}

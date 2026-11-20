import "server-only";
import { getEnv, getGoogleCredentials, type Env, type GoogleClient } from "@/lib/env";
import { addDays, ga4DateToIso, todayInTimeZone } from "@/lib/metrics/periods";
import { getProperty, listCustomDimensions, listKeyEvents } from "./admin";
import { getToken, invalidateToken } from "./auth";
import { toSafeError } from "./errors";
import { lastSuccessfulSync } from "@/lib/sync/sync";
import type {
  CheckResult,
  ConnectionReport,
  Ga4DataProbe,
  Ga4Report,
  GscReport,
  TokenInfo,
} from "./connection-types";
import { getMetadata, reportRows, runReport } from "./ga4";
import { listSitemaps, querySearchAnalytics, resolveSite } from "./gsc";
import { GoogleApiError } from "./http";
import { inspectionBudget } from "./inspection";
import { getUsage } from "./usage";

/**
 * Live connection check used by Settings → Connection status and the top-bar freshness badge.
 * Each step is timed and isolated: one failure never hides the others. Cached for 5 minutes.
 */

const TTL_MS = 5 * 60_000;

const SCOPES: Record<GoogleClient, { required: string; satisfiedBy: string[] }> = {
  ga4: {
    required: "https://www.googleapis.com/auth/analytics.readonly",
    satisfiedBy: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics",
    ],
  },
  gsc: {
    required: "https://www.googleapis.com/auth/webmasters.readonly",
    satisfiedBy: [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/webmasters",
    ],
  },
};

const TZ_ALIASES = new Set(["Asia/Calcutta", "Asia/Kolkata"]);

const g = globalThis as unknown as {
  __navreliaConn?: { report: ConnectionReport; at: number };
  __navreliaConnInflight?: Promise<ConnectionReport>;
};

export { toSafeError };

export async function getConnectionReport({ refresh = false } = {}): Promise<ConnectionReport> {
  const hit = g.__navreliaConn;
  if (!refresh && hit && Date.now() - hit.at < TTL_MS) return { ...hit.report, cached: true };
  if (g.__navreliaConnInflight) return g.__navreliaConnInflight;
  const p = buildReport(refresh)
    .then((report) => {
      g.__navreliaConn = { report, at: Date.now() };
      return report;
    })
    .finally(() => {
      g.__navreliaConnInflight = undefined;
    });
  g.__navreliaConnInflight = p;
  return p;
}

async function timed<T>(fn: () => Promise<T>): Promise<CheckResult<T>> {
  const t0 = performance.now();
  try {
    const data = await fn();
    return { status: "ok", data, ms: Math.round(performance.now() - t0) };
  } catch (err) {
    return { status: "error", error: toSafeError(err), ms: Math.round(performance.now() - t0) };
  }
}

const skipped = (reason: string) => ({ status: "skipped", reason }) as const;

async function tokenInfo(client: GoogleClient, forceRefresh: boolean): Promise<TokenInfo> {
  // Re-check means re-prove the refresh token still works, not just reuse the cached access token.
  if (forceRefresh) invalidateToken(client);
  const t = await getToken(client);
  const { satisfiedBy, required } = SCOPES[client];
  const ok = t.scopes.length === 0 || t.scopes.some((s) => satisfiedBy.includes(s));
  return {
    scopes: t.scopes,
    missingScopes: ok ? [] : [required],
    expiresInSec: Math.max(0, Math.round((t.expiresAt - Date.now()) / 1000)),
  };
}

async function buildReport(refresh: boolean): Promise<ConnectionReport> {
  const env = getEnv();
  const [ga4, gsc] = await Promise.all([checkGa4(env, refresh), checkGsc(env, refresh)]);
  const usage = getUsage();
  const budget = inspectionBudget();
  return {
    checkedAt: new Date().toISOString(),
    timeZone: env.REPORT_TIMEZONE,
    currency: env.REPORT_CURRENCY,
    ga4,
    gsc,
    usage: {
      date: usage.date,
      calls: usage.calls as Record<string, number>,
      ga4Quota: usage.ga4Quota,
      ga4QuotaAt: usage.ga4QuotaAt,
      inspectionsToday: budget.usedToday,
      inspectionDailyLimit: budget.dailyLimit,
    },
    lastSync: (() => {
      const l = lastSuccessfulSync();
      return l ? new Date(l.finishedAt).toISOString() : null;
    })(),
    cached: false,
  };
}

async function checkGa4(env: Env, refresh: boolean): Promise<Ga4Report> {
  const creds = getGoogleCredentials("ga4");
  const base = { configured: creds.ok, missing: creds.ok ? [] : creds.missing, propertyId: env.GA4_PROPERTY_ID };
  const token = await timed(() => tokenInfo("ga4", refresh));
  if (token.status !== "ok") {
    const s = skipped("Skipped — no GA4 access token.");
    return { ...base, token, property: s, keyEvents: s, customDimensions: s, metadata: s, data: s };
  }

  const [property, keyEvents, customDimensions, metadata, data] = await Promise.all([
    timed(async () => {
      const p = await getProperty();
      return {
        displayName: p.displayName,
        timeZone: p.timeZone ?? null,
        currencyCode: p.currencyCode ?? null,
        createTime: p.createTime ?? null,
        industryCategory: p.industryCategory ?? null,
        timeZoneMatches:
          p.timeZone === env.REPORT_TIMEZONE ||
          (TZ_ALIASES.has(p.timeZone ?? "") && TZ_ALIASES.has(env.REPORT_TIMEZONE)),
        currencyMatches: p.currencyCode === env.REPORT_CURRENCY,
      };
    }),
    timed(async () => ({
      events: (await listKeyEvents()).map((e) => ({
        name: e.eventName,
        countingMethod: e.countingMethod ?? null,
        custom: e.custom ?? false,
      })),
    })),
    timed(async () => {
      const dims = await listCustomDimensions();
      return { count: dims.length, names: dims.map((d) => d.displayName ?? d.parameterName) };
    }),
    timed(async () => {
      const m = await getMetadata();
      const all = [...(m.dimensions ?? []), ...(m.metrics ?? [])];
      return {
        dimensions: m.dimensions?.length ?? 0,
        metrics: m.metrics?.length ?? 0,
        customDefinitions: all.filter((x) => x.customDefinition).length,
        ecommerceMetrics: (m.metrics ?? []).some((x) => x.apiName === "purchaseRevenue"),
      };
    }),
    timed(probeGa4Data),
  ]);

  return { ...base, token, property, keyEvents, customDimensions, metadata, data };
}

async function probeGa4Data(): Promise<Ga4DataProbe> {
  const run = (keyEventMetric: "keyEvents" | "conversions") =>
    runReport({
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: keyEventMetric }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });

  let keyEventMetric: "keyEvents" | "conversions" = "keyEvents";
  let res;
  try {
    res = await run("keyEvents");
  } catch (err) {
    // Fallback for properties/API versions that still expose only `conversions`.
    if (!(err instanceof GoogleApiError) || err.status !== 400 || !/keyEvents/i.test(err.message)) throw err;
    keyEventMetric = "conversions";
    res = await run("conversions");
  }

  const days = reportRows(res).map((r) => ({
    date: ga4DateToIso(String(r.date)),
    sessions: Number(r.sessions),
    users: Number(r.totalUsers),
    keyEvents: Number(r[keyEventMetric]),
  }));
  const withData = days.filter((d) => d.sessions > 0);
  return {
    dataThrough: withData.length ? withData[withData.length - 1]!.date : null,
    days,
    keyEventMetric,
    thresholded: res.metadata?.subjectToThresholding ?? false,
    sampled: (res.metadata?.samplingMetadatas?.length ?? 0) > 0,
    quota: res.propertyQuota ?? null,
  };
}

async function checkGsc(env: Env, refresh: boolean): Promise<GscReport> {
  const creds = getGoogleCredentials("gsc");
  const base = { configured: creds.ok, missing: creds.ok ? [] : creds.missing };
  const token = await timed(() => tokenInfo("gsc", refresh));
  if (token.status !== "ok") {
    const s = skipped("Skipped — no Search Console access token.");
    return { ...base, token, site: s, data: s, sitemaps: s };
  }

  const site = await timed(async () => {
    const r = await resolveSite({ refresh });
    return {
      siteUrl: r.siteUrl,
      permissionLevel: r.permissionLevel ?? null,
      source: r.source,
      available: r.available.map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel ?? null })),
    };
  });
  if (site.status !== "ok") {
    const s = skipped("Skipped — Search Console property not resolved.");
    return { ...base, token, site, data: s, sitemaps: s };
  }
  const siteUrl = site.data.siteUrl;

  const [data, sitemaps] = await Promise.all([
    timed(async () => {
      const today = todayInTimeZone(env.REPORT_TIMEZONE);
      const req = { startDate: addDays(today, -10), endDate: today, dimensions: ["date" as const], type: "web" as const };
      const [final, fresh] = await Promise.all([
        querySearchAnalytics(siteUrl, { ...req, dataState: "final" }),
        querySearchAnalytics(siteUrl, { ...req, dataState: "all" }),
      ]);
      const lastDate = (rows: { keys?: string[] }[] | undefined) =>
        (rows ?? []).map((r) => r.keys?.[0] ?? "").filter(Boolean).sort().at(-1) ?? null;
      const finalThrough = lastDate(final.rows);
      return {
        finalThrough,
        freshThrough: lastDate(fresh.rows),
        days: (fresh.rows ?? [])
          .map((r) => {
            const date = r.keys?.[0] ?? "";
            return {
              date,
              clicks: r.clicks,
              impressions: r.impressions,
              ctr: r.ctr,
              position: r.position,
              preliminary: finalThrough === null || date > finalThrough,
            };
          })
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    }),
    timed(async () => {
      const maps = await listSitemaps(siteUrl);
      const downloaded = maps.map((m) => m.lastDownloaded).filter((d): d is string => Boolean(d)).sort();
      return {
        count: maps.length,
        errors: maps.reduce((n, m) => n + (m.errors ?? 0), 0),
        warnings: maps.reduce((n, m) => n + (m.warnings ?? 0), 0),
        lastDownloaded: downloaded.at(-1) ?? null,
      };
    }),
  ]);

  return { ...base, token, site, data, sitemaps };
}

/** Shared (client-safe) types for the connection report. Contains no secrets by construction. */

export interface SafeError {
  message: string;
  code?: string;
  hint?: string;
  httpStatus?: number;
}

export type CheckResult<T> =
  | { status: "ok"; data: T; ms: number }
  | { status: "error"; error: SafeError; ms: number }
  | { status: "skipped"; reason: string };

export interface QuotaPair {
  consumed?: number;
  remaining?: number;
}

export interface Ga4Quota {
  tokensPerDay?: QuotaPair;
  tokensPerHour?: QuotaPair;
  concurrentRequests?: QuotaPair;
  serverErrorsPerProjectPerHour?: QuotaPair;
  potentiallyThresholdedRequestsPerHour?: QuotaPair;
  tokensPerProjectPerHour?: QuotaPair;
}

export interface TokenInfo {
  scopes: string[];
  missingScopes: string[];
  expiresInSec: number;
}

export interface Ga4PropertyInfo {
  displayName: string;
  timeZone: string | null;
  currencyCode: string | null;
  createTime: string | null;
  industryCategory: string | null;
  timeZoneMatches: boolean;
  currencyMatches: boolean;
}

export interface Ga4DataProbe {
  dataThrough: string | null;
  days: { date: string; sessions: number; users: number; keyEvents: number }[];
  keyEventMetric: "keyEvents" | "conversions";
  thresholded: boolean;
  sampled: boolean;
  quota: Ga4Quota | null;
}

export interface Ga4Report {
  configured: boolean;
  missing: string[];
  propertyId: string;
  token: CheckResult<TokenInfo>;
  property: CheckResult<Ga4PropertyInfo>;
  keyEvents: CheckResult<{ events: { name: string; countingMethod: string | null; custom: boolean }[] }>;
  customDimensions: CheckResult<{ count: number; names: string[] }>;
  metadata: CheckResult<{ dimensions: number; metrics: number; customDefinitions: number; ecommerceMetrics: boolean }>;
  data: CheckResult<Ga4DataProbe>;
}

export interface GscReport {
  configured: boolean;
  missing: string[];
  token: CheckResult<TokenInfo>;
  site: CheckResult<{
    siteUrl: string;
    permissionLevel: string | null;
    source: "env" | "auto";
    available: { siteUrl: string; permissionLevel: string | null }[];
  }>;
  data: CheckResult<{
    finalThrough: string | null;
    freshThrough: string | null;
    days: { date: string; clicks: number; impressions: number; ctr: number; position: number; preliminary: boolean }[];
  }>;
  sitemaps: CheckResult<{ count: number; errors: number; warnings: number; lastDownloaded: string | null }>;
}

export interface ConnectionReport {
  checkedAt: string;
  timeZone: string;
  currency: string;
  ga4: Ga4Report;
  gsc: GscReport;
  usage: {
    date: string;
    calls: Record<string, number>;
    ga4Quota: Ga4Quota | null;
    ga4QuotaAt: string | null;
    inspectionsToday: number;
    inspectionDailyLimit: number;
  };
  /** Set once the step-3 sync job runs. */
  lastSync: string | null;
  cached: boolean;
}

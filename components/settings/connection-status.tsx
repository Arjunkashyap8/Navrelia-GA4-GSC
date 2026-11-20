"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  KeyRound,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/tooltip";
import { useConnection } from "@/lib/client/use-connection";
import type { CheckResult, ConnectionReport, Ga4Quota, QuotaPair, SafeError } from "@/lib/google/connection-types";
import { formatNumber, formatPercent, formatPosition } from "@/lib/metrics/format";
import { formatShortDate } from "@/lib/metrics/periods";
import { cn } from "@/lib/utils";

type Overall = "connected" | "partial" | "reconnect" | "not_configured";

function overallOf(configured: boolean, checks: CheckResult<unknown>[]): Overall {
  if (!configured) return "not_configured";
  const first = checks[0];
  if (first?.status === "error") return "reconnect";
  return checks.every((c) => c.status === "ok") ? "connected" : "partial";
}

const OVERALL: Record<Overall, { label: string; tone: "positive" | "warning" | "negative" | "neutral"; icon: React.ReactNode }> = {
  connected: { label: "Connected", tone: "positive", icon: <CheckCircle2 aria-hidden /> },
  partial: { label: "Partially connected", tone: "warning", icon: <AlertTriangle aria-hidden /> },
  reconnect: { label: "Reconnect needed", tone: "negative", icon: <XCircle aria-hidden /> },
  not_configured: { label: "Not configured", tone: "neutral", icon: <CircleDashed aria-hidden /> },
};

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Calcutta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso)) + " IST";
}

function ErrorBox({ error }: { error: SafeError }) {
  return (
    <div className="mt-1.5 rounded-lg border border-red-200 bg-negative-soft px-3 py-2 text-caption text-red-900">
      <p className="font-medium">
        {error.message}
        {error.code && <span className="ml-1 font-mono font-normal text-red-700">[{error.code}]</span>}
      </p>
      {error.hint && <p className="mt-1 text-red-800">{error.hint}</p>}
    </div>
  );
}

function CheckRow({ label, check }: { label: string; check: CheckResult<unknown> }) {
  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        {check.status === "ok" ? (
          <CheckCircle2 className="size-4 text-positive" aria-label="Passed" />
        ) : check.status === "error" ? (
          <XCircle className="size-4 text-negative" aria-label="Failed" />
        ) : (
          <CircleDashed className="size-4 text-slate-400" aria-label="Skipped" />
        )}
        <span className="text-body text-ink">{label}</span>
        <span className="num ml-auto text-caption text-muted">
          {check.status === "skipped" ? "skipped" : `${check.ms} ms`}
        </span>
      </div>
      {check.status === "error" && <ErrorBox error={check.error} />}
    </li>
  );
}

function Field({ label, children, tip }: { label: string; children: React.ReactNode; tip?: string }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 py-1.5">
      <dt className="flex items-center gap-1 text-caption text-muted">
        {label}
        {tip && <InfoTip label={label}>{tip}</InfoTip>}
      </dt>
      <dd className="num min-w-0 break-words text-body text-ink">{children}</dd>
    </div>
  );
}

function QuotaBar({ label, pair }: { label: string; pair?: QuotaPair }) {
  if (!pair || pair.remaining === undefined) return null;
  const consumed = pair.consumed ?? 0;
  const total = consumed + pair.remaining;
  const share = total > 0 ? consumed / total : 0;
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-caption">
        <span className="text-muted">{label}</span>
        <span className="num text-ink">
          {formatNumber(consumed)} used · {formatNumber(pair.remaining)} left
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <div
          className={cn("h-full rounded-full", share > 0.8 ? "bg-negative" : share > 0.5 ? "bg-warning" : "bg-brand-600")}
          style={{ width: `${Math.max(share * 100, 1)}%` }}
        />
      </div>
    </div>
  );
}

function QuotaBlock({ quota }: { quota: Ga4Quota | null }) {
  if (!quota) return <p className="text-caption text-muted">No quota reported yet.</p>;
  return (
    <>
      <QuotaBar label="Tokens per day (property)" pair={quota.tokensPerDay} />
      <QuotaBar label="Tokens per hour (property)" pair={quota.tokensPerHour} />
      <QuotaBar label="Tokens per project per hour" pair={quota.tokensPerProjectPerHour} />
      <QuotaBar label="Potentially thresholded requests / hour" pair={quota.potentiallyThresholdedRequestsPerHour} />
    </>
  );
}

function InvalidGrantCallout({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div role="alert" className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-warning-soft px-4 py-3 text-body text-amber-900">
      <KeyRound className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">Refresh token rejected — reconnect required</p>
        <p className="mt-1 text-caption">
          If the OAuth consent screen is in <strong>Testing</strong> mode, Google expires refresh tokens after 7 days.
          Publish the app (Google Cloud Console → APIs &amp; Services → OAuth consent screen → Publish app), then generate
          a new refresh token and update <code className="font-mono">.env.local</code>.
        </p>
      </div>
    </div>
  );
}

function Scopes({ scopes, missing }: { scopes: string[]; missing: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {scopes.length === 0 && <span className="text-muted">Not reported by Google</span>}
      {scopes.map((s) => (
        <Badge key={s} tone="brand" className="font-mono">
          {s.replace("https://www.googleapis.com/auth/", "")}
        </Badge>
      ))}
      {missing.map((s) => (
        <Badge key={s} tone="negative" className="font-mono">
          missing: {s.replace("https://www.googleapis.com/auth/", "")}
        </Badge>
      ))}
    </div>
  );
}

function ServiceHeader({ title, description, overall }: { title: string; description: string; overall: Overall }) {
  const o = OVERALL[overall];
  return (
    <CardHeader>
      <div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      <Badge tone={o.tone}>
        {o.icon}
        {o.label}
      </Badge>
    </CardHeader>
  );
}

function Ga4Card({ r }: { r: ConnectionReport }) {
  const g = r.ga4;
  const overall = overallOf(g.configured, [g.token, g.property, g.keyEvents, g.customDimensions, g.metadata, g.data]);
  const prop = g.property.status === "ok" ? g.property.data : null;
  const data = g.data.status === "ok" ? g.data.data : null;
  const meta = g.metadata.status === "ok" ? g.metadata.data : null;
  const keyEvents = g.keyEvents.status === "ok" ? g.keyEvents.data.events : null;

  return (
    <Card>
      <ServiceHeader title="Google Analytics 4" description="Data API v1beta + Admin API" overall={overall} />
      <CardContent>
        {!g.configured && (
          <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-body text-muted">
            Add {g.missing.join(", ")} to <code className="font-mono">.env.local</code> and restart the server.
          </p>
        )}
        <InvalidGrantCallout show={g.token.status === "error" && g.token.error.code === "invalid_grant"} />

        <dl className="divide-y divide-line">
          <Field label="Property">
            {prop ? <span className="font-medium">{prop.displayName}</span> : "—"}{" "}
            <span className="font-mono text-caption text-muted">{g.propertyId}</span>
          </Field>
          <Field label="Time zone">
            {prop?.timeZone ?? "—"}{" "}
            {prop && !prop.timeZoneMatches && <Badge tone="warning">differs from REPORT_TIMEZONE ({r.timeZone})</Badge>}
          </Field>
          <Field label="Currency">
            {prop?.currencyCode ?? "—"}{" "}
            {prop && !prop.currencyMatches && <Badge tone="warning">differs from REPORT_CURRENCY ({r.currency})</Badge>}
          </Field>
          <Field label="Data through" tip="Latest day with sessions in the property's time zone. GA4 can revise the last ~72 hours.">
            {data?.dataThrough ? formatShortDate(data.dataThrough) : "—"}
            {data?.thresholded && <Badge tone="warning" className="ml-2">thresholded</Badge>}
            {data?.sampled && <Badge tone="warning" className="ml-2">sampled</Badge>}
          </Field>
          <Field label="Key events" tip="Events marked as key events (formerly 'conversions') in GA4 Admin.">
            {keyEvents === null ? (
              "—"
            ) : keyEvents.length === 0 ? (
              <span className="text-warning">None configured</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {keyEvents.map((e) => (
                  <Badge key={e.name} className="font-mono">
                    {e.name}
                  </Badge>
                ))}
              </div>
            )}
          </Field>
          <Field label="Schema" tip="Dimensions and metrics available to this property, from getMetadata.">
            {meta
              ? `${meta.dimensions} dimensions · ${meta.metrics} metrics · ${meta.customDefinitions} custom`
              : "—"}
            {g.customDimensions.status === "ok" && ` · ${g.customDimensions.data.count} custom dimensions (Admin)`}
          </Field>
          <Field label="Scopes granted">
            {g.token.status === "ok" ? <Scopes scopes={g.token.data.scopes} missing={g.token.data.missingScopes} /> : "—"}
          </Field>
        </dl>

        {data && data.days.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-caption font-medium text-muted">
              Live probe — last 8 days (sessions · users · {data.keyEventMetric === "keyEvents" ? "key events" : "conversions"})
            </p>
            <table className="w-full text-caption">
              <tbody className="divide-y divide-line">
                {data.days.map((d) => (
                  <tr key={d.date}>
                    <td className="py-1 text-muted">{formatShortDate(d.date)}</td>
                    <td className="py-1 text-right">{formatNumber(d.sessions)}</td>
                    <td className="py-1 text-right">{formatNumber(d.users)}</td>
                    <td className="py-1 text-right">{formatNumber(d.keyEvents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-1 text-caption font-medium text-muted">API quota (from the latest response)</p>
          <QuotaBlock quota={data?.quota ?? r.usage.ga4Quota} />
        </div>

        <ul className="mt-4 divide-y divide-line border-t border-line">
          <CheckRow label="OAuth token refresh" check={g.token} />
          <CheckRow label="Admin API · property details" check={g.property} />
          <CheckRow label="Admin API · key events" check={g.keyEvents} />
          <CheckRow label="Admin API · custom dimensions" check={g.customDimensions} />
          <CheckRow label="Data API · getMetadata" check={g.metadata} />
          <CheckRow label="Data API · runReport probe" check={g.data} />
        </ul>
      </CardContent>
    </Card>
  );
}

function GscCard({ r }: { r: ConnectionReport }) {
  const s = r.gsc;
  const overall = overallOf(s.configured, [s.token, s.site, s.data, s.sitemaps]);
  const site = s.site.status === "ok" ? s.site.data : null;
  const data = s.data.status === "ok" ? s.data.data : null;
  const maps = s.sitemaps.status === "ok" ? s.sitemaps.data : null;
  const others = site?.available.filter((a) => a.siteUrl !== site.siteUrl) ?? [];

  return (
    <Card>
      <ServiceHeader title="Google Search Console" description="Search Console API (webmasters v3)" overall={overall} />
      <CardContent>
        {!s.configured && (
          <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-body text-muted">
            Add {s.missing.join(", ")} to <code className="font-mono">.env.local</code> and restart the server.
          </p>
        )}
        <InvalidGrantCallout show={s.token.status === "error" && s.token.error.code === "invalid_grant"} />

        <dl className="divide-y divide-line">
          <Field label="Resolved site" tip="GSC_SITE_URL if set; otherwise the sc-domain property matching SITE_ORIGIN, falling back to a URL-prefix property.">
            {site ? (
              <>
                <span className="font-mono font-medium">{site.siteUrl}</span>{" "}
                <Badge tone={site.source === "auto" ? "info" : "neutral"}>
                  {site.source === "auto" ? "auto-resolved" : "from GSC_SITE_URL"}
                </Badge>
              </>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Permission">{site?.permissionLevel ?? "—"}</Field>
          <Field label="Other properties">
            {others.length ? others.map((o) => o.siteUrl).join(", ") : site ? "None" : "—"}
          </Field>
          <Field
            label="Data through"
            tip="Search Console usually lags 2–3 days. 'Final' data no longer changes; fresher days (dataState: all) are preliminary."
          >
            {data ? (
              <>
                {data.finalThrough ? `Final ${formatShortDate(data.finalThrough)}` : "No final data"}
                {data.freshThrough && data.freshThrough !== data.finalThrough && (
                  <> · preliminary through {formatShortDate(data.freshThrough)}</>
                )}
              </>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Sitemaps">
            {maps
              ? `${maps.count} submitted · ${maps.errors} errors · ${maps.warnings} warnings${maps.lastDownloaded ? ` · last read ${fmtTime(maps.lastDownloaded)}` : ""}`
              : "—"}
          </Field>
          <Field label="Scopes granted">
            {s.token.status === "ok" ? <Scopes scopes={s.token.data.scopes} missing={s.token.data.missingScopes} /> : "—"}
          </Field>
        </dl>

        {data && data.days.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-caption font-medium text-muted">Live probe — web search, daily (clicks · impressions · CTR · position)</p>
            <table className="w-full text-caption">
              <tbody className="divide-y divide-line">
                {data.days.map((d) => (
                  <tr key={d.date}>
                    <td className="py-1 text-muted">
                      {formatShortDate(d.date)}
                      {d.preliminary && <span className="ml-1 text-warning">prelim.</span>}
                    </td>
                    <td className="py-1 text-right">{formatNumber(d.clicks)}</td>
                    <td className="py-1 text-right">{formatNumber(d.impressions)}</td>
                    <td className="py-1 text-right">{formatPercent(d.ctr)}</td>
                    <td className="py-1 text-right">{formatPosition(d.position)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ul className="mt-4 divide-y divide-line border-t border-line">
          <CheckRow label="OAuth token refresh" check={s.token} />
          <CheckRow label="sites.list · property resolution" check={s.site} />
          <CheckRow label="searchAnalytics.query probe" check={s.data} />
          <CheckRow label="sitemaps.list" check={s.sitemaps} />
        </ul>
      </CardContent>
    </Card>
  );
}

function UsageCard({ r }: { r: ConnectionReport }) {
  const calls = Object.entries(r.usage.calls);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Sync &amp; API usage</CardTitle>
          <CardDescription>Calls made by this server today ({r.usage.date}, IST).</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-line">
          <Field label="Last successful sync">
            {r.lastSync ? fmtTime(r.lastSync) : <span className="text-muted">No sync has run yet — the sync job arrives in build step 3.</span>}
          </Field>
          <Field label="Last check">
            {fmtTime(r.checkedAt)} {r.cached && <Badge className="ml-1">cached ≤ 5 min</Badge>}
          </Field>
          <Field label="API calls today">
            {calls.length ? calls.map(([k, v]) => `${k}: ${formatNumber(v)}`).join(" · ") : "None"}
          </Field>
          <Field label="URL inspections" tip="Google allows 2,000/day and 600/minute per property. We cap at 1,900/day.">
            {formatNumber(r.usage.inspectionsToday)} / {formatNumber(r.usage.inspectionDailyLimit)} today
          </Field>
        </dl>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Checking connections">
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardContent className="space-y-3 pt-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ConnectionStatus() {
  const { data, isLoading, isError, error, recheck, rechecking } = useConnection();
  const [recheckError, setRecheckError] = useState<string | null>(null);

  const onRecheck = async () => {
    setRecheckError(null);
    try {
      await recheck();
    } catch (e) {
      setRecheckError(e instanceof Error ? e.message : "Re-check failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onRecheck} disabled={rechecking || isLoading}>
          {rechecking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Re-check now
        </Button>
        {data && <span className="text-caption text-muted">Checked {fmtTime(data.checkedAt)}</span>}
        {recheckError && <span className="text-caption text-negative">{recheckError}</span>}
      </div>

      {isLoading && <LoadingState />}
      {isError && !data && (
        <Card className="border-red-200">
          <CardContent className="flex items-center justify-between gap-4 pt-5">
            <p className="text-body text-red-800">Connection check failed: {error.message}</p>
            <Button onClick={onRecheck}>Retry</Button>
          </CardContent>
        </Card>
      )}
      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Ga4Card r={data} />
            <GscCard r={data} />
          </div>
          <UsageCard r={data} />
        </>
      )}
    </div>
  );
}

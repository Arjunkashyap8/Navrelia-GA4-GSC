import type { Metadata } from "next";
import { BarChart } from "@/components/charts/bar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { KpiCard } from "@/components/kpi/kpi-card";
import { PrintControls } from "@/components/report/print-controls";
import { DataTable } from "@/components/table/data-table";
import { NumberFormatProvider } from "@/components/ui/fmt";
import { getViewContext } from "@/lib/data/context";
import { toParamReader, type RawSearchParams } from "@/lib/filters";
import type { Insight } from "@/lib/insights/types";
import { ratio } from "@/lib/metrics/delta";
import { formatRange } from "@/lib/metrics/periods";
import { getAcquisition } from "@/lib/modules/acquisition";
import { getContent } from "@/lib/modules/content";
import { getConversions } from "@/lib/modules/conversions";
import { getOrganic } from "@/lib/modules/organic";
import { getOverview } from "@/lib/modules/overview";
import { REPORT_MODULES } from "@/lib/report-modules";
import { safe } from "@/lib/safe";

export const metadata: Metadata = { title: "Client report" };
export const dynamic = "force-dynamic";


function Page({ children, title, first = false }: { children: React.ReactNode; title?: string; first?: boolean }) {
  return (
    <section className={first ? "report-page" : "report-page page-break"}>
      {title && <h2 className="mb-4 border-b-2 border-brand-700 pb-2 text-xl font-semibold text-ink">{title}</h2>}
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: Insight[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.text} className="flex gap-2 text-body">
          <span className={i.tone === "positive" ? "text-positive" : i.tone === "negative" ? "text-negative" : i.tone === "action" ? "text-brand-700" : "text-muted"} aria-hidden>
            ●
          </span>
          <span>
            {i.text}
            {i.action && <span className="text-muted"> → {i.action}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const box = "rounded-card border border-line bg-white p-4 avoid-break";

export default async function ReportPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const r = toParamReader(sp);
  const ctx = getViewContext(sp);
  const mods = new Set((r.get("modules") ?? REPORT_MODULES.map((m) => m.id).join(",")).split(","));
  const title = r.get("title") ?? "Monthly performance report";
  const [ov, acq, org, con, conv] = await Promise.all([
    safe(() => getOverview(ctx)),
    mods.has("acquisition") ? safe(() => getAcquisition(ctx, "session")) : null,
    mods.has("organic") ? safe(() => getOrganic(ctx)) : null,
    mods.has("content") ? safe(() => getContent(ctx)) : null,
    mods.has("conversions") ? safe(() => getConversions(ctx)) : null,
  ]);
  const hasCmp = Boolean(ctx.period.comparison);
  const generated = new Date().toLocaleString("en-IN", { timeZone: "Asia/Calcutta", dateStyle: "long", timeStyle: "short" });
  const cmpLabel = ctx.period.comparison ? `${formatRange(ctx.period.comparison)} (${ctx.period.compare === "yoy" ? "same period last year" : "previous period"})` : "none";

  return (
    <NumberFormatProvider system={ctx.settings.numberSystem}>
      <PrintControls autoPrint={r.get("print") === "1"} />
      <main className="report mx-auto max-w-[900px] bg-white px-10 py-10 print:p-0">
        {/* Cover */}
        <section className="report-page flex min-h-[900px] flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-brand-700 text-xl font-bold text-white">N</div>
              <div>
                <p className="text-lg font-semibold text-ink">Navrelia Foods</p>
                <p className="text-body text-muted">navreliafoods.com</p>
              </div>
            </div>
            <h1 className="mt-32 text-4xl font-semibold leading-tight text-ink">{title}</h1>
            <p className="mt-3 text-xl text-brand-800">{formatRange(ctx.period.range)}</p>
            <p className="mt-1 text-body text-muted">Compared with {cmpLabel}</p>
          </div>
          <div className="border-t border-line pt-4 text-caption text-muted">
            <p>Prepared with the Navrelia Search &amp; Analytics Command Center · Google Analytics 4 property 422569923 + Google Search Console</p>
            <p>Generated {generated} IST · Currency INR · Time zone Asia/Kolkata</p>
          </div>
        </section>

        {ov.ok && (
          <Page title="Executive summary">
            <p className="text-[15px] leading-relaxed text-ink">{ov.data.summary}</p>
            {ov.data.health && (
              <p className="text-body">
                <strong>Business health score:</strong> {ov.data.health.score}/100 ({ov.data.health.grade}). {ov.data.health.components.map((c) => `${c.label} ${c.score}`).join(" · ")}
              </p>
            )}
            <div className={box}>
              <h3 className="mb-2 font-semibold">Key points</h3>
              <Bullets items={ov.data.insights} />
            </div>
            {ov.data.ga4t.ok && ov.data.gsct.ok && (
              <div className="grid grid-cols-4 gap-3">
                <KpiCard label="Visitors" value={ov.data.ga4t.data.cur.totalUsers!} previous={hasCmp ? (ov.data.ga4t.data.prev?.totalUsers ?? null) : undefined} />
                <KpiCard label="Sessions" value={ov.data.ga4t.data.cur.sessions!} previous={hasCmp ? (ov.data.ga4t.data.prev?.sessions ?? null) : undefined} />
                <KpiCard label="Orders" value={ov.data.ga4t.data.cur.transactions!} previous={hasCmp ? (ov.data.ga4t.data.prev?.transactions ?? null) : undefined} />
                <KpiCard label="Revenue" format="currencyCompact" value={ov.data.ga4t.data.cur.purchaseRevenue!} previous={hasCmp ? (ov.data.ga4t.data.prev?.purchaseRevenue ?? null) : undefined} />
                <KpiCard label="Engagement rate" format="percent" value={ratio(ov.data.ga4t.data.cur.engagedSessions, ov.data.ga4t.data.cur.sessions)} previous={hasCmp ? ratio(ov.data.ga4t.data.prev?.engagedSessions, ov.data.ga4t.data.prev?.sessions) : undefined} />
                <KpiCard label="Google clicks" value={ov.data.gsct.data.cur.clicks} previous={hasCmp ? (ov.data.gsct.data.prev?.clicks ?? null) : undefined} />
                <KpiCard label="Google impressions" value={ov.data.gsct.data.cur.impressions} previous={hasCmp ? (ov.data.gsct.data.prev?.impressions ?? null) : undefined} />
                <KpiCard label="Avg. position" format="position" polarity="down_good" value={ov.data.gsct.data.cur.position || null} previous={hasCmp ? ov.data.gsct.data.prev?.position || null : undefined} />
              </div>
            )}
            {ov.data.ga4d.ok && ov.data.gscd.ok && (
              <div className={box}>
                <h3 className="mb-2 font-semibold">Daily visits, Google clicks and key events</h3>
                <TrendChart
                  height={260}
                  label="Daily sessions, organic clicks and key events"
                  dates={ov.data.ga4d.data.dates}
                  annotations={ov.data.annotations}
                  series={[
                    { name: "Sessions", data: ov.data.ga4d.data.cur.sessions!, compare: ov.data.ga4d.data.prev?.sessions },
                    { name: "Organic clicks", data: ov.data.gscd.data.cur.clicks! },
                    { name: "Key events", data: ov.data.ga4d.data.cur.keyEvents!, type: "bar", axis: 1 },
                  ]}
                />
              </div>
            )}
          </Page>
        )}

        {acq?.ok && (
          <Page title="Where visitors came from">
            <Bullets items={acq.data.insights} />
            <div className={box}>
              <BarChart label="Sessions by channel" categories={acq.data.channelRows.slice(0, 8).map((c) => c.name!)} series={[{ name: "Sessions", data: acq.data.channelRows.slice(0, 8).map((c) => c.sessions ?? 0) }]} />
            </div>
            <DataTable
              plain
              searchable={false}
              pageSize={12}
              maxHeight={2000}
              columns={[
                { key: "name", label: "Channel" },
                { key: "sessions", label: "Sessions", format: "number", delta: { prevKey: "sessionsPrev" } },
                { key: "conversionRate", label: "Conv. rate", format: "percent" },
                { key: "revenue", label: "Revenue", format: "currency" },
                { key: "revenuePerSession", label: "₹ / session", format: "currency" },
              ]}
              rows={acq.data.channelRows}
            />
          </Page>
        )}

        {org?.ok && (
          <Page title="Google Search (SEO)">
            <Bullets items={org.data.insights} />
            {org.data.daily.ok && (
              <div className={box}>
                <TrendChart
                  height={240}
                  label="Daily Google clicks and impressions"
                  dates={org.data.daily.data.dates}
                  series={[
                    { name: "Clicks", data: org.data.daily.data.cur.clicks!, compare: org.data.daily.data.prev?.clicks },
                    { name: "Impressions", data: org.data.daily.data.cur.impressions!, axis: 1 },
                  ]}
                />
              </div>
            )}
            <h3 className="font-semibold">Top search queries</h3>
            <DataTable
              plain
              searchable={false}
              pageSize={15}
              maxHeight={2000}
              columns={[
                { key: "query", label: "Query", wide: true },
                { key: "clicks", label: "Clicks", format: "number", delta: { prevKey: "clicksPrev" } },
                { key: "impressions", label: "Impressions", format: "number" },
                { key: "ctr", label: "CTR", format: "percent" },
                { key: "position", label: "Position", format: "position" },
              ]}
              rows={[...org.data.queryRows].sort((a, b) => b.clicks - a.clicks).slice(0, 15)}
            />
          </Page>
        )}

        {conv?.ok && conv.data.ecommerce && (
          <Page title="Sales">
            <Bullets items={conv.data.insights} />
            <h3 className="font-semibold">Top products</h3>
            <DataTable
              plain
              searchable={false}
              pageSize={12}
              maxHeight={2000}
              columns={[
                { key: "product", label: "Product", wide: true },
                { key: "revenue", label: "Revenue", format: "currency" },
                { key: "quantity", label: "Units", format: "number" },
                { key: "viewToPurchase", label: "View → purchase", format: "percent" },
              ]}
              rows={conv.data.productRows.slice(0, 12)}
            />
            <h3 className="font-semibold">Revenue by city</h3>
            <DataTable plain searchable={false} pageSize={10} maxHeight={2000} columns={[{ key: "name", label: "City" }, { key: "revenue", label: "Revenue", format: "currency" }, { key: "transactions", label: "Orders", format: "number" }]} rows={conv.data.byCity.slice(0, 10)} />
          </Page>
        )}

        {con?.ok && (
          <Page title="Content & landing pages">
            <Bullets items={con.data.insights} />
            <DataTable
              plain
              searchable={false}
              pageSize={12}
              maxHeight={2000}
              columns={[
                { key: "page", label: "Landing page", wide: true },
                { key: "sessions", label: "Sessions", format: "number" },
                { key: "engagementRate", label: "Engaged", format: "percent" },
                { key: "conversionRate", label: "Conv. rate", format: "percent" },
                { key: "revenue", label: "Revenue", format: "currency" },
              ]}
              rows={[...con.data.pages].sort((a, b) => b.sessions - a.sessions).slice(0, 12)}
            />
          </Page>
        )}

      </main>
    </NumberFormatProvider>
  );
}

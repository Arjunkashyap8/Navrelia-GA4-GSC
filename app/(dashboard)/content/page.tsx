import type { Metadata } from "next";
import { QuadrantChart } from "@/components/charts/quadrant-chart";
import { Notice, Section, SectionError } from "@/components/section";
import { DataTable } from "@/components/table/data-table";
import { getViewContext } from "@/lib/data/context";
import type { RawSearchParams } from "@/lib/filters";
import { formatPercent } from "@/lib/metrics/format";
import { getContent } from "@/lib/modules/content";

export const metadata: Metadata = { title: "Content & Landing Pages" };
export const dynamic = "force-dynamic";

const QUAD_BADGE = { Stars: "positive", "Fix conversion": "negative", Promote: "info", Review: "neutral" } as const;

export default async function ContentPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = getViewContext(await searchParams);
  const d = await getContent(ctx);
  const convLabel = d.ecommerce ? "Purchase conv. rate" : "Key events / session";

  return (
    <div className="space-y-5">

      {!d.landing.ok ? (
        <SectionError what="landing pages" error={d.landing.error} />
      ) : (
        <>
          <Section
            title="Page scorecard"
            description="Every landing page with search clicks, behaviour and outcomes. Click a row for its full profile."
            info="Entrances = sessions that started on the page. GA4's Data API has no exits metric, so exit share isn't available. Scrolls = GA4 'scroll' events (90% depth) on the page."
          >
            <DataTable
              exportName="page-scorecard"
              drill={{ type: "page", idKey: "page" }}
              defaultSort={{ key: "sessions" }}
              columns={[
                { key: "page", label: "Landing page", wide: true },
                { key: "group", label: "Group", hidden: true },
                { key: "organicClicks", label: "Organic clicks", format: "number", glossary: "clicks" },
                { key: "sessions", label: "Sessions", format: "number", bar: true, delta: { prevKey: "sessionsPrev" } },
                { key: "engagementRate", label: "Engagement rate", format: "percent", glossary: "engagementRate" },
                { key: "engagementTime", label: "Avg. engagement time", format: "duration", glossary: "engagementTime" },
                { key: "scrolls", label: "Scrolls", format: "number" },
                { key: "keyEvents", label: "Key events", format: "number" },
                { key: "conversionRate", label: convLabel, format: "percent" },
                { key: "revenue", label: "Revenue", format: "currency" },
                { key: "entrances", label: "Entrances", format: "number", hidden: true },
              ]}
              rows={d.pages}
            />
          </Section>

          <div className="grid gap-4">
            <Section
              title="Traffic vs conversion"
              description={`Pages with 10+ sessions. Split at the median traffic (${Math.round(d.xMid)} sessions) and the site conversion rate (${formatPercent(d.yMid)}). Bigger dots earn more; click a dot for the page's details.`}
            >
              <QuadrantChart label="Landing pages: traffic vs conversion rate" points={d.quadRows.map((p) => ({ id: p.page, label: p.page, x: p.sessions, y: p.conversionRate ?? 0, size: p.revenue || p.keyEvents }))} xMid={d.xMid} yMid={d.yMid} />
            </Section>
            <Section title="Quadrant list" description="Stars · Fix conversion · Promote · Review">
              <DataTable
                exportName="page-quadrants"
                pageSize={10}
                drill={{ type: "page", idKey: "page" }}
                columns={[
                  { key: "page", label: "Page", wide: true },
                  { key: "quadrant", label: "Quadrant", badge: QUAD_BADGE },
                  { key: "sessions", label: "Sessions", format: "number" },
                  { key: "conversionRate", label: "Conv. rate", format: "percent" },
                ]}
                rows={d.quadRows}
              />
            </Section>
          </div>

          <Section title="Content groups" description="Grouped by first URL directory, or by your rules in Settings.">
            <DataTable
              exportName="content-groups"
              searchable={false}
              columns={[
                { key: "group", label: "Group" },
                { key: "pages", label: "Pages", format: "number" },
                { key: "sessions", label: "Sessions", format: "number", bar: true },
                { key: "organicClicks", label: "Organic clicks", format: "number" },
                { key: "engagementRate", label: "Engagement rate", format: "percent" },
                { key: "conversionRate", label: convLabel, format: "percent" },
                { key: "revenue", label: "Revenue", format: "currency" },
              ]}
              rows={d.groupRows}
            />
          </Section>
        </>
      )}

      <Section
        title="Content decay detector"
        description={d.decayWindow ? `Organic clicks ${d.decayWindow.now} vs ${d.decayWindow.before} (from synced Search Console history).` : "Needs synced Search Console history; run a sync from Settings."}
        info="Diagnosis: position worsened 1+ place = lost rankings; impressions fell 15%+ at stable position = lost demand (seasonality or interest); otherwise lower CTR."
      >
        <DataTable
          exportName="decaying-pages"
          drill={{ type: "page", idKey: "page" }}
          emptyText="No pages lost more than 20% of organic clicks."
          columns={[
            { key: "page", label: "Page", wide: true },
            { key: "clicksBefore", label: "Clicks (prior 3 mo)", format: "number" },
            { key: "clicksNow", label: "Clicks (last 3 mo)", format: "number" },
            { key: "clickChange", label: "Change", format: "percent" },
            { key: "impChange", label: "Impressions change", format: "percent" },
            { key: "posBefore", label: "Position before", format: "position" },
            { key: "posNow", label: "Position now", format: "position" },
            { key: "diagnosis", label: "Diagnosis", badge: { "Lost rankings": "negative", "Lost demand": "warning", "Lower CTR": "info" } },
          ]}
          rows={d.decayRows}
          defaultSort={{ key: "clicksBefore" }}
        />
      </Section>
      {!d.scrollOk && <Notice tone="warning">Scroll events couldn&apos;t be loaded, so the Scrolls column shows 0.</Notice>}
      {d.notices.map((n) => (
        <Notice key={n} tone="warning">
          {n}
        </Notice>
      ))}
    </div>
  );
}

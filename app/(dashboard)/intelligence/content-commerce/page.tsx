import type { Metadata } from "next";
import { KpiCard, KpiGrid } from "@/components/kpi/kpi-card";
import { Notice, Section, SectionError } from "@/components/section";
import { DataTable } from "@/components/table/data-table";
import { getViewContext } from "@/lib/data/context";
import type { RawSearchParams } from "@/lib/filters";
import { ratio } from "@/lib/metrics/delta";
import { getContentCommerce } from "@/lib/modules/intel/content-commerce";
import { safe } from "@/lib/safe";

export const metadata: Metadata = { title: "Content → Commerce" };
export const dynamic = "force-dynamic";

export default async function ContentCommercePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = getViewContext(await searchParams);
  const r = await safe(() => getContentCommerce(ctx));
  if (!r.ok) return <SectionError what="content → commerce" error={r.error} />;
  const d = r.data;

  return (
    <div className="space-y-5">
      <KpiGrid className="xl:grid-cols-5 2xl:grid-cols-5">
        <KpiCard label="Blog impressions (Google)" value={d.totals.impressions} />
        <KpiCard label="Blog page views" value={d.totals.views} />
        <KpiCard label="Clicks to products" value={d.totals.productClicks} />
        <KpiCard label="Blog → product rate" value={ratio(d.totals.productClicks, d.totals.views)} format="percent" />
        <KpiCard label="Revenue from blog entrances" value={d.totals.revenue} format="currencyCompact" note={`${d.totals.purchases} orders`} />
      </KpiGrid>

      <Section
        title="Every blog post: reach → readers → product clicks → sales"
        description="Converter = visits starting here bought · Feeder = sends readers to products · Dead end = readers rarely continue · Hidden = shows in Google but isn't clicked."
        info="Product clicks = GA4 page_view events on /products/ or /collections/ pages whose referrer is this post. Sales = purchases in sessions that landed on the post."
      >
        <DataTable
          exportName="content-commerce"
          drill={{ type: "page", idKey: "page" }}
          defaultSort={{ key: "views" }}
          columns={[
            { key: "page", label: "Post", wide: true },
            { key: "role", label: "Role", badge: { Converter: "positive", Feeder: "info", "Dead end": "negative", Hidden: "warning", Building: "neutral" } },
            { key: "impressions", label: "Impressions", format: "number" },
            { key: "clicks", label: "Google clicks", format: "number" },
            { key: "position", label: "Position", format: "position", hidden: true },
            { key: "views", label: "Page views", format: "number", bar: true },
            { key: "engagementRate", label: "Engaged", format: "percent", hidden: true },
            { key: "engagementTime", label: "Engagement time", format: "duration", hidden: true },
            { key: "productClicks", label: "→ product clicks", format: "number" },
            { key: "productClickRate", label: "→ product rate", format: "percent" },
            { key: "purchases", label: "Orders", format: "number" },
            { key: "revenue", label: "Revenue", format: "currency" },
            { key: "topDestination", label: "Main product destination", wide: true },
          ]}
          rows={d.rows}
        />
      </Section>

      <Section title="Products that content sends people to">
        <DataTable exportName="content-destinations" drill={{ type: "page", idKey: "page" }} pageSize={10} columns={[{ key: "page", label: "Product / collection page", wide: true }, { key: "clicks", label: "Clicks from blog posts", format: "number", bar: true }]} rows={d.destinations} />
      </Section>
      {!d.transitionsOk && <Notice tone="warning">Page-to-page transitions couldn&apos;t be loaded, so product clicks show 0.</Notice>}
      {d.notices.map((n) => (
        <Notice key={n} tone="warning">
          {n}
        </Notice>
      ))}
    </div>
  );
}

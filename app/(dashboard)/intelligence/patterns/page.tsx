import type { Metadata } from "next";
import { Heatmap } from "@/components/charts/heatmap";
import { TrendChart } from "@/components/charts/trend-chart";
import { Section, SectionError } from "@/components/section";
import { DataTable } from "@/components/table/data-table";
import { Tabs } from "@/components/ui/tabs";
import { getViewContext } from "@/lib/data/context";
import type { RawSearchParams } from "@/lib/filters";
import { DAYS, getPatterns } from "@/lib/modules/intel/patterns";
import { safe } from "@/lib/safe";

export const metadata: Metadata = { title: "Buying Patterns" };
export const dynamic = "force-dynamic";

const short = (d: string) => d.slice(0, 3);

export default async function PatternsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = getViewContext(await searchParams);
  const r = await safe(() => getPatterns(ctx));
  if (!r.ok) return <SectionError what="buying patterns" error={r.error} />;
  const d = r.data;

  return (
    <div className="space-y-5">

      <Section title="When people visit and buy" description="Day of week × hour of day (IST). From a GA4 pivot report." info="Conversion rate cells need at least 15 sessions; quieter cells are left blank.">
        <Tabs labels={["Sessions", "Purchases", "Conversion rate", "Revenue"]}>
          <Heatmap label="Sessions by day and hour" x={d.hours} y={DAYS.map(short)} values={d.sessions} />
          <Heatmap label="Purchases by day and hour" x={d.hours} y={DAYS.map(short)} values={d.purchases} />
          <Heatmap label="Purchase conversion rate by day and hour" x={d.hours} y={DAYS.map(short)} values={d.convRate} format="percent" />
          <Heatmap label="Revenue by day and hour" x={d.hours} y={DAYS.map(short)} values={d.revenue} format="currencyCompact" />
        </Tabs>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="By day of week">
          <TrendChart
            categorical
            height={240}
            label="Sessions and purchases by day of week"
            dates={d.byDay.map((x) => short(x.day))}
            series={[
              { name: "Sessions", data: d.byDay.map((x) => x.sessions), type: "bar" },
              { name: "Purchases", data: d.byDay.map((x) => x.purchases), axis: 1, color: "#E69F00" },
            ]}
          />
          <DataTable plain searchable={false} exportName="by-day" columns={[{ key: "day", label: "Day" }, { key: "sessions", label: "Sessions", format: "number" }, { key: "purchases", label: "Purchases", format: "number" }, { key: "revenue", label: "Revenue", format: "currency" }]} rows={d.byDay} />
        </Section>
        <Section title="Best time windows" description="3-hour windows (IST): traffic vs conversion.">
          <DataTable
            plain
            searchable={false}
            exportName="time-windows"
            columns={[
              { key: "window", label: "Window" },
              { key: "sessions", label: "Sessions", format: "number", bar: true },
              { key: "purchases", label: "Purchases", format: "number" },
              { key: "conversionRate", label: "Conv. rate", format: "percent" },
            ]}
            rows={d.windows}
          />
        </Section>
      </div>

      <Section title="Channel × device" description="Purchase conversion rate for each channel on each device (cells with 10+ sessions).">
        <div className="grid gap-4 xl:grid-cols-2">
          <Heatmap label="Conversion rate by channel and device" x={d.devices} y={d.channels} values={d.cdHeat} format="percent" />
          <DataTable
            searchable={false}
            exportName="channel-device"
            columns={[
              { key: "channel", label: "Channel" },
              ...d.devices.flatMap((dv) => [
                { key: `s_${dv}`, label: `${dv} sessions`, format: "number" as const },
                { key: `cr_${dv}`, label: `${dv} conv.`, format: "percent" as const },
                { key: `rps_${dv}`, label: `${dv} ₹/session`, format: "currency" as const, hidden: true },
              ]),
            ]}
            rows={d.cdRows}
          />
        </div>
      </Section>

      <Section title="Where each product sells" description="Item revenue by product and Indian state (top 10 × top 10).">
        {d.products.length ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Heatmap label="Item revenue by product and state" x={d.states} y={d.products.map((p) => (p.length > 28 ? `${p.slice(0, 27)}…` : p))} values={d.prHeat} format="currencyCompact" />
            <DataTable
              plain
              searchable={false}
              exportName="product-top-state"
              columns={[
                { key: "product", label: "Product", wide: true },
                { key: "revenue", label: "Revenue", format: "currency" },
                { key: "topState", label: "Top state" },
                { key: "topShare", label: "Share", format: "percent" },
              ]}
              rows={d.productTopState}
            />
          </div>
        ) : (
          <p className="text-body text-muted">No product sales in India for this period.</p>
        )}
      </Section>
    </div>
  );
}

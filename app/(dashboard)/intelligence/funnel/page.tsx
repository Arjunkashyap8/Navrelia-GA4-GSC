import type { Metadata } from "next";
import { BarChart } from "@/components/charts/bar-chart";
import { Funnel } from "@/components/charts/funnel";
import { KpiCard, KpiGrid } from "@/components/kpi/kpi-card";
import { Notice, Section, SectionError } from "@/components/section";
import { ParamToggle } from "@/components/shell/param-toggle";
import { DataTable, type Column } from "@/components/table/data-table";
import { Tabs } from "@/components/ui/tabs";
import { getViewContext } from "@/lib/data/context";
import { toParamReader, type RawSearchParams } from "@/lib/filters";
import { getFunnelLab, STEP_LABEL } from "@/lib/modules/intel/funnel";
import { safe } from "@/lib/safe";

export const metadata: Metadata = { title: "Checkout Funnel Lab" };
export const dynamic = "force-dynamic";

export default async function FunnelLabPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const ctx = getViewContext(sp);
  const open = toParamReader(sp).get("funnel") === "open";
  const detailed = toParamReader(sp).get("steps") === "detailed";
  const r = await safe(() => getFunnelLab(ctx, open, detailed));
  if (!r.ok) return <SectionError what="the funnel" error={r.error} />;
  const d = r.data;
  if (d.empty) {
    return <Notice tone="warning">Not enough e-commerce events in this period to build a funnel (found: {d.steps.join(", ") || "none"}).</Notice>;
  }
  const segCols = (label: string): Column[] => [
    { key: "segment", label },
    { key: "starters", label: "Viewed product", format: "number", bar: true },
    ...d.steps.slice(0, -1).map((s) => ({ key: `c_${s}`, label: `${STEP_LABEL[s]} → next`, format: "percent" as const })),
    { key: "completed", label: "Purchased", format: "number" },
    { key: "conversion", label: "View → purchase", format: "percent" },
  ];

  return (
    <div className="space-y-5">
      <KpiGrid className="xl:grid-cols-4 2xl:grid-cols-4">
        <KpiCard label="View → purchase" value={d.overall} previous={ctx.period.comparison ? d.overallPrev : undefined} format="percent" />
        <KpiCard label="Abandoned in checkout" value={d.checkoutAbandons} polarity="down_good" />
        <KpiCard label="Value of abandoned checkouts" value={d.atRisk} format="currencyCompact" polarity="down_good" note={`at AOV ₹${Math.round(d.aov).toLocaleString("en-IN")}`} />
        <KpiCard label="Abandoned after adding to cart" value={d.cartAbandons} polarity="down_good" />
      </KpiGrid>

      <Section
        title="Purchase funnel"
        description={open ? "Open funnel: users can enter at any step." : "Step-by-step (closed) funnel: each step counts only users who did the previous step first."}
        actions={
          <div className="flex flex-wrap gap-2">
            <ParamToggle param="steps" label="Funnel steps" options={[{ id: "core", label: "Core steps" }, { id: "detailed", label: "With shipping & payment" }]} />
            <ParamToggle param="funnel" label="Funnel type" options={[{ id: "closed", label: "Step-by-step" }, { id: "open", label: "Open" }]} />
          </div>
        }
        info="Built with GA4's Funnel API (runFunnelReport), not by counting events separately, so drop-off figures are true sequential abandonment. Core steps skip add_shipping_info / add_payment_info, which Shopify's checkout fires inconsistently."
      >
        <div className="grid gap-6 xl:grid-cols-2">
          {/* The graphic shows, before each step, the share that continued from the PREVIOUS step. */}
          <Funnel steps={d.stepRows.map((s, i) => ({ event: s.event, label: s.step, users: s.users, fromPrev: i === 0 ? null : (d.stepRows[i - 1]!.toNext ?? null), fromStart: s.ofStart }))} />
          <DataTable
            plain
            searchable={false}
            exportName="funnel-steps"
            columns={[
              { key: "step", label: "Step" },
              { key: "users", label: "Users", format: "number" },
              { key: "ofStart", label: "% of viewers", format: "percent" },
              { key: "toNext", label: "Continue", format: "percent" },
              { key: "abandonments", label: "Drop out", format: "number" },
              { key: "abandonmentRate", label: "Drop-out rate", format: "percent" },
            ]}
            rows={d.stepRows}
          />
        </div>
      </Section>

      <Section title="Funnel by segment" description="Step-to-step continuation rate for each device, channel and entry page type.">
        <Tabs labels={["Device", "Channel", "Entry page type"]}>
          <DataTable searchable={false} exportName="funnel-device" columns={segCols("Device")} rows={d.devRows} />
          <DataTable searchable={false} exportName="funnel-channel" columns={segCols("Channel")} rows={d.chRows} />
          <DataTable searchable={false} exportName="funnel-entry" columns={segCols("Landed on")} rows={d.entryRows} />
        </Tabs>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="What people do instead of continuing" description="The next event after each step, for users who didn't move to the next funnel step.">
          <DataTable
            exportName="funnel-next-actions"
            pageSize={12}
            columns={[
              { key: "step", label: "After" },
              { key: "action", label: "Next action" },
              { key: "users", label: "Users", format: "number", bar: true },
            ]}
            rows={d.next}
          />
        </Section>
        <Section title="Where people leave the site" description="Users with no further action after each step.">
          <BarChart label="Users with no next action by funnel step" categories={d.exits.map((e) => e.step)} series={[{ name: "Left", data: d.exits.map((e) => e.users), color: "#DC2626" }]} />
        </Section>
      </div>
      {d.notices.map((n) => (
        <Notice key={n} tone="warning">
          {n}
        </Notice>
      ))}
    </div>
  );
}

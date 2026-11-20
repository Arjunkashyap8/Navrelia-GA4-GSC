import type { Metadata } from "next";
import { KpiCard, KpiGrid } from "@/components/kpi/kpi-card";
import { Notice, Section, SectionError } from "@/components/section";
import { DataTable } from "@/components/table/data-table";
import { RankedBars } from "@/components/viz/ranked-bars";
import { SegmentTable, type SegmentColumn } from "@/components/viz/segment-table";
import { StageFunnel } from "@/components/viz/stage-funnel";
import { getViewContext } from "@/lib/data/context";
import type { RawSearchParams } from "@/lib/filters";
import { ratio } from "@/lib/metrics/delta";
import { getConversions } from "@/lib/modules/conversions";
import { getJourney } from "@/lib/modules/journey";
import { safe } from "@/lib/safe";

export const metadata: Metadata = { title: "Ecommerce Journey" };
export const dynamic = "force-dynamic";

const SEG_COLS: SegmentColumn[] = [
  { key: "segment", label: "Segment" },
  { key: "viewed", label: "Viewed product", format: "number" },
  { key: "added", label: "Added to cart", format: "number" },
  { key: "checkout", label: "Checkout", format: "number" },
  { key: "purchased", label: "Purchased", format: "number" },
  { key: "viewToBuy", label: "View → buy", format: "percent", highlight: true },
];

export default async function EcommerceJourneyPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = getViewContext(await searchParams);
  const [conv, journey] = await Promise.all([safe(() => getConversions(ctx)), safe(() => getJourney(ctx))]);
  const hasCmp = Boolean(ctx.period.comparison);
  const d = conv.ok ? conv.data : null;
  const j = journey.ok ? journey.data : null;
  const t = d?.totals.ok ? d.totals.data : null;
  const pv = (v: number | null | undefined) => (hasCmp ? (v ?? null) : undefined);

  return (
    <div className="space-y-5">
      {t ? (
        <KpiGrid>
          <KpiCard label="Revenue" glossary="revenue" value={t.cur.purchaseRevenue!} previous={pv(t.prev?.purchaseRevenue)} format="currencyCompact" spark={d!.daily.ok ? d!.daily.data.cur.purchaseRevenue : undefined} sparkPrev={d!.daily.ok ? d!.daily.data.prev?.purchaseRevenue : undefined} />
          <KpiCard label="Orders" glossary="transactions" value={t.cur.transactions!} previous={pv(t.prev?.transactions)} spark={d!.daily.ok ? d!.daily.data.cur.transactions : undefined} />
          <KpiCard label="Average order value" glossary="aov" value={d!.aov} previous={hasCmp ? ratio(t.prev?.purchaseRevenue, t.prev?.transactions) : undefined} format="currency" />
          <KpiCard label="Purchase conv. rate" glossary="conversionRate" value={ratio(t.cur.transactions, t.cur.sessions)} previous={hasCmp ? ratio(t.prev?.transactions, t.prev?.sessions) : undefined} format="percent" />
          <KpiCard label="Buyers" value={t.cur.totalPurchasers!} previous={pv(t.prev?.totalPurchasers)} />
          <KpiCard label="Items per order" glossary="itemsPerOrder" value={ratio(t.cur.itemsPurchased, t.cur.transactions)} previous={hasCmp ? ratio(t.prev?.itemsPurchased, t.prev?.transactions) : undefined} format="decimal" />
        </KpiGrid>
      ) : (
        <SectionError what="revenue totals" error={conv.ok ? (d!.totals.ok ? null : d!.totals.error) : conv.error} />
      )}

      {!j ? (
        <SectionError what="the ecommerce journey" error={journey.ok ? null : journey.error} />
      ) : (
        <>
          <Section title="The funnel" description="Percentages on each bar are the share of the first stage that reached it; the line underneath is continuation from the step directly above.">
            <StageFunnel stages={j.funnel} />
          </Section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Section title="By device" description="The clearest place to spot a platform-specific problem.">
              <SegmentTable columns={SEG_COLS} rows={j.devices} defaultSort="viewToBuy" benchmark={j.overall} />
            </Section>
            <Section title="By channel" description="Which traffic sources send people who actually buy.">
              <SegmentTable columns={SEG_COLS} rows={j.channels} defaultSort="viewToBuy" benchmark={j.overall} />
            </Section>
          </div>
          <Section title="New vs. returning" description="Whether repeat visitors convert better than first-timers.">
            <SegmentTable columns={SEG_COLS} rows={j.customers} defaultSort="viewToBuy" benchmark={j.overall} />
          </Section>

          {j.hasRazorpay && (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <Section title="Razorpay checkout journey" description="Razorpay Magic Checkout events, from starting checkout to a successful online payment.">
                  <StageFunnel stages={j.rzpFunnel} />
                </Section>
                <Section title="Checkout friction" description="People who hit each problem or decision during checkout.">
                  <RankedBars items={j.frictionRows.map((f) => ({ label: f.label, value: f.users }))} limit={10} multicolor />
                </Section>
              </div>
              <Section title="Checkout by traffic source" description="Razorpay checkout steps for each channel: where buyers come from and where they drop.">
                <DataTable
                  searchable={false}
                  exportName="checkout-by-source"
                  defaultSort={{ key: "checkout" }}
                  columns={[
                    { key: "source", label: "Channel" },
                    { key: "checkout", label: "Started checkout", format: "number", bar: true },
                    { key: "rzpOpened", label: "Opened Razorpay", format: "number" },
                    { key: "payNow", label: "Clicked Pay now", format: "number" },
                    { key: "paid", label: "Paid online", format: "number" },
                    { key: "failed", label: "Payment failed", format: "number" },
                    { key: "purchased", label: "Purchased", format: "number" },
                    { key: "checkoutToPurchase", label: "Checkout → purchase", format: "percent" },
                  ]}
                  rows={j.sourceRows}
                />
              </Section>
            </>
          )}

        </>
      )}

      {d && (
        <>
          <Section title="Products" description="Revenue, units and the view-to-purchase rate per product.">
            {d.products.ok ? (
              <DataTable
                exportName="products"
                columns={[
                  { key: "product", label: "Product", wide: true },
                  { key: "revenue", label: "Revenue", format: "currency", bar: true, delta: { prevKey: "revenuePrev" } },
                  { key: "quantity", label: "Units sold", format: "number" },
                  { key: "views", label: "Product views", format: "number" },
                  { key: "addToCarts", label: "Add to carts", format: "number" },
                  { key: "viewToPurchase", label: "View → purchase", format: "percent" },
                ]}
                rows={d.productRows}
              />
            ) : (
              <SectionError what="products" error={d.products.error} />
            )}
          </Section>
          <Section title="Key events" description="Events marked as key events in GA4 Admin.">
            {d.keyEventDefs.ok ? (
              <DataTable
                searchable={false}
                exportName="key-events"
                columns={[
                  { key: "event", label: "Key event" },
                  { key: "count", label: "Count", format: "number", bar: true, delta: { prevKey: "countPrev" } },
                  { key: "users", label: "Users", format: "number" },
                  { key: "perUser", label: "Per user", format: "decimal" },
                ]}
                rows={d.keyEventRows}
              />
            ) : (
              <SectionError what="key event definitions" error={d.keyEventDefs.error} />
            )}
          </Section>
        </>
      )}

      <Notice>
        <strong>Attribution and lag:</strong> revenue is credited to the session&apos;s channel (GA4&apos;s session-scoped default channel group). Purchases can take 24–48 hours to finish processing, so the last two days may rise slightly.
      </Notice>
      {[...(j?.notices ?? []), ...(d?.notices ?? [])].filter((n, i, a) => a.indexOf(n) === i).map((n) => (
        <Notice key={n} tone="warning">
          {n}
        </Notice>
      ))}
    </div>
  );
}

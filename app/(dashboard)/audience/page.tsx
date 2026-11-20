import type { Metadata } from "next";
import { Heatmap } from "@/components/charts/heatmap";
import { Notice, Section, SectionError } from "@/components/section";
import { DataTable, type Column } from "@/components/table/data-table";
import { goalColumns } from "@/components/table/goal-columns";
import { Tabs } from "@/components/ui/tabs";
import { Donut } from "@/components/viz/donut";
import { RankedBars } from "@/components/viz/ranked-bars";
import { getViewContext } from "@/lib/data/context";
import type { RawSearchParams } from "@/lib/filters";
import { formatPercent } from "@/lib/metrics/format";
import { getAudience } from "@/lib/modules/audience";

export const metadata: Metadata = { title: "Audience & Locations" };
export const dynamic = "force-dynamic";

const cols = (label: string, compare = true): Column[] =>
  goalColumns(
    { key: "name", label, wide: true },
    {
      compare,
      extra: [
        { key: "users", label: "Users", format: "number", hidden: true },
        { key: "engagementRate", label: "Engagement rate", format: "percent", hidden: true },
        { key: "revenue", label: "Revenue", format: "currency", hidden: true },
      ],
    },
  );

/** State and channel first, then the shared session → purchase chain. */
const stateSourceCols = (): Column[] => {
  const [state, ...rest] = goalColumns({ key: "state", label: "State" });
  return [state!, { key: "channel", label: "Channel" }, ...rest];
};

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export default async function AudiencePage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const ctx = getViewContext(await searchParams);
  const d = await getAudience(ctx);
  const known = (rows: Record<string, string | number>[], dim: string) => rows.map((r) => ({ label: String(r[dim]), value: Number(r.totalUsers) }));

  return (
    <div className="space-y-5">
      {/* 1. Demography */}
      <Section
        title="Demography"
        description={d.demoCoverage !== null ? `Age and gender for the ${formatPercent(d.demoCoverage)} of users Google can identify (Google Signals). The rest are “unknown”.` : "Age and gender from Google Signals."}
      >
        {d.demographicsAvailable ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <h3 className="mb-2 text-body font-semibold text-ink">Age</h3>
              <RankedBars items={known(d.ageRows, "userAgeBracket").sort((a, b) => a.label.localeCompare(b.label))} limit={8} multicolor />
            </div>
            <div>
              <h3 className="mb-2 text-body font-semibold text-ink">Gender</h3>
              <Donut label="Users by gender" unit="users" items={known(d.genderRows, "userGender").map((g) => ({ ...g, label: cap(g.label) }))} />
            </div>
            <div>
              <h3 className="mb-2 text-body font-semibold text-ink">Interests</h3>
              <RankedBars items={known(d.interestRows, "brandingInterest")} limit={8} emptyText="No interest data (too few users after Google's privacy thresholds)." />
            </div>
          </div>
        ) : null}
        {d.demographicsAvailable && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 text-body font-semibold text-ink">Session → purchase by age and gender</h3>
            <Tabs labels={["Age", "Gender"]}>
              <DataTable searchable={false} exportName="age-goal" defaultSort={{ key: "name", desc: false }} columns={cols("Age", false)} rows={d.ageGoal} />
              <DataTable searchable={false} exportName="gender-goal" columns={cols("Gender", false)} rows={d.genderGoal} />
            </Tabs>
          </div>
        )}
        {!d.demographicsAvailable && (
          <Notice>
            Demographics aren&apos;t available for this period. GA4 only reports age, gender and interests when <strong>Google Signals</strong> is on, and it hides small groups to protect privacy. Widen the date range or remove filters.
          </Notice>
        )}
      </Section>

      {/* 2. Locations */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="States & regions" description="Top 10 by sessions (India).">
          <RankedBars items={d.stateRows.map((s) => ({ label: String(s.name), value: s.sessions ?? 0 }))} limit={10} multicolor />
        </Section>
        <Section title="Cities" description="Top 12 by sessions (India).">
          <RankedBars items={d.cityRows.map((c) => ({ label: String(c.name).replace(/, [^,]+$/, ""), value: c.sessions ?? 0 }))} limit={12} />
        </Section>
      </div>

      <Section title="Locations: session → purchase" description="For each state and city (India): sessions, add to carts, checkouts and purchases.">
        <Tabs labels={["States", "Cities"]}>
          <DataTable exportName="states-goal" columns={cols("State")} rows={d.stateRows} />
          <DataTable exportName="cities-goal" columns={cols("City, state")} rows={d.cityRows} />
        </Tabs>
      </Section>

      {/* 3. Sources and locations */}
      <Section title="Sources × locations" description="Which channels bring visitors in each state (top 10 states × top 6 channels).">
        {d.sourceLocation.states.length ? (
          <div className="space-y-5">
            <Heatmap label="Sessions by state and channel" x={d.sourceLocation.channels} y={d.sourceLocation.states} values={d.sourceLocation.sessions} />
            <div>
              <h3 className="mb-2 text-body font-semibold text-ink">Every state × source: session → purchase</h3>
              <DataTable exportName="state-by-source-goal" columns={stateSourceCols()} rows={d.stateSourceRows} />
            </div>
          </div>
        ) : (
          <p className="text-body text-muted">No state data for this selection.</p>
        )}
      </Section>

      {/* 4. Who they are */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="New vs. returning" description="Active users">
          <Donut label="New vs returning users" unit="users" items={d.loyaltyRows.map((r) => ({ label: cap(String(r.name)), value: r.users ?? 0 }))} />
        </Section>
        <Section title="Languages" description="Browser language by sessions">
          <RankedBars items={d.languageRows} limit={8} />
        </Section>
        <Section title="Devices" description="Sessions by category">
          <Donut label="Sessions by device" unit="sessions" items={d.devRows.map((r) => ({ label: cap(String(r.name)), value: r.sessions ?? 0 }))} />
        </Section>
      </div>

      <Section title="Visitors, devices and languages: session → purchase">
        <Tabs labels={["New vs returning", "Devices", "Languages"]}>
          <DataTable searchable={false} exportName="new-returning-goal" columns={cols("Visitor type")} rows={d.loyaltyRows.map((r) => ({ ...r, name: cap(String(r.name)) }))} />
          <DataTable searchable={false} exportName="devices-goal" drill={{ type: "device", idKey: "id" }} columns={cols("Device")} rows={d.devRows.map((r) => ({ ...r, name: cap(String(r.name)) }))} />
          <DataTable exportName="languages-goal" columns={cols("Language", false)} rows={d.languageGoal} />
        </Tabs>
      </Section>

      <Section title="Countries: GA4 visits and Google Search side by side" description="Search Console clicks and impressions from searchers in each country.">
        {d.ctry.ok ? (
          <DataTable exportName="countries" drill={{ type: "country", idKey: "id" }} columns={[...cols("Country"), { key: "gscClicks", label: "GSC clicks", format: "number" }, { key: "gscImpressions", label: "GSC impressions", format: "number" }]} rows={d.countryRows} />
        ) : (
          <SectionError what="countries" error={d.ctry.error} />
        )}
      </Section>

      <Section title="Technology: session → purchase" description="Per operating system, browser and screen size.">
        <Tabs labels={["Operating system", "Browser", "Screen resolution"]}>
          <DataTable exportName="os" columns={cols("Operating system")} rows={d.osRows} />
          <DataTable exportName="browsers" columns={cols("Browser")} rows={d.browserRows} />
          <DataTable exportName="screens" columns={cols("Screen resolution")} rows={d.screenRows} />
        </Tabs>
      </Section>

      <Section title="Weekly retention" description="Share of each week's new users who came back in later weeks." info="GA4 cohort report by first-session week.">
        {d.cohort.ok ? (
          <DataTable
            searchable={false}
            exportName="cohorts"
            columns={[{ key: "cohort", label: "First visit week" }, { key: "users", label: "Users", format: "number" }, ...[1, 2, 3, 4, 5].map((n) => ({ key: `w${n}`, label: `Week ${n}`, format: "percent" as const }))]}
            rows={d.cohort.data}
          />
        ) : (
          <SectionError what="cohort retention" error={d.cohort.error} />
        )}
      </Section>
      {d.notices.map((n) => (
        <Notice key={n} tone="warning">
          {n}
        </Notice>
      ))}
    </div>
  );
}

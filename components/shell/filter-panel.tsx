"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFmt } from "@/components/ui/fmt";
import { activeFilterCount, CUSTOMER_TYPES, DEVICES, FILTER_KEYS, GRANULARITIES, parseFilters, SHARED_KEYS } from "@/lib/filters";
import { COMPARE_MODES, RANGE_PRESETS, type CompareMode, type RangePreset } from "@/lib/metrics/periods";
import type { DataSource } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { usePeriod } from "./period-controls";

interface Options {
  channels: { value: string; count: number }[];
  states: { value: string; count: number }[];
  countries: { value: string; label: string; count: number }[];
}

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-white pl-4 pr-4 text-body text-ink shadow-[0_1px_1px_rgba(16,24,40,.03)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600";

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cn(inputCls, "appearance-none pr-10")} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink" aria-hidden />
    </div>
  );
}

function Field({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Period + filter panel shown at the top of every page. Fields depend on the page's data source:
 * GA4 pages get channel / state / device / customers / country; Search Console pages get
 * device / country / queries; combined pages get all of them.
 */
export function FilterPanel({ source, actions }: { source: DataSource; actions?: React.ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { period, update } = usePeriod();
  const { fmt } = useFmt();
  const f = parseFilters(params);
  const count = activeFilterCount(f);

  const ga4 = source === "ga4" || source === "both";
  const gsc = source === "gsc" || source === "both";

  // Counts follow the selected period and the other filters.
  const optionKey = new URLSearchParams();
  SHARED_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v && k !== "view") optionKey.set(k, v);
  });
  const { data: options } = useQuery({
    queryKey: ["filter-options", optionKey.toString()],
    staleTime: 10 * 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => (await (await fetch(`/api/filter-options?${optionKey.toString()}`)).json()) as Options,
  });

  const set = (k: string, v: string | null) => update({ [k]: v });
  const withCount = (label: string, n?: number) => (n === undefined ? label : `${label} (${fmt(n, "number")})`);
  const ensure = <T extends { value: string }>(list: T[] | undefined, value: string | undefined, make: (v: string) => T) =>
    value && !(list ?? []).some((o) => o.value === value) ? [make(value), ...(list ?? [])] : (list ?? []);

  const ga4OnlyActive = source === "both" && (f.channel || f.state || f.customer);
  const gscOnlyActive = source === "both" && f.brand;

  return (
    <section aria-label="Period and filters" className="rounded-card border border-line bg-[#F4F7F7] p-4 md:p-5">
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Period" htmlFor="f-period">
          <Select id="f-period" value={period.preset} onChange={(e) => {
            const id = e.target.value as RangePreset;
            update(id === "custom" ? { range: "custom", from: period.range.start, to: period.range.end } : { range: id, from: null, to: null });
          }}>
            {RANGE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="View by">
          <div role="group" aria-label="View by" className="grid h-10 grid-cols-4 rounded-xl border border-line bg-white p-1">
            {GRANULARITIES.map((g) => {
              const active = (f.view ?? "day") === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set("view", g.id === "day" ? null : g.id)}
                  className={cn("rounded-lg text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600", active ? "bg-brand-700 font-semibold text-white" : "text-ink hover:bg-slate-50")}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Compare with" htmlFor="f-cmp">
          <Select id="f-cmp" value={period.compare} onChange={(e) => set("cmp", e.target.value as CompareMode)}>
            {COMPARE_MODES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        {ga4 && (
          <Field label="Channel" htmlFor="f-channel">
            <Select id="f-channel" value={f.channel ?? ""} onChange={(e) => set("channel", e.target.value || null)}>
              <option value="">All channels</option>
              {ensure(options?.channels, f.channel, (v) => ({ value: v, count: 0 })).map((c) => (
                <option key={c.value} value={c.value}>
                  {withCount(c.value, c.count)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {ga4 && (
          <Field label="State" htmlFor="f-state">
            <Select id="f-state" value={f.state ?? ""} onChange={(e) => set("state", e.target.value || null)}>
              <option value="">All states</option>
              {ensure(options?.states, f.state, (v) => ({ value: v, count: 0 })).map((c) => (
                <option key={c.value} value={c.value}>
                  {withCount(c.value, c.count)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Device" htmlFor="f-device">
          <Select id="f-device" value={f.device ?? ""} onChange={(e) => set("device", e.target.value || null)}>
            <option value="">All devices</option>
            {DEVICES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        {ga4 && (
          <Field label="Customers" htmlFor="f-cust">
            <Select id="f-cust" value={f.customer ?? ""} onChange={(e) => set("cust", e.target.value || null)}>
              <option value="">All customers</option>
              {CUSTOMER_TYPES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Country" htmlFor="f-country">
          <Select id="f-country" value={f.country ?? ""} onChange={(e) => set("country", e.target.value || null)}>
            <option value="">All countries</option>
            {ensure(options?.countries, f.country, (v) => ({ value: v, label: v, count: 0 })).map((c) => (
              <option key={c.value} value={c.value}>
                {withCount(c.label, c.count)}
              </option>
            ))}
          </Select>
        </Field>
        {gsc && (
          <Field label="Search queries" htmlFor="f-brand">
            <Select id="f-brand" value={f.brand ?? ""} onChange={(e) => set("brand", e.target.value || null)}>
              <option value="">All queries</option>
              <option value="brand">Brand queries</option>
              <option value="nonbrand">Non-brand queries</option>
            </Select>
          </Field>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
          <span aria-live="polite">
            {count === 0
              ? "No filters applied. Showing all traffic."
              : `${count} ${count === 1 ? "filter" : "filters"} applied — every figure and its comparison period are both narrowed.`}
          </span>
          {count > 0 && (
            <button
              type="button"
              className="rounded-lg border border-line bg-white px-2.5 py-1 font-medium text-ink hover:bg-slate-50"
              onClick={() => {
                const next = new URLSearchParams(params.toString());
                FILTER_KEYS.forEach((k) => next.delete(k));
                router.replace(`${pathname}?${next.toString()}`, { scroll: false });
              }}
            >
              Clear all
            </button>
          )}
          {ga4OnlyActive && <span className="text-amber-800">Channel, state and customer filters narrow GA4 figures only (Search Console has no such data).</span>}
          {gscOnlyActive && <span className="text-amber-800">The search queries filter narrows Search Console figures only.</span>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}

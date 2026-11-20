"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronDown, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRange, RANGE_PRESETS, type RangePreset } from "@/lib/metrics/periods";
import type { NavItem } from "@/lib/nav";
import { SOURCE_DELAY } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useNav } from "./nav-context";
import { usePeriod } from "./period-controls";

const QUICK: { id: RangePreset; label: string; title: string }[] = [
  { id: "last7", label: "7D", title: "Last 7 days" },
  { id: "last28", label: "28D", title: "Last 28 days" },
  { id: "last90", label: "90D", title: "Last 90 days" },
  { id: "last12m", label: "12M", title: "Last 12 months" },
];

function DateRangeButton() {
  const { period, today, update } = usePeriod();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: period.range.start, to: period.range.end });
  useEffect(() => setDraft({ from: period.range.start, to: period.range.end }), [period.range.start, period.range.end]);
  const input = "h-9 rounded-lg border border-line bg-white px-2 text-body";
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="num inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-body font-semibold text-ink shadow-card hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          aria-label={`Date range ${formatRange(period.range)}. Change`}
        >
          <CalendarDays className="size-4 text-muted" aria-hidden />
          {formatRange(period.range)}
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-[340px] rounded-card border border-line bg-white p-3 shadow-lg">
          <div className="grid grid-cols-2 gap-1">
            {RANGE_PRESETS.filter((p) => p.id !== "custom").map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  update({ range: p.id, from: null, to: null });
                  setOpen(false);
                }}
                className={cn("rounded-md px-2.5 py-1.5 text-left text-body hover:bg-brand-50", period.preset === p.id && "bg-brand-50 font-semibold text-brand-800")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <form
            className="mt-3 border-t border-line pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              update({ range: "custom", from: draft.from, to: draft.to });
              setOpen(false);
            }}
          >
            <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-muted">Custom range</p>
            <div className="flex items-center gap-1.5">
              <input type="date" aria-label="Start date" className={input} value={draft.from} max={today} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              <span className="text-muted">–</span>
              <input type="date" aria-label="End date" className={input} value={draft.to} max={today} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            </div>
            <Button type="submit" variant="primary" size="sm" className="mt-2 w-full">
              Apply
            </Button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function PageHeader({ item }: { item: NavItem | undefined }) {
  const { setMobileOpen } = useNav();
  const { period, update } = usePeriod();
  const delay = item ? SOURCE_DELAY[item.source] : null;
  const showPeriod = item?.filters !== false;
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-slate-100 md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">{item?.label ?? "Dashboard"}</h1>
            {item?.href === "/realtime" ? (
              <span className="rounded-full bg-positive-soft px-2.5 py-0.5 text-caption font-semibold text-green-800">Live · refreshes every 60s</span>
            ) : (
              delay && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-caption font-semibold text-amber-800">{delay}</span>
            )}
          </div>
          {item?.summary && <p className="mt-0.5 text-body text-muted">{item.summary}</p>}
        </div>
      </div>
      {showPeriod && (
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Quick date range" className="inline-flex h-10 items-center rounded-full border border-line bg-white p-1 shadow-card">
            {QUICK.map((q) => {
              const active = period.preset === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  title={q.title}
                  aria-pressed={active}
                  onClick={() => update({ range: q.id, from: null, to: null })}
                  className={cn(
                    "h-8 rounded-full px-3.5 text-caption font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
                    active ? "bg-brand-700 text-white" : "text-muted hover:text-ink",
                  )}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
          <DateRangeButton />
        </div>
      )}
    </div>
  );
}

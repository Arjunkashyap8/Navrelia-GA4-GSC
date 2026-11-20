"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { TrendChart } from "@/components/charts/trend-chart";
import { KpiCard } from "@/components/kpi/kpi-card";
import { DataTable, type Column } from "@/components/table/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { SHARED_KEYS } from "@/lib/filters";
import type { DrillProfile } from "@/lib/data/drill-types";
import { useDrill } from "./drill-context";

const TITLES = { page: "Page", query: "Search query", channel: "Channel", country: "Country", device: "Device" };

export function DrillDrawer() {
  const { target, close } = useDrill();
  const params = useSearchParams();
  const panel = useRef<HTMLDivElement>(null);

  const qs = new URLSearchParams();
  SHARED_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) qs.set(k, v);
  });
  if (target) {
    qs.set("type", target.type);
    qs.set("id", target.id);
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["drill", qs.toString()],
    enabled: Boolean(target),
    queryFn: async () => {
      const res = await fetch(`/api/drill?${qs.toString()}`);
      const json = (await res.json()) as DrillProfile | { error: { message: string } };
      if (!res.ok || "error" in json) throw new Error("error" in json ? json.error.message : `HTTP ${res.status}`);
      return json;
    },
  });

  useEffect(() => {
    if (!target) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${TITLES[target.type]} details`}>
      <button type="button" className="absolute inset-0 bg-slate-900/20" aria-label="Close details" onClick={close} />
      <div ref={panel} tabIndex={-1} className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-canvas shadow-2xl focus:outline-none">
        <header className="flex items-start justify-between gap-3 border-b border-line bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-caption font-medium uppercase tracking-wide text-muted">{TITLES[target.type]}</p>
            <h2 className="break-words text-section text-ink">{data?.title ?? target.id}</h2>
            {data?.url && (
              <a href={data.url} target="_blank" rel="noreferrer noopener" className="mt-0.5 inline-flex items-center gap-1 text-caption text-brand-700 hover:underline">
                Open page <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <button type="button" onClick={close} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" aria-label="Close details">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {isLoading && (
            <>
              <Skeleton className="h-20 w-full" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[148px]" />
                ))}
              </div>
              <Skeleton className="h-64 w-full" />
            </>
          )}
          {error && <p className="rounded-lg bg-negative-soft p-3 text-body text-red-800">Couldn&apos;t load details: {error.message}</p>}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {data.kpis.map((k) => (
                  <KpiCard key={k.label} {...k} />
                ))}
              </div>
              {data.trend && (
                <div className="rounded-card border border-line bg-white p-4">
                  <h3 className="mb-2 text-body font-semibold text-ink">Daily trend</h3>
                  <TrendChart dates={data.trend.dates} series={data.trend.series} label={`${data.title} daily trend`} height={240} />
                </div>
              )}
              {data.tables.map((t) => (
                <div key={t.title} className="rounded-card border border-line bg-white p-4">
                  <h3 className="mb-1 text-body font-semibold text-ink">{t.title}</h3>
                  {t.note && <p className="mb-2 text-caption text-muted">{t.note}</p>}
                  <DataTable columns={t.columns as Column[]} rows={t.rows} pageSize={10} exportName={t.title.toLowerCase().replace(/\W+/g, "-")} maxHeight={380} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

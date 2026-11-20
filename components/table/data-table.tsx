"use client";

import * as Popover from "@radix-ui/react-popover";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DeltaBadge } from "@/components/kpi/delta-badge";
import { useDrill, type DrillType } from "@/components/drill/drill-context";
import { Button } from "@/components/ui/button";
import { useFmt, type Fmt } from "@/components/ui/fmt";
import { InfoTip } from "@/components/ui/tooltip";
import type { Polarity } from "@/lib/metrics/delta";
import { GLOSSARY } from "@/lib/metrics/glossary";
import { cn } from "@/lib/utils";

export interface Column {
  key: string;
  label: string;
  format?: Fmt;
  /** Draw an inline bar proportional to the column max (share metrics). */
  bar?: boolean;
  /** Show a delta badge vs this key in the same row. */
  delta?: { prevKey: string; polarity?: Polarity };
  glossary?: string;
  hidden?: boolean;
  /** Wrap long text (URLs, queries). */
  wide?: boolean;
  badge?: Record<string, "positive" | "negative" | "warning" | "info" | "neutral">;
}

type Row = Record<string, unknown>;

function toCsv(columns: Column[], rows: Row[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = columns.flatMap((c) => (c.delta ? [c, { key: c.delta.prevKey, label: `${c.label} (comparison)` } as Column] : [c]));
  return [cols.map((c) => esc(c.label)).join(","), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(","))].join("\n");
}

const BADGE_CLASS = {
  positive: "bg-positive-soft text-green-800",
  negative: "bg-negative-soft text-red-800",
  warning: "bg-warning-soft text-amber-800",
  info: "bg-info-soft text-blue-800",
  neutral: "bg-slate-100 text-slate-700",
};

export function DataTable({
  columns,
  rows,
  drill,
  defaultSort,
  pageSize = 20,
  exportName = "table",
  searchable = true,
  emptyText = "No rows for this selection.",
  maxHeight = 560,
  plain = false,
}: {
  columns: Column[];
  rows: Row[];
  drill?: { type: DrillType; idKey: string };
  defaultSort?: { key: string; desc?: boolean };
  pageSize?: number;
  exportName?: string;
  searchable?: boolean;
  emptyText?: string;
  maxHeight?: number;
  /** Print/report mode: no toolbar or pagination, all rows, no internal scroll. */
  plain?: boolean;
}) {
  const { fmt } = useFmt();
  const { open } = useDrill();
  const [sort, setSort] = useState(defaultSort ? { desc: true, ...defaultSort } : { key: columns.find((c) => c.format && c.format !== "text")?.key ?? columns[0]!.key, desc: true });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [visible, setVisible] = useState(() => new Set(columns.filter((c) => !c.hidden).map((c) => c.key)));

  const textKeys = columns.filter((c) => !c.format || c.format === "text").map((c) => c.key);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle ? rows.filter((r) => textKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle))) : rows;
    const dir = sort.desc ? -1 : 1;
    return [...base].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, q, sort, textKeys]);

  const maxes = useMemo(() => {
    const m: Record<string, number> = {};
    columns.filter((c) => c.bar).forEach((c) => (m[c.key] = Math.max(...rows.map((r) => Number(r[c.key]) || 0), 0)));
    return m;
  }, [columns, rows]);

  const size = plain ? filtered.length || 1 : pageSize;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * size, current * size + size);
  const shown = columns.filter((c) => visible.has(c.key));

  const exportCsv = () => {
    const blob = new Blob([toCsv(columns, filtered)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className={cn("mb-3 flex flex-wrap items-center gap-2", plain && "hidden")}>
        {searchable && (
          <label className="relative">
            <span className="sr-only">Search table</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Search…"
              className="h-8 w-56 rounded-lg border border-line bg-white pl-8 pr-2 text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            />
          </label>
        )}
        <span className="num text-caption text-muted">{filtered.length.toLocaleString("en-IN")} rows</span>
        <div className="ml-auto flex gap-2">
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button size="sm" aria-label="Choose columns">
                <Columns3 /> Columns
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={6} className="z-50 w-56 rounded-lg border border-line bg-white p-2 shadow-lg">
                {columns.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-body hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="accent-brand-700"
                      checked={visible.has(c.key)}
                      onChange={(e) => {
                        const next = new Set(visible);
                        if (e.target.checked) next.add(c.key);
                        else if (next.size > 1) next.delete(c.key);
                        setVisible(next);
                      }}
                    />
                    {c.label}
                  </label>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Button size="sm" onClick={exportCsv} aria-label="Export table as CSV">
            <Download /> CSV
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-line" style={plain ? undefined : { maxHeight }}>
        <table className="w-full border-collapse text-left text-body">
          <thead className="sticky top-0 z-10 bg-slate-50 text-caption text-muted shadow-[0_1px_0_#E6E8EC]">
            <tr>
              {shown.map((c) => {
                const numeric = c.format && c.format !== "text";
                const active = sort.key === c.key;
                return (
                  <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2 font-medium", numeric && "text-right")} aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
                    <span className={cn("inline-flex items-center gap-1", numeric && "flex-row-reverse")}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                        onClick={() => setSort({ key: c.key, desc: active ? !sort.desc : Boolean(numeric) })}
                      >
                        {c.label}
                        {active && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                      {c.glossary && GLOSSARY[c.glossary] && <InfoTip label={c.label}>{GLOSSARY[c.glossary]!.def}</InfoTip>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {slice.length === 0 && (
              <tr>
                <td colSpan={shown.length} className="px-3 py-8 text-center text-muted">
                  {emptyText}
                </td>
              </tr>
            )}
            {slice.map((r, i) => {
              const id = drill ? String(r[drill.idKey] ?? "") : "";
              return (
                <tr
                  key={i}
                  className={cn(drill && "cursor-pointer hover:bg-brand-50/40")}
                  onClick={drill && id ? () => open({ type: drill.type, id }) : undefined}
                  tabIndex={drill ? 0 : undefined}
                  onKeyDown={drill && id ? (e) => e.key === "Enter" && open({ type: drill.type, id }) : undefined}
                >
                  {shown.map((c) => {
                    const v = r[c.key];
                    const numeric = c.format && c.format !== "text";
                    return (
                      <td key={c.key} className={cn("px-3 py-2 align-top", numeric ? "num whitespace-nowrap text-right" : c.wide ? "min-w-[220px] max-w-[420px] break-words" : "whitespace-nowrap")}>
                        {c.badge && typeof v === "string" ? (
                          <span className={cn("rounded-full px-2 py-0.5 text-caption font-medium", BADGE_CLASS[c.badge[v] ?? "neutral"])}>{v}</span>
                        ) : (
                          <div className={cn("flex flex-col", numeric && "items-end")}>
                            <span className={cn(c.bar && "relative")}>
                              {c.bar && maxes[c.key] ? (
                                <span className="flex items-center justify-end gap-2">
                                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                                    <span className="block h-full rounded-full bg-brand-600/70" style={{ width: `${((Number(v) || 0) / maxes[c.key]!) * 100}%` }} />
                                  </span>
                                  {c.format ? fmt(v, c.format) : String(v ?? "—")}
                                </span>
                              ) : c.format ? (
                                fmt(v, c.format)
                              ) : (
                                String(v ?? "—")
                              )}
                            </span>
                            {c.delta && (
                              <DeltaBadge
                                current={v as number}
                                previous={r[c.delta.prevKey] as number | null}
                                polarity={c.delta.polarity}
                                format={c.format}
                                size="sm"
                              />
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && !plain && (
        <div className="mt-2 flex items-center justify-end gap-2 text-caption text-muted">
          <span className="num">
            Page {current + 1} of {pages}
          </span>
          <Button size="icon-sm" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}

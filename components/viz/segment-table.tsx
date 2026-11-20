"use client";

import { useState } from "react";
import { useFmt, type Fmt } from "@/components/ui/fmt";
import { cn } from "@/lib/utils";

export interface SegmentColumn {
  key: string;
  label: string;
  format?: Fmt;
  /** Highlight values above `benchmark` in green (e.g. View → buy above the overall rate). */
  highlight?: boolean;
}

/** Compact sortable comparison table used for funnel segments (device, channel, new vs returning). */
export function SegmentTable({
  columns,
  rows,
  defaultSort,
  benchmark,
}: {
  columns: SegmentColumn[];
  rows: Record<string, string | number | null | undefined>[];
  defaultSort: string;
  benchmark?: number | null;
}) {
  const { fmt } = useFmt();
  const [sort, setSort] = useState({ key: defaultSort, desc: true });
  const sorted = [...rows].sort((a, b) => {
    const x = a[sort.key];
    const y = b[sort.key];
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
    return sort.desc ? -r : r;
  });
  if (!rows.length) return <p className="py-6 text-center text-body text-muted">No data for this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body">
        <thead>
          <tr className="border-b border-line text-caption text-muted">
            {columns.map((c, i) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} scope="col" className={cn("py-2 font-medium", i > 0 && "text-right")} aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
                  <button type="button" className={cn("hover:text-ink", active && "font-semibold text-ink")} onClick={() => setSort({ key: c.key, desc: active ? !sort.desc : true })}>
                    {c.label} {active ? (sort.desc ? "▼" : "▲") : ""}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((r, ri) => (
            <tr key={ri}>
              {columns.map((c, i) => {
                const v = r[c.key];
                const good = c.highlight && typeof v === "number" && benchmark !== undefined && benchmark !== null && v >= benchmark && v > 0;
                return (
                  <td key={c.key} className={cn("num py-2.5", i > 0 ? "text-right" : "text-ink", good && "font-semibold text-green-700")}>
                    {c.format ? fmt(v, c.format) : String(v ?? "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

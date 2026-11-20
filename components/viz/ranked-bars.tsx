"use client";

import { useDrill, type DrillType } from "@/components/drill/drill-context";
import { useFmt, type Fmt } from "@/components/ui/fmt";
import { chartPalette } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

export interface RankedItem {
  label: string;
  value: number;
  /** Optional drill-down target when the row is clicked. */
  drill?: { type: DrillType; id: string };
}

/**
 * Ranked list: label · bar · bold value · share of total.
 * `multicolor` gives each row its own palette colour (states); otherwise one brand colour (cities).
 */
export function RankedBars({
  items,
  total,
  limit = 10,
  multicolor = false,
  format = "number",
  emptyText = "No data for this period.",
}: {
  items: RankedItem[];
  total?: number;
  limit?: number;
  multicolor?: boolean;
  format?: Fmt;
  emptyText?: string;
}) {
  const { fmt } = useFmt();
  const { open } = useDrill();
  const rows = items.slice(0, limit);
  const sum = total ?? items.reduce((s, i) => s + i.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="py-6 text-center text-body text-muted">{emptyText}</p>;
  return (
    <ul className="divide-y divide-transparent">
      {rows.map((r, i) => {
        const share = sum ? r.value / sum : 0;
        const color = multicolor ? chartPalette[i % chartPalette.length] : chartPalette[0];
        const Row = r.drill ? "button" : "div";
        return (
          <li key={r.label}>
            <Row
              type={r.drill ? "button" : undefined}
              onClick={r.drill ? () => open(r.drill!) : undefined}
              className={cn("grid w-full grid-cols-[minmax(96px,1.3fr)_minmax(36px,1fr)_auto_36px] items-center gap-3 py-1.5 text-left", r.drill && "rounded hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600")}
            >
              <span className="truncate text-body text-ink" title={r.label}>
                {r.label}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, background: color }} />
              </span>
              <span className="num text-right text-body font-semibold text-ink">{fmt(r.value, format)}</span>
              <span className="num text-right text-body text-muted">{Math.round(share * 100)}%</span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

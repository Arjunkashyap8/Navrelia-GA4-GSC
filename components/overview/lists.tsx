"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useDrill, type DrillType } from "@/components/drill/drill-context";
import { useFmt } from "@/components/ui/fmt";

export interface MoverItem {
  kind: string;
  name: string;
  drill: { type: DrillType; id: string };
  metric: string;
  cur: number;
  prev: number;
  change: number;
}

export function MoversList({ items, direction }: { items: MoverItem[]; direction: "up" | "down" }) {
  const { open } = useDrill();
  const { fmt } = useFmt();
  if (!items.length) return <p className="text-body text-muted">No {direction === "up" ? "gains" : "declines"} in this period.</p>;
  const Icon = direction === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <ul className="divide-y divide-line">
      {items.map((m) => (
        <li key={`${m.kind}:${m.name}`}>
          <button type="button" onClick={() => open(m.drill)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
            <Icon className={direction === "up" ? "size-4 shrink-0 text-positive" : "size-4 shrink-0 text-negative"} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body text-ink">{m.name}</span>
              <span className="text-caption text-muted">
                {m.kind} · {m.metric}
              </span>
            </span>
            <span className="num text-right text-caption">
              <span className={direction === "up" ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
                {m.change > 0 ? "+" : "−"}
                {fmt(Math.abs(m.change), "number")}
              </span>
              <span className="block text-muted">
                {fmt(m.prev, "number")} → {fmt(m.cur, "number")}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

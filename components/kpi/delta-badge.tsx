"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useFmt, type Fmt } from "@/components/ui/fmt";
import { computeDelta, type Polarity } from "@/lib/metrics/delta";
import { cn } from "@/lib/utils";

/** ▲/▼ with % and absolute change; colour by good/bad, never colour alone (icon + sign). */
export function DeltaBadge({
  current,
  previous,
  polarity = "up_good",
  format = "number",
  showAbs = true,
  size = "md",
}: {
  current: number | null | undefined;
  previous: number | null | undefined;
  polarity?: Polarity;
  format?: Fmt;
  showAbs?: boolean;
  size?: "sm" | "md";
}) {
  const { fmt } = useFmt();
  const d = computeDelta(current, previous, polarity);
  if (d.previous === null) return <span className="text-caption text-muted">—</span>;
  const Icon = d.direction === "up" ? ArrowUpRight : d.direction === "down" ? ArrowDownRight : ArrowRight;
  const isRate = format === "percent";
  const pctText =
    isRate && d.abs !== null
      ? `${d.abs >= 0 ? "+" : ""}${(d.abs * 100).toFixed(1)} pp`
      : d.pct === null
        ? "new"
        : `${d.pct >= 0 ? "+" : ""}${(d.pct * 100).toFixed(1)}%`;
  const absText = !isRate && d.abs !== null ? `${d.abs >= 0 ? "+" : "−"}${fmt(Math.abs(d.abs), format)}` : null;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-0.5 rounded-md font-medium",
        size === "sm" ? "text-[11px]" : "px-1.5 py-0.5 text-caption",
        d.sentiment === "good" && "bg-positive-soft text-green-700",
        d.sentiment === "bad" && "bg-negative-soft text-red-700",
        d.sentiment === "neutral" && "bg-slate-100 text-slate-600",
        size === "sm" && "bg-transparent px-0",
      )}
      aria-label={`${d.direction === "flat" ? "No change" : d.direction === "up" ? "Up" : "Down"} ${pctText}${absText ? `, ${absText}` : ""} vs comparison`}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />
      {pctText}
      {showAbs && absText && size === "md" && <span className="font-normal opacity-80">({absText})</span>}
    </span>
  );
}

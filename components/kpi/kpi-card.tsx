"use client";

import { Card } from "@/components/ui/card";
import { useFmt, type Fmt } from "@/components/ui/fmt";
import { InfoTip } from "@/components/ui/tooltip";
import type { Polarity } from "@/lib/metrics/delta";
import { GLOSSARY } from "@/lib/metrics/glossary";
import { cn } from "@/lib/utils";
import { DeltaBadge } from "./delta-badge";
import { Sparkline } from "./sparkline";

export interface KpiProps {
  label: string;
  glossary?: string;
  value: number | null;
  previous?: number | null;
  format?: Fmt;
  polarity?: Polarity;
  spark?: number[];
  sparkPrev?: number[];
  target?: { value: number; projected: number | null; monthLabel: string } | null;
  note?: string;
}

export function KpiCard({
  label,
  glossary,
  value,
  previous,
  format = "number",
  polarity = "up_good",
  spark,
  sparkPrev,
  target,
  note,
}: KpiProps) {
  const { fmt } = useFmt();
  const g = glossary ? GLOSSARY[glossary] : undefined;
  const progress = target && target.projected !== null ? target.projected / target.value : null;
  return (
    <Card className="flex min-h-[148px] flex-col p-4">
      <div className="flex items-center gap-1 text-caption font-medium text-muted">
        <span className="truncate">{label}</span>
        {g && (
          <InfoTip label={label}>
            {g.def}
            {g.formula && <span className="mt-1 block font-mono text-[11px] opacity-80">{g.formula}</span>}
          </InfoTip>
        )}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="num text-kpi text-ink">{fmt(value, format === "number" ? "compact" : format)}</p>
        {spark && spark.length > 1 && <Sparkline data={spark} compare={sparkPrev} label={`${label} trend`} />}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {previous !== undefined && (
          <>
            <DeltaBadge current={value} previous={previous} polarity={polarity} format={format} showAbs={false} />
            <span className="num text-caption text-muted">vs {fmt(previous, format === "number" ? "compact" : format)}</span>
          </>
        )}
      </div>
      {note && <p className="mt-1 text-caption text-muted">{note}</p>}
      {target && (
        <div className="mt-auto pt-3">
          <div className="flex justify-between text-[11px] text-muted">
            <span>
              {target.monthLabel} target {fmt(target.value, format === "number" ? "compact" : format)}
            </span>
            <span className="num">
              {target.projected === null ? "—" : `on pace for ${fmt(target.projected, format === "number" ? "compact" : format)}`}
            </span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
            role="meter"
            aria-label={`${label} projected vs target`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(progress ?? 0, 1) * 100)}
          >
            <div
              className={cn("h-full rounded-full", (progress ?? 0) >= 1 ? "bg-positive" : (progress ?? 0) >= 0.85 ? "bg-warning" : "bg-negative")}
              style={{ width: `${Math.min((progress ?? 0) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6", className)}>{children}</div>;
}

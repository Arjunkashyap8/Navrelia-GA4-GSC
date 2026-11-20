"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useFmt } from "@/components/ui/fmt";
import { chartPalette } from "@/lib/design/tokens";
import { computeDelta } from "@/lib/metrics/delta";
import { cn } from "@/lib/utils";

export interface Stage {
  label: string;
  event: string;
  value: number;
  previous?: number | null;
}

/**
 * Stage funnel: each bar's percentage is the share of the FIRST stage that reached it; the line
 * underneath is continuation from the stage directly above. Right side: count and change vs the
 * comparison period (▲ / ▼ with colour and arrow, never colour alone).
 */
export function StageFunnel({ stages }: { stages: Stage[] }) {
  const { fmt } = useFmt();
  const first = stages[0]?.value ?? 0;
  return (
    <ol className="space-y-3" aria-label="Funnel stages">
      {stages.map((s, i) => {
        const ofFirst = first ? s.value / first : 0;
        const prevStage = stages[i - 1];
        const cont = prevStage && prevStage.value ? s.value / prevStage.value : null;
        const left = prevStage ? Math.max(prevStage.value - s.value, 0) : 0;
        const d = s.previous !== undefined ? computeDelta(s.value, s.previous) : null;
        const Icon = d?.direction === "up" ? ArrowUpRight : d?.direction === "down" ? ArrowDownRight : ArrowRight;
        const color = chartPalette[i % chartPalette.length];
        return (
          <li key={s.event}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-body font-medium text-ink">{s.label}</span>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-muted">{s.event}</code>
              </span>
              <span className="num flex items-center gap-2 text-body">
                <span className="font-semibold text-ink">{fmt(s.value, "number")}</span>
                {d && d.previous !== null && (
                  <span
                    className={cn("inline-flex items-center gap-0.5 text-caption font-semibold", d.sentiment === "good" ? "text-green-700" : d.sentiment === "bad" ? "text-red-700" : "text-muted")}
                    aria-label={`${d.pct === null ? "new" : `${Math.abs(d.pct * 100).toFixed(0)}%`} ${d.direction} vs comparison`}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {d.pct === null ? "new" : `${Math.abs(d.pct * 100).toFixed(0)}%`}
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-9 overflow-hidden rounded-lg bg-slate-50">
              <div className="flex h-full items-center rounded-lg px-2.5" style={{ width: `${Math.max(ofFirst * 100, 3)}%`, background: color }}>
                {ofFirst >= 0.12 && <span className="num text-caption font-semibold text-white">{(ofFirst * 100).toFixed(2)}%</span>}
              </div>
              {ofFirst < 0.12 && (
                <span className="num absolute top-1/2 -translate-y-1/2 text-caption font-semibold text-ink" style={{ left: `calc(${Math.max(ofFirst * 100, 3)}% + 8px)` }}>
                  {(ofFirst * 100).toFixed(2)}%
                </span>
              )}
            </div>
            {cont !== null && (
              <p className="num mt-1 text-caption text-muted">
                {(cont * 100).toFixed(1)}% continued from the step above
                <span className="text-red-700">
                  {" "}
                  · {fmt(left, "number")} left ({((1 - Math.min(cont, 1)) * 100).toFixed(1)}%)
                </span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

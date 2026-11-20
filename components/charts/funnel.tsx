"use client";

import { useFmt } from "@/components/ui/fmt";

export interface FunnelStep {
  event: string;
  label: string;
  users: number;
  fromPrev: number | null;
  fromStart: number | null;
}

/** Accessible HTML funnel: bar width = share of the first step; drop-off shown between steps. */
export function Funnel({ steps, compact = false }: { steps: FunnelStep[]; compact?: boolean }) {
  const { fmt } = useFmt();
  const max = Math.max(...steps.map((s) => s.users), 1);
  return (
    <ol className="space-y-1.5" aria-label="Purchase funnel">
      {steps.map((s, i) => (
        <li key={s.event}>
          {i > 0 && !compact && (
            <p className="num ml-2 text-[11px] text-muted">
              ↓ {fmt(s.fromPrev, "percent")} continue · <span className="text-red-700">{fmt(1 - (s.fromPrev ?? 0), "percent")} drop off</span>
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className={compact ? "w-24 shrink-0 truncate text-caption text-muted" : "w-40 shrink-0 text-body text-ink"}>{s.label}</span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
              <div className="flex h-full items-center rounded bg-brand-600/80 px-2 text-[11px] font-medium text-white" style={{ width: `${Math.max((s.users / max) * 100, 2)}%` }}>
                {!compact && s.users / max > 0.15 ? fmt(s.users, "number") : ""}
              </div>
            </div>
            <span className="num w-20 shrink-0 text-right text-caption text-muted">{compact ? fmt(s.fromStart, "percent") : fmt(s.users, "number")}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

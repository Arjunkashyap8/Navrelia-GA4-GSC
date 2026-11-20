"use client";

import { useFmt } from "@/components/ui/fmt";
import { chartPalette } from "@/lib/design/tokens";

/** Dependency-free SVG donut with the total in the centre and a value + share legend. */
export function Donut({ items, unit, label }: { items: { label: string; value: number }[]; unit: string; label: string }) {
  const { fmt } = useFmt();
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  const gap = items.filter((i) => i.value > 0).length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div>
      <div className="flex justify-center py-2">
        <svg width="190" height="190" viewBox="0 0 190 190" role="img" aria-label={`${label}: ${items.map((i) => `${i.label} ${fmt(i.value, "number")}`).join(", ")}`}>
          <circle cx="95" cy="95" r={r} fill="none" stroke="#EEF0F3" strokeWidth="26" />
          {total > 0 &&
            items.map((it, i) => {
              const len = (it.value / total) * c;
              const seg = (
                <circle
                  key={it.label}
                  cx="95"
                  cy="95"
                  r={r}
                  fill="none"
                  stroke={chartPalette[i % chartPalette.length]}
                  strokeWidth="26"
                  strokeDasharray={`${Math.max(len - gap, 0)} ${c}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 95 95)"
                />
              );
              offset += len;
              return seg;
            })}
          <text x="95" y="96" textAnchor="middle" fontSize="22" fontWeight="600" fill="#0F172A" className="num">
            {fmt(total, "compact")}
          </text>
          <text x="95" y="116" textAnchor="middle" fontSize="11" fill="#64748B">
            {unit}
          </text>
        </svg>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <li key={it.label} className="grid grid-cols-[minmax(0,1fr)_64px_44px] items-center gap-3 text-body">
            <span className="flex items-center gap-2 truncate text-ink">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: chartPalette[i % chartPalette.length] }} aria-hidden />
              {it.label}
            </span>
            <span className="num text-right font-semibold text-ink">{fmt(it.value, "number")}</span>
            <span className="num text-right text-muted">{total ? Math.round((it.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

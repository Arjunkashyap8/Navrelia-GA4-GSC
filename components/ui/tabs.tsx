"use client";

import { Children, useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Accessible tabs (arrow-key navigation). Panels are pre-rendered server content. */
export function Tabs({ labels, children }: { labels: string[]; children: React.ReactNode }) {
  const [active, setActiveState] = useState(0);
  // Panels mount on first open (charts can't size themselves inside a hidden panel).
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const setActive = (i: number) => {
    setActiveState(i);
    setVisited((v) => (v.has(i) ? v : new Set(v).add(i)));
  };
  const id = useId();
  const panels = Children.toArray(children);
  return (
    <div>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1 border-b border-line">
        {labels.map((l, i) => (
          <button
            key={l}
            role="tab"
            id={`${id}-t${i}`}
            aria-selected={active === i}
            aria-controls={`${id}-p${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setActive((active + 1) % labels.length);
              if (e.key === "ArrowLeft") setActive((active - 1 + labels.length) % labels.length);
            }}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
              active === i ? "border-brand-700 text-brand-800" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div key={i} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} hidden={active !== i}>
          {visited.has(i) ? p : null}
        </div>
      ))}
    </div>
  );
}

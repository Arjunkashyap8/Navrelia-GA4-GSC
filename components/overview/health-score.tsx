"use client";

import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/tooltip";
import type { HealthComponent } from "@/lib/insights/health";
import { GLOSSARY } from "@/lib/metrics/glossary";
import { cn } from "@/lib/utils";

function color(score: number) {
  return score >= 75 ? "#16A34A" : score >= 55 ? "#0F766E" : score >= 40 ? "#D97706" : "#DC2626";
}

export function HealthScoreCard({ score, grade, components }: { score: number; grade: string; components: HealthComponent[] }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <Card className="flex min-h-[148px] items-center gap-4 p-4">
      <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`Business health score ${score} of 100, ${grade}`}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="#EEF0F3" strokeWidth="8" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={color(score)} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 42 42)" />
        <text x="42" y="47" textAnchor="middle" className="num" fontSize="20" fontWeight="600" fill="#0F172A">
          {score}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-caption font-medium text-muted">
          Business health score <InfoTip label="Business health score">{GLOSSARY.healthScore!.def}</InfoTip>
        </p>
        <p className="text-section" style={{ color: color(score) }}>
          {grade}
        </p>
        <Popover.Root>
          <Popover.Trigger className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
            See breakdown <ChevronDown className="size-3" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content sideOffset={6} align="start" className="z-50 w-80 rounded-card border border-line bg-white p-4 shadow-lg">
              <p className="mb-2 text-body font-semibold text-ink">How the score is built</p>
              <ul className="space-y-2.5">
                {components.map((k) => (
                  <li key={k.key}>
                    <div className="flex justify-between text-caption">
                      <span className="font-medium text-ink">
                        {k.label} <span className="font-normal text-muted">· {Math.round(k.weight * 100)}%</span>
                      </span>
                      <span className="num font-semibold" style={{ color: color(k.score) }}>
                        {k.score}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn("h-full rounded-full")} style={{ width: `${k.score}%`, background: color(k.score) }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">{k.detail}</p>
                  </li>
                ))}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </Card>
  );
}

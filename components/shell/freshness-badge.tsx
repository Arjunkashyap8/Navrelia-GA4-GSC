"use client";

import { AlertTriangle, CircleCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnection } from "@/lib/client/use-connection";
import { formatShortDate } from "@/lib/metrics/periods";
import { cn } from "@/lib/utils";

export function FreshnessBadge() {
  const { data, isLoading, isError } = useConnection();

  if (isLoading) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-caption text-muted">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Checking data freshness…
      </span>
    );
  }

  const ga4 = data?.ga4.data.status === "ok" ? data.ga4.data.data.dataThrough : null;
  const gscData = data?.gsc.data.status === "ok" ? data.gsc.data.data : null;
  const gsc = gscData?.freshThrough ?? null;
  const healthy = !isError && ga4 !== null && gsc !== null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/settings"
          className={cn(
            "num inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-caption font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
            healthy ? "border-line bg-white text-ink" : "border-amber-200 bg-warning-soft text-amber-800",
          )}
        >
          {healthy ? (
            <CircleCheck className="size-3.5 text-positive" aria-hidden />
          ) : (
            <AlertTriangle className="size-3.5" aria-hidden />
          )}
          <span>GA4 {ga4 ? `through ${formatShortDate(ga4)}` : "not connected"}</span>
          <span className="text-slate-300" aria-hidden>·</span>
          <span>GSC {gsc ? `through ${formatShortDate(gsc)}` : "not connected"}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <p className="font-semibold">Data freshness (IST)</p>
        <p className="mt-1">
          GA4 processes most data within hours but can revise the last ~3 days. Search Console typically lags 2–3 days;
          days after the &ldquo;final&rdquo; date are preliminary and may still change.
        </p>
        {gscData?.finalThrough && (
          <p className="mt-1">GSC final data through {formatShortDate(gscData.finalThrough)}.</p>
        )}
        {!healthy && <p className="mt-1">One or both sources are not connected — open Settings for details.</p>}
      </TooltipContent>
    </Tooltip>
  );
}
